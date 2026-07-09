"""
FastAPI server for Mega Agentic System frontend integration.

This server provides REST API endpoints to interact with the Mega Agentic System
from the Next.js frontend, including task execution, status monitoring, and
system management.
"""

import sys

# Force UTF-8 I/O on Windows (prevents charmap codec errors from emoji/Unicode in print output)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import atexit
import tempfile
import os as _os
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum
import json
import asyncio
import logging
from datetime import datetime
import uuid
import re


# ============================================================================
# PER-TASK LOG CAPTURE
# ============================================================================

def _classify_event(msg: str) -> str:
    """Infer a structured event_type from the log message text."""
    m = msg.lower()
    if "phase 1" in m or "phase 2" in m or "phase 3" in m or "phase 4" in m or "phase 5" in m:
        return "phase"
    if "execution plan" in m or "📋" in msg:
        return "plan"
    if "executing with" in m or "🚀" in msg:
        return "mode"
    if "question" in m or "❓" in msg:
        return "question"
    if "answer" in m or "answering" in m:
        return "answer"
    if "breakthrough" in m or "💡" in msg:
        return "breakthrough"
    if "complete" in m or "✅" in msg:
        return "complete"
    if "warning" in m or "⚠" in msg:
        return "warning"
    if "learning" in m or "📊" in msg:
        return "learning"
    if "agent" in m:
        return "agent"
    return "info"


def _extract_agents(msg: str, agents_count: int) -> list:
    """Build agent card objects from execution plan messages."""
    agents = []
    # Try to extract mode from 'Primary Mode:' line
    primary = re.search(r"Primary Mode:\s*(\w+)", msg, re.IGNORECASE)
    mode = primary.group(1) if primary else "unknown"
    for i in range(agents_count):
        role_names = ["Planner", "Executor", "Critic", "Synthesizer", "Validator"]
        agents.append({
            "id": i + 1,
            "name": f"Agent {i + 1}",
            "role": role_names[i] if i < len(role_names) else f"Agent {i + 1}",
            "mode": mode,
        })
    return agents


class TaskLogHandler(logging.Handler):
    """Captures log records for a specific task into task_store."""

    def __init__(self, task_id: str):
        super().__init__()
        self.task_id = task_id

    def emit(self, record: logging.LogRecord):
        try:
            msg = record.getMessage()
            event_type = _classify_event(msg)
            event = {
                "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                "level": record.levelname,
                "message": msg,
                "event_type": event_type,
            }
            if self.task_id in task_store:
                task_store[self.task_id]["logs"].append(event)
        except Exception:
            pass  # Never let logging errors crash the server

# Import Google GenAI error types
try:
    from google.genai.errors import APIError, ServerError, ClientError
except ImportError:
    # Fallback if error types aren't available
    APIError = Exception
    ServerError = Exception
    ClientError = Exception

from mega_agentic_system import (
    MegaAgenticSystem,
    Task,
    TaskComplexity,
    AgentMode,
    ExecutionResult
)

# Import additional modules
from image_generation import (
    generate_image,
    edit_image_with_gemini,
    generate_with_reference_image,
    batch_generate_images
)
from document_generation import (
    generate_document_content,
    analyze_document,
    summarize_document,
    expand_document,
    translate_document,
    improve_document,
    generate_with_research
)
from code_generation import (
    generate_code,
    review_code,
    explain_code,
    refactor_code,
    convert_code,
    generate_tests,
    execute_code,
    validate_syntax
)
from ai_research_platform import AIResearchPlatform
from main import (
    search_arxiv,
    search_pubmed,
    search_wikipedia,
    research_with_grounding,
    generate_music,
    usage_tracker,
    set_usage_label,
)
from music_realtime import (
    LYRIA_REALTIME_MODEL,
    get_realtime_client,
    build_weighted_prompts,
    build_generation_config,
    realtime_metadata,
    HARD_TRANSITION_FIELDS,
)
from speech_generation import (
    generate_speech,
    generate_multi_speaker_speech,
    VOICES as TTS_VOICES,
    TTS_MODELS,
)
from csv_data_completion_tool import analyze_missing_data
from build_scout_plan import ScoutPlanBuildOrchestrator
from google import genai
from PIL import Image

# Initialize FastAPI app
app = FastAPI(
    title="Mega Agentic System API",
    description="API for the Ultimate Multi-Pattern AI Orchestration System",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global system instance
mega_system: Optional[MegaAgenticSystem] = None

# In-memory task storage (in production, use a database)
task_store: Dict[str, Dict[str, Any]] = {}

# Global research platform (per-request Gemini clients are built via BYOK below)
research_platform: Optional[AIResearchPlatform] = None


# ============================================================================
# BRING-YOUR-OWN-KEY (BYOK)
# ============================================================================
# The server holds NO Gemini key. Each request carries the caller's key in the
# `X-Gemini-Key` header; we build a per-request client from it. Never log the key.

def get_gemini_key(x_gemini_key: Optional[str] = Header(default=None)) -> str:
    """FastAPI dependency: the caller's Gemini API key, or a 401 if absent."""
    key = (x_gemini_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=401,
            detail="No Gemini API key provided. Add your key in Settings to use this feature.",
        )
    return key


def get_gemini_client(x_gemini_key: Optional[str] = Header(default=None)) -> genai.Client:
    """FastAPI dependency: a per-request Gemini client built from the caller's key."""
    return genai.Client(api_key=get_gemini_key(x_gemini_key))
scout_plan_build: Optional[ScoutPlanBuildOrchestrator] = None


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class TaskComplexityEnum(str, Enum):
    """Task complexity levels."""
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    CRITICAL = "critical"


class AgentModeEnum(str, Enum):
    """Agent execution modes."""
    HIERARCHICAL = "hierarchical"
    SWARM = "swarm"
    DEBATE = "debate"
    NEGOTIATE = "negotiate"
    RED_BLUE = "red_blue"
    REFLECTIVE = "reflective"
    META_LEARNING = "meta_learning"
    BACKGROUND = "background"
    SOCRATIC = "socratic"


class TaskCreate(BaseModel):
    """Task creation request model."""
    description: str = Field(..., description="Task description")
    complexity: TaskComplexityEnum = Field(
        default=TaskComplexityEnum.MODERATE,
        description="Task complexity level"
    )
    preferred_mode: Optional[AgentModeEnum] = Field(
        default=None,
        description="Preferred execution mode (auto-selected if not provided)"
    )
    quality_threshold: float = Field(
        default=8.0,
        ge=0.0,
        le=10.0,
        description="Minimum acceptable quality score"
    )
    max_iterations: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum improvement iterations"
    )
    constraints: Dict[str, Any] = Field(
        default_factory=dict,
        description="Task-specific constraints"
    )


class ExecutionStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskResponse(BaseModel):
    """Task response model."""
    task_id: str
    status: ExecutionStatus
    description: str
    complexity: str
    mode_used: Optional[str] = None
    quality_score: Optional[float] = None
    execution_time: Optional[float] = None
    agents_involved: Optional[int] = None
    iterations: Optional[int] = None
    output: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    # Token usage for this task (populated once the task completes).
    prompt_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


class SystemMetrics(BaseModel):
    """System performance metrics."""
    total_executions: int
    avg_quality: float
    avg_execution_time: float
    success_rate: float
    mode_performance: Dict[str, Dict[str, Any]]
    recent_executions: List[Dict[str, Any]]
    # Cumulative token usage since server start (total / by_model / by_label).
    token_usage: Dict[str, Any] = Field(default_factory=dict)


# Additional request/response models for new modules
class ImageGenerateRequest(BaseModel):
    """Image generation request."""
    prompt: str
    aspect_ratio: str = "1:1"
    model: str = "imagen-4.0-fast-generate-001"
    number_of_images: int = 1
    person_generation: str = "ALLOW_ADULT"
    negative_prompt: Optional[str] = None


class DocumentGenerateRequest(BaseModel):
    """Document generation request."""
    topic: str
    length: str = "medium"  # short, medium, long, comprehensive
    style: str = "formal"  # technical, casual, formal, academic, creative
    target_audience: str = "general"
    include_citations: bool = False


class CodeGenerateRequest(BaseModel):
    """Code generation request."""
    requirements: str
    language: str = "python"
    style: str = "clean"
    include_tests: bool = False
    include_comments: bool = True
    max_complexity: str = "moderate"


class CodeReviewRequest(BaseModel):
    """Code review request."""
    code: str
    language: str = "python"


class CodeExplainRequest(BaseModel):
    """Code explanation request."""
    code: str
    detail_level: str = "detailed"  # brief, detailed, line-by-line


class CodeRefactorRequest(BaseModel):
    """Code refactor request."""
    code: str
    goals: List[str]


class CodeConvertRequest(BaseModel):
    """Code conversion request."""
    code: str
    source_lang: str
    target_lang: str


class CodeTestsRequest(BaseModel):
    """Test generation request."""
    code: str
    test_framework: str = "pytest"


class CodeExecuteRequest(BaseModel):
    """Code execution request (Python only)."""
    code: str
    timeout: int = 30


class CodeValidateRequest(BaseModel):
    """Syntax validation request."""
    code: str
    language: str = "python"


class ResearchRequest(BaseModel):
    """Research platform request."""
    request_type: str  # research, rag_query, chat
    query: Optional[str] = None
    question: Optional[str] = None
    message: Optional[str] = None


class DocumentGenerateRequest(BaseModel):
    """Document generation request."""
    topic: str
    length: str = "medium"  # short, medium, long, comprehensive
    style: str = "formal"  # technical, casual, formal, academic, creative
    target_audience: str = "general"
    include_citations: bool = False


class DocumentSummarizeRequest(BaseModel):
    """Document summarization request."""
    content: str
    length: str = "moderate"  # brief, moderate, detailed


class DocumentExpandRequest(BaseModel):
    """Document expansion request."""
    content: str
    expansion_factor: float = 1.5
    focus_areas: Optional[List[str]] = None


class DocumentTranslateRequest(BaseModel):
    """Document translation request."""
    content: str
    target_language: str
    preserve_formatting: bool = True


class DocumentImproveRequest(BaseModel):
    """Document improvement request."""
    content: str
    improvements: List[str]


class DocumentResearchRequest(BaseModel):
    """Document with research request."""
    topic: str
    use_grounding: bool = True


class DocumentAnalyzeRequest(BaseModel):
    """Document analysis request."""
    content: str


class ImageEditRequest(BaseModel):
    """Request model for editing images with Gemini."""
    image_base64: str  # Base64-encoded source image
    prompt: str
    number_of_images: int = 1


class ImageReferenceGenerateRequest(BaseModel):
    """Request model for reference-based image generation."""
    prompt: str
    reference_image_base64: str  # Base64-encoded reference image
    aspect_ratio: str = "1:1"
    number_of_images: int = 1


class ImageBatchGenerateRequest(BaseModel):
    """Request model for batch image generation."""
    prompts: List[str]
    aspect_ratio: str = "1:1"
    model: str = "imagen-4.0-fast-generate-001"
    number_of_images: int = 1


# ============================================================================
# STARTUP/SHUTDOWN
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize the mega system on startup."""
    global mega_system, research_platform, scout_plan_build
    try:
        # Boots with no key; each task builds its own keyed system (BYOK).
        mega_system = MegaAgenticSystem(name="API-Server")
        try:
            # AIResearchPlatform builds a Gemini client at construction, so with no
            # server key it fails here. Research stays BYOK-disabled until wired up.
            research_platform = AIResearchPlatform()
        except Exception as e:
            print(f"⚠️  Research platform unavailable (BYOK: per-request key wiring pending): {e}")
            research_platform = None
        try:
            scout_plan_build = ScoutPlanBuildOrchestrator()
        except Exception as e:
            # ScoutPlanBuildOrchestrator references a model that may not be available
            # ("gemini-3.5-flash" in build_scout_plan.py). Don't block server startup.
            print(f"⚠️  Scout/Plan/Build orchestrator unavailable: {e}")
            scout_plan_build = None
        # Try to load previous state
        try:
            mega_system.load_state("mega_system_state.pkl")
        except Exception:
            pass  # Start fresh if no state exists
        print("✅ Mega Agentic System initialized")
    except Exception as e:
        print(f"❌ Failed to initialize system: {e}")
        raise


def cleanup_resources():
    """Clean up resources to prevent shutdown warnings."""
    global research_platform
    try:
        research_platform = None
    except Exception:
        pass  # Ignore cleanup errors during shutdown

@app.on_event("shutdown")
async def shutdown_event():
    """Save system state on shutdown."""
    global mega_system
    if mega_system:
        try:
            mega_system.save_state("mega_system_state.pkl")
            print("💾 System state saved")
        except Exception as e:
            print(f"⚠️ Failed to save state: {e}")
    
    # Clean up resources to prevent shutdown warnings
    cleanup_resources()


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mega Agentic System API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "system_initialized": mega_system is not None
    }


@app.post("/tasks", response_model=TaskResponse, status_code=202)
async def create_task(task_data: TaskCreate, background_tasks: BackgroundTasks,
                      gemini_key: str = Depends(get_gemini_key)):
    """
    Create and execute a new task.

    Returns immediately with task ID, execution happens in background.
    """
    if not mega_system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    # Generate task ID
    task_id = str(uuid.uuid4())
    
    # Convert enums
    complexity_map = {
        TaskComplexityEnum.SIMPLE: TaskComplexity.SIMPLE,
        TaskComplexityEnum.MODERATE: TaskComplexity.MODERATE,
        TaskComplexityEnum.COMPLEX: TaskComplexity.COMPLEX,
        TaskComplexityEnum.CRITICAL: TaskComplexity.CRITICAL,
    }
    
    mode_map = {
        AgentModeEnum.HIERARCHICAL: AgentMode.HIERARCHICAL,
        AgentModeEnum.SWARM: AgentMode.SWARM,
        AgentModeEnum.DEBATE: AgentMode.DEBATE,
        AgentModeEnum.NEGOTIATE: AgentMode.NEGOTIATE,
        AgentModeEnum.RED_BLUE: AgentMode.RED_BLUE,
        AgentModeEnum.REFLECTIVE: AgentMode.REFLECTIVE,
        AgentModeEnum.META_LEARNING: AgentMode.META_LEARNING,
        AgentModeEnum.BACKGROUND: AgentMode.BACKGROUND,
        AgentModeEnum.SOCRATIC: AgentMode.SOCRATIC,
    }
    
    # Create task
    task = Task(
        id=task_id,
        description=task_data.description,
        complexity=complexity_map[task_data.complexity],
        preferred_mode=mode_map[task_data.preferred_mode] if task_data.preferred_mode else None,
        quality_threshold=task_data.quality_threshold,
        max_iterations=task_data.max_iterations,
        constraints=task_data.constraints
    )
    
    # Store task in memory
    task_store[task_id] = {
        "task_id": task_id,
        "status": ExecutionStatus.PENDING,
        "description": task_data.description,
        "complexity": task_data.complexity.value,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "result": None,
        "error": None,
        "logs": [],
        "agents": [],
    }
    
    # Execute in background (carries the caller's key — BYOK)
    background_tasks.add_task(execute_task_background, task_id, task, gemini_key)
    
    return TaskResponse(
        task_id=task_id,
        status=ExecutionStatus.PENDING,
        description=task_data.description,
        complexity=task_data.complexity.value,
        created_at=task_store[task_id]["created_at"]
    )


async def execute_task_background(task_id: str, task: Task, gemini_key: str):
    """Execute task in background and update store.

    BYOK: builds a per-task system with the caller's key, then folds its run
    history into the shared singleton so /metrics still reflects activity.
    """
    global mega_system

    # Attach a per-task log handler to capture structured events
    log_handler = TaskLogHandler(task_id)
    mega_logger = logging.getLogger("MegaAgenticSystem")
    root_logger = logging.getLogger()
    mega_logger.addHandler(log_handler)
    root_logger.addHandler(log_handler)

    try:
        # Update status
        task_store[task_id]["status"] = ExecutionStatus.RUNNING

        # Attribute all token usage during this run to the task id.
        set_usage_label(f"task:{task_id}")

        # Execute with a system built from the caller's own key.
        system = MegaAgenticSystem(name=f"task-{task_id}", api_key=gemini_key)
        result: ExecutionResult = system.execute(task)

        # Fold this run's history into the shared singleton for /metrics.
        try:
            if mega_system is not None and getattr(system, "execution_history", None):
                mega_system.execution_history.extend(system.execution_history)
        except Exception:
            pass

        # Always set agents from the actual result — never use log-based seeding
        # (log parsing is too ambiguous and fires before the correct plan message)
        if result.agents_involved:
            role_names = ["Planner", "Executor", "Critic", "Synthesizer", "Validator"]
            task_store[task_id]["agents"] = [
                {
                    "id": i + 1,
                    "name": f"Agent {i + 1}",
                    "role": role_names[i] if i < len(role_names) else f"Agent {i + 1}",
                    "mode": result.mode_used.value,
                }
                for i in range(result.agents_involved)
            ]

        # Update store
        task_store[task_id].update({
            "status": ExecutionStatus.COMPLETED,
            "mode_used": result.mode_used.value,
            "quality_score": result.quality_score,
            "execution_time": result.execution_time,
            "agents_involved": result.agents_involved,
            "iterations": result.iterations,
            "output": result.output,
            "completed_at": datetime.now().isoformat(),
            "prompt_tokens": getattr(result, "prompt_tokens", 0),
            "output_tokens": getattr(result, "output_tokens", 0),
            "total_tokens": getattr(result, "total_tokens", 0),
            "result": {
                "task_id": result.task_id,
                "mode_used": result.mode_used.value,
                "output": result.output,
                "quality_score": result.quality_score,
                "execution_time": result.execution_time,
                "agents_involved": result.agents_involved,
                "iterations": result.iterations,
                "metadata": result.metadata,
                "prompt_tokens": getattr(result, "prompt_tokens", 0),
                "output_tokens": getattr(result, "output_tokens", 0),
                "total_tokens": getattr(result, "total_tokens", 0),
            }
        })

    except Exception as e:
        import traceback
        err_msg = str(e)
        tb = traceback.format_exc()
        logging.getLogger("MegaAgenticSystem").error(
            f"Task {task_id} FAILED with exception: {err_msg}\n{tb}"
        )
        task_store[task_id].update({
            "status": ExecutionStatus.FAILED,
            "error": err_msg,
            "completed_at": datetime.now().isoformat()
        })
    finally:
        # Always detach handler
        mega_logger.removeHandler(log_handler)
        root_logger.removeHandler(log_handler)


@app.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str):
    """Get structured execution logs and agent cards for a task."""
    if task_id not in task_store:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "task_id": task_id,
        "logs": task_store[task_id].get("logs", []),
        "agents": task_store[task_id].get("agents", []),
        "status": task_store[task_id]["status"],
    }


@app.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str):
    """Get task status and results."""
    if task_id not in task_store:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_data = task_store[task_id]
    
    return TaskResponse(
        task_id=task_data["task_id"],
        status=task_data["status"],
        description=task_data["description"],
        complexity=task_data["complexity"],
        mode_used=task_data.get("mode_used"),
        quality_score=task_data.get("quality_score"),
        execution_time=task_data.get("execution_time"),
        agents_involved=task_data.get("agents_involved"),
        iterations=task_data.get("iterations"),
        output=task_data.get("output"),
        error=task_data.get("error"),
        created_at=task_data["created_at"],
        completed_at=task_data.get("completed_at"),
        metadata=task_data.get("result", {}).get("metadata", {}) if task_data.get("result") else {},
        prompt_tokens=task_data.get("prompt_tokens"),
        output_tokens=task_data.get("output_tokens"),
        total_tokens=task_data.get("total_tokens"),
    )


@app.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(limit: int = 50, offset: int = 0):
    """List all tasks."""
    tasks = list(task_store.values())[offset:offset+limit]
    return [
        TaskResponse(
            task_id=t["task_id"],
            status=t["status"],
            description=t["description"],
            complexity=t["complexity"],
            mode_used=t.get("mode_used"),
            quality_score=t.get("quality_score"),
            execution_time=t.get("execution_time"),
            agents_involved=t.get("agents_involved"),
            iterations=t.get("iterations"),
            output=t.get("output"),
            error=t.get("error"),
            created_at=t["created_at"],
            completed_at=t.get("completed_at"),
            metadata=t.get("result", {}).get("metadata", {}) if t.get("result") else {},
            prompt_tokens=t.get("prompt_tokens"),
            output_tokens=t.get("output_tokens"),
            total_tokens=t.get("total_tokens"),
        )
        for t in tasks
    ]


@app.get("/metrics", response_model=SystemMetrics)
async def get_metrics():
    """Get system performance metrics."""
    if not mega_system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    history = mega_system.execution_history
    
    if not history:
        return SystemMetrics(
            total_executions=0,
            avg_quality=0.0,
            avg_execution_time=0.0,
            success_rate=0.0,
            mode_performance={},
            recent_executions=[],
            token_usage=usage_tracker.snapshot(),
        )
    
    total = len(history)
    avg_quality = sum(r.quality_score for r in history) / total
    avg_time = sum(r.execution_time for r in history) / total
    success_rate = sum(1 for r in history if r.quality_score >= 7.0) / total
    
    # Mode performance
    mode_perf = {}
    for mode in AgentMode:
        mode_results = [r for r in history if r.mode_used == mode]
        if mode_results:
            mode_perf[mode.value] = {
                "executions": len(mode_results),
                "avg_quality": sum(r.quality_score for r in mode_results) / len(mode_results),
                "avg_time": sum(r.execution_time for r in mode_results) / len(mode_results),
                "success_rate": sum(1 for r in mode_results if r.quality_score >= 7.0) / len(mode_results)
            }
    
    # Recent executions
    recent = [
        {
            "task_id": r.task_id,
            "mode": r.mode_used.value,
            "quality": r.quality_score,
            "time": r.execution_time,
            "agents": r.agents_involved
        }
        for r in history[-10:]
    ]
    
    return SystemMetrics(
        total_executions=total,
        avg_quality=avg_quality,
        avg_execution_time=avg_time,
        success_rate=success_rate,
        mode_performance=mode_perf,
        recent_executions=recent,
        token_usage=usage_tracker.snapshot(),
    )


@app.get("/usage")
async def get_usage():
    """Cumulative Gemini token usage since server start, broken down by model and label."""
    return usage_tracker.snapshot()


@app.post("/usage/reset")
async def reset_usage():
    """Reset the in-memory token usage counters."""
    usage_tracker.reset()
    return {"message": "Token usage counters reset", "token_usage": usage_tracker.snapshot()}


@app.post("/system/optimize")
async def optimize_system():
    """Trigger system optimization."""
    if not mega_system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    mega_system.optimize_system()
    return {"message": "System optimization completed"}


@app.post("/system/save")
async def save_system_state():
    """Save system state."""
    if not mega_system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    mega_system.save_state("mega_system_state.pkl")
    return {"message": "System state saved"}


@app.get("/modes")
async def get_modes():
    """Get available agent modes with descriptions."""
    modes = []
    for mode in AgentMode:
        modes.append({
            "value": mode.value,
            "description": mega_system._get_mode_description(mode) if mega_system else "",
            "use_cases": mega_system._get_mode_use_cases(mode) if mega_system else []
        })
    return {"modes": modes}


@app.get("/complexities")
async def get_complexities():
    """Get available complexity levels."""
    return {
        "complexities": [
            {"value": "simple", "description": "Single agent, single call"},
            {"value": "moderate", "description": "Multiple agents, sequential execution"},
            {"value": "complex", "description": "Multiple agents, parallel execution"},
            {"value": "critical", "description": "Full arsenal, all patterns"}
        ]
    }


# ============================================================================
# IMAGE GENERATION ENDPOINTS
# ============================================================================

@app.post("/images/generate")
async def generate_image_endpoint(request: ImageGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate images using Imagen models."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        images = generate_image(
            client=ai_client,
            prompt=request.prompt,
            aspect_ratio=request.aspect_ratio,
            model=request.model,
            number_of_images=request.number_of_images,
            person_generation=request.person_generation,
            negative_prompt=request.negative_prompt
        )
        
        # Convert images to base64 for API response
        import base64
        from io import BytesIO
        
        image_data = []
        for i, img in enumerate(images):
            buffered = BytesIO()
            img.save(buffered, format="JPEG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            image_data.append({
                "index": i,
                "data": f"data:image/jpeg;base64,{img_base64}",
                "format": "jpeg"
            })
        
        return {
            "success": True,
            "images": image_data,
            "count": len(images)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/images/edit")
async def edit_image_endpoint(request: ImageEditRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Edit an image using Gemini's image editing capabilities."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        import base64
        from io import BytesIO
        
        # Decode base64 image
        image_data = base64.b64decode(request.image_base64.split(",")[1] if "," in request.image_base64 else request.image_base64)
        source_image = Image.open(BytesIO(image_data))
        
        # Edit the image
        edited_images = edit_image_with_gemini(
            client=ai_client,
            image=source_image,
            prompt=request.prompt,
            number_of_images=request.number_of_images
        )
        
        # Convert edited images to base64
        result_images = []
        for i, img in enumerate(edited_images):
            buffered = BytesIO()
            img.save(buffered, format="JPEG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            result_images.append({
                "index": i,
                "data": f"data:image/jpeg;base64,{img_base64}",
                "format": "jpeg"
            })
        
        return {
            "success": True,
            "images": result_images,
            "count": len(edited_images)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/images/generate-with-reference")
async def generate_with_reference_endpoint(request: ImageReferenceGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate images using a reference image for style guidance."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        import base64
        from io import BytesIO
        
        # Decode base64 reference image
        ref_data = base64.b64decode(request.reference_image_base64.split(",")[1] if "," in request.reference_image_base64 else request.reference_image_base64)
        reference_image = Image.open(BytesIO(ref_data))
        
        # Generate images with reference
        images = generate_with_reference_image(
            client=ai_client,
            prompt=request.prompt,
            reference_image=reference_image,
            aspect_ratio=request.aspect_ratio,
            number_of_images=request.number_of_images
        )
        
        # Convert to base64
        result_images = []
        for i, img in enumerate(images):
            buffered = BytesIO()
            img.save(buffered, format="JPEG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            result_images.append({
                "index": i,
                "data": f"data:image/jpeg;base64,{img_base64}",
                "format": "jpeg"
            })
        
        return {
            "success": True,
            "images": result_images,
            "count": len(images)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/images/batch-generate")
async def batch_generate_endpoint(request: ImageBatchGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate images for multiple prompts in batch."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        import base64
        from io import BytesIO
        
        # Generate images for all prompts
        batch_results = batch_generate_images(
            client=ai_client,
            prompts=request.prompts,
            aspect_ratio=request.aspect_ratio,
            model=request.model,
            number_of_images=request.number_of_images
        )
        
        # Convert all results to base64
        all_results = []
        for prompt_images in batch_results:
            prompt_result = []
            for i, img in enumerate(prompt_images):
                buffered = BytesIO()
                img.save(buffered, format="JPEG")
                img_base64 = base64.b64encode(buffered.getvalue()).decode()
                prompt_result.append({
                    "index": i,
                    "data": f"data:image/jpeg;base64,{img_base64}",
                    "format": "jpeg"
                })
            all_results.append({
                "images": prompt_result,
                "count": len(prompt_images)
            })
        
        return {
            "success": True,
            "results": all_results,
            "total_prompts": len(request.prompts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DOCUMENT GENERATION ENDPOINTS
# ============================================================================

@app.post("/documents/generate")
async def generate_document_endpoint(request: DocumentGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate document content."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        content = generate_document_content(
            client=ai_client,
            topic=request.topic,
            length=request.length,
            style=request.style,
            target_audience=request.target_audience,
            include_citations=request.include_citations
        )
        
        return {
            "success": True,
            "content": content,
            "topic": request.topic,
            "length": request.length,
            "style": request.style
        }
    except ServerError as e:
        error_msg = f"Google API server error: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Document generation server error: {error_msg}")
        raise HTTPException(
            status_code=503,
            detail=f"Document generation service temporarily unavailable. Please try again in a moment."
        )
    except ClientError as e:
        error_msg = f"Invalid request: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Document generation client error: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    except APIError as e:
        error_msg = f"API error: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Document generation API error: {error_msg}")
        raise HTTPException(status_code=502, detail=f"API error: {error_msg}")
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Document generation error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {error_msg}")


@app.post("/documents/analyze")
async def analyze_document_endpoint(content: str, ai_client: genai.Client = Depends(get_gemini_client)):
    """Analyze document content."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        analysis = analyze_document(ai_client, content)
        
        return {
            "success": True,
            "analysis": {
                "readability_score": analysis.readability_score,
                "main_topics": analysis.main_topics,
                "key_points": analysis.key_points,
                "suggested_improvements": analysis.suggested_improvements,
                "target_audience": analysis.target_audience,
                "tone": analysis.tone
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/summarize")
async def summarize_document_endpoint(request: DocumentSummarizeRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Summarize document content."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        summary = summarize_document(
            client=ai_client,
            content=request.content,
            length=request.length
        )
        return {"success": True, "summary": summary, "length": request.length}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/expand")
async def expand_document_endpoint(request: DocumentExpandRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Expand document with more detail."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        expanded = expand_document(
            client=ai_client,
            content=request.content,
            expansion_factor=request.expansion_factor,
            focus_areas=request.focus_areas
        )
        return {"success": True, "expanded_content": expanded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/translate")
async def translate_document_endpoint(request: DocumentTranslateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Translate document to another language."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        translated = translate_document(
            client=ai_client,
            content=request.content,
            target_language=request.target_language,
            preserve_formatting=request.preserve_formatting
        )
        return {
            "success": True,
            "translated_content": translated,
            "target_language": request.target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/improve")
async def improve_document_endpoint(request: DocumentImproveRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Improve document based on specified criteria."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        improved = improve_document(
            client=ai_client,
            content=request.content,
            improvements=request.improvements
        )
        return {"success": True, "improved_content": improved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/research")
async def research_document_endpoint(request: DocumentResearchRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate document with web research."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        content = generate_with_research(
            client=ai_client,
            topic=request.topic,
            use_grounding=request.use_grounding
        )
        return {"success": True, "content": content, "topic": request.topic}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CODE GENERATION ENDPOINTS
# ============================================================================

@app.post("/code/generate")
async def generate_code_endpoint(request: CodeGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate code based on requirements."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        code = generate_code(
            client=ai_client,
            requirements=request.requirements,
            language=request.language,
            style=request.style,
            include_tests=request.include_tests,
            include_comments=request.include_comments,
            max_complexity=request.max_complexity
        )
        
        return {
            "success": True,
            "code": code,
            "language": request.language,
            "style": request.style
        }
    except ServerError as e:
        error_msg = f"Google API server error: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Code generation server error: {error_msg}")
        raise HTTPException(
            status_code=503,
            detail=f"Code generation service temporarily unavailable. Please try again in a moment."
        )
    except ClientError as e:
        error_msg = f"Invalid request: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Code generation client error: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    except APIError as e:
        error_msg = f"API error: {e.message if hasattr(e, 'message') else str(e)}"
        print(f"❌ Code generation API error: {error_msg}")
        raise HTTPException(status_code=502, detail=f"API error: {error_msg}")
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Code generation error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {error_msg}")


@app.post("/code/review")
async def review_code_endpoint(request: CodeReviewRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Review code for issues and improvements."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        # Note: review_code doesn't use language param - it's for structured output
        review = review_code(ai_client, request.code)
        
        return {
            "success": True,
            "review": {
                "issues": review.issues,
                "suggestions": review.suggestions,
                "security_concerns": review.security_concerns,
                "performance_notes": review.performance_notes,
                "rating": review.rating
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/explain")
async def explain_code_endpoint(request: CodeExplainRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Explain what code does."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        explanation = explain_code(
            client=ai_client,
            code=request.code,
            detail_level=request.detail_level
        )
        return {"success": True, "explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/refactor")
async def refactor_code_endpoint(request: CodeRefactorRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Refactor code according to specified goals."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        refactored = refactor_code(
            client=ai_client,
            code=request.code,
            goals=request.goals
        )
        return {"success": True, "refactored_code": refactored}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/convert")
async def convert_code_endpoint(request: CodeConvertRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Convert code from one language to another."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        converted = convert_code(
            client=ai_client,
            code=request.code,
            source_lang=request.source_lang,
            target_lang=request.target_lang
        )
        return {
            "success": True,
            "converted_code": converted,
            "source_lang": request.source_lang,
            "target_lang": request.target_lang
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/tests")
async def generate_tests_endpoint(request: CodeTestsRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate unit tests for code."""
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI client not initialized")
    
    try:
        tests = generate_tests(
            client=ai_client,
            code=request.code,
            test_framework=request.test_framework
        )
        return {
            "success": True,
            "tests": [
                {
                    "test_name": t.test_name,
                    "test_code": t.test_code,
                    "description": t.description
                }
                for t in tests
            ],
            "framework": request.test_framework
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/execute")
async def execute_code_endpoint(request: CodeExecuteRequest):
    """Execute Python code and return results."""
    try:
        result = execute_code(
            code=request.code,
            timeout=request.timeout
        )
        return_code = result.get("returncode", -1)
        timed_out = result.get("timed_out", False)
        return {
            "success": (return_code == 0) and not timed_out,
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
            "return_code": return_code,
            "timed_out": timed_out,
            "execution_time": result.get("execution_time"),
            "error": result.get("stderr") if return_code != 0 else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/validate")
async def validate_code_endpoint(request: CodeValidateRequest):
    """Validate code syntax without executing."""
    try:
        result = validate_syntax(
            code=request.code,
            language=request.language
        )
        return {
            "success": True,
            "valid": result["valid"],
            "errors": result.get("errors", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RESEARCH PLATFORM ENDPOINTS
# ============================================================================

@app.post("/research/query")
async def research_query_endpoint(request: ResearchRequest, gemini_key: str = Depends(get_gemini_key)):
    """Process research platform queries (BYOK: built per-request from the caller's key)."""
    try:
        research_platform = AIResearchPlatform(api_key=gemini_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to initialize research platform: {e}")

    try:
        if request.request_type == "research":
            if not request.query:
                raise HTTPException(status_code=400, detail="Query required for research type")
            result = research_platform.process_request("research", query=request.query)
            return {"success": True, "response": result.get("response", "")}
        
        elif request.request_type == "rag_query":
            if not request.question:
                raise HTTPException(status_code=400, detail="Question required for rag_query type")
            result = research_platform.process_request("rag_query", question=request.question)
            return {"success": True, "answer": result.get("answer", "")}
        
        elif request.request_type == "chat":
            if not request.message:
                raise HTTPException(status_code=400, detail="Message required for chat type")
            result = research_platform.process_request("chat", message=request.message)
            return {"success": True, "response": result.get("response", "")}
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown request type: {request.request_type}")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SEARCH / KNOWLEDGE TOOLS (from main.py)
# ============================================================================

class SearchRequest(BaseModel):
    """Generic search request."""
    query: str
    max_results: int = Field(default=5, ge=1, le=50)


class WikipediaRequest(BaseModel):
    """Wikipedia lookup."""
    query: str


class GroundedQueryRequest(BaseModel):
    """Gemini Google-Search-grounded query."""
    query: str


@app.post("/research/arxiv")
async def search_arxiv_endpoint(request: SearchRequest):
    """Search arXiv for academic papers."""
    try:
        raw = search_arxiv(request.query, request.max_results)
        return {"success": True, "results": json.loads(raw)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/research/pubmed")
async def search_pubmed_endpoint(request: SearchRequest):
    """Search PubMed for medical papers with full article details."""
    try:
        raw = search_pubmed(request.query, request.max_results)
        articles = json.loads(raw)
        return {"success": True, "articles": articles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/research/wikipedia")
async def search_wikipedia_endpoint(request: WikipediaRequest):
    """Fetch a Wikipedia article summary + content."""
    try:
        raw = search_wikipedia(request.query)
        return {"success": True, "article": json.loads(raw)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/research/grounded")
async def grounded_query_endpoint(request: GroundedQueryRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Answer a query using Gemini with Google Search grounding."""
    try:
        result = research_with_grounding(request.query, client=ai_client)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RAG ENDPOINTS (deeper exposure of RAGSystem)
# ============================================================================

class RagAddDocumentsRequest(BaseModel):
    """Add documents to the in-memory knowledge base."""
    documents: List[str]
    titles:  Optional[List[str]] = None
    sources: Optional[List[str]] = None


class RagRetrievalRequest(BaseModel):
    """Retrieve top-k documents for a query."""
    query: str
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class RagAnswerRequest(BaseModel):
    """Answer a question using RAG over the in-memory KB."""
    question: str
    top_k: int = Field(default=5, ge=1, le=20)


def _require_rag():
    if not research_platform or research_platform.rag is None:
        raise HTTPException(
            status_code=503,
            detail="RAG system unavailable. Check GEMINI_API_KEY.",
        )
    return research_platform.rag


@app.post("/rag/documents")
async def rag_add_documents(request: RagAddDocumentsRequest):
    """Chunk, embed, and add documents to the RAG knowledge base."""
    rag = _require_rag()
    try:
        added = rag.add_documents(request.documents, titles=request.titles, sources=request.sources)
        stats = rag.stats()
        return {"success": True, "added": added, "total": stats["document_count"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/documents")
async def rag_stats():
    """Return current RAG KB stats."""
    rag = _require_rag()
    return rag.stats()


@app.delete("/rag/documents")
async def rag_clear():
    """Clear the in-memory RAG KB."""
    rag = _require_rag()
    rag.documents = []
    rag.embeddings = []
    return {"success": True, "document_count": 0}


@app.post("/rag/pdf")
async def rag_upload_pdf(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    source: str = Form(default=""),
):
    """Upload a PDF, extract + chunk + embed its content into the RAG KB."""
    rag = _require_rag()
    try:
        pdf_bytes = await file.read()
        added = rag.add_pdf(pdf_bytes, title=title or file.filename or "", source=source)
        stats = rag.stats()
        return {"success": True, "added": added, "total": stats["document_count"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/retrieve")
async def rag_retrieve(request: RagRetrievalRequest):
    """Retrieve the top-k matching chunks with similarity scores."""
    rag = _require_rag()
    try:
        results = rag.query(request.query, top_k=request.top_k, min_score=request.min_score)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/answer")
async def rag_answer(request: RagAnswerRequest):
    """Answer a question with RAG-augmented generation, returning sources."""
    rag = _require_rag()
    try:
        result = rag.answer_question(request.question, top_k=request.top_k)
        return {"success": True, "answer": result["answer"], "sources": result["sources"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MUSIC GENERATION (Lyria 3)
# ============================================================================

class MusicImageInput(BaseModel):
    data: str = Field(..., description="Base64-encoded image bytes (no data: prefix)")
    mime_type: str = Field(default="image/jpeg", description="Image MIME type, e.g. image/jpeg or image/png")


class MusicGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Text description of the music to generate")
    model: str = Field(default="lyria-3-clip-preview", description="lyria-3-clip-preview (30s) or lyria-3-pro-preview (full song)")
    output_format: str = Field(default="mp3", description="mp3 (both models) or wav (Pro only)")
    images: Optional[List[MusicImageInput]] = Field(default=None, description="Up to 10 inspiration images (Pro model)")


@app.post("/music/generate")
async def music_generate_endpoint(request: MusicGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate music with Lyria 3. Returns base64-encoded audio and lyrics."""
    try:
        images = (
            [{"data": img.data, "mime_type": img.mime_type} for img in request.images]
            if request.images
            else None
        )
        result = generate_music(
            prompt=request.prompt,
            model=request.model,
            output_format=request.output_format,
            images=images,
            client=ai_client,
        )
        if result.get("audio_base64") is None:
            raise HTTPException(status_code=500, detail="No audio returned by the model")
        return {
            "success": True,
            "audio_base64": result["audio_base64"],
            "mime_type": result["mime_type"],
            "lyrics": result["lyrics"],
            "model_used": result["model_used"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MUSIC — LYRIA REALTIME (interactive streaming)
# ============================================================================

@app.get("/music/realtime/metadata")
async def music_realtime_metadata_endpoint():
    """Static metadata for the Lyria RealTime UI (scales, modes, config ranges)."""
    return {"success": True, **realtime_metadata()}


@app.websocket("/music/realtime/ws")
async def music_realtime_ws(websocket: WebSocket):
    """Bridge a browser WebSocket to a Lyria RealTime live-music session.

    Browser -> server (JSON text frames):
      {"type": "start",       "prompts": [...], "config": {...}}
      {"type": "set_prompts", "prompts": [{"text": str, "weight": float}, ...]}
      {"type": "set_config",  "config": {...}}
      {"type": "play"} | {"type": "pause"} | {"type": "stop"} | {"type": "reset"}

    Server -> browser:
      text frames  : {"type": "status"|"setup_complete"|"filtered"|"error", ...}
      binary frames: raw PCM audio (48 kHz, 16-bit, stereo, little-endian)
    """
    await websocket.accept()

    # BYOK: browsers can't set WS headers, so the key arrives as a query param.
    byok_key = (websocket.query_params.get("key") or "").strip()
    if not byok_key:
        await websocket.send_json({
            "type": "error",
            "message": "No Gemini API key provided. Add your key in Settings to use live music.",
        })
        await websocket.close()
        return

    client = get_realtime_client(api_key=byok_key)
    # Remember the last config so we can detect bpm/scale changes that need a
    # hard reset_context to take effect cleanly.
    last_config: dict = {}

    async def send_json(payload: dict):
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    try:
        async with client.aio.live.music.connect(model=LYRIA_REALTIME_MODEL) as session:
            await send_json({"type": "status", "state": "connecting"})

            async def pump_audio():
                """Forward audio chunks and notices from Gemini to the browser."""
                try:
                    async for message in session.receive():
                        if getattr(message, "setup_complete", None) is not None:
                            await send_json({"type": "setup_complete"})
                        filtered = getattr(message, "filtered_prompt", None)
                        if filtered is not None:
                            await send_json({
                                "type": "filtered",
                                "text": getattr(filtered, "text", None) or getattr(filtered, "filtered_reason", "") or str(filtered),
                            })
                        server_content = getattr(message, "server_content", None)
                        if server_content and getattr(server_content, "audio_chunks", None):
                            for chunk in server_content.audio_chunks:
                                if chunk.data:
                                    await websocket.send_bytes(chunk.data)
                except Exception as e:
                    await send_json({"type": "error", "message": f"stream ended: {e}"})

            audio_task = asyncio.create_task(pump_audio())

            try:
                while True:
                    raw = await websocket.receive_text()
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        await send_json({"type": "error", "message": "invalid JSON control message"})
                        continue

                    mtype = msg.get("type")

                    if mtype in ("start", "set_prompts"):
                        prompts = build_weighted_prompts(msg.get("prompts"))
                        if prompts:
                            await session.set_weighted_prompts(prompts=prompts)

                    if mtype in ("start", "set_config"):
                        incoming = msg.get("config") or {}
                        cfg = build_generation_config(incoming)
                        await session.set_music_generation_config(config=cfg)
                        # bpm/scale changes only take effect after a context reset.
                        needs_reset = any(
                            field in incoming
                            and incoming.get(field) is not None
                            and incoming.get(field) != last_config.get(field)
                            for field in HARD_TRANSITION_FIELDS
                        )
                        last_config.update({k: v for k, v in incoming.items() if v is not None})
                        if mtype == "set_config" and needs_reset:
                            await session.reset_context()

                    if mtype in ("start", "play"):
                        await session.play()
                        await send_json({"type": "status", "state": "playing"})
                    elif mtype == "pause":
                        await session.pause()
                        await send_json({"type": "status", "state": "paused"})
                    elif mtype == "stop":
                        await session.stop()
                        await send_json({"type": "status", "state": "stopped"})
                    elif mtype == "reset":
                        await session.reset_context()
                        await send_json({"type": "status", "state": "reset"})
            finally:
                audio_task.cancel()
                try:
                    await audio_task
                except (asyncio.CancelledError, Exception):
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await send_json({"type": "error", "message": str(e)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ============================================================================
# SPEECH GENERATION (Gemini TTS)
# ============================================================================

class SpeechGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Text to speak; may include style direction in natural language")
    voice: str = Field(default="Kore", description="Prebuilt voice name")
    model: str = Field(default="gemini-2.5-flash-preview-tts", description="A Gemini TTS model id")


class SpeakerVoice(BaseModel):
    speaker: str = Field(..., description="Speaker name (must match the prompt)")
    voice: str = Field(..., description="Prebuilt voice name for this speaker")


class MultiSpeakerSpeechRequest(BaseModel):
    prompt: str = Field(..., description="Conversation text that names each speaker")
    speakers: List[SpeakerVoice] = Field(..., description="1-2 speaker/voice mappings")
    model: str = Field(default="gemini-2.5-flash-preview-tts", description="A Gemini TTS model id")


@app.get("/speech/voices")
async def speech_voices_endpoint():
    """List available prebuilt voices and TTS models."""
    return {
        "success": True,
        "voices": [{"name": name, "description": desc} for name, desc in TTS_VOICES.items()],
        "models": TTS_MODELS,
    }


@app.post("/speech/generate")
async def speech_generate_endpoint(request: SpeechGenerateRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate single-speaker speech. Returns base64-encoded WAV audio."""
    try:
        result = generate_speech(
            prompt=request.prompt,
            voice=request.voice,
            model=request.model,
            client=ai_client,
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (ServerError, ClientError, APIError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/speech/generate-multi")
async def speech_generate_multi_endpoint(request: MultiSpeakerSpeechRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Generate multi-speaker (conversational) speech. Returns base64-encoded WAV audio."""
    try:
        result = generate_multi_speaker_speech(
            prompt=request.prompt,
            speakers=[s.model_dump() for s in request.speakers],
            model=request.model,
            client=ai_client,
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (ServerError, ClientError, APIError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GEMINI LIVE — real-time voice conversation (Live API over WebSocket)
# ============================================================================

LIVE_MODEL = "gemini-3.1-flash-live-preview"
DEFAULT_LIVE_VOICE = "Puck"


@app.get("/speech/live/metadata")
async def speech_live_metadata_endpoint():
    """Static metadata for the Gemini Live UI (model + selectable voices)."""
    return {
        "success": True,
        "model": LIVE_MODEL,
        "default_voice": DEFAULT_LIVE_VOICE,
        "voices": [{"name": name, "description": desc} for name, desc in TTS_VOICES.items()],
        "input_sample_rate": 16000,
        "output_sample_rate": 24000,
    }


@app.websocket("/speech/live/ws")
async def speech_live_ws(websocket: WebSocket):
    """Bridge a browser WebSocket to a Gemini Live voice session (BYOK).

    Query params: key (required), voice, system (optional system instruction).

    Browser -> server:
      binary frames : raw PCM audio (16 kHz, 16-bit, mono, little-endian) mic input
      text frames   : {"type": "text", "text": str}   — inject a typed message
                      {"type": "audio_end"}            — flush mic buffer (VAD)

    Server -> browser:
      binary frames : raw PCM audio (24 kHz, 16-bit, mono) model speech
      text frames   : {"type": "ready"} | {"type": "input_transcript", "text": ...}
                      {"type": "output_transcript", "text": ...} | {"type": "interrupted"}
                      {"type": "turn_complete"} | {"type": "error", "message": ...}
    """
    await websocket.accept()

    async def send_json(payload: dict):
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    # BYOK: browsers can't set WS headers, so the key arrives as a query param.
    byok_key = (websocket.query_params.get("key") or "").strip()
    if not byok_key:
        await send_json({
            "type": "error",
            "message": "No Gemini API key provided. Add your key in Settings to use Gemini Live.",
        })
        await websocket.close()
        return

    voice = (websocket.query_params.get("voice") or DEFAULT_LIVE_VOICE).strip()
    if voice not in TTS_VOICES:
        voice = DEFAULT_LIVE_VOICE
    system_instruction = (websocket.query_params.get("system") or "").strip()

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )
    if system_instruction:
        config.system_instruction = types.Content(parts=[types.Part(text=system_instruction)])

    client = genai.Client(api_key=byok_key)

    try:
        async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
            await send_json({"type": "ready", "voice": voice, "model": LIVE_MODEL})

            async def pump_from_gemini():
                """Forward model audio + transcripts from Gemini to the browser."""
                async for response in session.receive():
                    content = getattr(response, "server_content", None)
                    if content is None:
                        continue
                    # Model speech — send every audio part in the event.
                    model_turn = getattr(content, "model_turn", None)
                    if model_turn and getattr(model_turn, "parts", None):
                        for part in model_turn.parts:
                            inline = getattr(part, "inline_data", None)
                            if inline and inline.data:
                                try:
                                    await websocket.send_bytes(inline.data)
                                except Exception:
                                    return
                    in_tx = getattr(content, "input_transcription", None)
                    if in_tx and getattr(in_tx, "text", None):
                        await send_json({"type": "input_transcript", "text": in_tx.text})
                    out_tx = getattr(content, "output_transcription", None)
                    if out_tx and getattr(out_tx, "text", None):
                        await send_json({"type": "output_transcript", "text": out_tx.text})
                    if getattr(content, "interrupted", None) is True:
                        await send_json({"type": "interrupted"})
                    if getattr(content, "turn_complete", None) is True:
                        await send_json({"type": "turn_complete"})

            gemini_task = asyncio.create_task(pump_from_gemini())

            try:
                while True:
                    message = await websocket.receive()
                    if message.get("type") == "websocket.disconnect":
                        break
                    # Mic audio arrives as binary PCM 16 kHz frames.
                    if message.get("bytes") is not None:
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=message["bytes"],
                                mime_type="audio/pcm;rate=16000",
                            )
                        )
                    elif message.get("text") is not None:
                        try:
                            ctrl = json.loads(message["text"])
                        except json.JSONDecodeError:
                            continue
                        ctype = ctrl.get("type")
                        if ctype == "text" and ctrl.get("text"):
                            await session.send_realtime_input(text=ctrl["text"])
                        elif ctype == "audio_end":
                            await session.send_realtime_input(audio_stream_end=True)
            finally:
                gemini_task.cancel()
                try:
                    await gemini_task
                except (asyncio.CancelledError, Exception):
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await send_json({"type": "error", "message": str(e)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ============================================================================
# CSV DATA COMPLETION
# ============================================================================

class CsvAnalyzeRequest(BaseModel):
    """Analyze a CSV provided as raw string content."""
    csv_content: str


@app.post("/csv/analyze")
async def csv_analyze_endpoint(file: UploadFile = File(...), ai_client: genai.Client = Depends(get_gemini_client)):
    """Analyze an uploaded CSV for missing cells; generate completion questions."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".csv", delete=False
        ) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        try:
            raw = analyze_missing_data(tmp_path, ai_client)
            return {"success": True, "analysis": json.loads(raw)}
        finally:
            try:
                _os.unlink(tmp_path)
            except OSError:
                pass
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/csv/analyze-text")
async def csv_analyze_text_endpoint(request: CsvAnalyzeRequest, ai_client: genai.Client = Depends(get_gemini_client)):
    """Analyze CSV content sent as a raw string (alternative to file upload)."""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(request.csv_content)
            tmp_path = tmp.name
        try:
            raw = analyze_missing_data(tmp_path, ai_client)
            return {"success": True, "analysis": json.loads(raw)}
        finally:
            try:
                _os.unlink(tmp_path)
            except OSError:
                pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# STANDALONE ORCHESTRATORS
# ============================================================================

class OrchestratorTaskRequest(BaseModel):
    """Single-task request for the standalone AgenticOrchestrator."""
    task: str


class AssistantChatRequest(BaseModel):
    """Chat message for the persistent ResearchAssistant session."""
    message: str


class ScoutPlanBuildRequest(BaseModel):
    """Scout → Plan → Build workflow request."""
    user_request: str
    codebase_root: str = "."
    documentation_urls: Optional[List[str]] = None


def _require_orchestrator():
    if not research_platform or research_platform.orchestrator is None:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    return research_platform.orchestrator


def _require_assistant():
    if not research_platform or research_platform.assistant is None:
        raise HTTPException(status_code=503, detail="Research assistant not initialized")
    return research_platform.assistant


@app.post("/orchestrators/agentic")
async def orchestrator_execute(request: OrchestratorTaskRequest):
    """Run a one-shot task through the AgenticOrchestrator (tool-using Gemini agent)."""
    orch = _require_orchestrator()
    try:
        result = orch.execute_task(request.task)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/orchestrators/agentic/stream")
async def orchestrator_execute_stream(request: OrchestratorTaskRequest):
    """Stream a research response as the orchestrator generates it."""
    orch = _require_orchestrator()

    def event_stream():
        try:
            for chunk in orch.stream_research_response(request.task):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/orchestrators/assistant/chat")
async def assistant_chat(request: AssistantChatRequest):
    """Send a message to the persistent ResearchAssistant chat session."""
    assistant = _require_assistant()
    try:
        response = assistant.send_message(request.message)
        return {"success": True, "response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/orchestrators/assistant/history")
async def assistant_history():
    """Return the conversation history of the persistent assistant."""
    assistant = _require_assistant()
    try:
        return {"history": assistant.get_history()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/orchestrators/assistant/reset")
async def assistant_reset():
    """Start a fresh ResearchAssistant chat session."""
    global research_platform
    if not research_platform:
        raise HTTPException(status_code=503, detail="Research platform not initialized")
    try:
        from research_assistant import ResearchAssistant
        research_platform.assistant = ResearchAssistant(research_platform.client)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/orchestrators/scout-plan-build")
async def scout_plan_build_endpoint(request: ScoutPlanBuildRequest):
    """Run the full Scout → Plan → Build coding workflow."""
    if not scout_plan_build:
        raise HTTPException(
            status_code=503,
            detail="Scout/Plan/Build orchestrator unavailable (see startup logs).",
        )
    try:
        result = scout_plan_build.execute(
            user_request=request.user_request,
            codebase_root=request.codebase_root,
            documentation_urls=request.documentation_urls,
        )
        # Pydantic objects → dicts so they JSON-encode
        scout_output = result.get("scout_output")
        execution_plan = result.get("execution_plan")
        return {
            "success": True,
            "scout_output": (
                scout_output.model_dump() if hasattr(scout_output, "model_dump") else scout_output
            ),
            "execution_plan": (
                execution_plan.model_dump() if hasattr(execution_plan, "model_dump") else execution_plan
            ),
            "build_results": result.get("build_results"),
            "elapsed_time": result.get("elapsed_time"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)

