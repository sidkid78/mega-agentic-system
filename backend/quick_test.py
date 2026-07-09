#!/usr/bin/env python3
"""
⚡ Quick Test - See AgentToolsManager in Action!

Ultra-simplified demo that runs in ~30 seconds and shows:
- YOUR AgentToolsManager being used
- Tool execution logging
- Multi-agent coordination

Perfect for quick testing!
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Windows consoles default to cp1252, which can't encode emoji like the
# section headers below (e.g. U+26A1). Force UTF-8 so prints don't crash.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from rich.console import Console
from rich.panel import Panel

from google import genai
from google.genai import types

# Import YOUR AgentToolsManager (lives at the ultimate repo root)
sys.path.insert(0, r'C:\Users\sidki\source\repos\ultimate')
from agent_tools_integration import AgentToolsManager

console = Console()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    console.print("[red]❌ GEMINI_API_KEY not set[/red]")
    exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)


def quick_test():
    """Run a quick test to see AgentToolsManager in action."""
    
    console.print(Panel(
        "[cyan]Testing AgentToolsManager integration[/cyan]\n"
        "[dim]This will create a simple Python script using YOUR tools[/dim]",
        title="⚡ Quick Test",
        border_style="green"
    ))
    
    # Setup workspace
    workspace = Path("./quick_test_workspace")
    workspace.mkdir(exist_ok=True)
    
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = workspace / f"test_{session_id}"
    session_dir.mkdir(exist_ok=True)
    
    # Initialize YOUR AgentToolsManager
    console.print("\n[bold]Step 1:[/bold] Initializing AgentToolsManager...")
    tools_manager = AgentToolsManager(workspace_root=str(session_dir))
    console.print("[green]✓[/green] Manager initialized")
    
    # Ask agent to build something simple
    console.print("\n[bold]Step 2:[/bold] Asking agent to build a simple script...")
    
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents="""Create a simple Python calculator script.

AVAILABLE TOOLS:
- create_directory: Make directories
- create_file: Write files

Create:
1. A directory called "calculator"
2. A file "calculator/calc.py" with add, subtract, multiply, divide functions
3. A file "calculator/README.md" with usage instructions

Use the tools to create these files.""",
        config=types.GenerateContentConfig(
            system_instruction="You are a developer who uses tools to create files.",
            temperature=0.1,
            max_output_tokens=4096,
            tools=tools_manager.get_tool_declarations()
            # Note: response_mime_type cannot be used with function calling (tools)
        )
    )
    
    console.print("[green]✓[/green] Agent completed")
    
    # Show results
    console.print("\n[bold]Step 3:[/bold] Checking results...")
    
    created_files = list(session_dir.rglob("*"))
    file_count = len([f for f in created_files if f.is_file()])
    
    console.print(f"[green]✓[/green] Files created: {file_count}")
    
    # Show tool execution log (THE KEY FEATURE!)
    tool_log = tools_manager.tool_execution_log
    
    console.print(f"\n[bold cyan]Tool Execution Log:[/bold cyan] {len(tool_log)} operations")
    
    for i, entry in enumerate(tool_log, 1):
        tool = entry['tool']
        success = entry['result'].get('success', False)
        status = "✓" if success else "✗"
        
        console.print(f"  {i}. {status} {tool}")
        
        # Show arguments for interesting operations
        if tool in ['create_file', 'create_directory']:
            args = entry['arguments']
            if 'path' in args:
                console.print(f"     [dim]→ {args['path']}[/dim]")
    
    # Save log
    log_file = session_dir / "tool_log.json"
    with open(log_file, 'w') as f:
        json.dump(tool_log, f, indent=2)
    
    console.print(f"\n[bold]Full log saved:[/bold] {log_file}")
    
    # Show created files
    console.print("\n[bold cyan]Created Files:[/bold cyan]")
    for f in sorted([f for f in created_files if f.is_file()]):
        rel_path = f.relative_to(session_dir)
        console.print(f"   {rel_path}")
    
    # Show one file's content
    calc_file = session_dir / "calculator" / "calc.py"
    if calc_file.exists():
        console.print(f"\n[bold]Sample: calc.py[/bold]")
        content = calc_file.read_text()
        lines = content.split('\n')[:15]  # First 15 lines
        total_lines = len(content.split('\n'))
        for line in lines:
            console.print(f"  [dim]{line}[/dim]")
        if total_lines > 15:
            console.print(f"  [dim]... ({total_lines - 15} more lines)[/dim]")
    
    console.print(f"\n[bold green]✨ Test completed![/bold green]")
    console.print(f"\n[bold]Workspace:[/bold] {session_dir}")
    console.print(f"[bold]Log file:[/bold] {log_file}")
    
    console.print("\n[cyan]Key Takeaway:[/cyan] Every tool call is logged automatically!")
    console.print("[dim]This is YOUR AgentToolsManager in action.[/dim]")


if __name__ == "__main__":
    console.print("""
[bold cyan]⚡ Quick Test - AgentToolsManager Integration[/bold cyan]

This demonstrates:
• Using YOUR AgentToolsManager
• Automatic tool execution logging
• File creation with agents

[bold]Running test...[/bold]
""")
    
    try:
        quick_test()
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠ Interrupted[/yellow]")
    except Exception as e:
        console.print(f"\n[red]❌ Error: {e}[/red]")
        import traceback
        console.print(f"[dim]{traceback.format_exc()}[/dim]")