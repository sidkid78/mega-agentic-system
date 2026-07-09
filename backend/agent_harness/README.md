# Multi-Tier Agent Harness — Gemini API

A production-grade multi-agent orchestration system built with `google-genai`,
directly implementing the patterns from the video.

## Architecture

```
User Request
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  (gemini-3-pro-preview, thinking=HIGH)    │
│  • Reads its mental model from past runs                │
│  • Decomposes request into team-level objectives        │
│  • Uses task_create to assign work to team leads        │
│  • NEVER writes code or files                           │
└───────────┬─────────────────┬────────────────┬──────────┘
            │ parallel        │                │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌────▼────────┐
     │  TEAM A     │   │  TEAM B     │   │  TEAM C     │
     │  Lead       │   │  Lead       │   │  Lead       │
     │  (planner)  │   │  (planner)  │   │  (planner)  │
     │  Worker A1  │   │  Worker B1  │   │  Worker C1  │
     │  Worker A2  │   │  Worker B2  │   └─────────────┘
     └─────────────┘   └─────────────┘
            │                 │
            └────────┬────────┘
                     ▼
           ┌──────────────────┐
           │  TaskRegistry    │  ← "Till-Done" loop
           │  .agent_tasks.json│   keeps running until
           │  pending → done  │   ALL tasks complete
           └──────────────────┘
```

## Key Patterns

### 1. Role Enforcement (via system prompt)
- **Orchestrator**: only `task_create`, `task_list`, `task_update`
- **Leads**: same + fallback `write_output` if workers fail
- **Workers**: all tools including `write_output`

### 2. Persistent Mental Models
Each agent has `.mental_models/<agent_id>.md` — updated after every run.
```
.mental_models/
  orchestrator.md       ← what the orchestrator has learned
  team_dashboard_lead.md
  team_dashboard_builder.md
  ...
```

### 3. Skill Injection
Markdown skill files are loaded into every agent's system prompt:
```
skills/
  ui_consistency.md    ← design rules, patterns, color palettes
  validator.md         ← quality checklist for review agents
  brand_enforcer.md    ← brand-specific rules
```

### 4. Till-Done Task Registry
The `TaskRegistry` stores all tasks in `.agent_tasks.json`.
The harness polls until every task is `completed` or `failed`.
Dependencies are tracked — blocked tasks auto-unblock when their
prerequisites complete.

### 5. Parallel Teams via asyncio
All teams run simultaneously with `asyncio.gather()`.
If one team's model fails, other teams continue.

## File Structure

```
agent_harness/
├── orchestrator.py      ← Agent, TaskRegistry, MentalModel, skill loader
├── harness.py           ← Team, AgentHarness (top-level runner)
├── run_example.py       ← Example: UI generation for security dashboard
└── workspace/
    ├── skills/          ← Your skill markdown files go here
    ├── outputs/         ← Worker deliverables written here
    ├── .agent_tasks.json← Till-done task registry (auto-created)
    └── .mental_models/  ← Per-agent persistent memory (auto-created)
```

## Usage

```bash
pip install google-genai
export GEMINI_API_KEY=your_key

python run_example.py
```

## Customizing for Your Domain

1. **Add teams** in `run_example.py` by defining more `TeamSpec` objects
2. **Add skills** by dropping `.md` files in `workspace/skills/`
3. **Swap models** per agent via `WorkerSpec(model="gemini-2.5-flash")`
4. **Add tools** in `orchestrator.py`'s `_get_tools()` and `_execute_tool()`

## Model Tiering

| Role         | Model                  | Thinking  |
|--------------|------------------------|-----------|
| Orchestrator | gemini-3-pro-preview   | HIGH      |
| Team Lead    | gemini-3-flash-preview | HIGH      |
| Worker       | gemini-3-flash-preview | LOW       |

Swap `WORKER_MODEL` to `gemini-2.5-flash` for cost reduction at scale.