import subprocess
import tempfile
import os
import sys
import ast
import json
from typing import Any, Dict, List, Optional, Literal
from pathlib import Path
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel

from main import gemini_generate


# Structured output schemas
class CodeOutput(BaseModel):
    """Schema for structured code generation output."""
    code: str
    explanation: str
    dependencies: List[str]
    complexity: str  # "simple", "moderate", "complex"
    language: str


class CodeReview(BaseModel):
    """Schema for code review output."""
    issues: List[str]
    suggestions: List[str]
    security_concerns: List[str]
    performance_notes: List[str]
    rating: int  # 1-10


class TestCase(BaseModel):
    """Schema for test case generation."""
    test_name: str
    test_code: str
    description: str


def generate_code(
    client: genai.Client, 
    requirements: str, 
    model: str = "gemini-3.5-flash",
    language: str = "python",
    style: str = "clean",
    include_tests: bool = False,
    include_comments: bool = True,
    max_complexity: str = "moderate",
    temperature: float = 0.2,
    use_thinking: bool = True
) -> str:
    """
    Generate code based on natural language requirements using Gemini AI.
    
    This function takes a description of what code should do and uses the Gemini AI model
    to generate clean, well-documented code that fulfills those requirements. Supports
    multiple languages, styles, and complexity levels.
    
    Args:
        client (genai.Client): An initialized Gemini API client for making requests
        requirements (str): A natural language description of what the code should do
        model (str, optional): The Gemini model to use. Defaults to "gemini-3.5-flash".
        language (str, optional): Programming language. Defaults to "python".
            Options: "python", "javascript", "java", "go", "rust", "typescript", etc.
        style (str, optional): Code style. Defaults to "clean".
            Options: "clean", "functional", "object-oriented", "minimal"
        include_tests (bool, optional): Include unit tests. Defaults to False.
        include_comments (bool, optional): Include code comments. Defaults to True.
        max_complexity (str, optional): Maximum code complexity. Defaults to "moderate".
            Options: "simple", "moderate", "complex"
        temperature (float, optional): Generation temperature (0-1). Defaults to 0.2.
        use_thinking (bool, optional): Use thinking mode for complex code. Defaults to True.
    
    Returns:
        str: The generated code as a string
    
    Raises:
        APIError: If the API request fails
    
    Example:
        >>> client = create_client()
        >>> code = generate_code(
        ...     client, 
        ...     "Create a REST API endpoint for user authentication",
        ...     language="python",
        ...     include_tests=True
        ... )
        >>> print(code)
    """
    # Build comprehensive prompt
    prompt = f"""Generate {language} code for the following requirements:

Requirements:
{requirements}

Style Guidelines:
- Style: {style}
- Max Complexity: {max_complexity}
- Include Comments: {"Yes" if include_comments else "No"}
- Include Tests: {"Yes" if include_tests else "No"}

Provide clean, well-documented code with:
- Proper error handling
- Type hints (if supported by language)
- Docstrings/comments
- Best practices for {language}
{"- Unit tests" if include_tests else ""}

Output the code only, without additional explanations unless needed for setup."""

    # Configure generation
    config = types.GenerateContentConfig(
        temperature=temperature,
        system_instruction=f"You are an expert {language} developer who writes clean, efficient, and well-documented code following industry best practices.",
    )
    
    # Add thinking config for complex reasoning (only for Gemini 2.5 models)
    if use_thinking and "3" in model:
        config.thinking_config = types.ThinkingConfig(
            thinking_budget=512 if max_complexity == "complex" else 256
        )

    try:
        response = gemini_generate(client, label="code", 
            model=model,
            contents=prompt,
            config=config
        )
        return response.text
    
    except APIError as e:
        print(f"API Error: {e.code} - {e.message}")
        raise


def generate_code_structured(
    client: genai.Client,
    requirements: str,
    model: str = "gemini-3.5-flash"
) -> CodeOutput:
    """
    Generate code with structured output including metadata.
    
    Returns a structured response with code, explanation, dependencies, and metadata.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        requirements (str): Natural language description of requirements
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        CodeOutput: Structured output with code and metadata
    
    Example:
        >>> result = generate_code_structured(client, "Build a web scraper")
        >>> print(result.code)
        >>> print(f"Dependencies: {result.dependencies}")
        >>> print(f"Complexity: {result.complexity}")
    """
    prompt = f"""Generate Python code for: {requirements}

Also provide:
- A brief explanation of the implementation
- List of required dependencies/libraries
- Complexity assessment (simple/moderate/complex)
- Language used"""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CodeOutput,
            temperature=0.2,
        )
    )
    
    return CodeOutput.model_validate_json(response.text)


def generate_code_streaming(
    client: genai.Client,
    requirements: str,
    model: str = "gemini-3.5-flash"
):
    """
    Generate code with streaming output for real-time feedback.
    
    Yields code chunks as they are generated, useful for long code generation
    or providing immediate feedback to users.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        requirements (str): Natural language description of requirements
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Yields:
        str: Chunks of generated code
    
    Example:
        >>> for chunk in generate_code_streaming(client, "Create a REST API"):
        ...     print(chunk, end='', flush=True)
    """
    prompt = f"""Generate Python code for the following requirements:

{requirements}

Provide clean, well-documented code with error handling."""

    response = client.models.generate_content_stream(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.2,
            system_instruction="You are an expert Python developer."
        )
    )

    for chunk in response:
        if chunk.text:
            yield chunk.text


def review_code(
    client: genai.Client,
    code: str,
    model: str = "gemini-3.5-flash"
) -> CodeReview:
    """
    Review code and provide structured feedback.
    
    Analyzes code for issues, security concerns, performance problems,
    and provides suggestions for improvement.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        code (str): The code to review
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        CodeReview: Structured review with issues, suggestions, and rating
    
    Example:
        >>> review = review_code(client, my_code)
        >>> print(f"Rating: {review.rating}/10")
        >>> for issue in review.issues:
        ...     print(f"- {issue}")
    """
    prompt = f"""Review the following Python code and provide structured feedback:
```python
{code}
```

Analyze for:
- Code issues and bugs
- Improvement suggestions
- Security concerns
- Performance notes
- Overall quality rating (1-10)"""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CodeReview,
            temperature=0.1,
        )
    )
    
    return CodeReview.model_validate_json(response.text)


def explain_code(
    client: genai.Client,
    code: str,
    detail_level: Literal["brief", "detailed", "line-by-line"] = "detailed",
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Generate an explanation of what code does.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        code (str): The code to explain
        detail_level (str, optional): Level of detail. Defaults to "detailed".
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Explanation of the code
    
    Example:
        >>> explanation = explain_code(client, complex_function)
        >>> print(explanation)
    """
    detail_instructions = {
        "brief": "Provide a brief 2-3 sentence summary of what this code does.",
        "detailed": "Provide a detailed explanation of what this code does, including the main logic flow and key components.",
        "line-by-line": "Provide a line-by-line explanation of this code, explaining each significant line or block."
    }
    
    prompt = f"""Explain the following Python code:
```python
{code}
```

{detail_instructions[detail_level]}"""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.3)
    )
    
    return response.text


def generate_tests(
    client: genai.Client,
    code: str,
    test_framework: str = "pytest",
    model: str = "gemini-3.5-flash"
) -> List[TestCase]:
    """
    Generate unit tests for given code.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        code (str): The code to generate tests for
        test_framework (str, optional): Test framework to use. Defaults to "pytest".
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        List[TestCase]: List of generated test cases
    
    Example:
        >>> tests = generate_tests(client, my_function_code)
        >>> for test in tests:
        ...     print(test.test_name)
        ...     print(test.test_code)
    """
    prompt = f"""Generate unit tests for the following Python code using {test_framework}:
```python
{code}
```

Create comprehensive tests covering:
- Normal cases
- Edge cases
- Error cases

Return a JSON array of test cases."""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=list[TestCase],
            temperature=0.2,
        )
    )
    
    test_data = json.loads(response.text)
    return [TestCase(**test) for test in test_data]


def refactor_code(
    client: genai.Client,
    code: str,
    goals: List[str],
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Refactor code to meet specific goals.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        code (str): The code to refactor
        goals (List[str]): List of refactoring goals (e.g., ["improve performance", "add type hints"])
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Refactored code
    
    Example:
        >>> refactored = refactor_code(
        ...     client, 
        ...     old_code, 
        ...     ["improve readability", "add error handling"]
        ... )
    """
    goals_str = "\n".join(f"- {goal}" for goal in goals)
    
    prompt = f"""Refactor the following Python code to meet these goals:

{goals_str}

Original code:
```python
{code}
```

Provide the refactored code with comments explaining major changes."""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.2)
    )
    
    return response.text


def convert_code(
    client: genai.Client,
    code: str,
    source_lang: str,
    target_lang: str,
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Convert code from one programming language to another.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        code (str): The code to convert
        source_lang (str): Source programming language
        target_lang (str): Target programming language
        model (str, optional): Model to use. Defaults to "gemini-2.5-pro".
    
    Returns:
        str: Converted code
    
    Example:
        >>> js_code = convert_code(client, python_code, "python", "javascript")
    """
    prompt = f"""Convert the following {source_lang} code to {target_lang}:
```{source_lang}
{code}
```

Maintain the same functionality and structure while following {target_lang} best practices."""

    response = gemini_generate(client, label="code",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.2)
    )
    
    return response.text


def execute_code(
    code: str,
    timeout: int = 30,
    env_vars: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Execute Python code safely in an isolated subprocess with timeout protection.
    
    This function writes the provided Python code to a temporary file and executes it
    in a separate Python subprocess. The execution is time-limited to prevent infinite
    loops or hanging processes. All output (stdout and stderr) is captured and returned
    along with the exit code.
    
    Args:
        code (str): The Python code to execute as a string
        timeout (int, optional): Execution timeout in seconds. Defaults to 30.
        env_vars (Dict[str, str], optional): Environment variables to set. Defaults to None.
    
    Returns:
        Dict[str, Any]: A dictionary containing:
            - stdout (str): Standard output from the code execution
            - stderr (str): Standard error output from the code execution
            - returncode (int): The exit code of the process (0 for success)
            - timed_out (bool): Whether the execution timed out
            - execution_time (float): Time taken to execute in seconds
    
    Example:
        >>> code = "print('Hello, World!')"
        >>> result = execute_code(code)
        >>> print(result['stdout'])
        Hello, World!
        >>> print(result['returncode'])
        0
    
    Note:
        The temporary file is automatically cleaned up after execution.
    """
    import time

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(code)
        temp_file = f.name

    start_time = time.time()
    timed_out = False
    
    try:
        # Prepare environment
        env = os.environ.copy()
        # Force the child interpreter into UTF-8 mode so emoji/non-cp1252 output
        # doesn't crash with UnicodeEncodeError on Windows consoles/pipes.
        env['PYTHONUTF8'] = '1'
        # The temp file lives in %TEMP%, so put backend/ on the path and run from
        # there — lets executed code import sibling modules (mega_agentic_system,
        # image_generation, ...) and keeps relative state files (e.g.
        # mega_system_state.pkl) consistent with the API server's cwd.
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        existing_pythonpath = env.get('PYTHONPATH', '')
        env['PYTHONPATH'] = backend_dir + (os.pathsep + existing_pythonpath if existing_pythonpath else '')
        if env_vars:
            env.update(env_vars)

        result = subprocess.run(
            # Use the server's own interpreter (the venv that has the backend's
            # deps) instead of bare 'python', which resolves via PATH to whatever
            # Python comes first — often the system install without these packages.
            [sys.executable, temp_file],
            capture_output=True,
            text=True,
            encoding='utf-8',  # decode captured output as UTF-8, not the parent's cp1252 locale
            errors='replace',
            timeout=timeout,
            cwd=backend_dir,
            env=env
        )

        execution_time = time.time() - start_time
        
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode,
            'timed_out': False,
            'execution_time': execution_time
        }
    
    except subprocess.TimeoutExpired:
        execution_time = time.time() - start_time
        return {
            'stdout': '',
            'stderr': f'Execution timed out after {timeout} seconds',
            'returncode': -1,
            'timed_out': True,
            'execution_time': execution_time
        }
    
    finally:
        # Windows-specific: retry file deletion to handle file locking
        max_retries = 3
        for i in range(max_retries):
            try:
                os.unlink(temp_file)
                break
            except PermissionError:
                if i < max_retries - 1:
                    time.sleep(0.1)


def validate_syntax(code: str, language: str = "python") -> Dict[str, Any]:
    """
    Validate the syntax of code without executing it.
    
    Args:
        code (str): The code to validate
        language (str, optional): Programming language. Defaults to "python".
    
    Returns:
        Dict[str, Any]: Dictionary with 'valid' (bool) and 'errors' (list)
    
    Example:
        >>> result = validate_syntax("print('hello'")
        >>> if not result['valid']:
        ...     print(result['errors'])
    """
    if language.lower() == "python":
        try:
            ast.parse(code)
            return {"valid": True, "errors": []}
        except SyntaxError as e:
            return {
                "valid": False,
                "errors": [f"Line {e.lineno}: {e.msg}"]
            }
    else:
        return {
            "valid": None,
            "errors": [f"Syntax validation not implemented for {language}"]
        }


def generate_and_execute(
    client: genai.Client,
    requirements: str,
    model: str = "gemini-3.5-flash",
    auto_fix: bool = True,
    max_retries: int = 3
) -> Dict[str, Any]:
    """
    Generate code and execute it, with automatic error fixing.
    
    If execution fails and auto_fix is True, will attempt to fix the code
    and retry execution up to max_retries times.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        requirements (str): Natural language description of requirements
        model (str, optional): Model to use. Defaults to "gemini-2.5-pro".
        auto_fix (bool, optional): Automatically fix errors. Defaults to True.
        max_retries (int, optional): Maximum fix attempts. Defaults to 3.
    
    Returns:
        Dict[str, Any]: Dictionary containing 'code', 'execution_result', and 'attempts'
    
    Example:
        >>> result = generate_and_execute(client, "Print fibonacci numbers")
        >>> print(result['execution_result']['stdout'])
        >>> print(f"Succeeded after {result['attempts']} attempts")
    """
    code = generate_code(client, requirements, model=model)
    attempts = 1
    
    while attempts <= max_retries:
        # Validate syntax first
        validation = validate_syntax(code)
        if not validation['valid']:
            if not auto_fix or attempts == max_retries:
                return {
                    'code': code,
                    'execution_result': {
                        'stdout': '',
                        'stderr': '\n'.join(validation['errors']),
                        'returncode': -1
                    },
                    'attempts': attempts
                }
            
            # Try to fix syntax errors
            fix_prompt = f"""The following code has syntax errors:
```python
{code}
```

Errors:
{chr(10).join(validation['errors'])}

Fix the code and provide only the corrected version."""

            response = gemini_generate(client, label="code",
                model=model,
                contents=fix_prompt,
                config=types.GenerateContentConfig(temperature=0.1)
            )
            code = response.text
            attempts += 1
            continue
        
        # Execute the code
        result = execute_code(code)
        
        # If successful or out of retries, return
        if result['returncode'] == 0 or not auto_fix or attempts == max_retries:
            return {
                'code': code,
                'execution_result': result,
                'attempts': attempts
            }
        
        # Try to fix runtime errors
        fix_prompt = f"""The following code executed with errors:
```python
{code}
```

Error output:
{result['stderr']}

Fix the code and provide only the corrected version."""

        response = gemini_generate(client, label="code",
            model=model,
            contents=fix_prompt,
            config=types.GenerateContentConfig(temperature=0.1)
        )
        code = response.text
        attempts += 1
    
    return {
        'code': code,
        'execution_result': result,
        'attempts': attempts
    }


# Usage Examples
if __name__ == "__main__":
    from main import create_client
    
    client = create_client()
    
    try:
        print("=" * 80)
        print("CODE GENERATION EXAMPLES")
        print("=" * 80)
        
        # Example 1: Basic code generation
        print("\n1. Basic code generation...")
        code = generate_code(
            client, 
            "Create a function to calculate fibonacci numbers recursively"
        )
        print(code)
        
        # Example 2: Structured output
        print("\n2. Structured code generation...")
        result = generate_code_structured(
            client,
            "Build a simple web scraper for news headlines"
        )
        print(f"Language: {result.language}")
        print(f"Complexity: {result.complexity}")
        print(f"Dependencies: {result.dependencies}")
        print(f"\nCode:\n{result.code}")
        
        # Example 3: Code with tests
        print("\n3. Generating code with tests...")
        code_with_tests = generate_code(
            client,
            "Create a function to validate email addresses",
            include_tests=True
        )
        print(code_with_tests)
        
        # Example 4: Streaming generation
        print("\n4. Streaming code generation...")
        for chunk in generate_code_streaming(
            client,
            "Create a simple calculator class"
        ):
            print(chunk, end='', flush=True)
        print("\n")
        
        # Example 5: Code review
        print("\n5. Reviewing code...")
        sample_code = """
def divide(a, b):
    return a / b
"""
        review = review_code(client, sample_code)
        print(f"Rating: {review.rating}/10")
        print(f"Issues: {review.issues}")
        print(f"Suggestions: {review.suggestions}")
        
        # Example 6: Explain code
        print("\n6. Explaining code...")
        explanation = explain_code(client, sample_code, detail_level="detailed")
        print(explanation)
        
        # Example 7: Generate and execute
        print("\n7. Generate and execute code...")
        result = generate_and_execute(
            client,
            "Print the first 10 fibonacci numbers",
            auto_fix=True
        )
        print(f"Attempts: {result['attempts']}")
        print(f"Output:\n{result['execution_result']['stdout']}")
        
        # Example 8: Refactoring
        print("\n8. Refactoring code...")
        refactored = refactor_code(
            client,
            sample_code,
            ["add error handling", "add type hints", "add docstring"]
        )
        print(refactored)
        
        # Example 9: Language conversion
        print("\n9. Converting Python to JavaScript...")
        python_code = "def greet(name):\n    return f'Hello, {name}!'"
        js_code = convert_code(client, python_code, "python", "javascript")
        print(js_code)
        
        print("\n" + "=" * 80)
        print("All examples completed!")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        try:
            client.close()
        except Exception:
            pass

# def execute_code(code: str) -> Dict[str, Any]:
#     """
#     Execute Python code safely in an isolated subprocess with timeout protection.
    
#     This function writes the provided Python code to a temporary file and executes it
#     in a separate Python subprocess. The execution is time-limited to prevent infinite
#     loops or hanging processes. All output (stdout and stderr) is captured and returned
#     along with the exit code.
    
#     Args:
#         code (str): The Python code to execute as a string
    
#     Returns:
#         Dict[str, Any]: A dictionary containing:
#             - stdout (str): Standard output from the code execution
#             - stderr (str): Standard error output from the code execution
#             - returncode (int): The exit code of the process (0 for success)
    
#     Example:
#         >>> code = "print('Hello, World!')"
#         >>> result = execute_code(code)
#         >>> print(result['stdout'])
#         Hello, World!
#         >>> print(result['returncode'])
#         0
    
#     Note:
#         The code execution has a 30-second timeout to prevent runaway processes.
#         The temporary file is automatically cleaned up after execution.
#     """
#     import time
    
#     with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
#         f.write(code)
#         temp_file = f.name

#     try:
#         result = subprocess.run( 
#             ['python', temp_file],
#             capture_output=True,
#             text=True,
#             timeout=30 
#         )

#         return {
#             'stdout': result.stdout,
#             'stderr': result.stderr,
#             'returncode': result.returncode 
#         }
#     finally:
#         # Windows-specific: retry file deletion to handle file locking
#         max_retries = 3
#         for i in range(max_retries):
#             try:
#                 os.unlink(temp_file)
#                 break
#             except PermissionError:
#                 if i < max_retries - 1:
#                     time.sleep(0.1)  # Brief delay before retry
#                 else:
#                     # If still fails, just pass - temp files get cleaned up eventually
#                     pass

# # Usage
# if __name__ == "__main__":
#     client = create_client()
#     code = generate_code(client, "Create a function to calculate fibonacci numbers")
#     result = execute_code(code)
#     print(result)
#     print(code)