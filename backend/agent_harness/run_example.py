"""
Example: Run the Agent Harness for UI Generation
=================================================
Mirrors the video's "Infinite UI" system:
  - Team A: React dashboard components
  - Team B: Data visualization / charts
  - Team C: Navigation + layout

Run (from the backend/ directory, since this is a package module):
    pip install google-genai
    export GEMINI_API_KEY=your_key_here
    python -m agent_harness.run_example
"""

# Force UTF-8 stdout/stderr before anything prints. Windows defaults to cp1252
# when output is piped/redirected (CI, log capture, the backend's execute_code),
# which crashes on the box-drawing banners (═) and emoji this harness prints.
# Reconfiguring here covers every print in the process, including harness.py's.
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import asyncio
from .harness import AgentHarness, TeamSpec, WorkerSpec


# ─── Skills setup (create a minimal skills dir for the demo) ─────────────────
import os
os.makedirs("workspace/skills", exist_ok=True)

# In a real system these are rich markdown files with design rules, patterns, etc.
SKILL_UI_CONSISTENCY = """\
# UI Consistency Skill
Always use Tailwind CSS. Color palette: slate-900 bg, cyan-400 accent.
Component pattern: card → header → body → footer.
Never use inline styles. All components must be responsive.
"""

SKILL_VALIDATOR = """\
# Validation Skill
Check: 1) No console.log left in code, 2) All props typed,
3) Components are exported as default, 4) No hardcoded colors.
"""

with open("workspace/skills/ui_consistency.md", "w", encoding="utf-8") as f:
    f.write(SKILL_UI_CONSISTENCY)

with open("workspace/skills/validator.md", "w", encoding="utf-8") as f:
    f.write(SKILL_VALIDATOR)


# ─── Team definitions ─────────────────────────────────────────────────────────

TEAMS = [
    TeamSpec(
        team_id="team_dashboard",
        lead_domain="React dashboard planning and component architecture",
        lead_skills=["ui_consistency"],
        workers=[
            WorkerSpec(
                name="builder",
                domain="React component creation — builds dashboard cards, stats, tables",
                skills=["ui_consistency"],
            ),
            WorkerSpec(
                name="validator",
                domain="Code review and validation — checks quality, types, consistency",
                skills=["validator"],
            ),
        ],
    ),

    TeamSpec(
        team_id="team_charts",
        lead_domain="Data visualization and chart component planning",
        lead_skills=["ui_consistency"],
        workers=[
            WorkerSpec(
                name="chart_builder",
                domain="Recharts/D3 chart components — line charts, bar charts, pie charts",
                skills=["ui_consistency"],
            ),
            WorkerSpec(
                name="data_layer",
                domain="Mock data generation and TypeScript interfaces for charts",
                skills=[],
            ),
        ],
    ),

    TeamSpec(
        team_id="team_layout",
        lead_domain="Navigation, sidebar, and layout shell planning",
        lead_skills=["ui_consistency"],
        workers=[
            WorkerSpec(
                name="nav_builder",
                domain="Sidebar navigation, topbar, breadcrumbs — responsive layout shell",
                skills=["ui_consistency"],
            ),
        ],
    ),
]


# ─── Run ──────────────────────────────────────────────────────────────────────

async def main():
    harness = AgentHarness(team_specs=TEAMS, workspace="./workspace")

    result = await harness.run(
        "Build a complete agent security monitoring dashboard UI in React + Tailwind. "
        "It should include: a live agent activity feed, threat detection stats cards, "
        "a timeline chart of events, sidebar navigation, and a top bar with status. "
        "Use a dark theme (slate-900 background, cyan-400 accents). "
        "All output should be production-ready React components."
    )

    print("\n\n━━━ ORCHESTRATOR SYNTHESIS ━━━")
    print(result)

    print("\n\n━━━ OUTPUT FILES ━━━")
    for root, dirs, files in os.walk("workspace/outputs"):
        for f in files:
            path = os.path.join(root, f)
            print(f"  📄 {path}")

if __name__ == "__main__":
    asyncio.run(main())