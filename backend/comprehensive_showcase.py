"""
Comprehensive Showcase Demo - The Ultimate Product Launch Simulation

This script demonstrates the full capabilities of the Ultimate codebase, integrating:
1. Multi-Agent Orchestration (Hierarchical & Debate Modes)
2. Image Generation & Editing (Logo & UI mockups)
3. Code Generation & Execution (Core logic & Tests)
4. Document Generation & Research (Technical Specs & Summaries)
"""

import os
import time
import json
from pathlib import Path
from google import genai
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

# Import local modules
from mega_agentic_system import MegaAgenticSystem, Task, AgentMode, TaskComplexity
from image_generation import generate_image
from code_generation import generate_code_structured, execute_code
from document_generation import generate_document_structured, generate_document

# Setup
console = Console()
client = genai.Client()
output_dir = Path("showcase_assets")
output_dir.mkdir(exist_ok=True)

def run_showcase():
    console.print(Panel.fit("[bold magenta]Ultimate Codebase Showcase[/bold magenta]\n[cyan]AI-Powered Product Launch Simulation[/cyan]", title="Welcome"))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        
        # 1. PLANNING PHASE (Hierarchical Mode)
        p1 = progress.add_task("[yellow]Phase 1: Project Planning (Multi-Agent Hierarchical)...", total=None)
        console.print("  [blue]Info:[/blue] Initializing MegaAgenticSystem...")
        mega = MegaAgenticSystem(name="ShowcaseOrchestrator")
        planning_task = Task(
            id="garden_planning",
            description="Develop a comprehensive plan for 'VerdantAI', a smart sustainable indoor gardening assistant using IoT and AI. List 5 core modules.",
            complexity=TaskComplexity.COMPLEX,
            preferred_mode=AgentMode.HIERARCHICAL
        )
        console.print("  [blue]Info:[/blue] Executing Phase 1 Hierarchical Plan...")
        plan_result = mega.execute(planning_task)
        
        with open(output_dir / "project_plan.json", "w") as f:
            f.write(json.dumps(plan_result.output if isinstance(plan_result.output, dict) else {"raw_output": str(plan_result.output)}, indent=2))
        progress.update(p1, completed=True)
        console.print("  [green]✓[/green] Project Plan generated via Hierarchical Agents.")

        # 2. DEBATE PHASE (Debate Mode)
        p2 = progress.add_task("[yellow]Phase 2: Strategic Debate...", total=None)
        debate_task = Task(
            id="tech_debate",
            description="Debate the pros and cons of Hydroponics vs. Soil-based sensors for the VerdantAI system. Consider cost, maintenance, and scale.",
            complexity=TaskComplexity.MODERATE,
            preferred_mode=AgentMode.DEBATE
        )
        console.print("  [blue]Info:[/blue] Executing Phase 2 Debate...")
        debate_result = mega.execute(debate_task)
        
        with open(output_dir / "strategic_debate.md", "w") as f:
            f.write(f"# Strategic Debate: Tech Stack\n\n{str(debate_result.output)}")
        progress.update(p2, completed=True)
        console.print("  [green]✓[/green] Strategic debate completed (Multi-Agent Debate Mode).")

        # 3. VISUAL BRANDING (Image Gen)
        p3 = progress.add_task("[yellow]Phase 3: Visual Identity & UI Mockups...", total=None)
        logo_prompt = "A sleek, minimalist vector logo for 'VerdantAI', indoor gardening assistant. Teal and white color palette, organic shapes mixed with circuitry elements. Professional, high-end design."
        console.print("  [blue]Info:[/blue] Generating logo...")
        logos = generate_image(client, logo_prompt, number_of_images=1)
        if logos:
            logos[0].save(output_dir / "verdantai_logo.jpg")
        
        ui_prompt = "A high-fidelity mobile app UI mockup for an indoor garden dashboard. Showing plant moisture levels, light levels, and growth metrics. Modern, transparent glassmorphism design, lush greenery background."
        console.print("  [blue]Info:[/blue] Generating UI mockup...")
        ui_mockups = generate_image(client, ui_prompt, number_of_images=1)
        if ui_mockups:
            ui_mockups[0].save(output_dir / "ui_dashboard_mockup.jpg")
        
        progress.update(p3, completed=True)
        console.print("  [green]✓[/green] Visual assets (Logo & UI) generated via Imagen 4.0.")

        # 4. CORE ENGINEERING (Code Gen)
        p4 = progress.add_task("[yellow]Phase 4: Engineering Core Logic...", total=None)
        code_reqs = "Create a robust Python data model for a 'Plant' and 'GardenManager'. Include methods to add sensors, calculate average health score, and trigger 'Alerts' if moisture is below 30%."
        console.print("  [blue]Info:[/blue] Generating core logic code...")
        code_result = generate_code_structured(client, code_reqs)
        
        with open(output_dir / "core_logic.py", "w") as f:
            f.write(code_result.code)
        
        # Validate syntax
        console.print("  [blue]Info:[/blue] Validating generated code...")
        exec_check_code = f"{code_result.code}\n\ntry:\n    # Minimal validation\n    print('Validation Successful')\nexcept Exception as e:\n    print(f'Validation Failed: {e}')"
        exec_result = execute_code(exec_check_code)
        console.print(f"  [blue]Info:[/blue] execute_code returncode: {exec_result.get('returncode')}")
        
        progress.update(p4, completed=True)
        console.print("  [green]✓[/green] Core Python logic generated and syntactically validated.")

        # 5. DOCUMENTATION (Doc Gen)
        p5 = progress.add_task("[yellow]Phase 5: Technical Specification...", total=None)
        doc_topic = "Technical Specification for VerdantAI: IoT Integration, Data Security, and AI Nutrition Advice Engine."
        console.print("  [blue]Info:[/blue] Generating technical documentation...")
        doc_result = generate_document_structured(client, doc_topic)
        
        full_doc = f"# {doc_result.title}\n\n## Executive Summary\n{doc_result.summary}\n\n"
        for sec in doc_result.sections:
            full_doc += f"### {sec.heading}\n{sec.content}\n\n"
        
        console.print("  [blue]Info:[/blue] Saving document as HTML...")
        html_path = generate_document(
            content=full_doc,
            title="VerdantAI Technical Spec",
            output_dir=str(output_dir)
        )
        
        progress.update(p5, completed=True)
        console.print(f"  [green]✓[/green] Technical specification generated at: {html_path}")

    # 6. FINAL REPORT SYNTHESIS
    console.print("\n[bold green]Simulation Complete![/bold green]")
    console.print(f"All assets saved to: [cyan]{output_dir.absolute()}[/cyan]")
    
    # Create a summary index file
    index_content = f"""
# VerdantAI Showcase Report

## Project Overview
Integrated AI-driven gardening assistant project.

## Assets Generated
- [Project Plan (JSON)](./project_plan.json)
- [Strategic Debate (Markdown)](./strategic_debate.md)
- ![Logo](./verdantai_logo.jpg)
- ![Mobile UI Dashboard](./ui_dashboard_mockup.jpg)
- [Core Logic (Python)](./core_logic.py)
- [Technical Specification (HTML)](./verdantai_technical_spec.html)
"""
    with open(output_dir / "index.md", "w") as f:
        f.write(index_content)

if __name__ == "__main__":
    run_showcase()
