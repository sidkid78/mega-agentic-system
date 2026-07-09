from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Optional
import json
import time

# ============================================================================
# PYDANTIC SCHEMAS FOR STRUCTURED OUTPUTS
# ============================================================================

class FileReference(BaseModel):
    """A reference to a specific file and location in the codebase."""
    file_path: str = Field(description="Relative path to the file")
    reason: str = Field(description="Why this file is relevant")
    line_numbers: Optional[str] = Field(
        default=None, 
        description="Specific line numbers if known (e.g., '10-25')"
    )

class ScoutOutput(BaseModel):
    """Output from the scout agent."""
    relevant_files: List[FileReference] = Field(
        description="List of files relevant to the task"
    )
    summary: str = Field(
        description="Brief summary of findings"
    )

class PlanStep(BaseModel):
    """A single step in the execution plan."""
    step_number: int
    description: str = Field(description="What needs to be done")
    files_involved: List[str] = Field(description="Files that will be modified")
    rationale: str = Field(description="Why this step is necessary")

class ExecutionPlan(BaseModel):
    """Complete execution plan for the build phase."""
    steps: List[PlanStep] = Field(description="Ordered steps to execute")
    dependencies: List[str] = Field(
        default_factory=list,
        description="External dependencies or libraries needed"
    )
    risks: List[str] = Field(
        default_factory=list,
        description="Potential risks or considerations"
    )

# ============================================================================
# FILE SYSTEM TOOLS
# ============================================================================

def search_codebase(query: str, file_extensions: List[str] = None) -> str:
    """Search the codebase for files matching a query.
    
    Args:
        query: Search term or pattern
        file_extensions: Optional list of file extensions to filter (e.g., ['.py', '.js'])
    
    Returns:
        JSON string with search results
    """
    # In production, this would use ripgrep, git grep, or AST parsing
    # For demo, we'll simulate
    results = {
        "files_found": [
            {"path": "src/components/Header.tsx", "matches": 3},
            {"path": "src/styles/theme.css", "matches": 5},
            {"path": "src/utils/themeToggle.ts", "matches": 2}
        ],
        "total_matches": 10
    }
    return json.dumps(results, indent=2)

def read_file(file_path: str, start_line: int = None, end_line: int = None) -> str:
    """Read contents of a file.
    
    Args:
        file_path: Path to the file
        start_line: Optional starting line number
        end_line: Optional ending line number
    
    Returns:
        File contents
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            if start_line and end_line:
                lines = f.readlines()[start_line-1:end_line]
                return ''.join(lines)
            return f.read()
    except FileNotFoundError:
        return f"Error: File {file_path} not found"

def list_directory(directory: str = ".", recursive: bool = False) -> str:
    """List files in a directory.
    
    Args:
        directory: Directory path
        recursive: Whether to list recursively
    
    Returns:
        JSON string with directory contents
    """
    path = Path(directory)
    if recursive:
        files = [str(p.relative_to(path)) for p in path.rglob("*") if p.is_file()]
    else:
        files = [str(p.name) for p in path.iterdir() if p.is_file()]
    
    return json.dumps({"files": files, "count": len(files)}, indent=2)

# ============================================================================
# SCOUT AGENT
# ============================================================================

class ScoutAgent:
    """Fast agent that finds relevant files in the codebase."""
    
    def __init__(self, client: genai.Client, model: str = "gemini-3.1-flash-lite"):
        self.client = client
        self.model = model
        
    def scout(self, user_request: str, codebase_root: str = ".") -> ScoutOutput:
        """Execute the scout phase.
        
        Args:
            user_request: The user's original request
            codebase_root: Root directory of the codebase
            
        Returns:
            ScoutOutput with relevant files identified
        """
        print(f"\n{'='*80}")
        print("SCOUT PHASE: Finding relevant files...")
        print(f"{'='*80}\n")
        
        # Phase 1: Use tools to explore codebase
        print("Phase 1: Exploring codebase with tools...")
        exploration_instruction = """You are a codebase explorer. Use the available tools to:
1. Search for relevant files and code patterns
2. List directory structures
3. Read file contents to understand the codebase

Provide a detailed report of what you found."""

        exploration_response = self.client.models.generate_content(
            model=self.model,
            contents=f"""User Request: {user_request}

Codebase Root: {codebase_root}

Use the search_codebase, list_directory, and read_file tools to explore the codebase.
Find all files that might be relevant to this request.""",
            config=types.GenerateContentConfig(
                system_instruction=exploration_instruction,
                tools=[search_codebase, list_directory, read_file],
                temperature=0.3,
            )
        )
        
        exploration_findings = exploration_response.text
        print(f"✓ Exploration complete\n")
        
        # Phase 2: Convert findings to structured output
        print("Phase 2: Structuring findings...")
        structuring_instruction = """You are a data structuring agent. 
Take the exploration findings and convert them into a structured format with:
- List of relevant files with exact paths
- Reason why each file is relevant
- Specific line numbers if mentioned

Be precise and thorough."""

        structure_response = self.client.models.generate_content(
            model=self.model,
            contents=f"""User Request: {user_request}

Exploration Findings:
{exploration_findings}

Convert these findings into a structured list of relevant files.""",
            config=types.GenerateContentConfig(
                system_instruction=structuring_instruction,
                response_mime_type="application/json",
                response_schema=ScoutOutput,
                temperature=0.3,
            )
        )
        
        scout_output = ScoutOutput.model_validate_json(structure_response.text)
        print(f"✓ Structuring complete\n")
        
        # Save to file for the next agent
        with open("relevant_files.md", "w") as f:
            f.write("# Relevant Files for Task\n\n")
            f.write(f"**Task:** {user_request}\n\n")
            f.write(f"**Summary:** {scout_output.summary}\n\n")
            f.write("## Files to Modify\n\n")
            
            for file_ref in scout_output.relevant_files:
                f.write(f"### {file_ref.file_path}\n")
                f.write(f"**Reason:** {file_ref.reason}\n")
                if file_ref.line_numbers:
                    f.write(f"**Lines:** {file_ref.line_numbers}\n")
                f.write("\n")
        
        print(f"✓ Scout complete! Found {len(scout_output.relevant_files)} relevant files")
        print(f"✓ Saved to relevant_files.md\n")
        
        return scout_output

# ============================================================================
# PLANNER AGENT
# ============================================================================

class PlannerAgent:
    """Strategic planning agent that creates execution blueprint."""
    
    def __init__(self, client: genai.Client, model: str = "gemini-3.5-flash"):
        self.client = client
        self.model = model
        
    def plan(
        self, 
        user_request: str,
        scout_output: ScoutOutput,
        documentation_urls: List[str] = None
    ) -> ExecutionPlan:
        """Execute the planning phase.
        
        Args:
            user_request: The user's original request
            scout_output: Output from the scout phase
            documentation_urls: Optional URLs to relevant documentation
            
        Returns:
            ExecutionPlan with detailed steps
        """
        print(f"\n{'='*80}")
        print("PLAN PHASE: Creating execution blueprint...")
        print(f"{'='*80}\n")
        
        # Read the scout's treasure map
        with open("relevant_files.md", "r") as f:
            scout_map = f.read()
        
        # System instruction for the planner
        system_instruction = """You are a strategic planning agent. Your job is to synthesize 
information and create a detailed, step-by-step execution plan.

Your inputs:
1. The user's original request
2. The scout's findings (relevant files and locations)
3. External documentation (if provided)

Your output must be a comprehensive plan that includes:
- Ordered, numbered steps
- Specific files to modify in each step
- Clear rationale for each step
- Dependencies or libraries needed
- Potential risks or considerations

The plan should be so detailed that a builder agent can execute it without making decisions.
Think like an architect creating a blueprint - every detail matters."""

        # Build documentation context if provided
        doc_context = ""
        if documentation_urls:
            doc_context = "\n\n## Documentation References\n"
            for url in documentation_urls:
                doc_context += f"- {url}\n"
        
        response = self.client.models.generate_content(
            model=self.model,
            contents=f"""User Request: {user_request}

{scout_map}

{doc_context}

Create a detailed execution plan with specific steps to fulfill this request.
Consider the files identified by the scout and create a logical sequence of modifications.""",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ExecutionPlan,
                temperature=0.5,  # Moderate temperature for creative planning
                thinking_config=types.ThinkingConfig(
                    thinking_budget=2048  # Give planner room to think
                )
            )
        )
        
        execution_plan = ExecutionPlan.model_validate_json(response.text)
        
        # Save plan to file
        with open("plan.md", "w") as f:
            f.write("# Execution Plan\n\n")
            f.write(f"**Task:** {user_request}\n\n")
            
            if execution_plan.dependencies:
                f.write("## Dependencies\n")
                for dep in execution_plan.dependencies:
                    f.write(f"- {dep}\n")
                f.write("\n")
            
            if execution_plan.risks:
                f.write("## Risks & Considerations\n")
                for risk in execution_plan.risks:
                    f.write(f"- {risk}\n")
                f.write("\n")
            
            f.write("## Execution Steps\n\n")
            for step in execution_plan.steps:
                f.write(f"### Step {step.step_number}: {step.description}\n\n")
                f.write(f"**Files:** {', '.join(step.files_involved)}\n\n")
                f.write(f"**Rationale:** {step.rationale}\n\n")
                f.write("---\n\n")
        
        print(f"✓ Plan complete! Created {len(execution_plan.steps)} steps")
        print(f"✓ Saved to plan.md\n")
        
        return execution_plan

# ============================================================================
# BUILDER AGENT
# ============================================================================

class BuilderAgent:
    """Execution agent that implements the plan."""
    
    def __init__(self, client: genai.Client, model: str = "gemini-flash-latest"):
        self.client = client
        self.model = model
        
    def build(self, execution_plan: ExecutionPlan) -> dict:
        """Execute the build phase.
        
        Args:
            execution_plan: The plan created by the planner
            
        Returns:
            Dict with execution results
        """
        print(f"\n{'='*80}")
        print("BUILD PHASE: Executing the plan...")
        print(f"{'='*80}\n")
        
        # Read the master plan (higher order prompt!)
        with open("plan.md", "r") as f:
            master_plan = f.read()
        
        # System instruction for the builder
        system_instruction = """You are a precise builder agent. Your job is to execute 
the master plan exactly as specified, without deviation.

Your approach:
1. Read each step carefully
2. Modify the specified files
3. Follow the plan's rationale
4. Report what you've done

You are NOT to make strategic decisions - the plan is your blueprint.
Execute with discipline and precision."""

        results = {
            "steps_executed": [],
            "files_modified": [],
            "success": True,
            "errors": []
        }
        
        for step in execution_plan.steps:
            print(f"Executing Step {step.step_number}: {step.description}")
            
            try:
                # In production, this would actually modify files
                # For demo, we'll simulate
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=f"""Execute this step from the master plan:

{step.description}

Files to modify: {', '.join(step.files_involved)}
Rationale: {step.rationale}

Use the read_file tool to examine current code, then describe the exact changes needed.""",
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        tools=[read_file],
                        temperature=0.1,  # Very low temperature for precise execution
                    )
                )
                
                results["steps_executed"].append({
                    "step": step.step_number,
                    "description": step.description,
                    "output": response.text
                })
                
                results["files_modified"].extend(step.files_involved)
                
                print(f"  ✓ Step {step.step_number} complete\n")
                
            except Exception as e:
                error_msg = f"Error in step {step.step_number}: {str(e)}"
                results["errors"].append(error_msg)
                results["success"] = False
                print(f"  ✗ {error_msg}\n")
        
        # Save build log
        with open("build_log.md", "w") as f:
            f.write("# Build Execution Log\n\n")
            f.write(f"**Status:** {'SUCCESS' if results['success'] else 'FAILED'}\n\n")
            
            f.write("## Steps Executed\n\n")
            for step_result in results["steps_executed"]:
                f.write(f"### Step {step_result['step']}: {step_result['description']}\n\n")
                f.write(f"{step_result['output']}\n\n")
                f.write("---\n\n")
            
            if results["errors"]:
                f.write("## Errors\n\n")
                for error in results["errors"]:
                    f.write(f"- {error}\n")
        
        print(f"✓ Build {'complete' if results['success'] else 'failed'}!")
        print(f"✓ Modified {len(set(results['files_modified']))} files")
        print(f"✓ Saved to build_log.md\n")
        
        return results

# ============================================================================
# ORCHESTRATOR
# ============================================================================

class ScoutPlanBuildOrchestrator:
    """Main orchestrator for the Scout, Plan, Build workflow."""
    
    def __init__(self, api_key: str = None):
        """Initialize the orchestrator.
        
        Args:
            api_key: Gemini API key (or set GEMINI_API_KEY env var)
        """
        self.client = genai.Client(api_key=api_key)
        
        # Initialize specialized agents
        self.scout = ScoutAgent(self.client, model="gemini-3.1-flash-lite")
        self.planner = PlannerAgent(self.client, model="gemini-3.1-pro-preview")
        self.builder = BuilderAgent(self.client, model="gemini-3.5-flash")
        
    def execute(
        self, 
        user_request: str,
        codebase_root: str = ".",
        documentation_urls: List[str] = None
    ) -> dict:
        """Execute the complete Scout, Plan, Build workflow.
        
        Args:
            user_request: The user's coding task
            codebase_root: Root directory of the codebase
            documentation_urls: Optional URLs to relevant documentation
            
        Returns:
            Dict with complete workflow results
        """
        start_time = time.time()
        
        print("\n" + "="*80)
        print("SCOUT → PLAN → BUILD WORKFLOW")
        print("="*80)
        print(f"\nTask: {user_request}\n")
        
        # Step 1: Scout
        scout_output = self.scout.scout(user_request, codebase_root)
        
        # Step 2: Plan
        execution_plan = self.planner.plan(
            user_request,
            scout_output,
            documentation_urls
        )
        
        # Step 3: Build
        build_results = self.builder.build(execution_plan)
        
        elapsed_time = time.time() - start_time
        
        # Final summary
        print("\n" + "="*80)
        print("WORKFLOW COMPLETE")
        print("="*80)
        print(f"\nTotal time: {elapsed_time:.2f}s")
        print(f"Status: {'✓ SUCCESS' if build_results['success'] else '✗ FAILED'}")
        print(f"\nOutputs:")
        print(f"  - relevant_files.md (Scout treasure map)")
        print(f"  - plan.md (Master blueprint)")
        print(f"  - build_log.md (Execution log)")
        print("\n" + "="*80 + "\n")
        
        return {
            "scout_output": scout_output,
            "execution_plan": execution_plan,
            "build_results": build_results,
            "elapsed_time": elapsed_time,
            "success": build_results["success"]
        }

# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    # Initialize orchestrator
    orchestrator = ScoutPlanBuildOrchestrator()
    
    # Execute the workflow something different
    results = orchestrator.execute(
        user_request="implement logic for this project",
        codebase_root="C:\\Users\\sidki\\source\\repos\\ultimate\\backend\\workspace_f",
        documentation_urls=["https://html2-blush.vercel.app/implementation.html"],
    )
    # Access individual results
    print(f"\nScout found {len(results['scout_output'].relevant_files)} files")
    print(f"Planner created {len(results['execution_plan'].steps)} steps")
    print(f"Builder executed {len(results['build_results']['steps_executed'])} steps")