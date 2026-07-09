"""
Multi-Tier Agent Harness using Google Gemini API
=================================================
Architecture (from the video):
    Orchestrator (thinks + delegates only)
        └── Team Lead A  (plans + delegates to workers)
                └── Worker A1 (hyper-specialized executor)
                └── Worker A2
        └── Team Lead B  (parallel team)
                └── Worker B1
                └── Worker B2

Key patterns implemented:
    - Orchestrator/Leads NEVER write code — they only think and delegate
    - Workers are domain-specialized via system prompts + skill injection
    - Persistent "mental models" (expertise files) survive between runs
    - "Till-Done" task registry tracks work until ALL tasks complete
    - Parallel team execution via asyncio
    - Graceful fallback: if a worker fails, the lead steps in
"""

import asyncio
import json
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional
from google import genai
from google.genai import types

# ─── Client (picks up GEMINI_API_KEY from env) ───────────────────────────────
client = genai.Client()

# ─── Models ──────────────────────────────────────────────────────────────────
ORCHESTRATOR_MODEL = "gemini-3.1-pro-preview"  # Deep thinker / planner
LEAD_MODEL         = "gemini-3.5-flash"         # Fast planner / delegator
WORKER_MODEL       = "gemini-3.5-flash"         # Fast executor


# ═════════════════════════════════════════════════════════════════════════════
#  TASK REGISTRY  ("Till-Done" system)
# ═════════════════════════════════════════════════════════════════════════════

class TaskRegistry:
    """
    Persistent task tracker stored in .agent_tasks.json.
    Orchestrator creates tasks; workers update them to completed/failed.
    The run loop keeps going until ALL tasks are completed or failed.
    """

    VALID_STATUSES = {"pending", "in_progress", "completed", "failed", "blocked"}

    def __init__(self, workspace: str = "."):
        self.path = Path(workspace) / ".agent_tasks.json"
        self.tasks: dict = {}
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                # _save wraps the tasks as {"tasks": {...}}; unwrap symmetrically.
                # (Tolerate a bare dict too, in case of older/hand-edited files.)
                self.tasks = data.get("tasks", {}) if isinstance(data, dict) else {}
            except Exception:
                self.tasks = {}

    def _save(self):
        self.path.write_text(json.dumps({"tasks": self.tasks}, indent=2), encoding="utf-8")

    def create(self, task_id: str, description: str, assigned_to: str,
               depends_on: list[str] | None = None):
        deps = depends_on or []
        blocked = any(
            self.tasks.get(d, {}).get("status") != "completed" for d in deps
        )
        self.tasks[task_id] = {
            "description": description,
            "assigned_to": assigned_to,
            "status": "blocked" if blocked and deps else "pending",
            "depends_on": deps,
            "result": None,
            "created_at": datetime.now().isoformat(),
        }
        self._save()
        return self.tasks[task_id]

    def update(self, task_id: str, status: str, result: str = ""):
        if task_id not in self.tasks:
            return {"error": f"Task {task_id!r} not found"}
        if status not in self.VALID_STATUSES:
            return {"error": f"Invalid status {status!r}"}
        self.tasks[task_id]["status"] = status
        self.tasks[task_id]["result"] = result
        self._unblock_dependents()
        self._save()
        return {"ok": True, "task_id": task_id, "status": status}

    def _unblock_dependents(self):
        changed = True
        while changed:
            changed = False
            for t in self.tasks.values():
                if t["status"] != "blocked":
                    continue
                if all(self.tasks.get(d, {}).get("status") == "completed"
                       for d in t.get("depends_on", [])):
                    t["status"] = "pending"
                    changed = True

    def list_pending(self) -> list[dict]:
        return [{"id": k, **v} for k, v in self.tasks.items()
                if v["status"] == "pending"]

    def tasks_for(self, assignees: set[str]) -> list[dict]:
        """Return all tasks (any status) assigned to one of the given agent IDs."""
        return [{"id": k, **v} for k, v in self.tasks.items()
                if v["assigned_to"] in assignees]

    def is_done(self) -> bool:
        return all(t["status"] in {"completed", "failed"}
                   for t in self.tasks.values())

    def summary(self) -> str:
        counts: dict[str, int] = {}
        for t in self.tasks.values():
            counts[t["status"]] = counts.get(t["status"], 0) + 1
        lines = [f"  {s}: {n}" for s, n in sorted(counts.items())]
        return "\n".join(lines)


# ═════════════════════════════════════════════════════════════════════════════
#  MENTAL MODEL  (agent expertise / persistent memory)
# ═════════════════════════════════════════════════════════════════════════════

class MentalModel:
    """
    Each agent has its own mental model file:
        .mental_models/<agent_id>.md

    The agent reads it at startup and updates it after completing work.
    This is the "agent that learns" pattern from the video.
    """

    def __init__(self, agent_id: str, workspace: str = "."):
        self.path = Path(workspace) / ".mental_models" / f"{agent_id}.md"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(f"# Mental Model: {agent_id}\n\n"
                                  "## What I know\n_Nothing yet._\n\n"
                                  "## What I've built\n_Nothing yet._\n\n"
                                  "## Lessons learned\n_None yet._\n", encoding="utf-8")

    def read(self) -> str:
        return self.path.read_text(encoding="utf-8")

    def update(self, new_content: str):
        """Agent writes its own mental model update after completing work."""
        self.path.write_text(new_content, encoding="utf-8")


# ═════════════════════════════════════════════════════════════════════════════
#  SKILL LOADER  (markdown files injected into system prompts)
# ═════════════════════════════════════════════════════════════════════════════

def load_skills(skill_names: list[str], skills_dir: str = "./skills") -> str:
    """
    Load skill markdown files and concatenate them into a single block
    to inject into an agent's system prompt.

    skills/
        ui_generator.md
        brand_enforcer.md
        validator.md
    """
    base = Path(skills_dir)
    blocks = []
    for name in skill_names:
        p = base / f"{name}.md"
        if p.exists():
            blocks.append(f"## SKILL: {name}\n\n{p.read_text(encoding='utf-8')}")
        else:
            print(f"  ⚠  Skill not found: {p}")
    return "\n\n---\n\n".join(blocks) if blocks else ""


# ═════════════════════════════════════════════════════════════════════════════
#  AGENT  (the base class — Orchestrator, Lead, and Worker all extend this)
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class AgentConfig:
    agent_id: str
    role: str                          # "orchestrator" | "lead" | "worker"
    domain: str                        # what area this agent works on
    model: str = WORKER_MODEL
    skills: list[str] = field(default_factory=list)
    workspace: str = "."
    team_id: str = "default"


class Agent:
    """
    A stateful Gemini agent with:
      - Persistent mental model (survives between runs)
      - Skills injected into system prompt
      - Agentic function calling (task registry tools)
      - Role-enforced behaviour (orchestrators/leads don't write files)
    """

    def __init__(self, config: AgentConfig, registry: TaskRegistry):
        self.cfg = config
        self.registry = registry
        self.mental_model = MentalModel(config.agent_id, config.workspace)
        self._history: list[types.Content] = []

    # ── System prompt ────────────────────────────────────────────────────────
    def _build_system_prompt(self) -> str:
        role_rules = {
            "orchestrator": (
                "You are the ORCHESTRATOR. You NEVER write code or files yourself. "
                "Your only job is to: 1) decompose the incoming task into subtasks, "
                "2) assign subtasks to the correct team leads, "
                "3) track progress via the task registry, "
                "4) synthesize final results. "
                "Use task_create to register work. Use task_list to check progress. "
                "Only respond when you have a clear delegation plan."
            ),
            "lead": (
                "You are a TEAM LEAD. You NEVER write code or files yourself. "
                "Your job is to: 1) break down your assigned task into worker subtasks, "
                "2) delegate each subtask using task_create, "
                "3) monitor workers via task_list. "
                "If a worker fails and no one else can do the job, you may "
                "complete it yourself — but this is a last resort."
            ),
            "worker": (
                "You are a SPECIALIZED WORKER. You execute ONE task at a time, "
                "extremely well. Stay strictly within your domain. "
                "When done, call task_update with status='completed' and a result summary. "
                "If you cannot complete the task, call task_update with status='failed'."
            ),
        }

        skills_block = load_skills(self.cfg.skills, f"{self.cfg.workspace}/skills")
        mental_model = self.mental_model.read()

        lines = [
            f"# Agent: {self.cfg.agent_id}",
            f"Role: {self.cfg.role.upper()}",
            f"Domain: {self.cfg.domain}",
            f"Team: {self.cfg.team_id}",
            "",
            "## Your Role Rules",
            role_rules[self.cfg.role],
            "",
            "## Your Mental Model (persistent memory from past runs)",
            mental_model,
        ]
        if skills_block:
            lines += ["", "## Injected Skills", skills_block]

        return "\n".join(lines)

    # ── Tool declarations ────────────────────────────────────────────────────
    def _get_tools(self) -> list[types.Tool]:
        from google.genai.types import Schema, Type as GType

        def _schema(**props) -> Schema:
            return Schema(
                type=GType.OBJECT,
                properties={k: Schema(**v) for k, v in props.items()},
            )

        declarations = [
            types.FunctionDeclaration(
                name="task_create",
                description="Register a new task in the shared task registry.",
                parameters=_schema(
                    task_id={"type": GType.STRING, "description": "Unique task ID"},
                    description={"type": GType.STRING, "description": "What this task does"},
                    assigned_to={"type": GType.STRING, "description": "Agent ID or role"},
                ),
            ),
            types.FunctionDeclaration(
                name="task_update",
                description="Update a task's status. Call with 'completed' or 'failed'.",
                parameters=_schema(
                    task_id={"type": GType.STRING, "description": "Task ID to update"},
                    status={"type": GType.STRING, "description": "completed|failed|in_progress|blocked"},
                    result={"type": GType.STRING, "description": "Summary of what was done"},
                ),
            ),
            types.FunctionDeclaration(
                name="task_list",
                description="List all pending tasks in the registry.",
            ),
            types.FunctionDeclaration(
                name="update_mental_model",
                description="Rewrite your mental model with new learnings from this run.",
                parameters=_schema(
                    content={"type": GType.STRING, "description": "Full updated mental model markdown"},
                ),
            ),
        ]

        # Workers also get a write_output tool (leads/orchestrators do not)
        if self.cfg.role == "worker":
            declarations.append(
                types.FunctionDeclaration(
                    name="write_output",
                    description="Write your deliverable output to disk.",
                    parameters=_schema(
                        filename={"type": GType.STRING, "description": "Output filename"},
                        content={"type": GType.STRING, "description": "File content"},
                    ),
                )
            )

        return [types.Tool(function_declarations=declarations)]

    # ── Tool execution ───────────────────────────────────────────────────────
    def _execute_tool(self, name: str, args: dict) -> str:
        if name == "task_create":
            result = self.registry.create(
                task_id=args["task_id"],
                description=args["description"],
                assigned_to=args["assigned_to"],
            )
            return json.dumps(result)

        elif name == "task_update":
            result = self.registry.update(
                task_id=args["task_id"],
                status=args["status"],
                result=args.get("result", ""),
            )
            return json.dumps(result)

        elif name == "task_list":
            pending = self.registry.list_pending()
            return json.dumps(pending if pending else [{"info": "No pending tasks"}])

        elif name == "update_mental_model":
            self.mental_model.update(args["content"])
            return json.dumps({"ok": True, "message": "Mental model updated."})

        elif name == "write_output":
            out_dir = Path(self.cfg.workspace) / "outputs" / self.cfg.team_id
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / args["filename"]
            out_path.write_text(args["content"], encoding="utf-8")
            return json.dumps({"ok": True, "path": str(out_path)})

        return json.dumps({"error": f"Unknown tool: {name}"})

    # ── Agentic run loop ─────────────────────────────────────────────────────
    async def run(self, message: str, max_turns: int = 15) -> str:
        """
        Run the agent on a message. Handles multi-turn function calling
        until the model produces a final text response.
        """
        tag = f"[{self.cfg.agent_id}]"
        print(f"\n{tag} Starting on: {message[:80]}...")

        system = self._build_system_prompt()
        self._history.append(
            types.Content(role="user", parts=[types.Part.from_text(text=message)])
        )

        for turn in range(max_turns):
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=self.cfg.model,
                contents=self._history,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    tools=self._get_tools(),
                    thinking_config=types.ThinkingConfig(
                        thinking_level=types.ThinkingLevel.LOW  # speed for workers
                        if self.cfg.role == "worker"
                        else types.ThinkingLevel.HIGH            # quality for planners
                    ),
                ),
            )

            # Collect all parts from this response turn
            text_parts: list[str] = []
            tool_calls: list[tuple[str, dict]] = []

            candidate = response.candidates[0]
            for part in candidate.content.parts:
                if part.thought:
                    continue  # skip thinking tokens
                if part.text:
                    text_parts.append(part.text)
                elif part.function_call:
                    fc = part.function_call
                    tool_calls.append((fc.name, dict(fc.args)))

            # Append model turn to history
            self._history.append(candidate.content)

            if not tool_calls:
                # Model gave a final text response — we're done
                final = "\n".join(text_parts)
                print(f"{tag} Done after {turn+1} turn(s).")
                return final

            # Execute all tool calls and feed results back
            print(f"{tag} Turn {turn+1}: calling {[n for n,_ in tool_calls]}")
            tool_result_parts: list[types.Part] = []
            for tool_name, tool_args in tool_calls:
                result_str = self._execute_tool(tool_name, tool_args)
                print(f"  └─ {tool_name}({tool_args}) → {result_str[:80]}")
                tool_result_parts.append(
                    types.Part.from_function_response(
                        name=tool_name,
                        response={"result": result_str},
                    )
                )

            self._history.append(
                types.Content(role="user", parts=tool_result_parts)
            )

        return f"[{self.cfg.agent_id}] Reached max turns ({max_turns})."