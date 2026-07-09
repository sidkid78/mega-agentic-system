# ============================================================================
# CODEBASE CLI TOOL
# ============================================================================

import subprocess
import json
from pathlib import Path
from typing import Optional, List

class CodebaseCLI:
    """Command-line interface for codebase operations.
    
    This CLI provides a unified interface for agents to interact with the codebase.
    It's more context-efficient than passing individual functions.
    """
    
    def __init__(self, root_dir: str = "."):
        self.root_dir = Path(root_dir)
        self.readme_path = Path("AGENT_TOOLS_README.md")
        self._generate_readme()
    
    def _generate_readme(self):
        """Generate the README that agents will read to learn the CLI."""
        readme_content = """# Codebase CLI Tools - Agent Guide

This CLI provides tools for exploring and analyzing codebases.

## Available Commands

All commands are accessed via: `python codebase_cli.py <command> [options]`

### 1. search
**When to use**: When you need to find files containing specific code patterns or text.
```bash
python codebase_cli.py search --query "function handleSubmit" --extensions .ts,.tsx
python codebase_cli.py search --query "TODO" --path src/
```

**Options**:
- `--query`: Search term or pattern (required)
- `--extensions`: Comma-separated file extensions (optional)
- `--path`: Directory to search in (optional, default: .)
- `--context`: Lines of context around matches (optional, default: 2)

**Returns**: JSON with file paths, line numbers, and matched content.

---

### 2. list
**When to use**: When you need to see the directory structure.
```bash
python codebase_cli.py list --path src/
python codebase_cli.py list --recursive --path components/
```

**Options**:
- `--path`: Directory to list (optional, default: .)
- `--recursive`: Include subdirectories (optional)
- `--extensions`: Filter by file extensions (optional)

**Returns**: JSON with directory tree structure.

---

### 3. read
**When to use**: When you need to examine specific file contents.
```bash
python codebase_cli.py read --file src/App.tsx
python codebase_cli.py read --file utils/helpers.ts --lines 10-50
```

**Options**:
- `--file`: File path (required)
- `--lines`: Line range in format START-END (optional)

**Returns**: File contents as text.

---

### 4. analyze
**When to use**: When you need to understand code structure and dependencies.
```bash
python codebase_cli.py analyze --file src/components/Header.tsx
python codebase_cli.py analyze --path src/ --type dependencies
```

**Options**:
- `--file`: Single file to analyze (optional)
- `--path`: Directory to analyze (optional)
- `--type`: Analysis type: 'structure', 'dependencies', 'complexity' (optional)

**Returns**: JSON with code metrics and analysis.

---

### 5. git
**When to use**: When you need Git history or diff information.
```bash
python codebase_cli.py git --command log --file src/App.tsx --limit 5
python codebase_cli.py git --command diff --since "2 days ago"
```

**Options**:
- `--command`: Git command: 'log', 'diff', 'blame' (required)
- `--file`: File to check (optional)
- `--since`: Time range for logs (optional)
- `--limit`: Number of commits to show (optional, default: 10)

**Returns**: JSON with git information.

---

## Usage Pattern for Agents

1. **Read this README first** to understand available tools
2. **Select the right command** based on your task
3. **Execute via bash_tool** with proper options
4. **Parse JSON output** for structured data

## Examples by Task Type

**Finding dark mode related files:**
```bash
python codebase_cli.py search --query "theme" --extensions .css,.tsx
python codebase_cli.py search --query "dark.*mode" --path src/styles/
```

**Understanding component structure:**
```bash
python codebase_cli.py list --path src/components/ --recursive
python codebase_cli.py analyze --path src/components/ --type structure
```

**Reading specific implementations:**
```bash
python codebase_cli.py read --file src/utils/themeToggle.ts
```
"""
        
        with open(self.readme_path, 'w') as f:
            f.write(readme_content)
    
    def execute(self, command: str, **kwargs) -> dict:
        """Execute a CLI command and return structured output."""
        handlers = {
            'search': self._search,
            'list': self._list,
            'read': self._read,
            'analyze': self._analyze,
            'git': self._git,
        }
        
        if command not in handlers:
            return {"error": f"Unknown command: {command}"}
        
        return handlers[command](**kwargs)
    
    def _search(
        self, 
        query: str, 
        extensions: str = None,
        path: str = ".",
        context: int = 2
    ) -> dict:
        """Search codebase for patterns."""
        # Use ripgrep if available, otherwise fallback to grep
        try:
            cmd = ['rg', query, str(self.root_dir / path), '--json']
            if extensions:
                for ext in extensions.split(','):
                    cmd.extend(['--glob', f'*{ext}'])
            
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
            # Parse ripgrep JSON output
            matches = []
            for line in result.stdout.split('\n'):
                if line:
                    try:
                        data = json.loads(line)
                        if data.get('type') == 'match':
                            matches.append(data)
                    except:
                        pass
            
            return {
                "matches": matches,
                "total": len(matches),
                "query": query
            }
        except FileNotFoundError:
            # Fallback to simple file search
            return {"error": "ripgrep not available, install with: cargo install ripgrep"}
    
    def _list(self, path: str = ".", recursive: bool = False, extensions: str = None) -> dict:
        """List directory contents."""
        target = self.root_dir / path
        files = []
        
        if recursive:
            for p in target.rglob("*"):
                if p.is_file():
                    if not extensions or p.suffix in extensions.split(','):
                        files.append(str(p.relative_to(self.root_dir)))
        else:
            for p in target.iterdir():
                if p.is_file():
                    if not extensions or p.suffix in extensions.split(','):
                        files.append(str(p.relative_to(self.root_dir)))
        
        return {
            "path": str(path),
            "files": sorted(files),
            "count": len(files)
        }
    
    def _read(self, file: str, lines: str = None) -> dict:
        """Read file contents."""
        file_path = self.root_dir / file
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                if lines:
                    start, end = map(int, lines.split('-'))
                    all_lines = f.readlines()
                    content = ''.join(all_lines[start-1:end])
                else:
                    content = f.read()
            
            return {
                "file": str(file),
                "content": content,
                "lines": len(content.split('\n'))
            }
        except Exception as e:
            return {"error": str(e)}
    
    def _analyze(self, file: str = None, path: str = None, type: str = "structure") -> dict:
        """Analyze code structure."""
        # This would use AST parsing, treesitter, etc.
        # For demo, returning mock structure
        return {
            "type": type,
            "target": file or path,
            "analysis": {
                "functions": 5,
                "classes": 2,
                "complexity": "medium"
            }
        }
    
    def _git(self, command: str, file: str = None, since: str = None, limit: int = 10) -> dict:
        """Git operations."""
        try:
            if command == 'log':
                cmd = ['git', 'log', f'--max-count={limit}', '--format=%H|%an|%ae|%ad|%s']
                if file:
                    cmd.append(file)
                
                result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=self.root_dir)
                commits = []
                for line in result.stdout.split('\n'):
                    if line:
                        hash, author, email, date, message = line.split('|', 4)
                        commits.append({
                            "hash": hash[:8],
                            "author": author,
                            "date": date,
                            "message": message
                        })
                
                return {"commits": commits}
            
            elif command == 'diff':
                cmd = ['git', 'diff']
                if since:
                    cmd.extend(['--since', since])
                if file:
                    cmd.append(file)
                
                result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=self.root_dir)
                return {"diff": result.stdout}
            
            return {"error": f"Unknown git command: {command}"}
            
        except Exception as e:
            return {"error": str(e)}


# ============================================================================
# CLI-ENHANCED SCOUT AGENT
# ============================================================================

class CLIScoutAgent:
    """Scout agent that uses CLI tools instead of direct function calls."""
    
    def __init__(self, client: genai.Client, model: str = "gemini-3.5-flash"):
        self.client = client
        self.model = model
        self.cli = CodebaseCLI()
        
    def scout(self, user_request: str, codebase_root: str = ".") -> ScoutOutput:
        """Execute scout phase using CLI approach."""
        print(f"\n{'='*80}")
        print("SCOUT PHASE (CLI Mode): Finding relevant files...")
        print(f"{'='*80}\n")
        
        # Read the CLI README
        with open(self.cli.readme_path, 'r') as f:
            cli_guide = f.read()
        
        system_instruction = """You are a codebase scout agent using CLI tools.

IMPORTANT: You have access to a codebase CLI tool. Read the README provided to understand 
available commands.

Your approach:
1. Read the CLI README to understand available tools
2. Use bash_tool to execute CLI commands
3. Analyze results to identify relevant files
4. Return structured findings

Execute commands like:
  python codebase_cli.py search --query "theme" --extensions .css,.tsx
  python codebase_cli.py list --path src/ --recursive
  python codebase_cli.py read --file src/App.tsx --lines 1-50"""

        # Create a bash tool wrapper for the CLI
        def execute_codebase_cli(command: str) -> str:
            """Execute a codebase CLI command.
            
            Args:
                command: Full CLI command (e.g., 'search --query "theme"')
            
            Returns:
                JSON output from the CLI
            """
            parts = command.split()
            cmd = parts[0]
            
            # Parse arguments
            kwargs = {}
            i = 1
            while i < len(parts):
                if parts[i].startswith('--'):
                    key = parts[i][2:]
                    value = parts[i+1] if i+1 < len(parts) else None
                    kwargs[key] = value
                    i += 2
                else:
                    i += 1
            
            result = self.cli.execute(cmd, **kwargs)
            return json.dumps(result, indent=2)
        
        response = self.client.models.generate_content(
            model=self.model,
            contents=f"""User Request: {user_request}

CLI Tools README:
{cli_guide}

Use the CLI tools to find all files relevant to this request.""",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[execute_codebase_cli],  # ✅ Much lighter than passing all individual functions!
                response_mime_type="application/json",
                response_schema=ScoutOutput,
                temperature=0.3,
            )
        )
        
        scout_output = ScoutOutput.model_validate_json(response.text)
        
        # Save to file
        with open("relevant_files.md", "w") as f:
            f.write("# Relevant Files (Found via CLI)\n\n")
            f.write(f"**Task:** {user_request}\n\n")
            f.write(f"**Summary:** {scout_output.summary}\n\n")
            f.write("## Files to Modify\n\n")
            
            for file_ref in scout_output.relevant_files:
                f.write(f"### {file_ref.file_path}\n")
                f.write(f"**Reason:** {file_ref.reason}\n")
                if file_ref.line_numbers:
                    f.write(f"**Lines:** {file_ref.line_numbers}\n")
                f.write("\n")
        
        print(f"✓ CLI Scout complete! Found {len(scout_output.relevant_files)} files")
        print(f"✓ Saved to relevant_files.md\n")
        
        return scout_output


# ============================================================================
# UPDATED ORCHESTRATOR WITH CLI OPTION
# ============================================================================

class ScoutPlanBuildOrchestrator:
    """Orchestrator with support for both direct and CLI-based approaches."""
    
    def __init__(self, api_key: str = None, use_cli: bool = True):
        """Initialize orchestrator.
        
        Args:
            api_key: Gemini API key
            use_cli: Whether to use CLI approach (recommended) vs direct functions
        """
        self.client = genai.Client(api_key=api_key)
        self.use_cli = use_cli
        
        # Initialize agents based on approach
        if use_cli:
            self.scout = CLIScoutAgent(self.client, model="gemini-3.1-flash-lite")
            print("✓ Using CLI-based tools (context-efficient)")
        else:
            self.scout = ScoutAgent(self.client, model="gemini-3.5-flash")
            print("✓ Using direct function calls")
        
        self.planner = PlannerAgent(self.client, model="gemini-3.5-flash")
        self.builder = BuilderAgent(self.client, model="gemini-flash-latest")
    
    # ... rest of execute() method stays the same


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    # CLI approach (recommended - 80% use case)
    orchestrator = ScoutPlanBuildOrchestrator(use_cli=True)
    
    results = orchestrator.execute(
        user_request="Add a dark mode toggle to our web application",
        codebase_root="./src"
    )