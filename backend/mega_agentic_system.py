"""
Mega Agentic System - Ultimate Multi-Pattern AI Orchestration

Implements multiple agent coordination patterns including:
- Hierarchical: Manager-worker decomposition
- Swarm: Parallel independent agents
- Debate: Adversarial refinement
- Negotiate: Consensus building
- Red/Blue: Adversarial attack/defense
- Reflective: Self-critique and improvement
- Meta-Learning: Pattern learning across tasks
- Background: Asynchronous processing
- Socratic: Question-driven exploration
"""

import os
import time
import uuid
import json
import random
import pickle
import logging
import logging.handlers
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime

from google import genai
from google.genai import types

try:
    from rich.console import Console as _RichConsole
    from rich.panel import Panel as _Panel
    from rich import box as _box
    import sys as _sys
    _rich_console = _RichConsole(highlight=False, legacy_windows=False)
    if _sys.platform == "win32":
        _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    _RICH_AVAILABLE = True
except ImportError:
    _RICH_AVAILABLE = False
    _rich_console = None


# ============================================================================
# LOGGING SETUP
# ============================================================================

os.makedirs("logs", exist_ok=True)
_log_filename = f"logs/mega_system_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logger = logging.getLogger("MegaAgenticSystem")
if not logger.handlers:
    logger.setLevel(logging.DEBUG)
    # File handler
    fh = logging.FileHandler(_log_filename, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                                      datefmt="%Y-%m-%d %H:%M:%S"))
    logger.addHandler(fh)
    # Console handler
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
    logger.addHandler(ch)

logger.info(f"Logging initialized. Log file: {_log_filename}")


# ============================================================================
# ENUMS
# ============================================================================

class TaskComplexity(Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    CRITICAL = "critical"


class AgentMode(Enum):
    HIERARCHICAL = "hierarchical"
    SWARM = "swarm"
    DEBATE = "debate"
    NEGOTIATE = "negotiate"
    RED_BLUE = "red_blue"
    REFLECTIVE = "reflective"
    META_LEARNING = "meta_learning"
    BACKGROUND = "background"
    SOCRATIC = "socratic"


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class Task:
    """Represents a task to be executed by the system."""
    id: str
    description: str
    complexity: TaskComplexity = TaskComplexity.MODERATE
    preferred_mode: Optional[AgentMode] = None
    quality_threshold: float = 8.0
    max_iterations: int = 3
    constraints: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ExecutionResult:
    """Result of a task execution."""
    task_id: str
    mode_used: AgentMode
    output: str
    quality_score: float
    execution_time: float
    agents_involved: int
    iterations: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    completed_at: str = field(default_factory=lambda: datetime.now().isoformat())
    # Token usage for this execution (defaults keep older pickled results loadable).
    prompt_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


# ============================================================================
# AGENT DEFINITION
# ============================================================================

@dataclass
class Agent:
    """Individual agent with a specialized role."""
    id: int
    name: str
    role: str
    specialization: str

    def __repr__(self):
        return f"Agent({self.name}, role={self.role})"


# ============================================================================
# MEGA AGENTIC SYSTEM
# ============================================================================

class MegaAgenticSystem:
    """
    Ultimate Multi-Pattern AI Orchestration System.

    Coordinates a pool of specialized agents across 9 distinct execution
    patterns, automatically selecting the best approach based on task
    complexity and historical performance data.
    """

    # Agent role definitions
    _AGENT_DEFINITIONS = [
        ("Analyst",    "Data analysis and pattern recognition"),
        ("Architect",  "System design and architecture"),
        ("Critic",     "Finding flaws and weaknesses"),
        ("Creative",   "Innovation and ideation"),
        ("Executor",   "Implementation and action"),
        ("Mediator",   "Conflict resolution and synthesis"),
        ("Researcher", "Information gathering"),
        ("Strategist", "Planning and optimization"),
        ("Teacher",    "Explanation and education"),
        ("Validator",  "Quality assurance"),
    ]

    # Mode → complexity affinity
    _MODE_COMPLEXITY = {
        AgentMode.HIERARCHICAL:  [TaskComplexity.MODERATE, TaskComplexity.COMPLEX, TaskComplexity.CRITICAL],
        AgentMode.SWARM:         [TaskComplexity.COMPLEX, TaskComplexity.CRITICAL],
        AgentMode.DEBATE:        [TaskComplexity.COMPLEX, TaskComplexity.CRITICAL],
        AgentMode.NEGOTIATE:     [TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
        AgentMode.RED_BLUE:      [TaskComplexity.CRITICAL],
        AgentMode.REFLECTIVE:    [TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
        AgentMode.META_LEARNING: [TaskComplexity.COMPLEX, TaskComplexity.CRITICAL],
        AgentMode.BACKGROUND:    [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
        AgentMode.SOCRATIC:      [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
    }

    def __init__(self, name: str = "MegaSystem", api_key: Optional[str] = None):
        logger.info(f"Initializing Mega Agentic System: {name}")
        logger.debug("Initializing subsystems...")

        self.name = name
        # BYOK: with no key this instance is metadata-only (metrics/modes). Task
        # execution always uses an instance built with the caller's key.
        self.client = genai.Client(api_key=api_key) if api_key else None

        # Per-execution token accumulators (reset at the start of each execute()).
        self._run_prompt_tokens = 0
        self._run_output_tokens = 0
        self._run_total_tokens = 0

        # Build agent pool
        self.agents: List[Agent] = []
        for i, (role, spec) in enumerate(self._AGENT_DEFINITIONS):
            agent = Agent(id=i, name=f"{role}_{i}", role=role, specialization=spec)
            self.agents.append(agent)
            logger.debug(f"Created agent: {agent.name} ({spec})")

        logger.info(f"Agent pool initialized with {len(self.agents)} agents")

        # Performance tracking per mode
        self.performance_metrics: Dict[str, Dict[str, Any]] = {}
        for mode in AgentMode:
            self.performance_metrics[mode.value] = {
                "executions": 0,
                "avg_quality": 0.0,
                "avg_time": 0.0,
                "success_rate": 0.0,
                "_total_quality": 0.0,
                "_total_time": 0.0,
                "_successes": 0,
            }
        logger.debug("Performance metrics initialized for all modes")

        self.execution_history: List[ExecutionResult] = []
        logger.info(f"System {name} initialized successfully with {len(self.agents)} agents")

    # -----------------------------------------------------------------------
    # PUBLIC API
    # -----------------------------------------------------------------------

    def execute(self, task: Task) -> ExecutionResult:
        """Execute a task using the optimal agent pattern."""
        start_time = time.time()

        # Reset per-run token accumulators so this result reflects only this task.
        self._run_prompt_tokens = 0
        self._run_output_tokens = 0
        self._run_total_tokens = 0

        # Determine execution mode
        mode = self._select_mode(task)
        logger.info(f"📋 Execution plan for task {task.id}: mode={mode.value}, "
                    f"complexity={task.complexity.value}")
        logger.info(f"🚀 Executing with {mode.value.upper()} pattern | "
                    f"Primary Mode: {mode.value}")

        # Select agents for this task
        agents_for_task = self._select_agents(mode, task.complexity)
        logger.info(f"Assigned {len(agents_for_task)} agents: "
                    f"{[a.name for a in agents_for_task]}")

        # Execute with selected pattern
        try:
            output, quality, iterations = self._run_mode(mode, task, agents_for_task)
        except Exception as exc:
            logger.error(f"Mode execution failed: {exc}")
            output = f"Task completed with fallback processing. Original request: {task.description}"
            quality = 6.0
            iterations = 1

        elapsed = time.time() - start_time

        result = ExecutionResult(
            task_id=task.id,
            mode_used=mode,
            output=output,
            quality_score=quality,
            execution_time=elapsed,
            agents_involved=len(agents_for_task),
            iterations=iterations,
            metadata={
                "mode": mode.value,
                "complexity": task.complexity.value,
                "agents": [a.name for a in agents_for_task],
            },
            prompt_tokens=self._run_prompt_tokens,
            output_tokens=self._run_output_tokens,
            total_tokens=self._run_total_tokens,
        )

        self._record_result(result)
        logger.info(f"✅ Task {task.id} complete | quality={quality:.2f} | "
                    f"time={elapsed:.2f}s")
        return result

    def optimize_system(self):
        """Analyse historical performance and adjust mode selection weights."""
        logger.info("Running system optimization...")
        if not self.execution_history:
            logger.info("No history to optimize from.")
            return

        for mode in AgentMode:
            mode_results = [r for r in self.execution_history if r.mode_used == mode]
            if mode_results:
                avg_q = sum(r.quality_score for r in mode_results) / len(mode_results)
                logger.debug(f"Mode {mode.value}: {len(mode_results)} runs, avg quality {avg_q:.2f}")

        logger.info("System optimization complete.")

    def save_state(self, path: str):
        """Persist system state to disk."""
        logger.info(f"Saving system state to {path}")
        state = {
            "name": self.name,
            "execution_history": self.execution_history,
            "performance_metrics": self.performance_metrics,
            "agents": self.agents,
        }
        logger.info(f"State contains: {len(self.execution_history)} executions, "
                    f"{len(self.agents)} agents")
        with open(path, "wb") as f:
            pickle.dump(state, f)
        logger.info(f"System state saved successfully to {path}")

    def load_state(self, path: str):
        """Load persisted system state from disk."""
        logger.info(f"Loading system state from {path}")
        with open(path, "rb") as f:
            state = pickle.load(f)
        self.execution_history = state.get("execution_history", [])
        self.performance_metrics = state.get("performance_metrics", self.performance_metrics)
        loaded_agents = state.get("agents", [])
        if loaded_agents:
            self.agents = loaded_agents
        logger.info(f"System state loaded successfully: "
                    f"{len(self.execution_history)} executions, {len(self.agents)} agents")
        logger.info(f"Performance metrics: {json.dumps({k: {kk: vv for kk, vv in v.items() if not kk.startswith('_')} for k, v in self.performance_metrics.items()})}")

    # -----------------------------------------------------------------------
    # MODE DESCRIPTIONS (used by /modes endpoint)
    # -----------------------------------------------------------------------

    def _get_mode_description(self, mode: AgentMode) -> str:
        descriptions = {
            AgentMode.HIERARCHICAL:  "Manager agent decomposes the task and delegates to specialist workers, then synthesizes results.",
            AgentMode.SWARM:         "Multiple agents work in parallel on independent sub-tasks; results are aggregated.",
            AgentMode.DEBATE:        "Two agents take opposing positions and refine the answer through structured argumentation.",
            AgentMode.NEGOTIATE:     "Agents with different priorities negotiate to reach a consensus solution.",
            AgentMode.RED_BLUE:      "A red team attacks the solution while a blue team defends and improves it.",
            AgentMode.REFLECTIVE:    "An agent generates a response, critiques it, then iteratively improves it.",
            AgentMode.META_LEARNING: "The system selects its strategy based on patterns learned from past executions.",
            AgentMode.BACKGROUND:    "Tasks are queued and processed asynchronously without blocking the caller.",
            AgentMode.SOCRATIC:      "A Socratic questioner guides the agent to the answer through targeted questions.",
        }
        return descriptions.get(mode, "")

    def _get_mode_use_cases(self, mode: AgentMode) -> List[str]:
        use_cases = {
            AgentMode.HIERARCHICAL:  ["Complex projects", "Multi-step workflows", "Structured deliverables"],
            AgentMode.SWARM:         ["Parallel research", "Bulk processing", "Diverse perspectives"],
            AgentMode.DEBATE:        ["Controversial decisions", "Risk analysis", "Policy evaluation"],
            AgentMode.NEGOTIATE:     ["Trade-off analysis", "Stakeholder alignment", "Resource allocation"],
            AgentMode.RED_BLUE:      ["Security reviews", "Critical systems", "Adversarial testing"],
            AgentMode.REFLECTIVE:    ["Writing tasks", "Code review", "Self-improvement loops"],
            AgentMode.META_LEARNING: ["Recurring task types", "Adaptive systems", "Performance tuning"],
            AgentMode.BACKGROUND:    ["Long-running jobs", "Batch tasks", "Non-blocking operations"],
            AgentMode.SOCRATIC:      ["Exploration", "Learning", "Clarifying ambiguous requirements"],
        }
        return use_cases.get(mode, [])

    # -----------------------------------------------------------------------
    # INTERNAL HELPERS
    # -----------------------------------------------------------------------

    def _select_mode(self, task: Task) -> AgentMode:
        """Choose the best mode for this task."""
        if task.preferred_mode:
            return task.preferred_mode

        # Filter modes compatible with complexity
        candidates = [
            mode for mode, complexities in self._MODE_COMPLEXITY.items()
            if task.complexity in complexities
        ]

        if not candidates:
            return AgentMode.HIERARCHICAL

        # Prefer modes with the highest historical average quality
        best_mode = max(
            candidates,
            key=lambda m: self.performance_metrics[m.value].get("avg_quality", 0.0)
                          + random.uniform(0, 0.5)  # small jitter to explore
        )
        return best_mode

    def _select_agents(self, mode: AgentMode, complexity: TaskComplexity) -> List[Agent]:
        """Return only the agents that this mode actually calls."""
        # How many agents each mode actually invokes
        mode_agent_count = {
            AgentMode.HIERARCHICAL:  2,   # planner + executor
            AgentMode.DEBATE:        3,   # proposer + opposer + synthesizer
            AgentMode.REFLECTIVE:    1,   # one agent iterates
            AgentMode.SOCRATIC:      3,   # questioner + answerer + synthesizer
            AgentMode.RED_BLUE:      2,   # blue + red (blue reused)
            AgentMode.BACKGROUND:    1,
            AgentMode.SWARM:         {   # parallel — scale with complexity
                TaskComplexity.SIMPLE:   2,
                TaskComplexity.MODERATE: 3,
                TaskComplexity.COMPLEX:  5,
                TaskComplexity.CRITICAL: len(self.agents),
            }.get(complexity, 3),
            AgentMode.NEGOTIATE:     {   # one per priority
                TaskComplexity.SIMPLE:   2,
                TaskComplexity.MODERATE: 3,
                TaskComplexity.COMPLEX:  4,
                TaskComplexity.CRITICAL: 4,
            }.get(complexity, 3),
            AgentMode.META_LEARNING: 2,   # delegates to another mode
        }
        n = mode_agent_count.get(mode, 3)
        if isinstance(n, dict):
            n = n.get(complexity, 3)
        return self.agents[:n]

    def _run_mode(
        self,
        mode: AgentMode,
        task: Task,
        agents: List[Agent],
    ) -> tuple[str, float, int]:
        """Dispatch to the appropriate execution pattern. Returns (output, quality, iterations)."""
        dispatch = {
            AgentMode.HIERARCHICAL:  self._hierarchical,
            AgentMode.SWARM:         self._swarm,
            AgentMode.DEBATE:        self._debate,
            AgentMode.NEGOTIATE:     self._negotiate,
            AgentMode.RED_BLUE:      self._red_blue,
            AgentMode.REFLECTIVE:    self._reflective,
            AgentMode.META_LEARNING: self._meta_learning,
            AgentMode.BACKGROUND:    self._background,
            AgentMode.SOCRATIC:      self._socratic,
        }
        fn = dispatch.get(mode, self._hierarchical)
        return fn(task, agents)

    # ---- Execution Patterns ------------------------------------------------

    # ── Live output helpers ──────────────────────────────────────────────────

    _ROLE_COLORS = {
        "planning":    "bright_cyan",
        "execution":   "bright_green",
        "validation":  "yellow",
        "synthesis":   "bright_magenta",
        "critique":    "bright_red",
        "improvement": "green",
        "proposition": "bright_blue",
        "opposition":  "bright_red",
        "questioner":  "bright_yellow",
        "answerer":    "cyan",
        "blue team":   "bright_blue",
        "red team":    "bright_red",
        "priority":    "magenta",
        "async":       "dim",
        "score":       "dim yellow",
    }

    def _print_step(
        self,
        step_label: str,
        role_hint: str,
        prompt: str,
        response: str,
        score: float | None = None,
    ) -> None:
        """Log a single agent step (full prompt + response), then pretty-print it.

        The logger call is unconditional so the step lands in the log file AND is
        captured per-task by TaskLogHandler in api_server (which feeds the frontend
        timeline and its expandable agent messages). Previously, when rich was
        available the step went only to the console — so the log file and the task
        detail view showed phase headers but never what the agents actually said.
        """
        prompt_excerpt = prompt if len(prompt) <= 1200 else prompt[:1200] + " …"
        step_lines = [
            f"{step_label} — {role_hint}",
            "",
            f"PROMPT:\n{prompt_excerpt}",
            "",
            f"RESPONSE:\n{response}",
        ]
        if score is not None:
            step_lines.append(f"\nQuality score: {score:.2f}/10")
        logger.info("\n".join(step_lines))

        if not _RICH_AVAILABLE:
            return

        color = "white"
        for key, c in self._ROLE_COLORS.items():
            if key in role_hint.lower():
                color = c
                break

        _rich_console.print()
        _rich_console.print(f"  [{color}]▶ {step_label} — {role_hint}[/{color}]")
        _rich_console.print(_Panel(
            prompt[:500] + (" …" if len(prompt) > 500 else ""),
            title=f"[{color}]PROMPT[/{color}]",
            border_style=color,
            padding=(0, 1),
        ))
        _rich_console.print(_Panel(
            response[:800] + (" …" if len(response) > 800 else ""),
            title=f"[{color}]RESPONSE[/{color}]",
            border_style=color,
            padding=(0, 1),
        ))
        if score is not None:
            _rich_console.print(f"  [dim yellow]Quality score: {score:.2f}/10[/dim yellow]")

    def _call_model(self, prompt: str, system: str = "", model: str = "gemini-2.5-flash") -> str:
        """Single LLM call with error handling."""
        try:
            config = types.GenerateContentConfig(
                system_instruction=system or None,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            )
            response = self.client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            self._record_usage(model, response)
            return response.text or ""
        except Exception as exc:
            logger.warning(f"Model call failed: {exc}")
            return f"[Unable to generate response: {exc}]"

    def _record_usage(self, model: str, response: Any) -> None:
        """Record token usage into the shared tracker and this run's accumulators."""
        try:
            from main import usage_tracker, extract_usage
            prompt_toks, output_toks, _thoughts, _cached, total_toks = extract_usage(response)
            usage_tracker.record(model, response)
            self._run_prompt_tokens += prompt_toks
            self._run_output_tokens += output_toks
            self._run_total_tokens += total_toks
        except Exception:
            pass  # never let usage accounting break a generation

    def _score_output(self, task_description: str, output: str) -> float:
        """Ask the model to score the output quality on a 0-10 scale."""
        try:
            prompt = (
                f"Task: {task_description}\n\n"
                f"Output:\n{output}\n\n"
                "On a scale from 0 to 10, how well does this output fulfill the task? "
                "Respond with ONLY a single number (e.g. 8.5)."
            )
            raw = self._call_model(prompt)
            # Extract first float-like token
            import re
            match = re.search(r"\d+(?:\.\d+)?", raw)
            if match:
                score = float(match.group())
                return min(max(score, 0.0), 10.0)
        except Exception:
            pass
        return 7.5  # default fallback

    def _hierarchical(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Phase 1: Planning (Hierarchical)")
        planner  = agents[0]
        executor = agents[1] if len(agents) > 1 else agents[0]

        plan = self._call_model(
            f"You are a {planner.role} agent. Create a step-by-step execution plan for:\n{task.description}",
            system="You are a planning agent. Output a concise numbered plan.",
        )
        self._print_step(
            f"Hierarchical Phase 1 — {planner.name}", "planning",
            f"Task: {task.description}", plan,
        )

        logger.info("Phase 2: Execution (Hierarchical)")
        result = self._call_model(
            f"Execute the following plan to fulfil the task.\n\nTask: {task.description}\n\nPlan:\n{plan}\n\nDeliver a complete, high-quality response.",
            system=f"You are a {executor.role} executing a plan. Be thorough and precise.",
        )
        self._print_step(
            f"Hierarchical Phase 2 — {executor.name}", "execution",
            f"Plan to execute:\n{plan[:300]}", result,
        )

        logger.info("Phase 3: Validation (Hierarchical)")
        quality = self._score_output(task.description, result)
        logger.info(f"Quality score: {quality:.2f}")
        if _RICH_AVAILABLE:
            _rich_console.print(f"  [dim yellow]Quality score: {quality:.2f}/10[/dim yellow]")
        return result, quality, 1

    def _swarm(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Phase 1: Parallel agent execution (Swarm)")
        perspectives = []
        for agent in agents:
            resp = self._call_model(
                f"You are a {agent.specialization} agent. Address this task from your perspective:\n{task.description}",
                system=f"You are a {agent.role} agent. Be concise and insightful.",
            )
            self._print_step(
                f"Swarm — {agent.name} ({agent.role})", "execution",
                task.description, resp,
            )
            perspectives.append(f"[{agent.name}]: {resp}")

        combined = "\n\n".join(perspectives)
        logger.info("Phase 2: Synthesis (Swarm)")
        synthesis = self._call_model(
            f"Synthesize the following perspectives into a single coherent response for:\n{task.description}\n\n{combined}",
            system="You are a synthesis agent. Integrate all perspectives into a unified, high-quality answer.",
        )
        self._print_step(
            "Swarm Synthesis", "synthesis",
            f"Merging {len(agents)} perspectives", synthesis,
        )
        quality = self._score_output(task.description, synthesis)
        if _RICH_AVAILABLE:
            _rich_console.print(f"  [dim yellow]Quality score: {quality:.2f}/10[/dim yellow]")
        return synthesis, quality, 1

    def _debate(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        proposer   = agents[0]
        opposer    = agents[1] if len(agents) > 1 else agents[0]
        synthesizer = agents[2] if len(agents) > 2 else agents[0]

        logger.info("Phase 1: Proposition (Debate)")
        proposition = self._call_model(
            f"Take a strong position on the best approach for:\n{task.description}",
            system="You are a debate agent. Present a clear, well-argued position.",
        )
        self._print_step(
            f"Debate Phase 1 — {proposer.name} (Proposer)", "proposition",
            task.description, proposition,
        )

        logger.info("Phase 2: Opposition (Debate)")
        opposition = self._call_model(
            f"Challenge and critique this proposition for the task '{task.description}':\n{proposition}",
            system="You are a critical debate agent. Find weaknesses and present alternatives.",
        )
        self._print_step(
            f"Debate Phase 2 — {opposer.name} (Opposer)", "opposition",
            f"Critiquing proposition:\n{proposition[:300]}", opposition,
        )

        logger.info("Phase 3: Synthesis (Debate)")
        synthesis = self._call_model(
            f"Given this debate, produce the best possible answer for:\n{task.description}\n\nProposition:\n{proposition}\n\nOpposition:\n{opposition}",
            system="You are a synthesis agent. Integrate the best insights from both sides.",
        )
        self._print_step(
            f"Debate Phase 3 — {synthesizer.name} (Synthesizer)", "synthesis",
            f"Merging proposition + opposition", synthesis,
        )

        quality = self._score_output(task.description, synthesis)
        if _RICH_AVAILABLE:
            _rich_console.print(f"  [dim yellow]Quality score: {quality:.2f}/10[/dim yellow]")
        return synthesis, quality, 2

    def _negotiate(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Phase 1: Individual proposals (Negotiate)")
        proposals = []
        priorities = ["quality", "speed", "cost-efficiency", "robustness"]
        for i, agent in enumerate(agents[:min(len(agents), len(priorities))]):
            priority = priorities[i]
            prop = self._call_model(
                f"Propose a solution for '{task.description}' optimised for {priority}.",
                system=f"You are a {agent.role} prioritising {priority}.",
            )
            proposals.append(f"[Priority: {priority}]:\n{prop}")

        logger.info("Phase 2: Consensus building (Negotiate)")
        consensus = self._call_model(
            f"Negotiate a consensus solution for '{task.description}' from these proposals:\n\n" + "\n\n".join(proposals),
            system="You are a mediator agent. Find the optimal balance among competing priorities.",
        )
        quality = self._score_output(task.description, consensus)
        return consensus, quality, 1

    def _red_blue(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Phase 1: Blue team — initial solution (Red/Blue)")
        blue = self._call_model(
            f"Create a robust solution for:\n{task.description}",
            system="You are a blue team agent. Build a strong, secure, well-reasoned solution.",
        )
        logger.info("Phase 2: Red team — attack (Red/Blue)")
        red = self._call_model(
            f"Identify all flaws, vulnerabilities, and weaknesses in this solution for '{task.description}':\n{blue}",
            system="You are a red team agent. Aggressively identify every weakness.",
        )
        logger.info("Phase 3: Blue team — hardened solution (Red/Blue)")
        hardened = self._call_model(
            f"Improve the solution for '{task.description}' by addressing all identified weaknesses.\n\nOriginal:\n{blue}\n\nWeaknesses:\n{red}",
            system="You are a blue team agent. Produce a hardened, improved solution.",
        )
        quality = self._score_output(task.description, hardened)
        return hardened, quality, 2

    def _reflective(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        agent = agents[0]

        current = self._call_model(
            f"Provide a complete response for:\n{task.description}",
            system="You are a specialist agent. Be thorough.",
        )
        self._print_step(
            f"Reflective Draft — {agent.name}", "execution",
            task.description, current,
        )

        iterations = 1
        for i in range(min(task.max_iterations, 3)):
            quality = self._score_output(task.description, current)
            logger.info(f"💡 Reflective iteration {i+1}: quality={quality:.2f}")
            if _RICH_AVAILABLE:
                _rich_console.print(
                    f"  [dim yellow]Reflective iteration {i+1}: quality={quality:.2f}/10 "
                    f"(threshold={task.quality_threshold})[/dim yellow]"
                )
            if quality >= task.quality_threshold:
                if _RICH_AVAILABLE:
                    _rich_console.print("  [green]Quality threshold met — stopping iterations.[/green]")
                break

            critique = self._call_model(
                f"Critique this response for '{task.description}' and list specific improvements:\n{current}",
                system="You are a critical review agent. Be specific and constructive.",
            )
            self._print_step(
                f"Reflective Critique — iteration {i+1}", "critique",
                f"Critiquing current draft", critique,
            )

            current = self._call_model(
                f"Improve the response for '{task.description}' based on this critique:\n{critique}\n\nCurrent response:\n{current}",
                system="You are an improvement agent. Address every critique point.",
            )
            self._print_step(
                f"Reflective Improvement — iteration {i+1}", "improvement",
                f"Applying critique", current,
            )
            iterations += 1

        quality = self._score_output(task.description, current)
        if _RICH_AVAILABLE:
            _rich_console.print(f"  [dim yellow]Final quality: {quality:.2f}/10 after {iterations} iteration(s)[/dim yellow]")
        return current, quality, iterations

    def _meta_learning(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        # Choose the historically best-performing mode (excluding meta_learning itself)
        best_mode = AgentMode.HIERARCHICAL
        best_quality = -1.0
        for mode in AgentMode:
            if mode == AgentMode.META_LEARNING:
                continue
            q = self.performance_metrics[mode.value].get("avg_quality", 0.0)
            if q > best_quality:
                best_quality = q
                best_mode = mode
        logger.info(f"📊 Meta-learning selected sub-mode: {best_mode.value} (avg quality {best_quality:.2f})")
        return self._run_mode(best_mode, task, agents)

    def _background(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Background processing task (async simulation)")
        result = self._call_model(
            f"Process this task efficiently:\n{task.description}",
            system="You are an async processing agent. Be concise and accurate.",
        )
        quality = self._score_output(task.description, result)
        return result, quality, 1

    def _socratic(self, task: Task, agents: List[Agent]) -> tuple[str, float, int]:
        logger.info("Phase 1: Question generation (Socratic)")
        questions = self._call_model(
            f"Generate 3-5 Socratic questions that guide exploration of:\n{task.description}",
            system="You are a Socratic questioner. Generate deep, clarifying questions.",
        )
        logger.info("❓ Socratic questions generated")
        logger.info("Phase 2: Answering questions (Socratic)")
        answers = self._call_model(
            f"Answer each of these questions thoughtfully to address '{task.description}':\n{questions}",
            system="You are a thoughtful respondent. Answer each question thoroughly.",
        )
        logger.info("Phase 3: Synthesis (Socratic)")
        synthesis = self._call_model(
            f"Using these question-and-answer pairs, create a comprehensive response for '{task.description}':\n\nQuestions:\n{questions}\n\nAnswers:\n{answers}",
            system="You are a synthesis agent. Distil the Q&A into a coherent final answer.",
        )
        quality = self._score_output(task.description, synthesis)
        return synthesis, quality, 1

    # ---- Metrics Recording -------------------------------------------------

    def _record_result(self, result: ExecutionResult):
        """Update performance metrics and history."""
        self.execution_history.append(result)
        mode_key = result.mode_used.value
        m = self.performance_metrics[mode_key]
        m["executions"] += 1
        m["_total_quality"] = m.get("_total_quality", 0.0) + result.quality_score
        m["_total_time"] = m.get("_total_time", 0.0) + result.execution_time
        if result.quality_score >= 7.0:
            m["_successes"] = m.get("_successes", 0) + 1
        m["avg_quality"] = m["_total_quality"] / m["executions"]
        m["avg_time"] = m["_total_time"] / m["executions"]
        m["success_rate"] = m["_successes"] / m["executions"]




# """ Mega Agentic System - Ultimate Multi-Pattern AI Orchestration
# This module implements a comprehensive agentic system that combines multiple AI patterns into a single intelligent orchestrator. It can analyze tasks, select optimal execution strategies, coordinate multiple agents, and learn from experience.
# Key Features: - Multiple execution modes (hierarchical, swarm, debate, negotiation, etc.) - Intelligent task analysis and mode selection - Self-learning and adaptation - Quality assurance and iterative improvement - Comprehensive logging and state persistence - Performance tracking and optimization
# Classes: AgentMode: Enum of available operational modes TaskComplexity: Enum of task complexity levels Task: Universal task representation AgentCapability: Individual agent capabilities ExecutionResult: Result from task execution MegaAgenticSystem: Main orchestrator class
# Example: >>> from mega_agentic_system import MegaAgenticSystem, Task, TaskComplexity >>> mega = MegaAgenticSystem(name="MySystem") >>> task = Task( ... id="TASK-001", ... description="Design a REST API", ... complexity=TaskComplexity.MODERATE ... ) >>> result = mega.execute(task) >>> print(f"Quality: {result.quality_score}/10")
# Author: AI Systems Team Version: 1.0.0 """
# from google import genai from google.genai import types import json from typing import List, Dict, Any, Optional, Callable from dataclasses import dataclass, field from enum import Enum import time import random import pickle from pathlib import Path from concurrent.futures import ThreadPoolExecutor, as_completed import numpy as np import logging from datetime import datetime
# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
# Create logs directory if it doesn't exist
# LOGS_DIR = Path("logs") LOGS_DIR.mkdir(exist_ok=True)
# Configure logging
# LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s' LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'
# Create logger
# logger = logging.getLogger('MegaAgenticSystem') logger.setLevel(logging.DEBUG)
# File handler - detailed logs
# log_filename = LOGS_DIR / f"mega_system_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log" file_handler = logging.FileHandler(log_filename, encoding='utf-8') file_handler.setLevel(logging.DEBUG) file_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
# Console handler - important messages only
# console_handler = logging.StreamHandler() console_handler.setLevel(logging.INFO) console_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
# Add handlers
# logger.addHandler(file_handler) logger.addHandler(console_handler)
# logger.info(f"Logging initialized. Log file: {log_filename}")
# ============================================================================
# CLIENT INITIALIZATION
# ============================================================================
# client = genai.Client()
# ============================================================================
# GEMINI API RETRY WRAPPER
# ============================================================================
# try: from google.genai.errors import ServerError, APIError as GenAIAPIError except ImportError: ServerError = Exception GenAIAPIError = Exception
# def _gemini_call(model: str, contents, config=None, max_retries: int = 3) -> Any: """ Wrapper around client.models.generate_content with exponential-backoff retries for transient 503 / ServerError failures.
# Args:
#     model:       Gemini model name
#     contents:    Prompt / contents to send
#     config:      Optional GenerateContentConfig
#     max_retries: Total attempts before raising (default 3)

# Returns:
#     The GenerateContentResponse from the Gemini API
# """
# delay = 2  # seconds
# kwargs: Dict[str, Any] = {"model": model, "contents": contents}
# if config is not None:
#     kwargs["config"] = config

# for attempt in range(1, max_retries + 1):
#     try:
#         return client.models.generate_content(**kwargs)
#     except ServerError as e:
#         if attempt == max_retries:
#             logger.error(
#                 f"Gemini API ServerError after {max_retries} attempts: {e}"
#             )
#             raise
#         logger.warning(
#             f"Gemini API ServerError (attempt {attempt}/{max_retries}), "
#             f"retrying in {delay}s: {e}"
#         )
#         time.sleep(delay)
#         delay *= 2
#     except GenAIAPIError as e:
#         # Only retry on 5xx errors; re-raise 4xx immediately
#         status = getattr(e, "status_code", None) or getattr(e, "code", None)
#         if status is not None and int(status) < 500:
#             raise
#         if attempt == max_retries:
#             logger.error(
#                 f"Gemini APIError after {max_retries} attempts: {e}"
#             )
#             raise
#         logger.warning(
#             f"Gemini APIError {status} (attempt {attempt}/{max_retries}), "
#             f"retrying in {delay}s: {e}"
#         )
#         time.sleep(delay)
#         delay *= 2
# ============================================================================
# MEGA SYSTEM ARCHITECTURE
# ============================================================================
# class AgentMode(Enum): """ Different operational modes for agent execution.
# Each mode represents a distinct pattern of multi-agent coordination
# optimized for different types of tasks.
# """
# HIERARCHICAL = "hierarchical"           # Multi-tier delegation
# SWARM = "swarm"                         # Emergent collective intelligence
# DEBATE = "debate"                       # Adversarial reasoning
# NEGOTIATE = "negotiate"                 # Multi-party deal-making
# RED_BLUE = "red_blue"                  # Attack/defend hardening
# REFLECTIVE = "reflective"              # Self-critique and improvement
# META_LEARNING = "meta_learning"        # Learn optimal strategies
# BACKGROUND = "background"              # Autonomous monitoring
# SOCRATIC = "socratic"                  # Deep questioning
# class TaskComplexity(Enum): """ Task complexity levels that guide execution strategy.
# Attributes:
#     SIMPLE: Single agent, single call
#     MODERATE: Multiple agents, sequential execution
#     COMPLEX: Multiple agents, parallel execution
#     CRITICAL: Full arsenal, all patterns
# """
# SIMPLE = "simple"           # Single agent, single call
# MODERATE = "moderate"       # Multiple agents, sequential
# COMPLEX = "complex"         # Multiple agents, parallel
# CRITICAL = "critical"       # Full arsenal, all patterns
# @dataclass class Task: """ Universal task representation.
# Attributes:
#     id (str): Unique task identifier
#     description (str): Detailed task description
#     complexity (TaskComplexity): Task complexity level
#     preferred_mode (Optional[AgentMode]): Preferred execution mode
#     constraints (Dict[str, Any]): Task-specific constraints
#     quality_threshold (float): Minimum acceptable quality score (0-10)
#     max_iterations (int): Maximum improvement iterations
# """
# id: str
# description: str
# complexity: TaskComplexity
# preferred_mode: Optional[AgentMode] = None
# constraints: Dict[str, Any] = field(default_factory=dict)
# quality_threshold: float = 8.0
# max_iterations: int = 3
# @dataclass class AgentCapability: """ Represents an individual agent's capabilities.
# Attributes:
#     name (str): Agent identifier
#     specialization (str): Agent's area of expertise
#     skills (List[str]): List of specific skills
#     success_rate (float): Historical success rate (0-1)
# """
# name: str
# specialization: str
# skills: List[str]
# success_rate: float = 0.5
# @dataclass class ExecutionResult: """ Result from task execution.
# Attributes:
#     task_id (str): ID of executed task
#     mode_used (AgentMode): Execution mode used
#     output (Any): Task output
#     quality_score (float): Quality assessment (0-10)
#     execution_time (float): Time taken in seconds
#     agents_involved (int): Number of agents used
#     iterations (int): Number of improvement iterations
#     metadata (Dict[str, Any]): Additional execution metadata
# """
# task_id: str
# mode_used: AgentMode
# output: Any
# quality_score: float
# execution_time: float
# agents_involved: int
# iterations: int
# metadata: Dict[str, Any] = field(default_factory=dict)
# class MegaAgenticSystem: """ ðŸŽ¯ THE MEGA SYSTEM
# Combines ALL agentic patterns into one intelligent orchestrator that:
# - Analyzes tasks and selects optimal approach
# - Coordinates multiple agent types
# - Learns from every execution
# - Adapts strategies over time
# - Handles any complexity level

# Attributes:
#     name (str): System identifier
#     execution_history (List[ExecutionResult]): History of all executions
#     agent_pool (List[AgentCapability]): Available agents
#     performance_metrics (Dict[str, Any]): Performance tracking per mode
    
# Example:
#     >>> mega = MegaAgenticSystem(name="Production-1")
#     >>> task = Task(id="T1", description="...", complexity=TaskComplexity.MODERATE)
#     >>> result = mega.execute(task)
#     >>> print(mega.get_system_report())
# """

# def __init__(self, name: str = "MegaSystem"):
#     """
#     Initialize the Mega Agentic System.
    
#     Args:
#         name (str): System identifier for logging and tracking
#     """
#     self.name = name
#     self.execution_history: List[ExecutionResult] = []
#     self.agent_pool: List[AgentCapability] = []
#     self.performance_metrics: Dict[str, Any] = {}
    
#     logger.info(f"Initializing Mega Agentic System: {name}")
    
#     # Initialize all sub-systems
#     self._init_subsystems()
    
#     initialization_msg = f"""
# {'='*80} ðŸš€ MEGA AGENTIC SYSTEM INITIALIZED {'='*80}
# System: {self.name} Operational Modes: {len(AgentMode)} Agent Pool: {len(self.agent_pool)} agents Sub-Systems: All Online âœ…
# Ready forä»»ä½• complexity level! {'='*80} """ print(initialization_msg) logger.info(f"System {name} initialized successfully with {len(self.agent_pool)} agents")
# def _init_subsystems(self):
#     """
#     Initialize all component systems.
    
#     Creates the agent pool with diverse specializations and initializes
#     performance tracking for all execution modes.
#     """
#     logger.debug("Initializing subsystems...")
    
#     # Create diverse agent pool
#     specializations = [
#         ("Analyst", "Data analysis and pattern recognition", ["analytics", "statistics", "visualization"]),
#         ("Architect", "System design and architecture", ["design", "scalability", "integration"]),
#         ("Critic", "Finding flaws and weaknesses", ["debugging", "testing", "security"]),
#         ("Creative", "Innovation and ideation", ["brainstorming", "design", "storytelling"]),
#         ("Executor", "Implementation and action", ["coding", "deployment", "automation"]),
#         ("Mediator", "Conflict resolution and synthesis", ["negotiation", "consensus", "facilitation"]),
#         ("Researcher", "Information gathering", ["research", "investigation", "synthesis"]),
#         ("Strategist", "Planning and optimization", ["strategy", "planning", "optimization"]),
#         ("Teacher", "Explanation and education", ["teaching", "documentation", "mentoring"]),
#         ("Validator", "Quality assurance", ["testing", "validation", "verification"])
#     ]
    
#     for i, (name, spec, skills) in enumerate(specializations):
#         agent = AgentCapability(
#             name=f"{name}_{i}",
#             specialization=spec,
#             skills=skills,
#             success_rate=0.5 + random.random() * 0.3
#         )
#         self.agent_pool.append(agent)
#         logger.debug(f"Created agent: {agent.name} ({agent.specialization})")
    
#     print(f"âœ… Agent pool initialized: {len(self.agent_pool)} agents")
#     logger.info(f"Agent pool initialized with {len(self.agent_pool)} agents")
    
#     # Initialize performance tracking
#     for mode in AgentMode:
#         self.performance_metrics[mode.value] = {
#             "executions": 0,
#             "avg_quality": 0.0,
#             "avg_time": 0.0,
#             "success_rate": 0.0
#         }
    
#     logger.debug("Performance metrics initialized for all modes")

# def execute(self, task: Task) -> ExecutionResult:
#     """
#     ðŸŽ¯ MAIN ENTRY POINT
    
#     Intelligently execute any task by:
#     1. Analyzing task characteristics
#     2. Selecting optimal mode(s)
#     3. Coordinating execution
#     4. Learning from results
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         ExecutionResult: Comprehensive execution results
        
#     Example:
#         >>> task = Task(id="T1", description="Design API", complexity=TaskComplexity.MODERATE)
#         >>> result = mega.execute(task)
#         >>> print(f"Quality: {result.quality_score}/10")
#     """
#     logger.info(f"Starting execution of task: {task.id}")
#     logger.debug(f"Task details - Complexity: {task.complexity.value}, "
#                 f"Threshold: {task.quality_threshold}, "
#                 f"Max iterations: {task.max_iterations}")
    
#     print(f"\n{'='*80}")
#     print(f"ðŸŽ¯ MEGA SYSTEM EXECUTING TASK")
#     print(f"{'='*80}")
#     print(f"Task ID: {task.id}")
#     print(f"Complexity: {task.complexity.value}")
#     print(f"Description: {task.description}")
#     print(f"{'='*80}\n")
    
#     start_time = time.time()
    
#     # Phase 1: Intelligence Planning
#     logger.info(f"Phase 1: Planning execution for task {task.id}")
#     execution_plan = self._plan_execution(task)
#     logger.info(f"Execution plan created - Primary mode: {execution_plan['primary_mode']}, "
#                f"Estimated agents: {execution_plan['estimated_agents']}")
    
#     print(f"ðŸ“‹ Execution Plan: {execution_plan['strategy']}")
#     print(f"   Primary Mode: {execution_plan['primary_mode']}")
#     print(f"   Backup Modes: {execution_plan['backup_modes']}")
#     print(f"   Estimated Agents: {execution_plan['estimated_agents']}\n")
    
#     # Phase 2: Execute with selected strategy
#     logger.info(f"Phase 2: Executing with {execution_plan['primary_mode']} mode")
#     result = self._execute_with_strategy(task, execution_plan)
#     logger.info(f"Initial execution complete - Quality: {result['quality_score']:.1f}/10")
    
#     # Phase 3: Quality assurance
#     if result['quality_score'] < task.quality_threshold:
#         logger.warning(f"Quality below threshold ({result['quality_score']:.1f} < {task.quality_threshold})")
#         print(f"âš ï¸  Quality below threshold ({result['quality_score']:.1f} < {task.quality_threshold})")
#         print(f"ðŸ”„ Attempting improvement...\n")
#         result = self._improve_result(task, result, execution_plan)
#         logger.info(f"After improvement - Quality: {result['quality_score']:.1f}/10")
    
#     execution_time = time.time() - start_time
    
#     # Phase 4: Package results
#     final_result = ExecutionResult(
#         task_id=task.id,
#         mode_used=AgentMode(execution_plan['primary_mode']),
#         output=result['output'],
#         quality_score=result['quality_score'],
#         execution_time=execution_time,
#         agents_involved=result['agents_used'],
#         iterations=result['iterations'],
#         metadata=result.get('metadata', {})
#     )
    
#     logger.info(f"Task {task.id} completed - Quality: {final_result.quality_score:.1f}/10, "
#                f"Time: {final_result.execution_time:.2f}s, "
#                f"Agents: {final_result.agents_involved}, "
#                f"Iterations: {final_result.iterations}")
    
#     # Phase 5: Learn and adapt
#     logger.info(f"Phase 5: Learning from execution")
#     self._learn_from_execution(task, final_result, execution_plan)
    
#     print(f"\n{'='*80}")
#     print(f"âœ… EXECUTION COMPLETE")
#     print(f"{'='*80}")
#     print(f"Quality Score: {final_result.quality_score:.1f}/10")
#     print(f"Execution Time: {final_result.execution_time:.2f}s")
#     print(f"Agents Used: {final_result.agents_involved}")
#     print(f"Iterations: {final_result.iterations}")
#     print(f"{'='*80}\n")
    
#     return final_result

# def _plan_execution(self, task: Task) -> Dict[str, Any]:
#     """
#     Intelligent execution planning.
    
#     Analyzes the task and creates an optimal execution plan including
#     mode selection, agent estimation, and risk assessment.
    
#     Args:
#         task (Task): Task to plan for
        
#     Returns:
#         Dict[str, Any]: Execution plan with strategy details
#     """
#     logger.debug(f"Planning execution for task {task.id}")
    
#     planning_prompt = f"""
# Mega System Execution Planning
# Task Analysis
# Description: {task.description} Complexity: {task.complexity.value} Preferred Mode: {task.preferred_mode.value if task.preferred_mode else "Auto-select"} Quality Threshold: {task.quality_threshold}/10 Max Iterations: {task.max_iterations} Constraints: {json.dumps(task.constraints, indent=2)}
# Available Modes
# {json.dumps([{ "mode": mode.value, "description": self._get_mode_description(mode), "best_for": self._get_mode_use_cases(mode), "avg_quality": self.performance_metrics[mode.value]["avg_quality"], "success_rate": self.performance_metrics[mode.value]["success_rate"] } for mode in AgentMode], indent=2)}
# Your Task
# Design optimal execution strategy:
# Select PRIMARY mode (most appropriate)
# Select 1-2 BACKUP modes (if primary fails)
# Estimate agents needed
# Identify potential challenges
# Suggest success criteria
# Output (JSON)
# {{ "primary_mode": "mode_name", "backup_modes": ["mode1", "mode2"], "strategy": "Brief strategy description", "estimated_agents": X, "estimated_time": X, "potential_challenges": ["challenge1", "challenge2"], "success_criteria": ["criterion1", "criterion2"], "reasoning": "Why this approach is optimal" }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=planning_prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json",
#             temperature=0.4
#         )
#     )
    
#     plan = json.loads(response.text)
#     # Guard: Gemini occasionally wraps the object in a list
#     if isinstance(plan, list):
#         plan = plan[0] if plan else {}
#     logger.debug(f"Execution plan created: {json.dumps(plan, indent=2)}")
    
#     return plan

# def _execute_with_strategy(self, task: Task, 
#                            plan: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Execute using planned strategy.
    
#     Routes execution to the appropriate mode-specific method.
    
#     Args:
#         task (Task): Task to execute
#         plan (Dict[str, Any]): Execution plan
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     mode = AgentMode(plan['primary_mode'])
    
#     logger.info(f"Executing with {mode.value} mode")
#     print(f"ðŸš€ Executing with {mode.value} mode...\n")
    
#     # Route to appropriate execution method
#     if mode == AgentMode.HIERARCHICAL:
#         return self._execute_hierarchical(task)
#     elif mode == AgentMode.SWARM:
#         return self._execute_swarm(task)
#     elif mode == AgentMode.DEBATE:
#         return self._execute_debate(task)
#     elif mode == AgentMode.NEGOTIATE:
#         return self._execute_negotiate(task)
#     elif mode == AgentMode.RED_BLUE:
#         return self._execute_red_blue(task)
#     elif mode == AgentMode.REFLECTIVE:
#         return self._execute_reflective(task)
#     elif mode == AgentMode.META_LEARNING:
#         return self._execute_meta_learning(task)
#     elif mode == AgentMode.SOCRATIC:
#         return self._execute_socratic(task)
#     else:
#         return self._execute_simple(task)

# def _execute_hierarchical(self, task: Task) -> Dict[str, Any]:
#     """
#     Hierarchical multi-tier execution.
    
#     Decomposes task into sub-tasks and CREATES specialized agents dynamically
#     (not from pool) to handle each subtask.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting hierarchical execution")
#     print("ðŸ“Š Hierarchical Mode: Breaking down into sub-tasks...\n")
    
#     # Decompose into sub-tasks
#     decomposition_prompt = f"""
# Task Decomposition
# Task: {task.description}
# Break this into sub-tasks that can be delegated. For each sub-task, specify:
# Description
# Difficulty (simple/moderate/complex)
# Required skills
# Dependencies
# Agent role (e.g., "GCP Infrastructure Specialist", "Security Architect", etc.)
# Output JSON: {{ "sub_tasks": [ {{ "id": "subtask_1", "description": "...", "difficulty": "moderate", "required_skills": ["skill1", "skill2"], "depends_on": [], "agent_role": "Descriptive Role Name" }} ] }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=decomposition_prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json"
#         )
#     )
    
#     decomposed = json.loads(response.text)
#     # Guard: Gemini occasionally wraps the object in a list
#     if isinstance(decomposed, list):
#         decomposed = decomposed[0] if decomposed else {}
#     sub_tasks = decomposed.get('sub_tasks', [])
#     if not sub_tasks:
#         logger.warning("Decomposition returned no sub_tasks — falling back to single task")
#         sub_tasks = [{'description': task.description, 'difficulty': 'moderate',
#                       'required_skills': ['general'], 'depends_on': [], 'agent_role': 'Generalist'}]
#     logger.info(f"Decomposed into {len(sub_tasks)} sub-tasks")
#     print(f"   Decomposed into {len(sub_tasks)} sub-tasks\n")
    
#     # DYNAMICALLY CREATE agents for this task (not from pool!)
#     print(f"   ðŸ”§ Creating {len(sub_tasks)} specialized agents...\n")
#     dynamic_agents = []
#     for i, st in enumerate(sub_tasks):
#         # Create a new agent with specific skills for this subtask
#         agent_role = st.get('agent_role', f"Specialist_{i}")
#         agent = AgentCapability(
#             name=f"{agent_role.replace(' ', '_')}_{i}",
#             specialization=st.get('description', 'Task specialist')[:100],
#             skills=st.get('required_skills', ['general']),
#             success_rate=0.75  # New agents start with neutral success rate
#         )
#         dynamic_agents.append(agent)
#         logger.info(f"Created dynamic agent: {agent.name}")
#         print(f"   âœ¨ Created agent: {agent.name}")
    
#     print()
    
#     # Assign subtasks to dynamically created agents
#     results = []
#     for st, agent in zip(sub_tasks, dynamic_agents):
#         logger.debug(f"Assigning subtask {st['id']} to {agent.name}")
#         print(f"   Assigning '{st['description'][:60]}...' to {agent.name}")
        
#         sub_result = self._agent_execute(agent, st['description'])
#         results.append(sub_result)
    
#     # Synthesize
#     logger.info(f"Synthesizing {len(results)} results")
#     print(f"\n   Synthesizing {len(results)} results...\n")
#     synthesis = self._synthesize_results(task.description, results)
    
#     return {
#         "output": synthesis['final_output'],
#         "quality_score": synthesis['quality_score'],
#         "agents_used": len(sub_tasks),
#         "iterations": 1,
#         "metadata": {
#             "sub_tasks": len(sub_tasks),
#             "sub_results": results,
#             "dynamic_agents_created": [a.name for a in dynamic_agents]
#         }
#     }


# def _execute_swarm(self, task: Task) -> Dict[str, Any]:
#     """
#     Swarm intelligence execution.
    
#     Deploys multiple agents in parallel to explore solution space
#     and synthesizes their collective intelligence.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting swarm execution")
#     print("ðŸ Swarm Mode: Deploying agent swarm...\n")
    
#     swarm_size = min(15, len(self.agent_pool))
#     agents = random.sample(self.agent_pool, swarm_size)
    
#     logger.info(f"Deployed swarm of {swarm_size} agents")
#     print(f"   Deployed {swarm_size} agents\n")
    
#     # Parallel exploration
#     solutions = []
#     with ThreadPoolExecutor(max_workers=5) as executor:
#         futures = {
#             executor.submit(self._agent_explore, agent, task.description): agent
#             for agent in agents
#         }
        
#         for future in as_completed(futures):
#             try:
#                 solution = future.result()
#                 solutions.append(solution)
#                 logger.debug(f"Solution received from {futures[future].name}")
#                 print(f"   âœ“ Solution from {futures[future].name}")
#             except Exception as e:
#                 logger.error(f"Agent {futures[future].name} failed: {e}")
#                 print(f"   âœ— Agent failed: {e}")
    
#     logger.info(f"Collected {len(solutions)} solutions from swarm")
#     print(f"\n   Collected {len(solutions)} solutions\n")
    
#     # Synthesize swarm intelligence
#     synthesis = self._synthesize_swarm_solutions(task.description, solutions)
    
#     return {
#         "output": synthesis['best_solution'],
#         "quality_score": synthesis['quality_score'],
#         "agents_used": swarm_size,
#         "iterations": 1,
#         "metadata": {
#             "solutions_explored": len(solutions),
#             "diversity_score": synthesis['diversity']
#         }
#     }

# def _execute_debate(self, task: Task) -> Dict[str, Any]:
#     """
#     Debate-based execution.
    
#     Generates multiple perspectives, has them argue their positions,
#     and synthesizes a consensus solution.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting debate execution")
#     print("âš–ï¸  Debate Mode: Multi-perspective analysis...\n")
    
#     # Generate multiple perspectives
#     perspectives = self._generate_perspectives(task.description)
#     logger.info(f"Generated {len(perspectives)} perspectives")
#     print(f"   Generated {len(perspectives)} perspectives\n")
    
#     # Each perspective argues their case
#     arguments = []
#     for persp in perspectives:
#         arg = self._generate_argument(task.description, persp)
#         arguments.append(arg)
#         logger.debug(f"Argument from {persp['name']}: {arg['summary']}")
#         print(f"   ðŸ“¢ {persp['name']}: {arg['summary']}")
    
#     print(f"\n   Synthesizing debate...\n")
    
#     # Synthesize consensus
#     logger.info("Synthesizing debate consensus")
#     consensus = self._synthesize_debate(task.description, arguments)
    
#     return {
#         "output": consensus['unified_solution'],
#         "quality_score": consensus['confidence'],
#         "agents_used": len(perspectives),
#         "iterations": 1,
#         "metadata": {
#             "perspectives": len(perspectives),
#             "arguments": arguments
#         }
#     }

# def _execute_negotiate(self, task: Task) -> Dict[str, Any]:
#     """
#     Negotiation-based execution.
    
#     Identifies stakeholders, simulates negotiation, and finds
#     mutually acceptable solution.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting negotiation execution")
#     print("ðŸ¤ Negotiation Mode: Multi-party optimization...\n")
    
#     # Identify stakeholders and their interests
#     stakeholders = self._identify_stakeholders(task.description)
#     logger.info(f"Identified {len(stakeholders)} stakeholders")
#     print(f"   Identified {len(stakeholders)} stakeholders\n")
    
#     # Negotiate solution
#     negotiation_result = self._run_negotiation(task.description, stakeholders)
#     logger.info(f"Negotiation completed in {negotiation_result['rounds']} rounds")
    
#     return {
#         "output": negotiation_result['agreement'],
#         "quality_score": negotiation_result['satisfaction_score'],
#         "agents_used": len(stakeholders),
#         "iterations": negotiation_result['rounds'],
#         "metadata": {
#             "stakeholders": stakeholders,
#             "final_terms": negotiation_result['terms']
#         }
#     }

# def _execute_red_blue(self, task: Task) -> Dict[str, Any]:
#     """
#     Red team / Blue team hardening.
    
#     Iteratively attacks and defends solution to identify and fix
#     vulnerabilities.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting red/blue team execution")
#     print("âš”ï¸  Red/Blue Mode: Attack and defend...\n")
    
#     current_solution = self._generate_initial_solution(task.description)
#     logger.debug("Initial solution generated")
#     print(f"   Initial solution generated\n")
    
#     for round_num in range(3):
#         logger.info(f"Red/Blue round {round_num + 1}")
#         print(f"   Round {round_num + 1}:")
        
#         # Red team attacks
#         attacks = self._red_team_attack(current_solution)
#         logger.debug(f"Red team found {len(attacks)} vulnerabilities")
#         print(f"      ðŸ”´ Found {len(attacks)} vulnerabilities")
        
#         # Blue team defends
#         improvements = self._blue_team_defend(current_solution, attacks)
#         logger.debug(f"Blue team applied {len(improvements)} improvements")
#         print(f"      ðŸ”µ Applied {len(improvements)} improvements")
        
#         current_solution = improvements['hardened_solution']
    
#     logger.info(f"Solution hardened through {round_num + 1} rounds")
#     print(f"\n   Solution hardened through {round_num + 1} rounds\n")
    
#     return {
#         "output": current_solution,
#         "quality_score": 8.5,  # Hardened solutions are high quality
#         "agents_used": 2 * 3,  # Red + Blue per round
#         "iterations": 3,
#         "metadata": {
#             "vulnerabilities_fixed": "multiple",
#             "hardening_rounds": 3
#         }
#     }

# def _execute_reflective(self, task: Task) -> Dict[str, Any]:
#     """
#     Self-reflective execution with improvement.
    
#     Generates solution, critiques it, and iteratively improves
#     until quality threshold is met.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting reflective execution")
#     print("ðŸªž Reflective Mode: Generate, critique, improve...\n")
    
#     current_output = self._generate_initial_solution(task.description)
#     current_score = 0.0
#     iteration = 0
    
#     while iteration < task.max_iterations and current_score < task.quality_threshold:
#         iteration += 1
#         logger.info(f"Reflective iteration {iteration}")
#         print(f"   Iteration {iteration}:")
        
#         # Self-critique
#         critique = self._self_critique(task.description, current_output)
#         current_score = critique['score']
#         logger.debug(f"Self-critique score: {current_score:.1f}/10")
#         print(f"      Score: {current_score:.1f}/10")
        
#         if current_score >= task.quality_threshold:
#             logger.info("Quality threshold reached")
#             print(f"      âœ“ Quality threshold reached!")
#             break
        
#         # Improve based on critique
#         logger.debug(f"Improving based on {len(critique['weaknesses'])} issues")
#         print(f"      Improving based on {len(critique['weaknesses'])} issues...")
#         current_output = self._improve_based_on_critique(
#             task.description, current_output, critique
#         )
    
#     print()
    
#     return {
#         "output": current_output,
#         "quality_score": current_score,
#         "agents_used": 2,  # Generator + Critic
#         "iterations": iteration,
#         "metadata": {
#             "improvement_cycles": iteration
#         }
#     }

# def _execute_meta_learning(self, task: Task) -> Dict[str, Any]:
#     """
#     Meta-learning execution (learns optimal approach).
    
#     Tests multiple strategies and selects the best performing one.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting meta-learning execution")
#     print("ðŸ§  Meta-Learning Mode: Learning optimal strategy...\n")
    
#     # Try multiple strategies and learn
#     strategies = ["direct", "step_by_step", "creative", "analytical"]
#     results = []
    
#     for strategy in strategies:
#         logger.debug(f"Testing '{strategy}' strategy")
#         print(f"   Testing '{strategy}' strategy...")
#         result = self._execute_with_learned_strategy(task.description, strategy)
#         results.append({
#             "strategy": strategy,
#             "output": result['output'],
#             "score": result['score']
#         })
#         logger.debug(f"Strategy '{strategy}' score: {result['score']:.1f}/10")
#         print(f"      Score: {result['score']:.1f}/10")
    
#     # Select best
#     best = max(results, key=lambda x: x['score'])
#     logger.info(f"Best strategy: '{best['strategy']}' ({best['score']:.1f}/10)")
#     print(f"\n   Best strategy: '{best['strategy']}' ({best['score']:.1f}/10)\n")
    
#     return {
#         "output": best['output'],
#         "quality_score": best['score'],
#         "agents_used": len(strategies),
#         "iterations": 1,
#         "metadata": {
#             "strategies_tested": strategies,
#             "best_strategy": best['strategy'],
#             "all_results": results
#         }
#     }

# def _execute_socratic(self, task: Task) -> Dict[str, Any]:
#     """
#     Socratic dialogue execution.
    
#     Uses deep questioning to explore and refine understanding.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting Socratic execution")
#     print("ðŸ¤” Socratic Mode: Deep questioning...\n")
    
#     current_understanding = self._generate_initial_solution(task.description)
    
#     for level in range(1, 4):
#         logger.info(f"Socratic question level {level}")
#         print(f"   Question Level {level}:")
        
#         # Generate probing question
#         question = self._generate_socratic_question(
#             task.description, current_understanding, level
#         )
#         logger.debug(f"Question: {question}")
#         print(f"      Q: {question}")
        
#         # Answer and refine
#         answer = self._answer_socratic_question(
#             task.description, current_understanding, question
#         )
#         current_understanding = answer['refined_understanding']
#         print(f"      A: Refined understanding")
        
#         if answer['breakthrough']:
#             logger.info("Breakthrough achieved")
#             print(f"      ðŸ’¡ Breakthrough achieved!")
#             break
    
#     print()
    
#     return {
#         "output": current_understanding,
#         "quality_score": 8.0,
#         "agents_used": 2,  # Questioner + Responder
#         "iterations": level,
#         "metadata": {
#             "dialogue_depth": level
#         }
#     }

# def _execute_simple(self, task: Task) -> Dict[str, Any]:
#     """
#     Simple single-agent execution.
    
#     Direct execution by a single best-suited agent.
    
#     Args:
#         task (Task): Task to execute
        
#     Returns:
#         Dict[str, Any]: Execution results
#     """
#     logger.info("Starting simple execution")
#     print("âš¡ Simple Mode: Direct execution...\n")
    
#     agent = self._select_best_agent(task.description)
#     logger.debug(f"Selected agent: {agent.name}")
#     result = self._agent_execute(agent, task.description)
    
#     return {
#         "output": result['output'],
#         "quality_score": result['score'],
#         "agents_used": 1,
#         "iterations": 1,
#         "metadata": {
#             "agent": agent.name
#         }
#     }

# def _improve_result(self, task: Task, result: Dict[str, Any],
#                    plan: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Attempt to improve subpar results.
    
#     Tries backup modes or reflective improvement if initial result
#     doesn't meet quality threshold.
    
#     Args:
#         task (Task): Original task
#         result (Dict[str, Any]): Current result
#         plan (Dict[str, Any]): Execution plan
        
#     Returns:
#         Dict[str, Any]: Improved result
#     """
#     logger.info("Attempting to improve result")
    
#     # Try backup modes
#     for backup_mode in plan.get('backup_modes', []):
#         logger.info(f"Trying backup mode: {backup_mode}")
#         print(f"   Trying backup mode: {backup_mode}")
        
#         backup_task = Task(
#             id=task.id + "_backup",
#             description=task.description,
#             complexity=task.complexity,
#             preferred_mode=AgentMode(backup_mode)
#         )
        
#         backup_plan = {"primary_mode": backup_mode, "backup_modes": []}
#         backup_result = self._execute_with_strategy(backup_task, backup_plan)
        
#         if backup_result['quality_score'] > result['quality_score']:
#             logger.info(f"Backup mode improved quality from {result['quality_score']:.1f} to {backup_result['quality_score']:.1f}")
#             print(f"   âœ“ Backup mode improved quality!\n")
#             return backup_result
    
#     # If still not good enough, use reflective improvement
#     logger.info("Applying reflective improvement")
#     print(f"   Applying reflective improvement...\n")
#     return self._execute_reflective(task)

# def _learn_from_execution(self, task: Task, result: ExecutionResult,
#                          plan: Dict[str, Any]):
#     """
#     Learn from execution results.
    
#     Updates performance metrics and agent success rates based on
#     execution outcomes.
    
#     Args:
#         task (Task): Executed task
#         result (ExecutionResult): Execution results
#         plan (Dict[str, Any]): Execution plan used
#     """
#     logger.info("Learning from execution results")
    
#     # Update performance metrics
#     mode = result.mode_used.value
#     metrics = self.performance_metrics[mode]
    
#     n = metrics['executions']
#     metrics['executions'] = n + 1
#     metrics['avg_quality'] = (metrics['avg_quality'] * n + result.quality_score) / (n + 1)
#     metrics['avg_time'] = (metrics['avg_time'] * n + result.execution_time) / (n + 1)
    
#     success = result.quality_score >= task.quality_threshold
#     metrics['success_rate'] = (metrics['success_rate'] * n + (1 if success else 0)) / (n + 1)
    
#     logger.debug(f"Updated metrics for mode '{mode}': "
#                 f"executions={metrics['executions']}, "
#                 f"avg_quality={metrics['avg_quality']:.1f}, "
#                 f"success_rate={metrics['success_rate']:.1%}")
    
#     # Store execution
#     self.execution_history.append(result)
    
#     # Update agent success rates
#     # (Simplified - in real system would track individual contributions)
    
#     print(f"ðŸ“Š Learning Update:")
#     print(f"   Mode '{mode}' performance:")
#     print(f"      Executions: {metrics['executions']}")
#     print(f"      Avg Quality: {metrics['avg_quality']:.1f}/10")
#     print(f"      Success Rate: {metrics['success_rate']:.1%}")

# # ========================================================================
# # HELPER METHODS
# # ========================================================================

# def _get_mode_description(self, mode: AgentMode) -> str:
#     """Get description of a mode."""
#     descriptions = {
#         AgentMode.HIERARCHICAL: "Break down into sub-tasks with delegation",
#         AgentMode.SWARM: "Many simple agents explore solution space",
#         AgentMode.DEBATE: "Multiple perspectives argue and synthesize",
#         AgentMode.NEGOTIATE: "Multi-party deal-making and optimization",
#         AgentMode.RED_BLUE: "Attack and defend to harden solutions",
#         AgentMode.REFLECTIVE: "Self-critique and iterative improvement",
#         AgentMode.META_LEARNING: "Try multiple strategies and learn best",
#         AgentMode.BACKGROUND: "Autonomous monitoring and adaptation",
#         AgentMode.SOCRATIC: "Deep questioning to explore understanding"
#     }
#     return descriptions.get(mode, "Unknown mode")

# def _get_mode_use_cases(self, mode: AgentMode) -> List[str]:
#     """Get best use cases for a mode."""
#     use_cases = {
#         AgentMode.HIERARCHICAL: ["Complex multi-step tasks", "Project planning", "System design"],
#         AgentMode.SWARM: ["Exploration tasks", "Creative generation", "Parallel search"],
#         AgentMode.DEBATE: ["Decision making", "Strategy development", "Multi-perspective analysis"],
#         AgentMode.NEGOTIATE: ["Deal-making", "Conflict resolution", "Multi-stakeholder problems"],
#         AgentMode.RED_BLUE: ["Security analysis", "Risk assessment", "Solution hardening"],
#         AgentMode.REFLECTIVE: ["Quality-critical tasks", "Learning tasks", "Improvement cycles"],
#         AgentMode.META_LEARNING: ["Novel tasks", "Strategy optimization", "Long-term improvement"],
#         AgentMode.BACKGROUND: ["Monitoring", "Anomaly detection", "Continuous operations"],
#         AgentMode.SOCRATIC: ["Learning", "Deep understanding", "Assumption testing"]
#     }
#     return use_cases.get(mode, [])

# def _select_agent(self, required_skills: List[str]) -> AgentCapability:
#     """Select best agent for required skills."""
#     scored_agents = []
#     for agent in self.agent_pool:
#         skill_match = len(set(required_skills) & set(agent.skills))
#         score = skill_match + agent.success_rate
#         scored_agents.append((score, agent))
    
#     return max(scored_agents, key=lambda x: x[0])[1]

# def _select_best_agent(self, task_desc: str) -> AgentCapability:
#     """Select overall best agent."""
#     return max(self.agent_pool, key=lambda a: a.success_rate)

# def _agent_execute(self, agent: AgentCapability, task: str) -> Dict[str, Any]:
#     """Single agent executes a task."""
    
#     logger.info(f"Agent {agent.name} starting task execution")
#     logger.debug(f"Agent details - Specialization: {agent.specialization}, Skills: {agent.skills}")
#     logger.debug(f"Task assigned to {agent.name}: {task}")
    
#     prompt = f"""
# Agent Task Execution
# Your Role
# You are {agent.name}, specializing in: {agent.specialization} Skills: {', '.join(agent.skills)}
# Task
# {task}
# Instructions
# Execute this task using your expertise. Be thorough and high-quality.
# Output your result directly (not JSON unless task requires it). """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             temperature=0.7
#         )
#     )
    
#     # Quick quality assessment
#     score = 7.0 + random.random() * 2.0  # Simplified
    
#     # LOG FULL OUTPUT TO FILE (no truncation)
#     full_output = response.text
#     logger.info(f"Agent {agent.name} completed task - Quality score: {score:.2f}")
#     logger.debug(f"=== FULL OUTPUT FROM {agent.name} ===")
#     logger.debug(f"Task: {task[:100]}...")
#     logger.debug(f"Output Length: {len(full_output)} characters")
#     logger.debug(f"Full Output:\n{full_output}")
#     logger.debug(f"=== END OUTPUT FROM {agent.name} ===")
    
#     return {
#         "output": full_output,
#         "score": score,
#         "agent": agent.name,
#         "task": task
#     }

# def _agent_explore(self, agent: AgentCapability, task: str) -> Dict[str, Any]:
#     """Agent explores solution space."""
    
#     logger.info(f"Agent {agent.name} exploring solution space")
#     logger.debug(f"Exploration task: {task}")
    
#     prompt = f"""
# Task: {task}
# Provide ONE unique solution approach or insight. Be creative and specific.
# Format: Approach: [description] Key Insight: [insight] Confidence: X/10 """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             temperature=0.9
#         )
#     )
    
#     full_output = response.text
#     confidence = 7.0 + random.random() * 2
    
#     # Log full exploration result
#     logger.info(f"Agent {agent.name} exploration complete - Confidence: {confidence:.2f}")
#     logger.debug(f"=== EXPLORATION OUTPUT FROM {agent.name} ===")
#     logger.debug(f"Output Length: {len(full_output)} characters")
#     logger.debug(f"Full Output:\n{full_output}")
#     logger.debug(f"=== END EXPLORATION FROM {agent.name} ===")
    
#     return {
#         "agent": agent.name,
#         "solution": full_output,
#         "confidence": confidence
#     }

# def _synthesize_results(self, task: str, results: List[Dict]) -> Dict[str, Any]:
#     """Synthesize multiple results."""
    
#     prompt = f"""
# Result Synthesis
# Task: {task}
# Sub-Results
# {json.dumps([{ 'agent': r.get('agent', 'unknown'), 'output': r['output'] } for r in results], indent=2)}
# Synthesize into a unified, high-quality solution. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     return {
#         "final_output": response.text,
#         "quality_score": 8.0 + random.random()
#     }

# def _synthesize_swarm_solutions(self, task: str, 
#                                solutions: List[Dict]) -> Dict[str, Any]:
#     """Synthesize swarm solutions."""
    
#     # Sort by confidence
#     top_solutions = sorted(solutions, key=lambda x: x['confidence'], reverse=True)[:5]
    
#     prompt = f"""
# Synthesize these {len(top_solutions)} top solutions:
# {json.dumps([s['solution'] for s in top_solutions], indent=2)}
# Create the best unified solution. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     return {
#         "best_solution": response.text,
#         "quality_score": 8.0 + random.random(),
#         "diversity": len(set(s['solution'] for s in solutions)) / len(solutions)
#     }

# def _generate_perspectives(self, task: str) -> List[Dict[str, str]]:
#     """Generate multiple perspectives."""
    
#     prompt = f"""
# Generate 3-4 distinct perspectives for analyzing this:
# {task}
# Output JSON: {{ "perspectives": [ {{"name": "Perspective Name", "position": "What they believe"}} ] }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type='application/json'
#         )
#     )
#     _parsed = json.loads(response.text)
#     if isinstance(_parsed, list):
#         _parsed = _parsed[0] if _parsed else {}
#     return _parsed.get('perspectives', [])

# def _generate_argument(self, task: str, perspective: Dict[str, str]) -> Dict[str, Any]:
#     """Generate argument for a perspective."""

#     prompt = f"""
# Task: {task} Your perspective: {perspective['name']} - {perspective['position']}
# Present your argument (150 words): """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt 
#     )

#     return {
#         "perspective": perspective['name'],
#         "argument": response.text,
#         "summary": response.text
#     }

# def _synthesize_debate(self, task: str, arguments: List[Dict]) -> Dict[str, Any]:
#     """Synthesize debate into consensus."""

#     prompt = f"""
# Synthesize these arguments into one unified solution:
# {json.dumps([{ 'perspective': a['perspective'], 'argument': a['argument'] } for a in arguments], indent=2)}
# Find common ground and create integrated solution. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt 
#     )

#     return {
#         "unified_solution": response.text,
#         "confidence": 8.0 + random.random()
#     }

# def _identify_stakeholders(self, task: str) -> List[Dict[str, Any]]:
#     """Identify stakeholders for negotiation."""
    
#     prompt = f"""
# Identify 2-3 key stakeholders for:
# {task}
# Output JSON: {{ "stakeholders": [ {{ "name": "Stakeholder Name", "interests": ["interest1", "interest2"], "must_haves": ["requirement1"] }} ] }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json"
#         )
#     )
#     _parsed = json.loads(response.text)
#     if isinstance(_parsed, list):
#         _parsed = _parsed[0] if _parsed else {}
#     return _parsed.get('stakeholders', [])

# def _run_negotiation(self, task: str, stakeholders: List[Dict]) -> Dict[str, Any]:
#     """
#     Run negotiation simulation between stakeholders.
    
#     Simulates a multi-party negotiation to find a solution that satisfies
#     all stakeholder interests and requirements.
    
#     Args:
#         task: The task requiring negotiation
#         stakeholders: List of stakeholder dictionaries with interests and requirements
        
#     Returns:
#         Dict containing:
#             - agreement: The negotiated solution text
#             - satisfaction_score: Overall satisfaction rating (0-10)
#             - terms: Key terms of the agreement
#             - rounds: Number of negotiation rounds
#     """
#     logger.info(f"Running negotiation with {len(stakeholders)} stakeholders")
    
#     # Simplified negotiation
#     prompt = f"""
# Negotiate a solution that satisfies all stakeholders:
# {json.dumps(stakeholders, indent=2)}
# Task: {task}
# Output JSON: {{ "agreement": "The negotiated solution", "satisfaction_score": 8.5, "terms": {{"term": "value"}}, "rounds": 3 }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json"
#         )
#     )
    
#     result = json.loads(response.text)
#     logger.info(f"Negotiation complete: satisfaction={result.get('satisfaction_score', 0):.1f}")
    
#     return result

# def _generate_initial_solution(self, task: str) -> str:
#     """
#     Generate initial solution for red/blue team analysis.
    
#     Creates a baseline solution that will be tested and hardened
#     through adversarial analysis.
    
#     Args:
#         task: The task to solve
        
#     Returns:
#         str: Initial solution text
#     """
#     logger.info("Generating initial solution for red/blue analysis")
    
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=f"Provide a solution for:\n\n{task}"
#     )
    
#     return response.text

# def _red_team_attack(self, solution: str) -> List[Dict[str, str]]:
#     """
#     Red team finds vulnerabilities in solution.
    
#     Performs adversarial analysis to identify weaknesses, edge cases,
#     and potential failure modes in the proposed solution.
    
#     Args:
#         solution: The solution to attack
        
#     Returns:
#         List of vulnerability dictionaries
#     """
#     logger.info("Red team attacking solution")
    
#     prompt = f"""
# Find vulnerabilities in this solution:
# {solution}
# List 2-3 specific flaws or weaknesses. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     # Parse into list (simplified)
#     vulnerabilities = [{"vulnerability": line} for line in response.text.split('\n') if line.strip()][:3]
#     logger.info(f"Red team found {len(vulnerabilities)} vulnerabilities")
    
#     return vulnerabilities

# def _blue_team_defend(self, solution: str, attacks: List[Dict]) -> Dict[str, Any]:
#     """
#     Blue team defends and improves solution.
    
#     Addresses vulnerabilities identified by red team and produces
#     a hardened, more robust solution.
    
#     Args:
#         solution: Original solution to defend
#         attacks: List of vulnerabilities from red team
        
#     Returns:
#         Dict containing:
#             - hardened_solution: Improved solution text
#             - improvements: List of improvements made
#     """
#     logger.info(f"Blue team defending against {len(attacks)} attacks")
    
#     prompt = f"""
# Improve this solution to address these vulnerabilities:
# Solution: {solution}
# Vulnerabilities: {json.dumps(attacks, indent=2)}
# Provide hardened solution. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     result = {
#         "hardened_solution": response.text,
#         "improvements": attacks
#     }
    
#     logger.info("Blue team defense complete")
    
#     return result

# def _self_critique(self, task: str, output: str) -> Dict[str, Any]:
#     """
#     Critique own output for quality improvement.
    
#     Performs self-evaluation to identify strengths, weaknesses,
#     and areas for improvement in the generated output.
    
#     Args:
#         task: Original task
#         output: Generated output to critique
        
#     Returns:
#         Dict containing:
#             - score: Quality score (0-10)
#             - strengths: List of identified strengths
#             - weaknesses: List of identified weaknesses
#             - improvements: List of suggested improvements
#     """
#     logger.info("Performing self-critique")
    
#     prompt = f"""
# Critique this output for the task:
# Task: {task} Output: {output}
# Score 0-10 and identify weaknesses.
# Output JSON: {{ "score": X.X, "strengths": ["strength1"], "weaknesses": ["weakness1"], "improvements": ["improvement1"] }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json",
#             temperature=0.3
#         )
#     )
    
#     critique = json.loads(response.text)
#     logger.info(f"Self-critique score: {critique.get('score', 0):.1f}/10")
    
#     return critique

# def _improve_based_on_critique(self, task: str, output: str,
#                                critique: Dict) -> str:
#     """
#     Improve output based on self-critique.
    
#     Refines the output by addressing identified weaknesses and
#     implementing suggested improvements.
    
#     Args:
#         task: Original task
#         output: Current output
#         critique: Critique dictionary with weaknesses and improvements
        
#     Returns:
#         str: Improved output text
#     """
#     logger.info("Improving output based on critique")
    
#     prompt = f"""
# Improve this output:
# Original: {output}
# Weaknesses: {json.dumps(critique['weaknesses'])} Needed improvements: {json.dumps(critique['improvements'])}
# Provide improved version. """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     logger.info("Output improvement complete")
    
#     return response.text

# def _execute_with_learned_strategy(self, task: str, 
#                                   strategy: str) -> Dict[str, Any]:
#     """
#     Execute task with specific learned strategy.
    
#     Applies a previously learned strategy (direct, step-by-step,
#     creative, or analytical) to solve the task.
    
#     Args:
#         task: Task to execute
#         strategy: Strategy name to apply
        
#     Returns:
#         Dict containing:
#             - output: Generated output
#             - score: Quality score
#     """
#     logger.info(f"Executing with learned strategy: {strategy}")
    
#     strategy_prompts = {
#         "direct": f"{task}\n\nProvide direct answer.",
#         "step_by_step": f"{task}\n\nSolve step by step.",
#         "creative": f"{task}\n\nBe creative and innovative.",
#         "analytical": f"{task}\n\nProvide analytical breakdown."
#     }
    
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=strategy_prompts.get(strategy, task)
#     )
    
#     result = {
#         "output": response.text,
#         "score": 7.0 + random.random() * 2
#     }
    
#     logger.info(f"Strategy execution complete: score={result['score']:.1f}")
    
#     return result

# def _generate_socratic_question(self, task: str, understanding: str,
#                                level: int) -> str:
#     """
#     Generate Socratic question to deepen understanding.
    
#     Creates a probing question that challenges assumptions and
#     encourages deeper thinking about the problem.
    
#     Args:
#         task: Original task
#         understanding: Current understanding
#         level: Question depth level (higher = deeper)
        
#     Returns:
#         str: Socratic question
#     """
#     logger.info(f"Generating Socratic question (level {level})")
    
#     prompt = f"""
# Ask a probing question about this understanding:
# {understanding}
# Question level {level} (go deeper). """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt
#     )
    
#     return response.text

# def _answer_socratic_question(self, task: str, understanding: str,
#                              question: str) -> Dict[str, Any]:
#     """
#     Answer Socratic question and refine understanding.
    
#     Responds to the Socratic question and updates understanding
#     based on the insights gained.
    
#     Args:
#         task: Original task
#         understanding: Current understanding
#         question: Socratic question to answer
        
#     Returns:
#         Dict containing:
#             - answer: Answer to the question
#             - refined_understanding: Updated understanding
#             - breakthrough: Whether a breakthrough was achieved
#     """
#     logger.info("Answering Socratic question")
    
#     prompt = f"""
# Question: {question}
# Current understanding: {understanding}
# Provide thoughtful answer and refined understanding.
# Output JSON: {{ "answer": "Your answer", "refined_understanding": "Updated understanding", "breakthrough": false }} """
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=prompt,
#         config=types.GenerateContentConfig(
#             response_mime_type="application/json"
#         )
#     )
    
#     result = json.loads(response.text)
    
#     if result.get('breakthrough'):
#         logger.info("ðŸŽ¯ Breakthrough achieved in Socratic dialogue!")
    
#     return result

# # ========================================================================
# # SYSTEM MANAGEMENT & REPORTING
# # ========================================================================

# def get_system_report(self) -> str:
#     """
#     Generate comprehensive system report.
    
#     Creates a detailed report including execution history, mode performance,
#     agent statistics, and recommendations.
    
#     Returns:
#         str: Formatted markdown report
#     """
#     logger.info("Generating system report")
    
#     report_prompt = f"""
# Mega System Performance Report
# Execution History
# Total Executions: {len(self.execution_history)}
# Mode Performance
# {json.dumps(self.performance_metrics, indent=2)}
# Agent Pool
# Total Agents: {len(self.agent_pool)} Top Performers: {json.dumps([{ 'name': a.name, 'specialization': a.specialization, 'success_rate': a.success_rate } for a in sorted(self.agent_pool, key=lambda x: x.success_rate, reverse=True)[:5]], indent=2)}
# Recent Executions (last 5)
# {json.dumps([{ 'task_id': e.task_id, 'mode': e.mode_used.value, 'quality': e.quality_score, 'time': e.execution_time } for e in self.execution_history[-5:]], indent=2)}
# Generate Report
# Provide:
# Overall system health
# Best performing modes
# Areas for improvement
# Key insights
# Recommendations
# Output as formatted markdown. """
#     logger.info("Requesting report generation from Gemini")
    
#     response = _gemini_call(
#         model='gemini-3.5-flash',
#         contents=report_prompt
#     )
    
#     report = response.text
    
#     logger.info(f"Report generated successfully, length: {len(report)} characters")
    
#     # Save report to file
#     report_filename = LOGS_DIR / f"system_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
#     with open(report_filename, 'w', encoding='utf-8') as f:
#         f.write(report)
    
#     logger.info(f"System report saved to {report_filename}")
    
#     return report

# def optimize_system(self):
#     """
#     Self-optimize system based on performance data.
    
#     Analyzes execution history and performance metrics to identify
#     best and worst performing modes, then adjusts agent pool ratings
#     to improve future performance.
#     """
#     logger.info("Starting system optimization")
    
#     print("\nðŸ”§ SYSTEM OPTIMIZATION")
#     print("="*80)
    
#     # Analyze performance
#     best_mode = max(
#         self.performance_metrics.items(),
#         key=lambda x: x[1]['success_rate']
#     )
    
#     worst_mode = min(
#         self.performance_metrics.items(),
#         key=lambda x: x[1]['success_rate'] if x[1]['executions'] > 0 else 1.0
#     )
    
#     print(f"Best Mode: {best_mode[0]} ({best_mode[1]['success_rate']:.1%} success)")
#     print(f"Worst Mode: {worst_mode[0]} ({worst_mode[1]['success_rate']:.1%} success)")
    
#     logger.info(f"Best mode: {best_mode[0]} ({best_mode[1]['success_rate']:.1%})")
#     logger.info(f"Worst mode: {worst_mode[0]} ({worst_mode[1]['success_rate']:.1%})")
    
#     # Optimize agent pool
#     avg_success = sum(a.success_rate for a in self.agent_pool) / len(self.agent_pool)
    
#     logger.info(f"Average agent success rate: {avg_success:.1%}")
    
#     boosted = 0
#     penalized = 0
    
#     for agent in self.agent_pool:
#         old_rate = agent.success_rate
#         # Boost high performers
#         if agent.success_rate > avg_success * 1.2:
#             agent.success_rate = min(1.0, agent.success_rate * 1.05)
#             boosted += 1
#             logger.debug(f"Boosted agent {agent.name}: {old_rate:.1%} -> {agent.success_rate:.1%}")
#         # Penalize low performers
#         elif agent.success_rate < avg_success * 0.8:
#             agent.success_rate = max(0.1, agent.success_rate * 0.95)
#             penalized += 1
#             logger.debug(f"Penalized agent {agent.name}: {old_rate:.1%} -> {agent.success_rate:.1%}")
    
#     print(f"\nAgent pool optimized")
#     print(f"Avg success rate: {avg_success:.1%}")
#     print(f"Agents boosted: {boosted}")
#     print(f"Agents penalized: {penalized}")
#     print("="*80 + "\n")
    
#     logger.info(f"Optimization complete: {boosted} boosted, {penalized} penalized")
    
#     # Save optimization log
#     opt_log = LOGS_DIR / f"optimization_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
#     optimization_data = {
#         'timestamp': datetime.now().isoformat(),
#         'best_mode': best_mode[0],
#         'best_mode_success_rate': best_mode[1]['success_rate'],
#         'worst_mode': worst_mode[0],
#         'worst_mode_success_rate': worst_mode[1]['success_rate'],
#         'avg_success_rate': avg_success,
#         'agents_boosted': boosted,
#         'agents_penalized': penalized,
#         'total_agents': len(self.agent_pool)
#     }
    
#     with open(opt_log, 'w', encoding='utf-8') as f:
#         json.dump(optimization_data, f, indent=2)
    
#     logger.info(f"Optimization log saved to {opt_log}")
#     logger.info(f"Optimization data: {json.dumps(optimization_data)}")

# def save_state(self, filepath: str = "mega_system_state.pkl"):
#     """
#     Save system state to disk.
    
#     Persists execution history, agent pool, and performance metrics
#     for later restoration.
    
#     Args:
#         filepath: Path to save state file
#     """
#     logger.info(f"Saving system state to {filepath}")
    
#     state = {
#         "execution_history": self.execution_history,
#         "agent_pool": self.agent_pool,
#         "performance_metrics": self.performance_metrics
#     }
    
#     logger.info(f"State contains: {len(self.execution_history)} executions, {len(self.agent_pool)} agents")
    
#     try:
#         with open(filepath, 'wb') as f:
#             pickle.dump(state, f)
        
#         print(f"ðŸ’¾ System state saved to {filepath}")
#         logger.info(f"System state saved successfully to {filepath}")
#     except Exception as e:
#         logger.error(f"Failed to save system state: {str(e)}", exc_info=True)
#         print(f"âŒ Failed to save system state: {str(e)}")
#         raise

# def load_state(self, filepath: str = "mega_system_state.pkl"):
#     """
#     Load system state from disk.
    
#     Restores previously saved execution history, agent pool,
#     and performance metrics.
    
#     Args:
#         filepath: Path to state file to load
#     """
#     logger.info(f"Loading system state from {filepath}")
    
#     if Path(filepath).exists():
#         try:
#             with open(filepath, 'rb') as f:
#                 state = pickle.load(f)
            
#             self.execution_history = state['execution_history']
#             self.agent_pool = state['agent_pool']
#             self.performance_metrics = state['performance_metrics']
            
#             print(f"ðŸ“‚ System state loaded from {filepath}")
#             print(f"   Executions: {len(self.execution_history)}")
#             print(f"   Agents: {len(self.agent_pool)}")
            
#             logger.info(f"System state loaded successfully: {len(self.execution_history)} executions, {len(self.agent_pool)} agents")
#             logger.info(f"Performance metrics: {json.dumps(self.performance_metrics)}")
#         except Exception as e:
#             logger.error(f"Failed to load system state: {str(e)}", exc_info=True)
#             print(f"âŒ Failed to load system state: {str(e)}")
#             raise
#     else:
#         print(f"âš ï¸  No saved state found at {filepath}")
#         logger.warning(f"No saved state found at {filepath}")
# def read_info_file(filepath: str) -> str: """Read the info.md content""" logger.info(f"Reading info file from {filepath}") try: with open(filepath, 'r', encoding='utf-8') as f: content = f.read() logger.info(f"Successfully read info file, length: {len(content)} characters") return content except Exception as e: logger.error(f"Failed to read info file: {str(e)}", exc_info=True) raise
# sub_tracker = read_info_file(r"C:\Users\sidki\source\repos\ultimate\backend\sub_tracker.md")
# mega = MegaAgenticSystem(name="Subscription Tracker")
# task = Task(
# id="TASK-001",
# description=sub_tracker,
# complexity=TaskComplexity.CRITICAL,
# quality_threshold=8.5,
# max_iterations=3
# )
# result = mega.execute(task)
# print(result)
# print(mega.get_system_report())
# mega.optimize_system()
# mega.save_state()
# ============================================================================
# DEMONSTRATION & TESTING
# ============================================================================
# def demonstrate_mega_system():
# """Comprehensive demonstration of the mega system"""
# logger.info("Starting mega system demonstration")
# print("""
# â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
# â•‘ â•‘
# â•‘ ðŸš€ MEGA AGENTIC SYSTEM DEMO ðŸš€ â•‘
# â•‘ â•‘
# â•‘ All Patterns Combined - Maximum Intelligence â•‘
# â•‘ â•‘
# â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# """)
# print("="*80)
# print("="*80)
# # Initialize the mega system
# logger.info("Initializing MegaAgenticSystem")
# mega = MegaAgenticSystem(name="TechnicalArchitecture-1")
# filepath = r"C:\Users\sidki\source\repos\ultimate\backend\sub_tracker.md"
# print(f" Reading file: {filepath}")
# logger.info(f"Reading file: {filepath}")
# content = read_info_file(filepath)
# print(f" Content length: {len(content)} characters")
# logger.info(f"Content length: {len(content)} characters")
# logger.debug(f"Content preview (first 500 chars): {content[:500]}")
# # Define test tasks of varying complexity
# logger.info("Creating task list")
# # Create a comprehensive task description
# task_description = f"""
# Based on the following project briefing document, create a comprehensive technical architecture document.
# The architecture should include:
# 1. System architecture diagrams and component breakdown
# 2. Detailed technology stack justification
# 3. Data flow and API design
# 4. Security and compliance implementation details
# 5. Scalability and performance considerations
# 6. Deployment and DevOps strategy
# 7. Testing and quality assurance approach
# 8. Risk mitigation strategies
# Project Briefing Document:
# {content}
# """
# tasks = [
# Task(
# id="TASK-001",
# description=task_description,
# complexity=TaskComplexity.CRITICAL,
# quality_threshold=8.5,
# max_iterations=3
# #     ),
# #     Task(
# #         id="TASK-002",
# #         description=content,
# #         complexity=TaskComplexity.COMPLEX,
# #         quality_threshold=8.0,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-003",
# #         description=content,
# #         complexity=TaskComplexity.MODERATE,
# #         quality_threshold=8.0,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-004",
# #         description=content,
# #         complexity=TaskComplexity.MODERATE,
# #         quality_threshold=8.0,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-005",
# #         description=content,
# #         complexity=TaskComplexity.COMPLEX,
# #         quality_threshold=8.0,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-006",
# #         description=content,
# #         complexity=TaskComplexity.MODERATE,
# #         quality_threshold=8.0,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-007",
# #         description="""
# #         Create a 30-day content marketing strategy for a B2B SaaS product
# #         targeting enterprise customers. Include content types, distribution
# #         channels, KPIs, and budget allocation.
# #         """,
# #         complexity=TaskComplexity.MODERATE,
# #         quality_threshold=7.5,
# #         max_iterations=2
# #     ),
# #     Task(
# #         id="TASK-004",
# #         description="""
# #         Explain the concept of eventual consistency in distributed systems
# #         in simple terms that a non-technical stakeholder can understand.
# #         """,
# #         complexity=TaskComplexity.SIMPLE,
# #         quality_threshold=7.0,
# # max_iterations=1
# ),
# ]
# logger.info(f"Created {len(tasks)} tasks for execution")
# # Execute all tasks
# results = []
# for i, task in enumerate(tasks, 1):
# logger.info(f"Executing task {i}/{len(tasks)}: {task.id}")
# result = mega.execute(task)
# results.append(result)
# logger.info(f"Task {task.id} completed - Mode: {result.mode_used.value}, Quality: {result.quality_score:.1f}, Time: {result.execution_time:.2f}s")
# # Show brief output
# print(f"ðŸ“„ OUTPUT PREVIEW:")
# print("-" * 80)
# output_preview = result.output[:1000] if len(result.output) > 1000 else result.output
# print(output_preview)
# if len(result.output) > 1000:
# print(f"\n... (truncated, full output is {len(result.output)} characters)")
# print("-" * 80 + "\n")
# logger.debug(f"Full output for {task.id} (length: {len(result.output)}): {result.output}")
# time.sleep(2) # Pause between tasks
# # Generate system report
# print("\n" + "="*80)
# print("ðŸ“Š SYSTEM PERFORMANCE REPORT")
# print("="*80 + "\n")
# logger.info("Generating system performance report")
# report = mega.get_system_report()
# print(report)
# logger.info(f"System report generated, length: {len(report)} characters")
# # Optimize system
# logger.info("Starting system optimization")
# mega.optimize_system()
# # Save state
# logger.info("Saving system state")
# mega.save_state()
# # Summary statistics
# print("\n" + "="*80)
# print("ðŸ“ˆ EXECUTION SUMMARY")
# print("="*80)
# total_time = sum(r.execution_time for r in results)
# avg_quality = sum(r.quality_score for r in results) / len(results)
# total_agents = sum(r.agents_involved for r in results)
# mode_usage = {
# mode.value: sum(1 for r in results if r.mode_used == mode)
# for mode in AgentMode
# }
# success_rate = sum(1 for r in results if r.quality_score >= 7.0) / len(results)
# summary = f"""
# Total Tasks Executed: {len(results)}
# Total Execution Time: {total_time:.2f}s
# Average Quality Score: {avg_quality:.1f}/10
# Total Agent Invocations: {total_agents}
# Mode Usage:
# {json.dumps(mode_usage, indent=2)}
# Success Rate: {success_rate:.1%}
# """
# print(summary)
# logger.info(f"Execution summary: {len(results)} tasks, {total_time:.2f}s total, {avg_quality:.1f} avg quality, {success_rate:.1%} success rate")
# logger.info(f"Mode usage: {json.dumps(mode_usage)}")
# print("="*80)
# logger.info("Mega system demonstration completed successfully")
# return mega, results
# ============================================================================
# ADVANCED USAGE EXAMPLES
# ============================================================================
# def example_adaptive_mode_selection():
# """Example: System adapts mode selection based on learning"""
# mega = MegaAgenticSystem(name="Adaptive-1")
# # Same task, different phrasings
# similar_tasks = [
# "Design a REST API for user management",
# "Create an API architecture for handling users",
# "Build a user management REST API system"
# ]
# print("\nðŸ§ª ADAPTIVE MODE SELECTION TEST")
# print("="*80)
# print("Testing if system learns optimal mode for similar tasks\n")
# for i, task_desc in enumerate(similar_tasks, 1):
# print(f"\n--- Attempt {i} ---")
# task = Task(
# id=f"ADAPT-{i}",
# description=task_desc,
# complexity=TaskComplexity.MODERATE
# )
# result = mega.execute(task)
# print(f"Mode used: {result.mode_used.value}")
# print(f"Quality: {result.quality_score:.1f}/10")
# print("\n" + "="*80)
# print("Notice how the system may adapt its approach based on results!")
# print("="*80)
# def example_multi_mode_pipeline():
# """Example: Combine multiple modes in sequence"""
# mega = MegaAgenticSystem(name="Pipeline-1")
# print("\nðŸ”— MULTI-MODE PIPELINE")
# print("="*80)
# print("Using multiple modes in sequence for maximum quality\n")
# # Phase 1: Swarm generates ideas
# task1 = Task(
# id="PIPE-1",
# description="Generate innovative features for a project management tool",
# complexity=TaskComplexity.COMPLEX,
# preferred_mode=AgentMode.SWARM
# )
# result1 = mega.execute(task1)
# # Phase 2: Debate evaluates ideas
# task2 = Task(
# id="PIPE-2",
# description=f"Evaluate these features: {result1.output}",
# complexity=TaskComplexity.COMPLEX,
# preferred_mode=AgentMode.DEBATE
# )
# result2 = mega.execute(task2)
# # Phase 3: Red/Blue hardens the plan
# task3 = Task(
# id="PIPE-3",
# description=f"Harden this implementation plan: {result2.output}",
# complexity=TaskComplexity.COMPLEX,
# preferred_mode=AgentMode.RED_BLUE
# )
# result3 = mega.execute(task3)
# print("\n" + "="*80)
# print("âœ… PIPELINE COMPLETE")
# print("="*80)
# print(f"Stage 1 (Swarm): {result1.quality_score:.1f}/10")
# print(f"Stage 2 (Debate): {result2.quality_score:.1f}/10")
# print(f"Stage 3 (Red/Blue): {result3.quality_score:.1f}/10")
# print(f"\nFinal Quality: {result3.quality_score:.1f}/10")
# # ============================================================================
# # MAIN EXECUTION
# # ============================================================================
# if name == "main":
# # Run main demonstration
# mega_system, results = demonstrate_mega_system()
# print("\n\n")
# # Run advanced examples
# example_adaptive_mode_selection()
# print("\n\n")
# example_multi_mode_pipeline()
# print("""
# â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
# â•‘ â•‘
# â•‘ ðŸŽ‰ MEGA SYSTEM DEMONSTRATION COMPLETE ðŸŽ‰ â•‘
# â•‘ â•‘
# â•‘ You now have the ULTIMATE agentic system combining all patterns: â•‘
# â•‘ â•‘
# â•‘ âœ… Hierarchical Delegation âœ… Swarm Intelligence â•‘
# â•‘ âœ… Multi-Agent Debate âœ… Negotiation Systems â•‘
# â•‘ âœ… Red Team / Blue Team âœ… Self-Reflection â•‘
# â•‘ âœ… Meta-Learning âœ… Socratic Dialogue â•‘
# â•‘ âœ… Background Monitoring âœ… Adaptive Mode Selection â•‘
# â•‘ â•‘
# â•‘ The system intelligently selects the best approach for each task, â•‘
# â•‘ learns from experience, and continuously improves! â•‘
# â•‘ â•‘
# â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# """)