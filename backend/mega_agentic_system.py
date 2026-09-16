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
import re
import time
import uuid
import json
import random
import pickle
import logging
import logging.handlers
import threading
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Callable, Tuple
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from google import genai
from google.genai import types

try:
    from main import DEFAULT_MODEL, COMPLEX_MODEL, LITE_MODEL
except ImportError:  # standalone use without the API server package
    DEFAULT_MODEL = "gemini-3.5-flash"
    COMPLEX_MODEL = "gemini-3.1-pro-preview"
    LITE_MODEL = "gemini-3.1-flash-lite"

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
    # Building-block patterns (the Workflows page renders these as cards)
    CHAIN = "chain"
    ROUTING = "routing"
    PARALLEL = "parallel"
    EVALUATOR = "evaluator"


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


@dataclass
class AgentEvent:
    """One structured, observable step taken by one agent.

    This is the unit the UI renders. It exists because the timeline used to be
    reverse-engineered from log prose by keyword-matching the message text,
    which meant an agent writing the word "question" in its answer produced a
    `question` event. Everything the frontend needs is now an explicit field.
    """
    seq: int
    timestamp: str
    kind: str                      # decompose | agent_step | synthesis | score | phase
    mode: str
    phase: str
    agent_name: Optional[str] = None
    agent_role: Optional[str] = None
    agent_origin: Optional[str] = None   # "pool" | "dynamic" | "inline"
    subtask_id: Optional[str] = None
    batch: Optional[int] = None
    depends_on: List[str] = field(default_factory=list)
    prompt: str = ""
    response: str = ""
    score: Optional[float] = None
    duration_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


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
        AgentMode.CHAIN:         [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
        AgentMode.ROUTING:       [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
        AgentMode.PARALLEL:      [TaskComplexity.MODERATE, TaskComplexity.COMPLEX, TaskComplexity.CRITICAL],
        AgentMode.EVALUATOR:     [TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
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

        # ---- Structured observability -------------------------------------
        # events: every AgentEvent from the CURRENT execute() call. Consumers
        # (api_server -> frontend timeline) read these instead of scraping logs.
        # event_sink: optional callback fired per event, for live streaming.
        self.events: List[AgentEvent] = []
        self.event_sink: Optional[Callable[[AgentEvent], None]] = None
        self._event_lock = threading.Lock()   # hierarchical runs workers in parallel
        self._event_seq = 0

        logger.info(f"System {name} initialized successfully with {len(self.agents)} agents")

    # -----------------------------------------------------------------------
    # PUBLIC API
    # -----------------------------------------------------------------------


    def execute(self, task: Task) -> ExecutionResult:
        """Execute a task using the optimal agent pattern."""
        start_time = time.time()

        # Reset per-run accumulators so this result reflects only this task.
        self._run_prompt_tokens = 0
        self._run_output_tokens = 0
        self._run_total_tokens = 0
        with self._event_lock:
            self.events = []
            self._event_seq = 0

        mode = self._select_mode(task)
        logger.info(f"📋 Execution plan for task {task.id}: mode={mode.value}, "
                    f"complexity={task.complexity.value}")
        logger.info(f"🚀 Executing with {mode.value.upper()} pattern | "
                    f"Primary Mode: {mode.value}")
        self._emit(
            kind="phase", mode=mode.value, phase="Mode selected",
            response=f"Selected {mode.value} for a {task.complexity.value} task.",
        )

        try:
            output, quality, iterations = self._run_mode(mode, task)
        except Exception as exc:
            logger.error(f"Mode execution failed: {exc}", exc_info=True)
            output = f"Task failed during {mode.value} execution: {exc}"
            quality = 0.0
            iterations = 1
            self._emit(kind="phase", mode=mode.value, phase="Failed", response=str(exc))

        elapsed = time.time() - start_time

        # Agent count is now derived from what actually ran, not from a
        # pre-allocated slice. Modes that use no named agents report 0.
        agent_names = [e.agent_name for e in self.events if e.agent_name]
        distinct_agents = sorted(set(agent_names))

        result = ExecutionResult(
            task_id=task.id,
            mode_used=mode,
            output=output,
            quality_score=quality,
            execution_time=elapsed,
            agents_involved=len(distinct_agents),
            iterations=iterations,
            metadata={
                "mode": mode.value,
                "complexity": task.complexity.value,
                "agents": distinct_agents,
                "events": [e.to_dict() for e in self.events],
            },
            prompt_tokens=self._run_prompt_tokens,
            output_tokens=self._run_output_tokens,
            total_tokens=self._run_total_tokens,
        )

        self._record_result(result)
        logger.info(f"✅ Task {task.id} complete | quality={quality:.2f} | "
                    f"time={elapsed:.2f}s | agents={len(distinct_agents)}")
        return result

    def optimize_system(self):
        """Analyse historical performance and log per-mode standings.

        Mode selection reads performance_metrics directly (see _select_mode),
        so this is reporting only — it deliberately mutates nothing.
        """
        logger.info("Running system optimization...")
        if not self.execution_history:
            logger.info("No history to optimize from.")
            return

        for mode in AgentMode:
            mode_results = [r for r in self.execution_history if r.mode_used == mode]
            if mode_results:
                avg_q = sum(r.quality_score for r in mode_results) / len(mode_results)
                logger.info(f"Mode {mode.value}: {len(mode_results)} runs, avg quality {avg_q:.2f}")
            else:
                logger.info(f"Mode {mode.value}: never run (treated as optimistic by selector)")

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
        # Merge rather than replace: a pickle written before a mode existed has
        # no entry for it, and _select_mode indexes every mode in AgentMode.
        # Replacing wholesale would KeyError the moment a new mode is added.
        for mode_key, metrics in (state.get("performance_metrics") or {}).items():
            if mode_key in self.performance_metrics:
                self.performance_metrics[mode_key] = metrics
            else:
                logger.info(f"Ignoring metrics for unknown mode '{mode_key}' in saved state")
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
            AgentMode.CHAIN:         "A fixed pipeline where each stage consumes the previous stage's output.",
            AgentMode.ROUTING:       "A cheap classifier picks one specialist, and only that specialist runs.",
            AgentMode.PARALLEL:      "Splits the task into independent sub-questions, answers them concurrently, aggregates once.",
            AgentMode.EVALUATOR:     "A generator produces, a separate evaluator grades against a rubric and returns PASS or REVISE.",
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
            AgentMode.CHAIN:         ["Summarize then translate", "Outline then draft then edit", "Staged content refinement"],
            AgentMode.ROUTING:       ["Support triage", "Multi-language handling", "Picking a domain expert cheaply"],
            AgentMode.PARALLEL:      ["Multi-source research", "Auditing several files at once", "Independent sub-analyses"],
            AgentMode.EVALUATOR:     ["Work with clear acceptance criteria", "Draft-and-grade loops", "Spec compliance"],
        }
        return use_cases.get(mode, [])


    # -----------------------------------------------------------------------
    # MODE SELECTION
    # -----------------------------------------------------------------------

    # A mode that has never run is scored with this optimistic prior rather
    # than 0.0. Without it the selector froze: quality is a 0-10 scale, so one
    # lucky early run (a self-scored 10.0) permanently outranked every unrun
    # mode, whose avg_quality sat at 0.0. Seven of nine modes became
    # unreachable, and because metrics are pickled the lock-in survived
    # restarts. The prior is the TOP of the scale (optimism under uncertainty):
    # an untried mode always outranks a tried one, so every mode gets sampled
    # at least once before any repeats. EXPLORATION_BONUS decays with run count
    # so selection then converges on real quality without ever fully freezing.
    OPTIMISTIC_PRIOR = 10.0
    EXPLORATION_BONUS = 2.0

    def _select_mode(self, task: Task) -> AgentMode:
        """Choose a mode for this task: explicit request, else optimistic bandit."""
        if task.preferred_mode:
            logger.info(f"Mode explicitly requested: {task.preferred_mode.value}")
            return task.preferred_mode

        candidates = [
            mode for mode, complexities in self._MODE_COMPLEXITY.items()
            if task.complexity in complexities
        ]
        if not candidates:
            return AgentMode.HIERARCHICAL

        def score(m: AgentMode) -> float:
            metrics = self.performance_metrics[m.value]
            runs = metrics.get("executions", 0)
            base = self.OPTIMISTIC_PRIOR if runs == 0 else metrics.get("avg_quality", 0.0)
            # Bonus decays as a mode accumulates runs, so rarely-tried modes
            # keep getting sampled instead of being locked out forever.
            bonus = self.EXPLORATION_BONUS / (1.0 + runs)
            return base + bonus + random.uniform(0, 0.25)

        standings = {m.value: round(score(m), 2) for m in candidates}
        chosen = max(candidates, key=score)
        logger.info(f"Mode selection among {standings} -> {chosen.value}")
        return chosen

    def _run_mode(self, mode: AgentMode, task: Task) -> Tuple[str, float, int]:
        """Dispatch to the execution pattern. Returns (output, quality, iterations).

        Modes own their agents. Nothing pre-allocates a shared slice and hands
        it in: _swarm draws from the pool, _hierarchical mints agents per
        sub-task, and the rest declare their roles inline.
        """
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
            AgentMode.CHAIN:         self._chain,
            AgentMode.ROUTING:       self._routing,
            AgentMode.PARALLEL:      self._parallel,
            AgentMode.EVALUATOR:     self._evaluator,
        }
        fn = dispatch.get(mode, self._hierarchical)
        return fn(task)

    # -----------------------------------------------------------------------
    # OBSERVABILITY
    # -----------------------------------------------------------------------

    _ROLE_COLORS = {
        "planning":     "bright_cyan",
        "decompos":     "bright_cyan",
        "execution":    "bright_green",
        "worker":       "bright_green",
        "validation":   "yellow",
        "synthesis":    "bright_magenta",
        "critique":     "bright_red",
        "improvement":  "green",
        "proposition":  "bright_blue",
        "opposition":   "bright_red",
        "questioner":   "bright_yellow",
        "answerer":     "cyan",
        "blue team":    "bright_blue",
        "red team":     "bright_red",
        "priority":     "magenta",
        "async":        "dim",
        "score":        "dim yellow",
    }

    def _emit(
        self,
        kind: str,
        mode: str,
        phase: str,
        agent: Optional[Agent] = None,
        agent_origin: Optional[str] = None,
        subtask_id: Optional[str] = None,
        batch: Optional[int] = None,
        depends_on: Optional[List[str]] = None,
        prompt: str = "",
        response: str = "",
        score: Optional[float] = None,
        duration_ms: int = 0,
    ) -> AgentEvent:
        """Record one observable agent step.

        Writes to three places at once:
          1. self.events  - structured, what the API and UI consume
          2. event_sink   - optional live callback
          3. logger.info  - human-readable, and the path api_server already
                            tails; kept so existing log capture never regresses.
        Safe to call from worker threads.
        """
        with self._event_lock:
            self._event_seq += 1
            event = AgentEvent(
                seq=self._event_seq,
                timestamp=datetime.now().isoformat(),
                kind=kind,
                mode=mode,
                phase=phase,
                agent_name=agent.name if agent else None,
                agent_role=agent.role if agent else None,
                agent_origin=agent_origin,
                subtask_id=subtask_id,
                batch=batch,
                depends_on=depends_on or [],
                prompt=prompt,
                response=response,
                score=score,
                duration_ms=duration_ms,
            )
            self.events.append(event)

        if self.event_sink:
            try:
                self.event_sink(event)
            except Exception:
                pass  # a broken consumer must never break execution

        self._log_event(event)
        self._render_event(event)
        return event

    def _log_event(self, event: AgentEvent) -> None:
        """Human-readable rendering into the log stream."""
        who = f"{event.agent_name} ({event.agent_role})" if event.agent_name else event.phase
        header = f"{event.mode} - {event.phase} - {who}"
        if event.batch is not None:
            header += f" [batch {event.batch}]"
        lines = [header]
        if event.prompt:
            excerpt = event.prompt if len(event.prompt) <= 1200 else event.prompt[:1200] + " ..."
            lines += ["", f"PROMPT:\n{excerpt}"]
        if event.response:
            lines += ["", f"RESPONSE:\n{event.response}"]
        if event.score is not None:
            lines += ["", f"Quality score: {event.score:.2f}/10"]
        logger.info("\n".join(lines))

    def _render_event(self, event: AgentEvent) -> None:
        """Pretty console rendering (no-op without rich)."""
        if not _RICH_AVAILABLE:
            return
        hint = f"{event.phase} {event.agent_role or ''}".lower()
        color = "white"
        for key, c in self._ROLE_COLORS.items():
            if key in hint:
                color = c
                break

        label = event.phase
        if event.agent_name:
            label += f" - {event.agent_name}"
        if event.batch is not None:
            label += f"  [batch {event.batch}]"

        _rich_console.print()
        _rich_console.print(f"  [{color}]> {event.mode}: {label}[/{color}]")
        if event.prompt:
            _rich_console.print(_Panel(
                event.prompt[:500] + (" ..." if len(event.prompt) > 500 else ""),
                title=f"[{color}]PROMPT[/{color}]", border_style=color, padding=(0, 1),
            ))
        if event.response:
            _rich_console.print(_Panel(
                event.response[:800] + (" ..." if len(event.response) > 800 else ""),
                title=f"[{color}]RESPONSE[/{color}]", border_style=color, padding=(0, 1),
            ))
        if event.score is not None:
            _rich_console.print(f"  [dim yellow]Quality score: {event.score:.2f}/10[/dim yellow]")

    # -----------------------------------------------------------------------
    # MODEL CALLS
    # -----------------------------------------------------------------------

    def _call_model(
        self,
        prompt: str,
        system: str = "",
        model: Optional[str] = None,
        thinking: bool = False,
        json_schema: bool = False,
    ) -> str:
        """Single LLM call with error handling.

        thinking=True leaves the model's thinking budget at its default, for
        the reasoning-heavy steps (decomposition, critique, synthesis, scoring).
        Everything else keeps budget=0 for speed.
        """
        try:
            kwargs: Dict[str, Any] = {"system_instruction": system or None}
            if not thinking:
                kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            if json_schema:
                kwargs["response_mime_type"] = "application/json"
            response = self.client.models.generate_content(
                model=model or DEFAULT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(**kwargs),
            )
            self._record_usage(model or DEFAULT_MODEL, response)
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
            with self._event_lock:
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
                "Rate how well this output fulfills the task, from 0 to 10. "
                "Be a strict grader: 10 means flawless and complete, 5 means "
                "partially useful, 0 means it does not address the task. "
                'Respond ONLY with JSON: {"score": <number>}'
            )
            raw = self._call_model(prompt, thinking=True, json_schema=True)
            # Parse JSON rather than regexing the first number out of prose:
            # a bare regex pulled the "0" out of "on a scale of 0 to 10..."
            # and scored a good answer as zero.
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    parsed = parsed[0] if parsed else {}
                score = float(parsed.get("score"))
            except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
                match = re.search(r"\d+(?:\.\d+)?", raw)
                if not match:
                    return 7.5
                score = float(match.group())
            return min(max(score, 0.0), 10.0)
        except Exception as exc:
            logger.warning(f"Scoring failed, using neutral default: {exc}")
        return 7.5


    # -----------------------------------------------------------------------
    # AGENT PREVIEW (for demos / UI, before a run starts)
    # -----------------------------------------------------------------------

    def preview_agents(
        self, mode: AgentMode, complexity: TaskComplexity
    ) -> Tuple[List[Agent], str]:
        """The agents a mode will use, plus a note on where they come from.

        Returns ([], note) for HIERARCHICAL because its agents do not exist
        until the task has been decomposed - that is the point of the mode.
        """
        if mode == AgentMode.HIERARCHICAL:
            return [], (
                "Dynamic - one specialist is created per sub-task after "
                "decomposition, then run in dependency batches."
            )
        if mode == AgentMode.SWARM:
            size = min(self._SWARM_SIZE.get(complexity, 5), len(self.agents))
            return list(self.agents), (
                f"Shared pool - {size} of {len(self.agents)} sampled at random "
                f"for {complexity.value} complexity."
            )
        if mode == AgentMode.META_LEARNING:
            return [], "Delegates to the best-performing mode; agents are that mode's."
        if mode == AgentMode.CHAIN:
            return (
                [self._inline_agent(60 + i, role, spec)
                 for i, (role, spec, _) in enumerate(self._CHAIN_STAGES, start=1)],
                "Fixed pipeline - each stage receives the previous stage's output.",
            )
        if mode == AgentMode.ROUTING:
            roster = [("Router", "Classifies work and dispatches it")] + list(self._ROUTES.values())
            return (
                [self._inline_agent(70 + i, r, s) for i, (r, s) in enumerate(roster)],
                "Router plus the candidate specialists - exactly ONE specialist runs per task.",
            )
        if mode == AgentMode.PARALLEL:
            width = {
                TaskComplexity.SIMPLE: 2, TaskComplexity.MODERATE: 3,
                TaskComplexity.COMPLEX: 4, TaskComplexity.CRITICAL: 5,
            }.get(complexity, 3)
            return (
                [self._inline_agent(80, "Splitter", "Divides work into independent pieces")],
                f"Splitter plus {width} workers named at runtime, one per independent sub-question.",
            )

        rosters = {
            AgentMode.EVALUATOR: [
                ("Rubric Author", "Defines acceptance criteria"),
                ("Generator", "Produces candidate answers"),
                ("Evaluator", "Grades against the rubric"),
            ],
            AgentMode.DEBATE: [
                ("Proposer", "Argues for a position"),
                ("Opposer", "Attacks the proposition"),
                ("Synthesizer", "Reconciles both sides"),
            ],
            AgentMode.RED_BLUE: [
                ("Blue Team", "Builds and hardens solutions"),
                ("Red Team", "Attacks solutions"),
            ],
            AgentMode.REFLECTIVE: [
                ("Author", "Drafts and revises the answer"),
                ("Critic", "Finds concrete improvements"),
            ],
            AgentMode.SOCRATIC: [
                ("Questioner", "Generates probing questions"),
                ("Answerer", "Answers deeply"),
                ("Synthesizer", "Distils Q&A into an answer"),
            ],
            AgentMode.BACKGROUND: [
                ("Async Worker", "Fast single-pass processing"),
            ],
        }
        if mode == AgentMode.NEGOTIATE:
            count = {
                TaskComplexity.SIMPLE: 2, TaskComplexity.MODERATE: 3,
                TaskComplexity.COMPLEX: 4, TaskComplexity.CRITICAL: 4,
            }.get(complexity, 3)
            priorities = ["quality", "speed", "cost-efficiency", "robustness"][:count]
            roster = [(f"{p.title()} Advocate", f"Optimises solutions for {p}")
                      for p in priorities]
            roster.append(("Mediator", "Balances competing priorities"))
            return (
                [self._inline_agent(i, r, s) for i, (r, s) in enumerate(roster)],
                f"Inline roster - one advocate per priority ({count}) plus a mediator.",
            )

        roster = rosters.get(mode, [])
        return (
            [self._inline_agent(i, r, s) for i, (r, s) in enumerate(roster)],
            "Inline roster - defined by the mode itself, every one is called.",
        )

    # =======================================================================
    # EXECUTION PATTERNS
    #
    # Each mode owns its agents:
    #   _hierarchical  mints a dedicated agent per sub-task (dynamic)
    #   _swarm         draws from the shared pool (self.agents)
    #   everything else declares its roles inline
    # =======================================================================

    # ---- Hierarchical: decompose -> dynamic agents -> batched parallel -----

    HIERARCHICAL_MAX_WORKERS = 5

    def _decompose(self, task: Task) -> List[Dict[str, Any]]:
        """Break the task into sub-tasks, each with the role that should own it."""
        prompt = (
            f"Decompose this task into 3-6 independent sub-tasks that specialists "
            f"can work on.\n\nTASK: {task.description}\n\n"
            "For each sub-task give:\n"
            "  id           - short slug, e.g. \"research_market\"\n"
            "  description  - what this specialist must produce\n"
            "  agent_role   - the specialist's title, e.g. \"Security Architect\"\n"
            "  required_skills - list of skills\n"
            "  depends_on   - ids of sub-tasks whose output this one needs (often empty)\n\n"
            "Maximise the number with an empty depends_on so work can run in parallel. "
            "Only add a dependency when the sub-task genuinely cannot start without "
            "the other's output.\n\n"
            'Respond ONLY with JSON: {"sub_tasks": [...]}'
        )
        raw = self._call_model(
            prompt,
            system="You are a task decomposition planner. Output strict JSON.",
            thinking=True,
            json_schema=True,
        )
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                parsed = parsed[0] if parsed else {}
            sub_tasks = parsed.get("sub_tasks", [])
        except (ValueError, AttributeError, json.JSONDecodeError) as exc:
            logger.warning(f"Decomposition JSON parse failed ({exc}); using single sub-task")
            sub_tasks = []

        if not sub_tasks:
            sub_tasks = [{
                "id": "subtask_1",
                "description": task.description,
                "agent_role": "Generalist",
                "required_skills": ["general"],
                "depends_on": [],
            }]

        # Normalise: guarantee unique ids and that depends_on only ever names
        # a sub-task that actually exists (the model invents ids otherwise,
        # which would strand work in an unreachable batch).
        seen: Dict[str, int] = {}
        for i, st in enumerate(sub_tasks):
            raw_id = str(st.get("id") or f"subtask_{i+1}").strip()
            if raw_id in seen:
                seen[raw_id] += 1
                raw_id = f"{raw_id}_{seen[raw_id]}"
            else:
                seen[raw_id] = 0
            st["id"] = raw_id
            st.setdefault("description", task.description)
            st.setdefault("agent_role", f"Specialist_{i+1}")
            st.setdefault("required_skills", ["general"])
        valid_ids = {st["id"] for st in sub_tasks}
        for st in sub_tasks:
            deps = st.get("depends_on") or []
            if isinstance(deps, str):
                deps = [deps]
            st["depends_on"] = [d for d in deps if d in valid_ids and d != st["id"]]
        return sub_tasks

    @staticmethod
    def _batch_subtasks(sub_tasks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Group sub-tasks into dependency levels. Each level runs in parallel."""
        by_id = {st["id"]: st for st in sub_tasks}
        remaining = dict(by_id)
        done: set = set()
        batches: List[List[Dict[str, Any]]] = []

        while remaining:
            ready = [
                st for st in remaining.values()
                if all(dep in done for dep in st["depends_on"])
            ]
            if not ready:
                # Cyclic or unsatisfiable dependencies: run whatever is left as
                # one final batch rather than looping forever.
                logger.warning(
                    f"Dependency cycle among {list(remaining)}; scheduling as one batch"
                )
                ready = list(remaining.values())
            batches.append(ready)
            for st in ready:
                done.add(st["id"])
                remaining.pop(st["id"], None)
        return batches

    def _run_subtask(
        self,
        task: Task,
        sub_task: Dict[str, Any],
        agent: Agent,
        batch_index: int,
        upstream: Dict[str, str],
    ) -> str:
        """Execute one sub-task with its dedicated agent. Runs on a worker thread."""
        context = ""
        if sub_task["depends_on"]:
            parts = [
                f"--- Output of '{dep}' ---\n{upstream.get(dep, '(unavailable)')}"
                for dep in sub_task["depends_on"]
            ]
            context = (
                "\n\nYou depend on these completed sub-tasks:\n\n"
                + "\n\n".join(parts)
            )

        prompt = (
            f"OVERALL TASK: {task.description}\n\n"
            f"YOUR SUB-TASK: {sub_task['description']}"
            f"{context}\n\n"
            "Deliver your part completely. Do not restate the overall task."
        )
        system = (
            f"You are a {agent.role}. Your specialisation: {agent.specialization}. "
            f"Relevant skills: {', '.join(sub_task['required_skills'])}. "
            "Be thorough, concrete and self-contained."
        )

        started = time.time()
        output = self._call_model(prompt, system=system)
        elapsed_ms = int((time.time() - started) * 1000)

        self._emit(
            kind="agent_step",
            mode=AgentMode.HIERARCHICAL.value,
            phase="Worker",
            agent=agent,
            agent_origin="dynamic",
            subtask_id=sub_task["id"],
            batch=batch_index,
            depends_on=sub_task["depends_on"],
            prompt=prompt,
            response=output,
            duration_ms=elapsed_ms,
        )
        return output

    def _hierarchical(self, task: Task) -> Tuple[str, float, int]:
        """Decompose, mint one agent per sub-task, run batches in parallel, synthesize."""
        mode = AgentMode.HIERARCHICAL.value

        # Phase 1 - decomposition
        started = time.time()
        sub_tasks = self._decompose(task)
        self._emit(
            kind="decompose", mode=mode, phase="Decomposition",
            prompt=task.description,
            response=json.dumps(sub_tasks, indent=2),
            duration_ms=int((time.time() - started) * 1000),
        )

        # Phase 2 - mint a dedicated agent per sub-task (NOT from the pool)
        agents: Dict[str, Agent] = {}
        for i, st in enumerate(sub_tasks):
            role = str(st["agent_role"]).strip() or f"Specialist_{i+1}"
            agents[st["id"]] = Agent(
                id=1000 + i,
                name=f"{role.replace(' ', '_')}_{i+1}",
                role=role,
                specialization=str(st["description"])[:120],
            )
        self._emit(
            kind="phase", mode=mode, phase="Agents created",
            response="\n".join(
                f"{a.name}  <-  {sid}" for sid, a in agents.items()
            ),
        )

        # Phase 3 - batched parallel execution along the dependency graph
        batches = self._batch_subtasks(sub_tasks)
        logger.info(
            f"Hierarchical: {len(sub_tasks)} sub-tasks in {len(batches)} batch(es); "
            f"sizes={[len(b) for b in batches]}"
        )
        outputs: Dict[str, str] = {}
        for batch_index, batch in enumerate(batches, start=1):
            self._emit(
                kind="phase", mode=mode, phase=f"Batch {batch_index} starting",
                batch=batch_index,
                response=(
                    f"{len(batch)} agent(s) in parallel: "
                    + ", ".join(agents[st["id"]].name for st in batch)
                ),
            )
            workers = min(len(batch), self.HIERARCHICAL_MAX_WORKERS)
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {
                    pool.submit(
                        self._run_subtask, task, st, agents[st["id"]],
                        batch_index, dict(outputs),
                    ): st
                    for st in batch
                }
                for future in as_completed(futures):
                    st = futures[future]
                    try:
                        outputs[st["id"]] = future.result()
                    except Exception as exc:
                        logger.error(f"Sub-task {st['id']} failed: {exc}")
                        outputs[st["id"]] = f"[Sub-task failed: {exc}]"

        # Phase 4 - synthesis
        assembled = "\n\n".join(
            f"### {st['agent_role']} - {st['id']}\n{outputs.get(st['id'], '')}"
            for st in sub_tasks
        )
        started = time.time()
        synthesis = self._call_model(
            f"Combine these specialist deliverables into one coherent, complete "
            f"response to the original task.\n\nTASK: {task.description}\n\n{assembled}",
            system="You are the manager agent. Integrate the work into a single "
                   "polished deliverable. Remove duplication, resolve contradictions.",
            thinking=True,
        )
        quality = self._score_output(task.description, synthesis)
        self._emit(
            kind="synthesis", mode=mode, phase="Synthesis",
            prompt=f"Integrating {len(sub_tasks)} deliverables",
            response=synthesis, score=quality,
            duration_ms=int((time.time() - started) * 1000),
        )
        return synthesis, quality, len(batches)

    # ---- Swarm: the one mode that uses the shared pool ---------------------

    _SWARM_SIZE = {
        TaskComplexity.SIMPLE:   3,
        TaskComplexity.MODERATE: 5,
        TaskComplexity.COMPLEX:  7,
        TaskComplexity.CRITICAL: 10,
    }

    SWARM_MAX_WORKERS = 5

    def _swarm(self, task: Task) -> Tuple[str, float, int]:
        """Parallel independent perspectives from the shared agent pool."""
        mode = AgentMode.SWARM.value
        size = min(self._SWARM_SIZE.get(task.complexity, 5), len(self.agents))
        # Sample rather than taking self.agents[:n]: a fixed slice meant
        # Researcher, Strategist, Teacher and Validator only ever ran at
        # CRITICAL, so most of the pool was dead weight.
        agents = random.sample(self.agents, size)

        self._emit(
            kind="phase", mode=mode, phase="Swarm deployed",
            response=f"{size} agents from the pool: "
                     + ", ".join(f"{a.name} ({a.specialization})" for a in agents),
        )

        def run_one(agent: Agent) -> Tuple[Agent, str]:
            started = time.time()
            prompt = (
                f"Address this task from your own angle as a {agent.role}:\n\n"
                f"{task.description}\n\nContribute what only your specialisation "
                "would notice. Be concise and insightful."
            )
            resp = self._call_model(
                prompt,
                system=f"You are a {agent.role} agent. Specialisation: {agent.specialization}.",
            )
            self._emit(
                kind="agent_step", mode=mode, phase="Perspective",
                agent=agent, agent_origin="pool",
                prompt=prompt, response=resp,
                duration_ms=int((time.time() - started) * 1000),
            )
            return agent, resp

        # Actually parallel. This used to be a sequential for-loop while
        # logging "Parallel agent execution".
        perspectives: List[str] = []
        with ThreadPoolExecutor(max_workers=min(size, self.SWARM_MAX_WORKERS)) as pool:
            futures = [pool.submit(run_one, a) for a in agents]
            for future in as_completed(futures):
                try:
                    agent, resp = future.result()
                    perspectives.append(f"[{agent.name} - {agent.role}]: {resp}")
                except Exception as exc:
                    logger.error(f"Swarm agent failed: {exc}")

        started = time.time()
        synthesis = self._call_model(
            f"Synthesize these independent perspectives into one coherent response "
            f"for:\n{task.description}\n\n" + "\n\n".join(perspectives),
            system="You are a synthesis agent. Integrate every perspective into a "
                   "unified, high-quality answer.",
            thinking=True,
        )
        quality = self._score_output(task.description, synthesis)
        self._emit(
            kind="synthesis", mode=mode, phase="Synthesis",
            prompt=f"Merging {len(perspectives)} perspectives",
            response=synthesis, score=quality,
            duration_ms=int((time.time() - started) * 1000),
        )
        return synthesis, quality, 1

    # ---- Modes that declare their own roles inline -------------------------

    @staticmethod
    def _inline_agent(idx: int, role: str, specialization: str) -> Agent:
        """An agent that belongs to one mode's script, not to the shared pool."""
        return Agent(id=2000 + idx, name=f"{role.replace(' ', '_')}", role=role,
                     specialization=specialization)

    def _step(
        self,
        mode: str,
        phase: str,
        agent: Agent,
        prompt: str,
        system: str,
        thinking: bool = False,
        score: Optional[float] = None,
        model: Optional[str] = None,
        json_schema: bool = False,
    ) -> str:
        """Run one inline-agent step and emit it. Returns the response."""
        started = time.time()
        response = self._call_model(
            prompt, system=system, thinking=thinking, model=model, json_schema=json_schema,
        )
        self._emit(
            kind="agent_step", mode=mode, phase=phase, agent=agent,
            agent_origin="inline", prompt=prompt, response=response, score=score,
            duration_ms=int((time.time() - started) * 1000),
        )
        return response

    def _debate(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.DEBATE.value
        proposer = self._inline_agent(1, "Proposer", "Argues for a position")
        opposer = self._inline_agent(2, "Opposer", "Attacks the proposition")
        synthesizer = self._inline_agent(3, "Synthesizer", "Reconciles both sides")

        proposition = self._step(
            mode, "Proposition", proposer,
            f"Take a strong, specific position on the best approach for:\n{task.description}",
            "You are a debate agent. Present a clear, well-argued position.",
        )
        opposition = self._step(
            mode, "Opposition", opposer,
            f"Challenge and critique this proposition for the task "
            f"'{task.description}':\n\n{proposition}",
            "You are a critical debate agent. Find real weaknesses and present alternatives.",
            thinking=True,
        )
        synthesis = self._step(
            mode, "Synthesis", synthesizer,
            f"Given this debate, produce the best possible answer for:\n{task.description}\n\n"
            f"PROPOSITION:\n{proposition}\n\nOPPOSITION:\n{opposition}",
            "You are a synthesis agent. Integrate the strongest insights from both sides.",
            thinking=True,
        )
        quality = self._score_output(task.description, synthesis)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return synthesis, quality, 2

    def _negotiate(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.NEGOTIATE.value
        priorities = ["quality", "speed", "cost-efficiency", "robustness"]
        count = {
            TaskComplexity.SIMPLE: 2, TaskComplexity.MODERATE: 3,
            TaskComplexity.COMPLEX: 4, TaskComplexity.CRITICAL: 4,
        }.get(task.complexity, 3)

        proposals = []
        for i, priority in enumerate(priorities[:count]):
            agent = self._inline_agent(10 + i, f"{priority.title()} Advocate",
                                       f"Optimises solutions for {priority}")
            prop = self._step(
                mode, f"Proposal - {priority}", agent,
                f"Propose a solution for '{task.description}' optimised above all for {priority}.",
                f"You are a {agent.role} negotiating on behalf of {priority}.",
            )
            proposals.append(f"[Priority: {priority}]\n{prop}")

        mediator = self._inline_agent(19, "Mediator", "Balances competing priorities")
        consensus = self._step(
            mode, "Consensus", mediator,
            f"Negotiate a consensus solution for '{task.description}' from these "
            f"competing proposals:\n\n" + "\n\n".join(proposals),
            "You are a mediator agent. Find the optimal balance and justify the trade-offs.",
            thinking=True,
        )
        quality = self._score_output(task.description, consensus)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return consensus, quality, 1

    def _red_blue(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.RED_BLUE.value
        blue_agent = self._inline_agent(20, "Blue Team", "Builds and hardens solutions")
        red_agent = self._inline_agent(21, "Red Team", "Attacks solutions")

        blue = self._step(
            mode, "Blue team - build", blue_agent,
            f"Create a robust solution for:\n{task.description}",
            "You are a blue team agent. Build a strong, secure, well-reasoned solution.",
        )
        red = self._step(
            mode, "Red team - attack", red_agent,
            f"Identify every flaw, vulnerability and weakness in this solution for "
            f"'{task.description}':\n\n{blue}",
            "You are a red team agent. Aggressively identify every weakness.",
            thinking=True,
        )
        hardened = self._step(
            mode, "Blue team - harden", blue_agent,
            f"Improve the solution for '{task.description}' by addressing every identified "
            f"weakness.\n\nORIGINAL:\n{blue}\n\nWEAKNESSES:\n{red}",
            "You are a blue team agent. Produce a hardened, improved solution.",
            thinking=True,
        )
        quality = self._score_output(task.description, hardened)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return hardened, quality, 2

    def _reflective(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.REFLECTIVE.value
        author = self._inline_agent(30, "Author", "Drafts and revises the answer")
        critic = self._inline_agent(31, "Critic", "Finds concrete improvements")

        current = self._step(
            mode, "Draft", author,
            f"Provide a complete response for:\n{task.description}",
            "You are a specialist agent. Be thorough.",
        )

        iterations = 1
        for i in range(max(0, min(task.max_iterations, 3))):
            quality = self._score_output(task.description, current)
            self._emit(
                kind="score", mode=mode, phase=f"Review - iteration {i+1}",
                score=quality,
                response=f"quality={quality:.2f}/10 vs threshold {task.quality_threshold}",
            )
            if quality >= task.quality_threshold:
                self._emit(
                    kind="phase", mode=mode, phase="Threshold met",
                    response=f"Stopping after {iterations} iteration(s).",
                )
                break

            critique = self._step(
                mode, f"Critique - iteration {i+1}", critic,
                f"Critique this response for '{task.description}' and list specific, "
                f"actionable improvements:\n\n{current}",
                "You are a critical review agent. Be specific and constructive.",
                thinking=True,
            )
            current = self._step(
                mode, f"Improvement - iteration {i+1}", author,
                f"Improve the response for '{task.description}' using this critique:\n\n"
                f"CRITIQUE:\n{critique}\n\nCURRENT RESPONSE:\n{current}",
                "You are an improvement agent. Address every critique point.",
                thinking=True,
            )
            iterations += 1

        quality = self._score_output(task.description, current)
        self._emit(kind="score", mode=mode, phase="Final score", score=quality)
        return current, quality, iterations

    def _meta_learning(self, task: Task) -> Tuple[str, float, int]:
        """Delegate to the mode with the best track record, and say why."""
        mode = AgentMode.META_LEARNING.value
        scored = [
            (m, self.performance_metrics[m.value].get("avg_quality", 0.0),
             self.performance_metrics[m.value].get("executions", 0))
            for m in AgentMode if m != AgentMode.META_LEARNING
        ]
        # Only consider modes with a track record; with no history at all fall
        # back to hierarchical rather than picking an arbitrary zero-run mode.
        experienced = [(m, q, n) for m, q, n in scored if n > 0]
        if experienced:
            best_mode, best_quality, runs = max(experienced, key=lambda x: x[1])
            rationale = (
                f"Delegating to {best_mode.value}: best observed average quality "
                f"{best_quality:.2f}/10 over {runs} run(s)."
            )
        else:
            best_mode, rationale = (
                AgentMode.HIERARCHICAL,
                "No execution history yet - defaulting to hierarchical.",
            )
        self._emit(kind="phase", mode=mode, phase="Sub-mode selected", response=rationale)
        return self._run_mode(best_mode, task)

    def _background(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.BACKGROUND.value
        worker = self._inline_agent(40, "Async Worker", "Fast single-pass processing")
        result = self._step(
            mode, "Async processing", worker,
            f"Process this task efficiently:\n{task.description}",
            "You are an async processing agent. Be concise and accurate.",
        )
        quality = self._score_output(task.description, result)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return result, quality, 1

    def _socratic(self, task: Task) -> Tuple[str, float, int]:
        mode = AgentMode.SOCRATIC.value
        questioner = self._inline_agent(50, "Questioner", "Generates probing questions")
        answerer = self._inline_agent(51, "Answerer", "Answers deeply")
        synthesizer = self._inline_agent(52, "Synthesizer", "Distils Q&A into an answer")

        questions = self._step(
            mode, "Questions", questioner,
            f"Generate 3-5 Socratic questions that guide exploration of:\n{task.description}",
            "You are a Socratic questioner. Generate deep, clarifying questions.",
            thinking=True,
        )
        answers = self._step(
            mode, "Answers", answerer,
            f"Answer each of these questions thoughtfully to address "
            f"'{task.description}':\n\n{questions}",
            "You are a thoughtful respondent. Answer each question thoroughly.",
            thinking=True,
        )
        synthesis = self._step(
            mode, "Synthesis", synthesizer,
            f"Using these question-and-answer pairs, create a comprehensive response for "
            f"'{task.description}':\n\nQUESTIONS:\n{questions}\n\nANSWERS:\n{answers}",
            "You are a synthesis agent. Distil the Q&A into a coherent final answer.",
            thinking=True,
        )
        quality = self._score_output(task.description, synthesis)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return synthesis, quality, 1


    # ---- Chain: strictly sequential, each stage consumes the last ----------

    _CHAIN_STAGES = [
        ("Outliner",  "Structures the work before any prose is written",
         "Produce a tight outline of what a complete answer must contain. "
         "Headings and one line each - no prose yet."),
        ("Drafter",   "Turns an outline into a full draft",
         "Write the full draft that fills out the outline above. Cover every point."),
        ("Editor",    "Tightens and corrects the draft",
         "Edit the draft: cut repetition, fix inaccuracies, tighten wording. "
         "Return the improved version in full, not a list of edits."),
    ]

    def _chain(self, task: Task) -> Tuple[str, float, int]:
        """Prompt chaining: a fixed pipeline where each stage's output is the
        next stage's input. The defining property is that no stage sees the
        original task alone - it sees what the previous stage produced."""
        mode = AgentMode.CHAIN.value
        carried = ""

        for i, (role, spec, instruction) in enumerate(self._CHAIN_STAGES, start=1):
            agent = self._inline_agent(60 + i, role, spec)
            if carried:
                prompt = (
                    f"TASK: {task.description}\n\n"
                    f"OUTPUT OF THE PREVIOUS STAGE:\n{carried}\n\n{instruction}"
                )
            else:
                prompt = f"TASK: {task.description}\n\n{instruction}"

            carried = self._step(
                mode, f"Stage {i}/{len(self._CHAIN_STAGES)} - {role}", agent,
                prompt,
                f"You are the {role} in a prompt chain. {spec}.",
                thinking=(i > 1),
            )

        quality = self._score_output(task.description, carried)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return carried, quality, len(self._CHAIN_STAGES)

    # ---- Routing: classify, then hand to one specialist --------------------

    _ROUTES = {
        "technical":  ("Engineer",        "Implementation, systems and code"),
        "analytical": ("Analyst",         "Data, trade-offs and quantitative reasoning"),
        "creative":   ("Creative Lead",   "Ideation, naming and narrative"),
        "factual":    ("Researcher",      "Established facts and definitions"),
        "advisory":   ("Advisor",         "Recommendations and judgement calls"),
    }

    def _routing(self, task: Task) -> Tuple[str, float, int]:
        """Intelligent routing: a cheap classifier picks one specialist, and
        only that specialist runs. The saving is the point - the other routes
        cost nothing."""
        mode = AgentMode.ROUTING.value
        router = self._inline_agent(70, "Router", "Classifies work and dispatches it")

        options = "\n".join(f"  {k}: {v[1]}" for k, v in self._ROUTES.items())
        raw = self._step(
            mode, "Classification", router,
            f"Classify this task into exactly one category.\n\nTASK: {task.description}\n\n"
            f"CATEGORIES:\n{options}\n\n"
            'Respond ONLY with JSON: {"category": "<key>", "reason": "<one sentence>"}',
            "You are a routing classifier. Output strict JSON.",
            model=LITE_MODEL,   # the classifier is the cheap half of this pattern
            json_schema=True,
        )

        category, reason = "advisory", "Defaulted: classifier output unreadable."
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                parsed = parsed[0] if parsed else {}
            candidate = str(parsed.get("category", "")).strip().lower()
            if candidate in self._ROUTES:
                category = candidate
                reason = str(parsed.get("reason", "")) or reason
        except (ValueError, AttributeError, json.JSONDecodeError) as exc:
            logger.warning(f"Routing classification unparseable ({exc}); using {category}")

        role, spec = self._ROUTES[category]
        self._emit(
            kind="phase", mode=mode, phase="Routed",
            response=f"category={category} -> {role}\n{reason}",
        )

        specialist = self._inline_agent(71, role, spec)
        answer = self._step(
            mode, f"Specialist - {category}", specialist,
            f"Answer this task within your specialisation.\n\nTASK: {task.description}",
            f"You are a {role}. {spec}. Give a complete, expert answer.",
            thinking=True,
        )
        quality = self._score_output(task.description, answer)
        self._emit(kind="score", mode=mode, phase="Scored", score=quality)
        return answer, quality, 1

    # ---- Parallel: independent fan-out, single aggregation -----------------

    PARALLEL_MAX_WORKERS = 5

    def _parallel(self, task: Task) -> Tuple[str, float, int]:
        """Parallel execution: split into genuinely independent sub-questions,
        answer them concurrently, aggregate once.

        Distinct from hierarchical (which schedules dependency batches) and
        from swarm (where every agent answers the same question from a
        different angle). Here each worker owns a different piece.
        """
        mode = AgentMode.PARALLEL.value
        planner = self._inline_agent(80, "Splitter", "Divides work into independent pieces")

        width = {
            TaskComplexity.SIMPLE: 2, TaskComplexity.MODERATE: 3,
            TaskComplexity.COMPLEX: 4, TaskComplexity.CRITICAL: 5,
        }.get(task.complexity, 3)

        raw = self._step(
            mode, "Split", planner,
            f"Split this task into exactly {width} sub-questions that can be answered "
            f"INDEPENDENTLY - no sub-question may need another's answer.\n\n"
            f"TASK: {task.description}\n\n"
            'Respond ONLY with JSON: {"parts": [{"title": "...", "question": "..."}]}',
            "You are a work splitter. Output strict JSON. Independence is mandatory.",
            thinking=True,
            json_schema=True,
        )

        parts: List[Dict[str, str]] = []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                parsed = parsed[0] if parsed else {}
            for item in parsed.get("parts", []):
                q = str(item.get("question", "")).strip()
                if q:
                    parts.append({"title": str(item.get("title", q[:40])), "question": q})
        except (ValueError, AttributeError, json.JSONDecodeError) as exc:
            logger.warning(f"Parallel split unparseable ({exc}); falling back to one part")
        if not parts:
            parts = [{"title": "Whole task", "question": task.description}]

        def run_part(index_part):
            index, part = index_part
            agent = self._inline_agent(81 + index, part["title"][:40] or f"Worker {index+1}",
                                       "Answers one independent sub-question")
            started = time.time()
            prompt = (
                f"OVERALL TASK: {task.description}\n\n"
                f"YOUR SUB-QUESTION: {part['question']}\n\n"
                "Answer only your sub-question, completely."
            )
            response = self._call_model(
                prompt,
                system=f"You are working on one independent piece of a larger task: {part['title']}.",
            )
            self._emit(
                kind="agent_step", mode=mode, phase="Parallel worker",
                agent=agent, agent_origin="inline", batch=1,
                subtask_id=part["title"][:40],
                prompt=prompt, response=response,
                duration_ms=int((time.time() - started) * 1000),
            )
            return part["title"], response

        self._emit(
            kind="phase", mode=mode, phase="Fan-out", batch=1,
            response=f"{len(parts)} independent parts in parallel: "
                     + ", ".join(p["title"] for p in parts),
        )

        results: List[Tuple[str, str]] = []
        with ThreadPoolExecutor(max_workers=min(len(parts), self.PARALLEL_MAX_WORKERS)) as pool:
            futures = [pool.submit(run_part, (i, p)) for i, p in enumerate(parts)]
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as exc:
                    logger.error(f"Parallel worker failed: {exc}")

        assembled = "\n\n".join(f"### {title}\n{body}" for title, body in results)
        started = time.time()
        aggregate = self._call_model(
            f"Aggregate these independently-answered parts into one coherent response.\n\n"
            f"TASK: {task.description}\n\n{assembled}",
            system="You are an aggregator. Merge the parts, remove overlap, keep everything useful.",
            thinking=True,
        )
        quality = self._score_output(task.description, aggregate)
        self._emit(
            kind="synthesis", mode=mode, phase="Aggregation",
            prompt=f"Merging {len(results)} independent answers",
            response=aggregate, score=quality,
            duration_ms=int((time.time() - started) * 1000),
        )
        return aggregate, quality, 1

    # ---- Evaluator-optimizer: generate, grade against a rubric, revise -----

    def _evaluator(self, task: Task) -> Tuple[str, float, int]:
        """Evaluator-optimizer: a generator produces, a separate evaluator
        grades against explicit criteria and returns PASS or REVISE.

        Differs from reflective in that the evaluator is a distinct agent
        applying a rubric it wrote up front, and the loop exits on an explicit
        verdict rather than on a self-assigned score.
        """
        mode = AgentMode.EVALUATOR.value
        rubric_author = self._inline_agent(90, "Rubric Author", "Defines acceptance criteria")
        generator = self._inline_agent(91, "Generator", "Produces candidate answers")
        evaluator = self._inline_agent(92, "Evaluator", "Grades against the rubric")

        rubric = self._step(
            mode, "Rubric", rubric_author,
            f"List 3-5 concrete, checkable acceptance criteria for a good answer to:\n"
            f"{task.description}\n\nNumbered list, one line each.",
            "You define acceptance criteria. Be specific and checkable.",
            thinking=True,
        )

        candidate = self._step(
            mode, "Candidate 1", generator,
            f"Produce a complete answer to:\n{task.description}\n\n"
            f"It will be graded against:\n{rubric}",
            "You are the generator. Satisfy every criterion.",
        )

        iterations = 1
        rounds = max(1, min(task.max_iterations, 3))
        for i in range(rounds):
            verdict_raw = self._step(
                mode, f"Evaluation {i+1}", evaluator,
                f"Grade this answer against the criteria.\n\nTASK: {task.description}\n\n"
                f"CRITERIA:\n{rubric}\n\nANSWER:\n{candidate}\n\n"
                'Respond ONLY with JSON: {"verdict": "PASS" or "REVISE", '
                '"score": <0-10>, "failing": ["..."], "guidance": "what to change"}',
                "You are a strict evaluator. Output strict JSON.",
                thinking=True,
                json_schema=True,
            )

            verdict, guidance, score = "REVISE", "", None
            try:
                parsed = json.loads(verdict_raw)
                if isinstance(parsed, list):
                    parsed = parsed[0] if parsed else {}
                verdict = str(parsed.get("verdict", "REVISE")).upper()
                guidance = str(parsed.get("guidance", ""))
                failing = parsed.get("failing") or []
                if failing:
                    guidance = guidance + "\n\nFailing criteria:\n" + "\n".join(f"- {f}" for f in failing)
                score = float(parsed.get("score")) if parsed.get("score") is not None else None
            except (ValueError, TypeError, AttributeError, json.JSONDecodeError) as exc:
                logger.warning(f"Evaluator verdict unparseable ({exc}); revising once more")

            self._emit(
                kind="score", mode=mode, phase=f"Verdict {i+1}",
                score=score, response=f"{verdict}\n{guidance}".strip(),
            )

            if verdict == "PASS":
                break
            if i == rounds - 1:
                break   # out of budget; keep the last candidate

            candidate = self._step(
                mode, f"Candidate {i+2}", generator,
                f"Revise your answer using the evaluator's guidance.\n\n"
                f"TASK: {task.description}\n\nCRITERIA:\n{rubric}\n\n"
                f"GUIDANCE:\n{guidance}\n\nCURRENT ANSWER:\n{candidate}",
                "You are the generator. Address every failing criterion.",
                thinking=True,
            )
            iterations += 1

        quality = self._score_output(task.description, candidate)
        self._emit(kind="score", mode=mode, phase="Final score", score=quality)
        return candidate, quality, iterations

    # -----------------------------------------------------------------------
    # METRICS RECORDING
    # -----------------------------------------------------------------------

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
