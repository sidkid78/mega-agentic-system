"""
╔══════════════════════════════════════════════════════════════════════════════╗
║          ULTIMATE BACKEND — COMPREHENSIVE CAPABILITY SHOWCASE v2            ║
║                                                                              ║
║  Covers every module in the backend/  directory:                             ║
║   1.  Text generation    — basic, streaming, chat, system instructions       ║
║   2.  Structured output  — Pydantic schema enforcement                       ║
║   3.  Thinking / reasoning  — high-budget chain-of-thought                  ║
║   4.  Code generation    — plain, structured, streaming, review, refactor    ║
║   5.  Code execution     — subprocess sandbox + auto-fix loop                ║
║   6.  Document generation — content, structured, HTML rendering              ║
║   7.  Image generation   — single, multi-image, reference, edit             ║
║   8.  RAG system         — embed, retrieve, grounded Q&A                    ║
║   9.  Research tools     — arXiv, PubMed, Wikipedia, Google grounding        ║
║  10.  Music generation   — Lyria 30-second clip                              ║
║  11.  Agentic orchestration — tool-calling agent loop                        ║
║  12.  Mega agentic system  — hierarchical + debate modes                     ║
║  13.  Embeddings          — cosine similarity                                ║
║  14.  Function calling    — multi-tool, multi-turn                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

Run:
    uv run python showcase2.py                    # all phases
    uv run python showcase2.py --phase 3          # single phase
    uv run python showcase2.py --list             # list phases
"""

import argparse
import base64
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError with rich)
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from google import genai
from google.genai import types
from pydantic import BaseModel
from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.progress import (BarColumn, Progress, SpinnerColumn,
                           TaskProgressColumn, TextColumn, TimeElapsedColumn)
from rich.rule import Rule
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text

# ── Local modules ──────────────────────────────────────────────────────────────
from code_generation import (execute_code, explain_code,
                              generate_and_execute, generate_code,
                              generate_code_structured, generate_code_streaming,
                              generate_tests, refactor_code, review_code,
                              validate_syntax)
from document_generation import (generate_document, generate_document_content,
                                  generate_document_structured,
                                  summarize_document)
from image_generation import (batch_generate_images, edit_image_with_gemini,
                               generate_image, generate_with_reference_image)
from main import (create_client, research_with_grounding, search_arxiv,
                  search_pubmed, search_wikipedia, generate_music)
from RAG_system import RAGSystem
from agentic_orchestration_system import AgenticOrchestrator
from mega_agentic_system import MegaAgenticSystem, Task, AgentMode, TaskComplexity

# ── Setup ──────────────────────────────────────────────────────────────────────
console = Console(highlight=True, legacy_windows=False)
OUTPUT = Path("showcase2_assets")
OUTPUT.mkdir(exist_ok=True)

DEFAULT_MODEL  = "gemini-3.5-flash"
FLASH_MODEL    = "gemini-3.5-flash"
COMPLEX_MODEL  = "gemini-3.1-pro-preview"

TOTAL_PHASES = 14

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def header(n: int, title: str) -> None:
    console.print()
    console.rule(f"[bold cyan]Phase {n}/{TOTAL_PHASES} — {title}[/bold cyan]")
    console.print()


def ok(msg: str) -> None:
    console.print(f"  [bold green]✓[/bold green]  {msg}")


def info(msg: str) -> None:
    console.print(f"  [dim blue]→[/dim blue]  {msg}")


def warn(msg: str) -> None:
    console.print(f"  [yellow]⚠[/yellow]  {msg}")


def err(msg: str) -> None:
    console.print(f"  [red]✗[/red]  {msg}")


def save(path: Path, data: Any, mode: str = "w") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        path.write_bytes(data)
    elif isinstance(data, str):
        path.write_text(data, encoding="utf-8")
    else:
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    ok(f"Saved → {path}")


def snippet(code: str, lang: str = "python", title: str = "") -> None:
    trimmed = code.strip()[:800]
    if len(code.strip()) > 800:
        trimmed += "\n... [truncated]"
    console.print(Panel(Syntax(trimmed, lang, theme="monokai", line_numbers=False),
                         title=title or lang, border_style="dim"))


def kv_table(data: dict, title: str = "") -> None:
    t = Table(title=title, box=box.SIMPLE_HEAD, show_header=True)
    t.add_column("Key", style="bold cyan", no_wrap=True)
    t.add_column("Value", style="white")
    for k, v in data.items():
        t.add_row(str(k), str(v)[:120])
    console.print(t)


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Basic text generation, streaming, chat, system instructions
# ─────────────────────────────────────────────────────────────────────────────

def phase_1_text_generation(client: genai.Client) -> None:
    header(1, "Text Generation — basic · streaming · chat · system instructions")

    # 1a. Basic single-turn
    info("Basic generate_content …")
    resp = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents="Name 3 emerging programming languages in 2025 and one killer feature each. Be concise.",
    )
    console.print(Panel(resp.text, title="Basic Response", border_style="blue"))
    save(OUTPUT / "phase1_basic.txt", resp.text)

    # 1b. System instruction
    info("System instruction …")
    resp2 = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents="Explain recursion.",
        config=types.GenerateContentConfig(
            system_instruction="You are an enthusiastic teacher who explains everything using pirate analogies.",
        ),
    )
    console.print(Panel(resp2.text[:600], title="Pirate Teacher", border_style="magenta"))

    # 1c. Streaming
    info("Streaming response …")
    console.print("  [dim]Streaming chunks:[/dim] ", end="")
    stream_result = []
    for chunk in client.models.generate_content_stream(
        model=DEFAULT_MODEL,
        contents="Write a haiku about artificial intelligence.",
        config=types.GenerateContentConfig(temperature=0.9),
    ):
        if chunk.text:
            stream_result.append(chunk.text)
            console.print(chunk.text, end="", highlight=False)
    console.print()
    save(OUTPUT / "phase1_haiku.txt", "".join(stream_result))

    # 1d. Multi-turn chat
    info("Multi-turn chat session …")
    chat = client.chats.create(model=DEFAULT_MODEL)
    r1 = chat.send_message(message="I'm building a system that converts voice to sheet music. Call it 'MelodyMind'.")
    r2 = chat.send_message(message="What would be the three hardest technical challenges for MelodyMind?")
    r3 = chat.send_message(message="Which of those challenges can current AI models best help with?")
    chat_log = f"Turn 1:\n{r1.text}\n\nTurn 2:\n{r2.text}\n\nTurn 3:\n{r3.text}"
    save(OUTPUT / "phase1_chat.txt", chat_log)
    console.print(Panel(r3.text[:500], title="Chat — Final Turn", border_style="green"))
    ok("Phase 1 complete — text generation, streaming, chat all verified.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — Structured output (Pydantic schema enforcement)
# ─────────────────────────────────────────────────────────────────────────────

class TechStartup(BaseModel):
    name: str
    tagline: str
    core_problem: str
    solution: str
    target_market: str
    revenue_model: str
    competitors: list[str]
    moat: str
    funding_stage: str
    estimated_valuation_usd: int


def phase_2_structured_output(client: genai.Client) -> None:
    header(2, "Structured Output — Pydantic schema enforcement")

    info("Generating startup profile with enforced JSON schema …")
    resp = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=(
            "Invent a realistic AI startup that solves a genuine problem in healthcare supply chains. "
            "Be specific and creative."
        ),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TechStartup,
        ),
    )
    startup: TechStartup = TechStartup.model_validate_json(resp.text)
    kv_table(startup.model_dump(), title=f"🚀 {startup.name}")
    save(OUTPUT / "phase2_startup.json", startup.model_dump())
    ok(f"Structured output validated — startup '{startup.name}' generated.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — Thinking / chain-of-thought reasoning
# ─────────────────────────────────────────────────────────────────────────────

def phase_3_thinking(client: genai.Client) -> None:
    header(3, "Thinking / Reasoning — chain-of-thought with thought traces")

    problem = (
        "A company runs 3 data centers: US (500 servers, $0.12/kWh), EU (300 servers, $0.18/kWh), "
        "APAC (200 servers, $0.10/kWh). Each server uses 400W on average. "
        "They want to shift 20% of US workload to minimize electricity cost. "
        "Where should they move it and what are the annual savings?"
    )

    info("Sending reasoning problem with thinking enabled …")
    resp = client.models.generate_content(
        model=FLASH_MODEL,
        contents=problem,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH)
        ),
    )

    thoughts, answer = [], []
    for part in resp.candidates[0].content.parts:
        if getattr(part, "thought", False):
            thoughts.append(part.text or "")
        else:
            answer.append(part.text or "")

    thought_text = "\n".join(thoughts)
    answer_text  = "\n".join(answer)

    if thought_text:
        console.print(Panel(thought_text[:600] + (" …" if len(thought_text) > 600 else ""),
                             title="🧠 Internal Thought Trace", border_style="dim yellow"))
    console.print(Panel(answer_text, title="📐 Final Answer", border_style="green"))
    save(OUTPUT / "phase3_thinking.txt", f"THOUGHT:\n{thought_text}\n\nANSWER:\n{answer_text}")
    ok("Thinking phase complete — thought trace captured.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Code generation (plain, structured, streaming)
# ─────────────────────────────────────────────────────────────────────────────

def phase_4_code_generation(client: genai.Client) -> None:
    header(4, "Code Generation — plain · structured output · streaming")

    # 4a. Plain generation
    info("Plain code generation (Python) …")
    plain = generate_code(
        client,
        "Create a thread-safe LRU cache class with a configurable max size, get/set/delete methods, "
        "and statistics (hits, misses, evictions).",
        language="python",
        include_tests=False,
        include_comments=True,
    )
    snippet(plain, "python", "Generated: LRU Cache")
    save(OUTPUT / "phase4_lru_cache.py", plain)

    # 4b. Structured output
    info("Structured code generation (JSON schema) …")
    structured = generate_code_structured(
        client,
        "Build a Python context manager that measures and logs function execution time with configurable precision.",
    )
    kv_table({
        "Language": structured.language,
        "Complexity": structured.complexity,
        "Dependencies": ", ".join(structured.dependencies) or "none",
        "Explanation": structured.explanation[:200],
    }, title="Structured Metadata")
    save(OUTPUT / "phase4_timer_ctx.py", structured.code)

    # 4c. Streaming
    info("Streaming code generation …")
    console.print("  [dim]Streaming JS code:[/dim]")
    js_chunks = []
    for chunk in generate_code_streaming(
        client,
        "Write a JavaScript async function that retries a fetch call up to 3 times with exponential back-off.",
    ):
        js_chunks.append(chunk)
    js_code = "".join(js_chunks)
    snippet(js_code, "javascript", "Streaming Output: Retry Fetch")
    save(OUTPUT / "phase4_retry_fetch.js", js_code)
    ok("Phase 4 complete — 3 code generation modes demonstrated.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 5 — Code review, refactor, explain, tests, convert, validate syntax
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_CODE = """\
def process(data):
    result = []
    for i in range(len(data)):
        if data[i] > 0:
            result.append(data[i] * 2)
    return result
"""


def phase_5_code_operations(client: genai.Client) -> None:
    header(5, "Code Operations — review · explain · tests · refactor · syntax")

    # 5a. Syntax validation
    info("Syntax validation …")
    good = validate_syntax(SAMPLE_CODE)
    bad  = validate_syntax("def foo(\n    x = \n")
    kv_table({"Valid code": str(good), "Invalid code": str(bad)}, "Syntax Validation")

    # 5b. Review
    info("Code review …")
    review = review_code(client, SAMPLE_CODE)
    t = Table(title=f"Code Review — Rating {review.rating}/10", box=box.SIMPLE)
    t.add_column("Category", style="bold")
    t.add_column("Findings")
    t.add_row("Issues",        "\n".join(f"• {i}" for i in review.issues)       or "—")
    t.add_row("Suggestions",   "\n".join(f"• {s}" for s in review.suggestions)  or "—")
    t.add_row("Security",      "\n".join(f"• {s}" for s in review.security_concerns) or "—")
    t.add_row("Performance",   "\n".join(f"• {s}" for s in review.performance_notes) or "—")
    console.print(t)

    # 5c. Explain
    info("Code explanation …")
    explanation = explain_code(client, SAMPLE_CODE, detail_level="detailed")
    console.print(Panel(explanation[:500], title="Explanation", border_style="blue"))

    # 5d. Refactor
    info("Refactoring …")
    refactored = refactor_code(
        client, SAMPLE_CODE,
        ["add type hints", "use list comprehension", "add docstring", "add error handling"],
    )
    snippet(refactored, "python", "Refactored Code")
    save(OUTPUT / "phase5_refactored.py", refactored)

    # 5e. Generate tests
    info("Generating unit tests …")
    tests = generate_tests(client, SAMPLE_CODE)
    test_code = "\n\n".join(tc.test_code for tc in tests)
    snippet(test_code[:600], "python", f"Generated {len(tests)} Tests")
    save(OUTPUT / "phase5_tests.py", test_code)

    ok(f"Phase 5 complete — review/explain/refactor/tests all done ({len(tests)} tests generated).")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 6 — Code execution + auto-fix loop
# ─────────────────────────────────────────────────────────────────────────────

def phase_6_code_execution(client: genai.Client) -> None:
    header(6, "Code Execution — sandbox · auto-fix loop · generate-and-execute")

    # 6a. Direct execution
    info("Direct subprocess sandbox execution …")
    result = execute_code(
        "import math\n"
        "primes = [n for n in range(2, 100) if all(n % i != 0 for i in range(2, int(math.sqrt(n))+1))]\n"
        "print(f'Primes under 100: {primes}')\n"
        "print(f'Count: {len(primes)}')"
    )
    kv_table({
        "stdout":  result["stdout"].strip()[:200],
        "returncode": result["returncode"],
        "exec_time_s": f"{result['execution_time']:.3f}",
        "timed_out": result["timed_out"],
    }, "Execution Result")

    # 6b. generate_and_execute with auto-fix
    info("generate_and_execute with auto-fix loop …")
    gen_exec = generate_and_execute(
        client,
        "Print a formatted table of the first 8 Fibonacci numbers showing index, value, and ratio to previous.",
        auto_fix=True,
        max_retries=3,
    )
    console.print(Panel(
        gen_exec["execution_result"]["stdout"].strip() or gen_exec["execution_result"]["stderr"].strip(),
        title=f"Executed (attempts={gen_exec['attempts']}, rc={gen_exec['execution_result']['returncode']})",
        border_style="green",
    ))
    save(OUTPUT / "phase6_generated.py", gen_exec["code"])
    ok("Phase 6 complete — sandbox execution + auto-fix verified.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 7 — Document generation (content, structured, HTML)
# ─────────────────────────────────────────────────────────────────────────────

def phase_7_documents(client: genai.Client) -> None:
    header(7, "Document Generation — content · structured · HTML export · summary")

    # 7a. Plain content
    info("Generating medium-length technical document …")
    content = generate_document_content(
        client,
        topic="Federated Learning: Privacy-Preserving AI at Scale",
        length="medium",
        style="technical",
        target_audience="software engineers",
    )
    save(OUTPUT / "phase7_federated_learning.md", content)
    console.print(Panel(content[:400] + " …", title="Document Preview", border_style="blue"))

    # 7b. Structured (Pydantic)
    info("Structured document generation …")
    structured_doc = generate_document_structured(
        client,
        "The Economics of Quantum Computing: Cost, ROI, and Timeline to Commercial Viability",
    )
    kv_table({
        "Title":     structured_doc.title,
        "Sections":  str(len(structured_doc.sections)),
        "Keywords":  ", ".join(structured_doc.keywords[:5]),
        "Word count": structured_doc.word_count,
        "Summary":   structured_doc.summary[:200],
    }, "Structured Document Metadata")

    # 7c. HTML export
    info("Rendering to HTML …")
    full_md = f"# {structured_doc.title}\n\n{structured_doc.summary}\n\n"
    for sec in structured_doc.sections:
        full_md += f"## {sec.heading}\n{sec.content}\n\n"
    html_path = generate_document(
        content=full_md,
        title=structured_doc.title,
        output_dir=str(OUTPUT),
    )
    ok(f"HTML rendered at: {html_path}")

    # 7d. Summary
    info("Summarising a long text …")
    long_text = content  # reuse the federated learning article
    summary = summarize_document(client, long_text, length="brief")
    save(OUTPUT / "phase7_summary.txt", summary)
    console.print(Panel(summary[:400], title="Auto-Summary", border_style="green"))
    ok("Phase 7 complete — content, structured, HTML, summary all done.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 8 — Image generation (single, batch, reference-guided, editing)
# ─────────────────────────────────────────────────────────────────────────────

def phase_8_images(client: genai.Client) -> None:
    header(8, "Image Generation — single · batch · reference-guided · editing")

    # 8a. Single image
    info("Generating single landscape image (16:9) …")
    imgs = generate_image(
        client,
        "A bioluminescent deep-sea research submarine exploring a glowing coral reef at midnight. "
        "Photorealistic, cinematic lighting, ultra-detailed.",
        aspect_ratio="16:9",
        number_of_images=1,
    )
    if imgs:
        imgs[0].save(OUTPUT / "phase8_submarine.jpg")
        ok(f"Saved phase8_submarine.jpg  ({imgs[0].size[0]}×{imgs[0].size[1]})")
    else:
        warn("No images returned for single generation.")

    # 8b. Batch generation
    info("Batch generating 3 concept images …")
    prompts = [
        "Minimalist logo for an AI startup called 'Nexus' — clean, geometric, dark background",
        "Isometric illustration of a smart city at dusk with autonomous vehicles",
        "Abstract visualization of neural network activations, vibrant neon on black",
    ]
    batch = batch_generate_images(client, prompts)
    for i, (pimgs, label) in enumerate(zip(batch, ["logo", "city", "neural"])):
        if pimgs:
            pimgs[0].save(OUTPUT / f"phase8_batch_{label}.jpg")
            ok(f"Saved phase8_batch_{label}.jpg")
        else:
            warn(f"No image returned for batch prompt {i}")

    # 8c. Reference-guided generation (if base image exists)
    if imgs:
        info("Reference-guided generation (same style, different scene) …")
        try:
            ref_imgs = generate_with_reference_image(
                client,
                "A team of scientists celebrating a breakthrough inside the submarine lab",
                reference_image=imgs[0],
                aspect_ratio="16:9",
                number_of_images=1,
            )
            if ref_imgs:
                ref_imgs[0].save(OUTPUT / "phase8_reference_guided.jpg")
                ok("Saved phase8_reference_guided.jpg")
        except Exception as e:
            warn(f"Reference-guided generation skipped: {e}")

    # 8d. Image editing
    if imgs:
        info("Editing image — adding 'dramatic storm clouds above' …")
        try:
            edited = edit_image_with_gemini(
                client, imgs[0],
                "Add dramatic storm clouds with lightning above the ocean surface.",
            )
            if edited:
                edited[0].save(OUTPUT / "phase8_edited.jpg")
                ok("Saved phase8_edited.jpg")
        except Exception as e:
            warn(f"Image editing skipped: {e}")

    ok("Phase 8 complete — image generation pipeline done.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 9 — RAG: embed, retrieve, grounded Q&A
# ─────────────────────────────────────────────────────────────────────────────

KNOWLEDGE_CORPUS = [
    (
        "Gemini 3 Flash is Google's most efficient multimodal model as of 2025. "
        "It supports text, image, audio, and video input. It has a 1M token context window, "
        "native tool use, and JSON mode. Pricing is $0.075 per 1M input tokens.",
        "Gemini 3 Flash Overview",
        "google.com/gemini",
    ),
    (
        "The Gemini embedding models (gemini-embedding-001 and gemini-embedding-2) produce "
        "dense vector representations for semantic search. gemini-embedding-2 is multimodal, "
        "handles images, PDFs, and text up to 8192 tokens, and is the recommended model for RAG.",
        "Gemini Embedding Models",
        "google.com/embeddings",
    ),
    (
        "Lyria 3 is Google's music generation model. lyria-3-clip-preview produces 30-second "
        "MP3 clips. lyria-3-pro-preview generates full songs (~2 minutes) and supports WAV output. "
        "Both models accept a text prompt describing genre, mood, instruments, and tempo.",
        "Lyria 3 Music Generation",
        "google.com/lyria",
    ),
    (
        "The Gemini API supports function calling (tool use) where the model can call Python "
        "functions, web APIs, or code interpreters as part of a reasoning chain. Multi-turn "
        "function calling allows the model to plan, execute, observe results, and iterate.",
        "Gemini Function Calling",
        "google.com/function-calling",
    ),
    (
        "Imagen 4 is Google's image generation model with state-of-the-art photorealism. "
        "It supports 1:1, 16:9, 4:3, 3:4, and 9:16 aspect ratios, negative prompts, and "
        "person generation controls. Gemini Nano Banana models also support image editing in chat.",
        "Imagen 4 Image Generation",
        "google.com/imagen",
    ),
]


def phase_9_rag(client: genai.Client) -> None:
    header(9, "RAG System — embed · retrieve · grounded Q&A")

    info("Initialising RAGSystem with gemini-embedding-2 …")
    rag = RAGSystem(client=client)

    info(f"Adding {len(KNOWLEDGE_CORPUS)} knowledge documents …")
    texts   = [t for t, _, _ in KNOWLEDGE_CORPUS]
    titles  = [t for _, t, _ in KNOWLEDGE_CORPUS]
    sources = [s for _, _, s in KNOWLEDGE_CORPUS]
    n_chunks = rag.add_documents(texts, titles=titles, sources=sources)
    kv_table(rag.stats(), "RAG Stats After Ingestion")

    questions = [
        "Which embedding model should I use for RAG with images?",
        "How long is a Lyria 3 clip?",
        "What is the context window size of Gemini 3 Flash?",
    ]

    results_log = {}
    for q in questions:
        info(f"Q: {q}")
        result = rag.answer_question(q, top_k=3)
        console.print(Panel(result["answer"][:400], title=f"Answer", border_style="cyan"))
        src_table = Table(box=box.SIMPLE, show_header=True)
        src_table.add_column("Score")
        src_table.add_column("Title")
        src_table.add_column("Snippet")
        for s in result["sources"]:
            src_table.add_row(str(s["score"]), s["title"], s["snippet"][:80])
        console.print(src_table)
        results_log[q] = result

    save(OUTPUT / "phase9_rag_results.json", results_log)
    ok(f"Phase 9 complete — {n_chunks} chunks embedded, {len(questions)} questions answered.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 10 — Research tools: arXiv, PubMed, Wikipedia, Google Grounding
# ─────────────────────────────────────────────────────────────────────────────

def phase_10_research_tools(client: genai.Client) -> None:
    header(10, "Research Tools — arXiv · PubMed · Wikipedia · Google Grounding")

    # 10a. arXiv
    info("Searching arXiv for 'retrieval augmented generation' …")
    arxiv_raw = search_arxiv("retrieval augmented generation", max_results=3)
    arxiv_papers = json.loads(arxiv_raw)
    t = Table(title="arXiv Results", box=box.SIMPLE)
    t.add_column("Title", style="bold")
    t.add_column("Authors")
    t.add_column("Published")
    for p in arxiv_papers:
        t.add_row(p["title"][:60], ", ".join(p["authors"][:2]), p["published"])
    console.print(t)
    save(OUTPUT / "phase10_arxiv.json", arxiv_papers)

    # 10b. PubMed
    info("Searching PubMed for 'large language models clinical decision' …")
    try:
        pubmed_raw = search_pubmed("large language models clinical decision", max_results=2)
        pubmed_papers = json.loads(pubmed_raw)
        if pubmed_papers:
            t2 = Table(title="PubMed Results", box=box.SIMPLE)
            t2.add_column("Title", style="bold")
            t2.add_column("Journal")
            t2.add_column("Year")
            for p in pubmed_papers:
                t2.add_row(p["title"][:60], p["journal"][:30], p["year"])
            console.print(t2)
            save(OUTPUT / "phase10_pubmed.json", pubmed_papers)
        else:
            warn("No PubMed results returned.")
    except Exception as e:
        warn(f"PubMed search skipped: {e}")

    # 10c. Wikipedia
    info("Fetching Wikipedia page for 'Transformer (machine learning model)' …")
    wiki_raw = search_wikipedia("Transformer machine learning model")
    wiki = json.loads(wiki_raw)
    console.print(Panel(wiki.get("summary", wiki.get("error", ""))[:500],
                         title=f"Wikipedia: {wiki.get('title', 'N/A')}", border_style="green"))
    save(OUTPUT / "phase10_wikipedia.json", wiki)

    # 10d. Google Search Grounding
    info("Google Search Grounding — real-time web facts …")
    grounding = research_with_grounding("What is the current state of quantum computing in 2025?")
    console.print(Panel(grounding["answer"][:500], title="Grounded Answer", border_style="yellow"))
    if grounding["sources"]:
        st = Table(title="Sources", box=box.SIMPLE)
        st.add_column("Title")
        st.add_column("URL")
        for s in grounding["sources"][:4]:
            st.add_row(s["title"][:40], s["url"][:60])
        console.print(st)
    save(OUTPUT / "phase10_grounding.json", grounding)
    ok("Phase 10 complete — all 4 research tools exercised.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 11 — Music generation (Lyria 3)
# ─────────────────────────────────────────────────────────────────────────────

def phase_11_music(client: genai.Client) -> None:
    header(11, "Music Generation — Lyria 3 clip preview")

    music_prompt = (
        "Upbeat electronic lo-fi study music with soft piano, gentle synth pads, "
        "and a slow hip-hop drum groove. 85 BPM, calm and focused atmosphere."
    )
    info(f"Prompt: {music_prompt}")
    info("Calling generate_music (lyria-3-clip-preview) — 30-second MP3 …")

    try:
        result = generate_music(
            prompt=music_prompt,
            model="lyria-3-clip-preview",
            output_format="mp3",
        )
        if result.get("audio_base64"):
            audio_bytes = base64.b64decode(result["audio_base64"])
            ext = "mp3" if "mpeg" in result.get("mime_type", "") else "wav"
            audio_path = OUTPUT / f"phase11_music.{ext}"
            audio_path.write_bytes(audio_bytes)
            ok(f"Saved {audio_path}  ({len(audio_bytes):,} bytes, MIME={result['mime_type']})")
            if result.get("lyrics"):
                console.print(Panel(result["lyrics"][:400], title="Model Text Output", border_style="magenta"))
        else:
            warn("generate_music returned no audio data.")
            console.print(f"  raw result keys: {list(result.keys())}")
    except Exception as e:
        warn(f"Music generation error: {e}")
        traceback.print_exc()

    ok("Phase 11 complete — Lyria 3 music generation demonstrated.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 12 — Embeddings + cosine similarity
# ─────────────────────────────────────────────────────────────────────────────

def phase_12_embeddings(client: genai.Client) -> None:
    header(12, "Embeddings — embed_content · cosine similarity matrix")
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    sentences = [
        "Neural networks learn representations from data.",
        "Deep learning uses layered architectures for feature extraction.",
        "The stock market closed higher on strong earnings.",
        "Investors reacted positively to the quarterly report.",
        "Transformers revolutionized natural language processing.",
    ]

    info(f"Embedding {len(sentences)} sentences with gemini-embedding-2 …")
    embeddings = []
    for s in sentences:
        resp = client.models.embed_content(
            model="gemini-embedding-2",
            contents=f"task: search result | query: {s}",
        )
        embeddings.append(resp.embeddings[0].values)

    matrix = cosine_similarity(embeddings)

    t = Table(title="Cosine Similarity Matrix", box=box.SIMPLE_HEAD)
    labels = [f"S{i+1}" for i in range(len(sentences))]
    t.add_column("", style="bold")
    for lab in labels:
        t.add_column(lab, justify="right")
    for i, row in enumerate(matrix):
        t.add_row(labels[i], *[f"{v:.3f}" for v in row])
    console.print(t)

    console.print()
    for i, s in enumerate(sentences):
        console.print(f"  [dim]S{i+1}:[/dim] {s}")

    # Most similar pair
    np_matrix = np.array(matrix)
    np.fill_diagonal(np_matrix, 0)
    ai, aj = divmod(np_matrix.argmax(), len(sentences))
    ok(f"Most similar pair: S{ai+1} ↔ S{aj+1}  (score={matrix[ai][aj]:.4f})")
    save(OUTPUT / "phase12_similarity.json", {
        "sentences": sentences,
        "matrix": [[round(v, 4) for v in row] for row in matrix.tolist()],
    })
    ok("Phase 12 complete — embeddings + similarity matrix computed.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 13 — Agentic Orchestration (tool-calling AgenticOrchestrator)
# ─────────────────────────────────────────────────────────────────────────────

def phase_13_orchestration(client: genai.Client) -> None:
    header(13, "Agentic Orchestration — multi-tool auto-selection")

    info("Initialising AgenticOrchestrator …")
    orch = AgenticOrchestrator(client)

    task = (
        "Research the latest advances in diffusion model image generation (use arXiv), "
        "then write a concise 3-paragraph technical summary for a software engineering audience."
    )
    info(f"Task: {task}")
    result = orch.execute_task(task)
    console.print(Panel(result[:700], title="Orchestrated Result", border_style="cyan"))
    save(OUTPUT / "phase13_orchestration.txt", result)
    ok("Phase 13 complete — AgenticOrchestrator multi-tool task done.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 14 — MegaAgenticSystem — fully transparent, live agent output
# ─────────────────────────────────────────────────────────────────────────────

_AGENT_COLORS = {
    "Analyst":    "bright_cyan",
    "Architect":  "bright_blue",
    "Critic":     "bright_red",
    "Creative":   "bright_magenta",
    "Executor":   "bright_green",
    "Mediator":   "bright_yellow",
    "Researcher": "cyan",
    "Strategist": "blue",
    "Teacher":    "green",
    "Validator":  "yellow",
    # generic roles used inside patterns
    "Planner":    "bright_cyan",
    "Synthesizer":"bright_green",
    "Proposer":   "bright_blue",
    "Opposer":    "bright_red",
    "Questioner": "bright_yellow",
}

_step_counter = [0]  # mutable cell so nested fn can increment it


def _make_verbose_call_model(original_call_model, tag_prefix: str = ""):
    """
    Wrap MegaAgenticSystem._call_model so every prompt+response is printed.
    We infer the 'agent role' from the system-instruction string.
    """
    def verbose_call_model(self_inner, prompt: str, system: str = "", model: str = "gemini-2.5-flash") -> str:
        _step_counter[0] += 1
        step = _step_counter[0]

        # Guess role from system instruction
        role = "Agent"
        for candidate in list(_AGENT_COLORS.keys()):
            if candidate.lower() in system.lower():
                role = candidate
                break
        color = _AGENT_COLORS.get(role, "white")

        # Print the prompt this agent is receiving
        console.print()
        console.print(f"  [{color}]▶ Step {step} — {tag_prefix}{role}[/{color}]"
                      f"  [dim](system: {system[:80].strip()!r})[/dim]")
        console.print(Panel(
            prompt[:600] + (" …" if len(prompt) > 600 else ""),
            title=f"[{color}]PROMPT → {role}[/{color}]",
            border_style=color,
            padding=(0, 1),
        ))

        # Actual call
        response = original_call_model(self_inner, prompt, system, model)

        # Print the response
        console.print(Panel(
            response[:800] + (" …" if len(response) > 800 else ""),
            title=f"[{color}]RESPONSE ← {role}[/{color}]",
            border_style=color,
            padding=(0, 1),
        ))
        return response

    return verbose_call_model


def _explain_agent_assignment(agents, mode_name: str, complexity_name: str) -> None:
    """Explain why these specific agents were picked and which ones actually do work."""
    t = Table(title=f"Agents Assigned — {mode_name} mode (complexity={complexity_name})",
              box=box.ROUNDED)
    t.add_column("#", style="bold dim", justify="right")
    t.add_column("Agent", style="bold")
    t.add_column("Role")
    t.add_column("Specialization")
    t.add_column("Used by this mode?")

    mode_usage = {
        "HIERARCHICAL": {0: "Planner (Phase 1)", 1: "Executor (Phase 2)"},
        "DEBATE":       {0: "Proposer (Phase 1)", 1: "Opposer (Phase 2)"},
        "SWARM":        "all",
        "REFLECTIVE":   {0: "Primary agent (all iterations)"},
        "SOCRATIC":     {0: "Questioner", 1: "Answerer"},
        "RED_BLUE":     {0: "Blue (initial)", 1: "Red (attack)", 2: "Blue (harden)"},
        "NEGOTIATE":    "all (each gets a priority)",
    }
    usage = mode_usage.get(mode_name, "?")

    for i, a in enumerate(agents):
        if usage == "all" or (isinstance(usage, str) and usage.startswith("all")):
            used = f"✅  {usage}"
        elif isinstance(usage, dict):
            used = f"✅  {usage[i]}" if i in usage else "⬜  assigned but not called"
        else:
            used = "?"
        t.add_row(str(i), a.name, a.role, a.specialization, used)

    console.print(t)
    console.print(
        f"\n  [dim]Note: The system always selects agents[0..n] from a fixed pool of 10. "
        f"For COMPLEX tasks n=5, MODERATE n=3, SIMPLE n=2. "
        f"Each mode only calls the agents it needs internally — the rest are 'on standby'.[/dim]\n"
    )


def phase_14_mega_system(client: genai.Client) -> None:
    header(14, "MegaAgenticSystem — transparent live agent output")

    # ── What is the MegaAgenticSystem? ────────────────────────────────────────
    console.print(Panel(
        "[bold]MegaAgenticSystem[/bold] is a multi-pattern AI orchestrator.\n"
        "It has a pool of 10 specialist agents (Analyst, Architect, Critic, Creative, "
        "Executor, Mediator, Researcher, Strategist, Teacher, Validator).\n\n"
        "For each task it:\n"
        "  1. Selects a mode (hierarchical / debate / swarm / reflective / etc.)\n"
        "  2. Picks a subset of agents based on complexity\n"
        "  3. Runs the mode — each mode calls _call_model() once per phase\n"
        "  4. Scores the output (0-10) and records history\n\n"
        "[dim]Below every prompt and response from every agent will be printed live.[/dim]",
        title="How it works", border_style="dim blue",
    ))

    mega = MegaAgenticSystem(name="ShowcaseOrchestrator2")

    # ── Monkey-patch _call_model for transparency ─────────────────────────────
    import types as _types
    original_call_model = mega._call_model.__func__  # unbound
    mega._call_model = _types.MethodType(
        _make_verbose_call_model(original_call_model), mega
    )

    full_log: dict = {}

    # ─── RUN 1: HIERARCHICAL ─────────────────────────────────────────────────
    console.rule("[bold blue]RUN 1 — HIERARCHICAL mode[/bold blue]")
    console.print(
        "  [dim]Hierarchical: Agent[0] (Analyst) creates a plan → "
        "Agent[1] (Architect) executes it → quality scored.[/dim]\n"
    )
    task1 = Task(
        id="neurosync_arch",
        description=(
            "Design the architecture for 'NeuroSync', a real-time AI-powered EEG data analysis "
            "platform. Identify 5 core microservices, their responsibilities, and key data flows."
        ),
        complexity=TaskComplexity.COMPLEX,
        preferred_mode=AgentMode.HIERARCHICAL,
    )
    agents1 = mega._select_agents(AgentMode.HIERARCHICAL, task1.complexity)
    _explain_agent_assignment(agents1, "HIERARCHICAL", task1.complexity.value)
    _step_counter[0] = 0
    result1 = mega.execute(task1)
    console.print()
    console.print(Panel(
        f"[bold]Final output[/bold] (quality={result1.quality_score:.1f}/10, "
        f"agents={result1.agents_involved}, time={result1.execution_time:.1f}s)\n\n"
        + str(result1.output)[:1000],
        title="✅ HIERARCHICAL — Final Result", border_style="bright_blue",
    ))
    save(OUTPUT / "phase14_hierarchical.md",
         f"# Hierarchical — NeuroSync Architecture\n\n{result1.output}")
    full_log["hierarchical"] = {
        "quality": result1.quality_score,
        "output": str(result1.output)[:2000],
    }

    # ─── RUN 2: DEBATE ───────────────────────────────────────────────────────
    console.rule("[bold magenta]RUN 2 — DEBATE mode[/bold magenta]")
    console.print(
        "  [dim]Debate: Agent[0] proposes → Agent[1] opposes and critiques → "
        "synthesis merges the best of both.[/dim]\n"
    )
    task2 = Task(
        id="monolith_vs_micro",
        description=(
            "Debate: Should NeuroSync be built as a monolith or microservices for v1? "
            "Team: 5 engineers. Deadline: 6 months. Constraint: medical regulatory compliance."
        ),
        complexity=TaskComplexity.MODERATE,
        preferred_mode=AgentMode.DEBATE,
    )
    agents2 = mega._select_agents(AgentMode.DEBATE, task2.complexity)
    _explain_agent_assignment(agents2, "DEBATE", task2.complexity.value)
    _step_counter[0] = 0
    result2 = mega.execute(task2)
    console.print()
    console.print(Panel(
        f"[bold]Final output[/bold] (quality={result2.quality_score:.1f}/10, "
        f"iterations={result2.iterations})\n\n"
        + str(result2.output)[:1000],
        title="✅ DEBATE — Final Synthesis", border_style="bright_magenta",
    ))
    save(OUTPUT / "phase14_debate.md",
         f"# Debate — Monolith vs Microservices\n\n{result2.output}")
    full_log["debate"] = {
        "quality": result2.quality_score,
        "output": str(result2.output)[:2000],
    }

    # ─── RUN 3: REFLECTIVE ───────────────────────────────────────────────────
    console.rule("[bold green]RUN 3 — REFLECTIVE mode[/bold green]")
    console.print(
        "  [dim]Reflective: One agent drafts → critiques itself → improves → repeats "
        "until quality threshold is reached.[/dim]\n"
    )
    task3 = Task(
        id="api_design",
        description=(
            "Write a concise REST API design spec for NeuroSync's data-ingestion microservice. "
            "Include: endpoints, request/response schemas, authentication, error codes."
        ),
        complexity=TaskComplexity.MODERATE,
        preferred_mode=AgentMode.REFLECTIVE,
        quality_threshold=8.5,
        max_iterations=2,
    )
    agents3 = mega._select_agents(AgentMode.REFLECTIVE, task3.complexity)
    _explain_agent_assignment(agents3, "REFLECTIVE", task3.complexity.value)
    _step_counter[0] = 0
    result3 = mega.execute(task3)
    console.print()
    console.print(Panel(
        f"[bold]Final output[/bold] (quality={result3.quality_score:.1f}/10, "
        f"iterations={result3.iterations})\n\n"
        + str(result3.output)[:1000],
        title="✅ REFLECTIVE — Final (Self-Improved) Output", border_style="bright_green",
    ))
    save(OUTPUT / "phase14_reflective.md",
         f"# Reflective — API Design Spec\n\n{result3.output}")
    full_log["reflective"] = {
        "quality": result3.quality_score,
        "iterations": result3.iterations,
        "output": str(result3.output)[:2000],
    }

    # ─── Summary ─────────────────────────────────────────────────────────────
    console.rule("[bold]Summary[/bold]")
    t = Table(title="All Runs", box=box.ROUNDED)
    t.add_column("Mode", style="bold")
    t.add_column("Task")
    t.add_column("Quality", justify="right")
    t.add_column("Iterations", justify="right")
    t.add_column("Time (s)", justify="right")
    for r, label, task in [
        (result1, "HIERARCHICAL", task1),
        (result2, "DEBATE",       task2),
        (result3, "REFLECTIVE",   task3),
    ]:
        t.add_row(
            label,
            task.description[:60],
            f"{r.quality_score:.1f}/10",
            str(r.iterations),
            f"{r.execution_time:.1f}",
        )
    console.print(t)

    save(OUTPUT / "phase14_all_results.json", full_log)
    ok("Phase 14 complete — 3 modes run with full agent transparency.")


# ─────────────────────────────────────────────────────────────────────────────
# Final index
# ─────────────────────────────────────────────────────────────────────────────

def write_index(phases_run: list[int], timings: dict[int, float], errors: dict[int, str]) -> None:
    lines = ["# Showcase2 — Run Report\n"]
    lines.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append(f"Phases requested: {phases_run}\n\n")
    lines.append("## Phase Summary\n")
    lines.append("| Phase | Name | Time (s) | Status |\n")
    lines.append("|-------|------|----------|--------|\n")

    phase_names = {
        1:  "Text Generation",
        2:  "Structured Output",
        3:  "Thinking / Reasoning",
        4:  "Code Generation",
        5:  "Code Operations",
        6:  "Code Execution",
        7:  "Document Generation",
        8:  "Image Generation",
        9:  "RAG System",
        10: "Research Tools",
        11: "Music Generation",
        12: "Embeddings",
        13: "Agentic Orchestration",
        14: "Mega Agentic System",
    }

    for n in phases_run:
        t_str = f"{timings.get(n, 0):.1f}"
        status = "❌ " + errors[n][:40] if n in errors else "✅"
        lines.append(f"| {n} | {phase_names.get(n, '?')} | {t_str} | {status} |\n")

    lines.append("\n## Assets\n")
    for f in sorted(OUTPUT.iterdir()):
        if f.is_file() and f.name != "index.md":
            size = f.stat().st_size
            lines.append(f"- [{f.name}](./{f.name})  ({size:,} bytes)\n")

    (OUTPUT / "index.md").write_text("".join(lines), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

PHASE_FNS = {
    1:  phase_1_text_generation,
    2:  phase_2_structured_output,
    3:  phase_3_thinking,
    4:  phase_4_code_generation,
    5:  phase_5_code_operations,
    6:  phase_6_code_execution,
    7:  phase_7_documents,
    8:  phase_8_images,
    9:  phase_9_rag,
    10: phase_10_research_tools,
    11: phase_11_music,
    12: phase_12_embeddings,
    13: phase_13_orchestration,
    14: phase_14_mega_system,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ultimate Backend Showcase v2")
    parser.add_argument("--phase", type=int, default=None,
                        help="Run a single phase (1-14). Omit to run all.")
    parser.add_argument("--list", action="store_true",
                        help="List all phases and exit.")
    args = parser.parse_args()

    if args.list:
        t = Table(title="Available Phases", box=box.ROUNDED)
        t.add_column("#", style="bold cyan", justify="right")
        t.add_column("Name")
        for n, fn in PHASE_FNS.items():
            t.add_row(str(n), fn.__name__.replace("phase_", "").replace("_", " ").title())
        console.print(t)
        return

    phases_to_run = [args.phase] if args.phase else list(PHASE_FNS.keys())

    console.print(Panel.fit(
        "[bold magenta]ULTIMATE BACKEND — SHOWCASE v2[/bold magenta]\n"
        f"[cyan]Phases: {phases_to_run}[/cyan]\n"
        f"[dim]Output directory: {OUTPUT.absolute()}[/dim]",
        title="Welcome",
        border_style="magenta",
    ))

    client = genai.Client()
    timings: dict[int, float] = {}
    errors:  dict[int, str]  = {}

    try:
        for n in phases_to_run:
            fn = PHASE_FNS.get(n)
            if fn is None:
                warn(f"Unknown phase {n}, skipping.")
                continue
            t0 = time.time()
            try:
                fn(client)
                timings[n] = time.time() - t0
                console.print(f"  [dim]⏱  {timings[n]:.1f}s[/dim]")
            except Exception as exc:
                timings[n] = time.time() - t0
                errors[n] = str(exc)
                err(f"Phase {n} failed: {exc}")
                traceback.print_exc()
                console.print()

    finally:
        try:
            client.close()
        except Exception:
            pass

    write_index(phases_to_run, timings, errors)

    # ── Final summary table ──────────────────────────────────────────────────
    console.print()
    console.rule("[bold green]Run Complete[/bold green]")
    t = Table(title="Phase Results", box=box.ROUNDED)
    t.add_column("#", justify="right", style="bold")
    t.add_column("Phase")
    t.add_column("Time", justify="right")
    t.add_column("Status")
    for n in phases_to_run:
        status = "[red]FAILED[/red]" if n in errors else "[green]OK[/green]"
        t.add_row(str(n), PHASE_FNS[n].__name__, f"{timings.get(n, 0):.1f}s", status)
    console.print(t)
    console.print(f"\n[bold]Assets saved to:[/bold] [cyan]{OUTPUT.absolute()}[/cyan]")
    console.print(f"[bold]Index:[/bold]  [cyan]{(OUTPUT / 'index.md').absolute()}[/cyan]\n")


if __name__ == "__main__":
    main()
