"""
orch5 as a service
==================
Wraps the multi-team harness so the API server can run it per request:

  1. plan_teams()      - the orchestrator model reads the goal and proposes
                         the team structure, instead of the fixed teams the
                         standalone demo hardcodes.
  2. run_multi_team()  - builds an AgentHarness from that plan, runs it in an
                         isolated workspace, and collects the files the
                         workers wrote.

Progress is reported through an on_event callback so the caller can stream a
timeline; nothing here imports the API server.
"""

import asyncio
import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .harness import AgentHarness, TeamSpec, WorkerSpec
from .orchestrator import ORCHESTRATOR_MODEL, PLANNER_THINKING, get_default_client

logger = logging.getLogger("MegaAgenticSystem")

# A worker that writes a large file should not blow up the API response.
MAX_OUTPUT_BYTES = 200_000
MAX_OUTPUT_FILES = 40

PLANNING_PROMPT = """You are planning a multi-team engineering effort.

GOAL: {goal}

Design 2-3 teams that together can deliver this goal. Each team has one lead
and 2-3 workers. A worker's domain must be narrow enough that it never
overlaps another worker's files.

Respond ONLY with JSON:
{{
  "teams": [
    {{
      "team_id": "snake_case_id",
      "lead_domain": "what this team's lead plans",
      "workers": [
        {{"name": "snake_case_name", "domain": "the narrow area this worker owns"}}
      ]
    }}
  ]
}}"""


def _fallback_teams(goal: str) -> List[TeamSpec]:
    """Used when the planner's JSON cannot be read - better a working generic
    structure than a failed run."""
    return [
        TeamSpec(
            team_id="team_build",
            lead_domain=f"Planning and decomposition for: {goal[:80]}",
            workers=[
                WorkerSpec(name="implementer", domain="Primary implementation work"),
                WorkerSpec(name="reviewer", domain="Review and correction of the implementation"),
            ],
        ),
    ]


async def plan_teams(
    goal: str,
    client=None,
    on_event: Optional[Callable[[dict], None]] = None,
) -> List[TeamSpec]:
    """Ask the orchestrator model to design the team structure for this goal."""
    active = client or get_default_client()

    def _emit(**event):
        if on_event:
            try:
                on_event({"agent_id": "planner", "agent_role": "orchestrator",
                          "team_id": "core", **event})
            except Exception:
                pass

    _emit(kind="agent_start", phase="Planning teams", prompt=goal)

    from google.genai import types
    response = await asyncio.to_thread(
        active.models.generate_content,
        model=ORCHESTRATOR_MODEL,
        contents=PLANNING_PROMPT.format(goal=goal),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            # Without this the Pro model plans at its own default, which put
            # team planning alone at tens of seconds.
            thinking_config=types.ThinkingConfig(thinking_level=PLANNER_THINKING),
        ),
    )

    specs: List[TeamSpec] = []
    try:
        parsed = json.loads(response.text or "{}")
        if isinstance(parsed, list):
            parsed = parsed[0] if parsed else {}
        for team in parsed.get("teams", []):
            workers = [
                WorkerSpec(
                    name=str(w.get("name") or f"worker_{i+1}").strip().replace(" ", "_"),
                    domain=str(w.get("domain") or "General implementation"),
                )
                for i, w in enumerate(team.get("workers", []))
            ]
            if not workers:
                continue
            specs.append(TeamSpec(
                team_id=str(team.get("team_id") or f"team_{len(specs)+1}").strip().replace(" ", "_"),
                lead_domain=str(team.get("lead_domain") or "Team planning"),
                workers=workers,
            ))
    except (ValueError, AttributeError, json.JSONDecodeError) as exc:
        logger.warning(f"orch5 team planning JSON unreadable ({exc}); using fallback teams")

    if not specs:
        specs = _fallback_teams(goal)

    _emit(
        kind="agent_step",
        phase="Teams planned",
        response="\n".join(
            f"{s.team_id}: lead={s.lead_domain}\n" +
            "\n".join(f"    - {w.name}: {w.domain}" for w in s.workers)
            for s in specs
        ),
    )
    return specs


def _collect_outputs(workspace: Path) -> List[Dict[str, Any]]:
    """Read back what the workers wrote.

    The workspace is a temp directory that disappears with the run (and the
    host filesystem is ephemeral anyway), so the files have to travel in the
    response or they are lost.
    """
    outputs_dir = workspace / "outputs"
    if not outputs_dir.exists():
        return []

    files: List[Dict[str, Any]] = []
    for path in sorted(outputs_dir.rglob("*")):
        if not path.is_file():
            continue
        if len(files) >= MAX_OUTPUT_FILES:
            break
        try:
            size = path.stat().st_size
            truncated = size > MAX_OUTPUT_BYTES
            content = path.read_text(encoding="utf-8", errors="replace")
            if truncated:
                content = content[:MAX_OUTPUT_BYTES] + "\n... [truncated]"
        except OSError as exc:
            logger.warning(f"Could not read orch5 output {path}: {exc}")
            continue
        files.append({
            "path": str(path.relative_to(outputs_dir)).replace("\\", "/"),
            "team": path.relative_to(outputs_dir).parts[0] if path.relative_to(outputs_dir).parts else "",
            "bytes": size,
            "truncated": truncated,
            "content": content,
        })
    return files


async def run_multi_team(
    goal: str,
    client=None,
    on_event: Optional[Callable[[dict], None]] = None,
) -> Dict[str, Any]:
    """Plan teams for this goal, run them, and return the report plus files."""
    workspace = Path(tempfile.mkdtemp(prefix="orch5_"))
    try:
        team_specs = await plan_teams(goal, client=client, on_event=on_event)

        harness = AgentHarness(
            team_specs=team_specs,
            workspace=str(workspace),
            client=client,
            on_event=on_event,
        )
        report = await harness.run(goal)
        outputs = _collect_outputs(workspace)

        if on_event:
            try:
                on_event({
                    "agent_id": "harness", "agent_role": "orchestrator", "team_id": "core",
                    "kind": "synthesis", "phase": "Consolidated report",
                    "response": report,
                })
            except Exception:
                pass

        return {
            "report": report,
            "outputs": outputs,
            "teams": [
                {
                    "team_id": s.team_id,
                    "lead_domain": s.lead_domain,
                    "workers": [{"name": w.name, "domain": w.domain} for w in s.workers],
                }
                for s in team_specs
            ],
            # TaskRegistry keeps its state in .tasks (id -> record).
            "tasks": list(harness.registry.tasks.values()),
        }
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
