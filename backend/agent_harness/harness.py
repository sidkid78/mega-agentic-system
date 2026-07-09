"""
Team Runner + Harness Entry Point
==================================
- Builds teams of (Lead + Workers)
- Runs teams in parallel with asyncio
- Implements the "till-done" polling loop
- Coordinates with the shared TaskRegistry
"""

import asyncio
from dataclasses import dataclass, field
from .orchestrator import (
    Agent, AgentConfig, TaskRegistry,
    ORCHESTRATOR_MODEL, LEAD_MODEL, WORKER_MODEL,
)


# ═════════════════════════════════════════════════════════════════════════════
#  TEAM DEFINITION
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class WorkerSpec:
    """Specification for one worker inside a team."""
    name: str           # e.g. "ui_builder"
    domain: str         # e.g. "React component generation"
    skills: list[str] = field(default_factory=list)
    model: str = WORKER_MODEL


@dataclass
class TeamSpec:
    """A named team with a lead and one or more workers."""
    team_id: str
    lead_domain: str          # e.g. "UI generation planning"
    workers: list[WorkerSpec]
    lead_model: str = LEAD_MODEL
    lead_skills: list[str] = field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
#  TEAM  (Lead + Workers, runs as a unit)
# ═════════════════════════════════════════════════════════════════════════════

class Team:
    """
    A Team runs its lead agent first to decompose work,
    then runs all workers in parallel on their assigned tasks.
    Workers are re-run until no pending tasks remain (till-done).
    """

    def __init__(self, spec: TeamSpec, registry: TaskRegistry, workspace: str):
        self.spec = spec
        self.registry = registry
        self.workspace = workspace

        self.lead = Agent(
            AgentConfig(
                agent_id=f"{spec.team_id}_lead",
                role="lead",
                domain=spec.lead_domain,
                model=spec.lead_model,
                skills=spec.lead_skills,
                workspace=workspace,
                team_id=spec.team_id,
            ),
            registry,
        )

        self.workers = [
            Agent(
                AgentConfig(
                    agent_id=f"{spec.team_id}_{w.name}",
                    role="worker",
                    domain=w.domain,
                    model=w.model,
                    skills=w.skills,
                    workspace=workspace,
                    team_id=spec.team_id,
                ),
                registry,
            )
            for w in spec.workers
        ]

    async def run(self, task_description: str) -> dict:
        """
        1. Lead plans and creates subtasks in the registry.
        2. Workers pick up pending tasks and execute them.
        3. Loop until all tasks assigned to this team are done.
        """
        tag = f"[Team:{self.spec.team_id}]"
        results: dict[str, str] = {}

        # Step 1: Lead decomposes the task
        print(f"\n{tag} Lead planning...")
        lead_result = await self.lead.run(
            f"Your team is assigned: {task_description}\n\n"
            f"Use task_create to register subtasks for your workers. "
            f"Assign tasks using worker IDs: "
            f"{[w.cfg.agent_id for w in self.workers]}. "
            f"Then call task_list to confirm your plan."
        )
        results["lead_plan"] = lead_result

        # Step 2: Workers execute — loop until team's tasks are done
        max_rounds = 5
        for round_num in range(max_rounds):
            pending = [
                t for t in self.registry.list_pending()
                if any(t["assigned_to"] in w.cfg.agent_id for w in self.workers)
                or t["assigned_to"] in [w.cfg.agent_id for w in self.workers]
            ]

            if not pending:
                print(f"{tag} No more pending tasks — team done.")
                break

            print(f"{tag} Round {round_num+1}: {len(pending)} pending task(s)")

            # Run all workers in parallel on their respective tasks
            async def worker_run(worker: Agent, task: dict) -> tuple[str, str]:
                result = await worker.run(
                    f"Your assigned task (ID: {task['id']}): {task['description']}\n\n"
                    f"When finished, call task_update with task_id='{task['id']}' "
                    f"and status='completed'. Also call update_mental_model with "
                    f"what you learned. Use write_output to save any deliverables."
                )
                return task["id"], result

            # Match pending tasks to workers
            coroutines = []
            for task in pending:
                # Find the right worker for this task
                matching = [
                    w for w in self.workers
                    if task["assigned_to"] == w.cfg.agent_id
                ]
                worker = matching[0] if matching else self.workers[0]  # fallback
                coroutines.append(worker_run(worker, task))

            worker_results = await asyncio.gather(*coroutines, return_exceptions=True)
            for res in worker_results:
                if isinstance(res, Exception):
                    print(f"  ⚠  Worker error: {res}")
                else:
                    task_id, output = res
                    results[task_id] = output

        # Step 3: Resolve this team's lead task(s) based on its workers' subtasks.
        # A lead task only delegates — it's "done" when every worker subtask it
        # spawned is completed, and "failed" otherwise. This lets the registry
        # settle truthfully instead of the orchestrator rubber-stamping it.
        worker_ids = {w.cfg.agent_id for w in self.workers}
        subtasks = self.registry.tasks_for(worker_ids)
        completed = [t for t in subtasks if t["status"] == "completed"]
        team_done = bool(subtasks) and len(completed) == len(subtasks)

        lead_id = f"{self.spec.team_id}_lead"
        for lead_task in self.registry.tasks_for({lead_id}):
            if lead_task["status"] in ("completed", "failed"):
                continue
            if team_done:
                self.registry.update(
                    lead_task["id"], "completed",
                    result=f"All {len(subtasks)} worker subtask(s) completed.",
                )
                print(f"{tag} Lead task '{lead_task['id']}' completed "
                      f"({len(completed)}/{len(subtasks)} subtasks).")
            else:
                self.registry.update(
                    lead_task["id"], "failed",
                    result=(f"Only {len(completed)}/{len(subtasks)} worker subtask(s) "
                            "completed." if subtasks else "No worker subtasks were created."),
                )
                print(f"{tag} Lead task '{lead_task['id']}' FAILED "
                      f"({len(completed)}/{len(subtasks)} subtasks).")

        return results


# ═════════════════════════════════════════════════════════════════════════════
#  HARNESS  (the top-level orchestrator + all teams)
# ═════════════════════════════════════════════════════════════════════════════

class AgentHarness:
    """
    The full harness wires together:
      - One Orchestrator (master planner)
      - Multiple parallel Teams
      - A shared TaskRegistry (till-done loop)
    """

    def __init__(
        self,
        team_specs: list[TeamSpec],
        workspace: str = "./workspace",
    ):
        import os
        os.makedirs(workspace, exist_ok=True)

        self.workspace = workspace
        self.registry = TaskRegistry(workspace)
        self.teams: dict[str, Team] = {
            spec.team_id: Team(spec, self.registry, workspace)
            for spec in team_specs
        }

        self.orchestrator = Agent(
            AgentConfig(
                agent_id="orchestrator",
                role="orchestrator",
                domain="High-level task decomposition and team coordination",
                model=ORCHESTRATOR_MODEL,
                workspace=workspace,
                team_id="core",
            ),
            self.registry,
        )

    async def run(self, user_request: str) -> str:
        """
        Main entry point. The orchestrator breaks down the request,
        teams run in parallel, and the harness loops until done.
        """
        print("\n" + "═" * 60)
        print(f"  AGENT HARNESS: Starting")
        print(f"  Request: {user_request[:80]}...")
        print("═" * 60)

        # 1. Orchestrator decomposes the request into team-level tasks
        team_ids = list(self.teams.keys())
        orch_result = await self.orchestrator.run(
            f"User request: {user_request}\n\n"
            f"Available teams: {team_ids}\n\n"
            f"Use task_create to assign one primary objective to each relevant team. "
            f"Keep each team assignment to a single, clear objective. "
            f"Assign tasks to team leads using IDs like '{team_ids[0]}_lead'."
        )
        print(f"\n[Orchestrator] Plan complete.")

        # 2. Run all teams in parallel
        print(f"\n[Harness] Launching {len(self.teams)} team(s) in parallel...")
        team_tasks = []
        for team_id, team in self.teams.items():
            # Find tasks assigned to this team's lead
            all_tasks = [
                t for t in self.registry.list_pending()
                if t.get("assigned_to") == f"{team_id}_lead"
            ]
            description = (
                all_tasks[0]["description"] if all_tasks
                else f"Contribute to: {user_request}"
            )
            team_tasks.append(team.run(description))

        team_results = await asyncio.gather(*team_tasks, return_exceptions=True)
        for team_id, res in zip(self.teams.keys(), team_results):
            if isinstance(res, Exception):
                import traceback
                print(f"\n[Harness] ⚠ Team '{team_id}' FAILED: {res!r}")
                traceback.print_exception(type(res), res, res.__traceback__)

        # 3. Till-Done: poll until registry is fully settled
        print("\n[Harness] Waiting for till-done settlement...")
        max_wait_seconds = 30
        elapsed = 0
        while not self.registry.is_done() and elapsed < max_wait_seconds:
            await asyncio.sleep(2)
            elapsed += 2

        settled = self.registry.is_done()
        print(f"\n[Harness] Registry {'settled' if settled else 'did NOT settle'} "
              f"after {elapsed}s:\n{self.registry.summary()}")

        # 4. Orchestrator synthesizes the final output. The registry is already
        # resolved by the teams, so the orchestrator only reports — it must not
        # mark tasks complete itself (that was the old rubber-stamp behaviour).
        synthesis = await self.orchestrator.run(
            f"The teams have finished. Here is the FINAL registry state "
            f"(already resolved — do not modify it):\n{self.registry.summary()}\n\n"
            f"Provide a concise synthesis based strictly on the real task "
            f"statuses above: report what was completed and call out anything "
            f"that failed. Do not claim work that is not marked completed. "
            f"Then update your mental model with what you learned."
        )

        print("\n" + "═" * 60)
        print("  HARNESS COMPLETE")
        print("═" * 60)
        return synthesis