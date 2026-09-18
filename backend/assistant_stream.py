"""
Streaming research assistant
============================
Token-streaming counterpart to ResearchAssistant, built on the Interactions
API.

Why not chat.send_message_stream: with automatic function calling it executes
the tool and then yields zero characters of text - the tool runs, the answer
never arrives. Verified against gemini-3.5-flash: non-streaming returned 1851
characters for the same prompt, streaming returned 0.

So the tool loop is driven explicitly here, which is what the Interactions
API expects:

  turn 1  stream with tools -> accumulate function_call name + arguments,
          interaction ends with status requires_action
  turn 2  stream again with previous_interaction_id and a function_result
          block -> the model's answer arrives as text deltas

previous_interaction_id also carries the conversation, so multi-turn needs no
local history object.

Events yielded are plain dicts so the API server can serialise them as SSE
without this module knowing anything about HTTP.
"""

import json
import logging
from typing import Any, Callable, Dict, Iterator, List, Optional

from main import (
    DEFAULT_MODEL,
    search_arxiv,
    search_pubmed,
    search_wikipedia,
    research_with_grounding as _research_with_grounding,
)

logger = logging.getLogger("MegaAgenticSystem")

# How many function-call rounds to allow before giving up. Each round is a
# full model turn, so this bounds both cost and wall time. Observed: a broad
# research question legitimately used four rounds of searching before it had
# enough to answer, so a limit of 4 cut it off just short.
MAX_TOOL_ROUNDS = 8

SYSTEM_INSTRUCTION = (
    "You are a research assistant with access to academic papers, web search "
    "and knowledge bases. Help users with research tasks, code generation and "
    "document creation. Use your tools when the question needs current or "
    "citable information."
)

# The Interactions API takes JSON schemas, not Python callables - there is no
# automatic schema generation on this path.
TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_arxiv",
        "description": "Search arXiv for academic papers.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search terms."},
                "max_results": {"type": "integer", "description": "How many papers (default 5)."},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "search_pubmed",
        "description": "Search PubMed for medical and life-sciences papers.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search terms."},
                "max_results": {"type": "integer", "description": "How many articles (default 5)."},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "search_wikipedia",
        "description": "Fetch a Wikipedia article's content.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Article title or topic."}},
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "research_with_grounding",
        "description": "Answer using live Google Search grounding, with sources.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "What to look up."}},
            "required": ["query"],
        },
    },
]


class StreamingResearchAssistant:
    """One conversation. Hold an instance per user/session."""

    def __init__(self, client):
        self.client = client
        # The API keeps the history; this is our handle on it.
        self.previous_interaction_id: Optional[str] = None
        self._tools: Dict[str, Callable[..., Any]] = {
            "search_arxiv": search_arxiv,
            "search_pubmed": search_pubmed,
            "search_wikipedia": search_wikipedia,
            # Bind the caller's client so grounding uses their key rather than
            # falling back to the environment.
            "research_with_grounding": lambda query: _research_with_grounding(query, client=client),
        }

    def reset(self) -> None:
        """Start a fresh conversation."""
        self.previous_interaction_id = None

    # -- tool execution ---------------------------------------------------

    def _run_tool(self, name: str, raw_args: str) -> str:
        fn = self._tools.get(name)
        if fn is None:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            args = json.loads(raw_args) if raw_args.strip() else {}
        except json.JSONDecodeError as exc:
            return json.dumps({"error": f"Could not parse arguments: {exc}"})
        try:
            result = fn(**args)
        except TypeError as exc:
            return json.dumps({"error": f"Bad arguments for {name}: {exc}"})
        except Exception as exc:
            logger.warning(f"Assistant tool {name} failed: {exc}")
            return json.dumps({"error": f"{name} failed: {exc}"})
        return result if isinstance(result, str) else json.dumps(result, default=str)

    # -- streaming --------------------------------------------------------

    def stream_message(self, message: str) -> Iterator[Dict[str, Any]]:
        """Yield events for one user message.

        Event shapes:
          {"type": "tool_call",   "name", "arguments"}
          {"type": "tool_result", "name", "chars"}
          {"type": "text",        "delta"}
          {"type": "done",        "text"}
          {"type": "error",       "message"}
        """
        pending_input: Any = message
        answer_parts: List[str] = []

        for round_index in range(MAX_TOOL_ROUNDS):
            calls: List[Dict[str, str]] = []
            try:
                for event in self._stream_turn(pending_input):
                    if event["type"] == "text":
                        answer_parts.append(event["delta"])
                        yield event          # forwarded the moment it arrives
                    elif event["type"] == "call":
                        calls.append(event)
            except Exception as exc:
                logger.error(f"Assistant stream failed: {exc}", exc_info=True)
                yield {"type": "error", "message": str(exc)}
                return

            if not calls:
                yield {"type": "done", "text": "".join(answer_parts)}
                return

            # The model asked for tools: run them and feed the results back.
            results = []
            for call in calls:
                yield {"type": "tool_call", "name": call["name"], "arguments": call["arguments"]}
                output = self._run_tool(call["name"], call["arguments"])
                yield {"type": "tool_result", "name": call["name"], "chars": len(output)}
                results.append({
                    "type": "function_result",
                    "name": call["name"],
                    "call_id": call["id"],
                    "result": {"content": [{"type": "text", "text": output}]},
                })
            pending_input = results

        yield {
            "type": "done",
            "text": "".join(answer_parts) or
                    f"Stopped after {MAX_TOOL_ROUNDS} tool rounds without a final answer.",
        }

    def _stream_turn(self, turn_input: Any) -> Iterator[Dict[str, Any]]:
        """Run one streamed interaction, yielding text and call events live.

        A generator, not a list: buffering the turn made every token of a
        4000-character answer arrive in one burst at the end, which is the
        thing streaming exists to avoid. The caller forwards text immediately
        and collects the calls as they pass.
        """
        kwargs: Dict[str, Any] = {
            "model": DEFAULT_MODEL,
            "input": turn_input,
            "tools": TOOL_SCHEMAS,
            "stream": True,
        }
        if self.previous_interaction_id:
            kwargs["previous_interaction_id"] = self.previous_interaction_id
        else:
            kwargs["system_instruction"] = SYSTEM_INSTRUCTION

        current: Dict[str, str] = {}

        for event in self.client.interactions.create(**kwargs):
            etype = getattr(event, "event_type", None)

            if etype == "interaction.created":
                interaction = getattr(event, "interaction", None)
                if interaction is not None and getattr(interaction, "id", None):
                    self.previous_interaction_id = interaction.id

            elif etype == "step.start":
                step = getattr(event, "step", None)
                if step is not None and getattr(step, "type", None) == "function_call":
                    current = {
                        "type": "call",
                        "id": getattr(step, "id", "") or "",
                        "name": getattr(step, "name", "") or "",
                        "arguments": "",
                    }

            elif etype == "step.delta":
                delta = getattr(event, "delta", None)
                dtype = getattr(delta, "type", None) if delta is not None else None
                if dtype == "text":
                    text = getattr(delta, "text", "") or ""
                    if text:
                        yield {"type": "text", "delta": text}
                elif dtype == "arguments_delta" and current:
                    # Arguments arrive as partial JSON and must be concatenated.
                    current["arguments"] += getattr(delta, "arguments", "") or ""

            elif etype in ("step.stop", "step.done"):
                # The stream emits step.stop; step.done is accepted too so a
                # future rename does not silently merge two calls' arguments
                # into one accumulator.
                if current:
                    yield current
                    current = {}

        if current:  # stream ended without an explicit step.stop
            yield current
