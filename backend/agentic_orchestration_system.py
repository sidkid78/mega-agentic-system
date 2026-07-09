from google.genai.types import FunctionCall, Tool
from google import genai
from google.genai import types
from typing import Callable, List, Dict, Any
from functools import partial
from main import search_arxiv, search_pubmed, search_wikipedia, research_with_grounding
from code_generation import generate_code, execute_code
from document_generation import generate_document
from image_generation import generate_image
from main import create_client, COMPLEX_MODEL, DEFAULT_MODEL


class AgenticOrchestrator:
    """
    Orchestrates complex tasks by intelligently selecting and coordinating multiple AI tools.
    
    This class provides a high-level interface for executing multi-step tasks that may require
    various capabilities such as research, code generation, document creation, and image generation.
    It uses the Gemini model to determine which tools to use and how to combine their results.
    
    Attributes:
        client (genai.Client): The Gemini API client for making requests
        tools (Dict[str, Callable]): Dictionary mapping tool names to their callable functions
    """
    
    def __init__(self, client: genai.Client):
        """
        Initialize the AgenticOrchestrator with a Gemini client.
        
        Args:
            client (genai.Client): An initialized Gemini API client
        """
        self.client = client 
        # Bind client to functions that need it
        self.tools = {
            'search_arxiv': search_arxiv,
            'search_pubmed': search_pubmed,
            'search_wikipedia': search_wikipedia,
            'research_with_grounding': research_with_grounding,
            'generate_image': partial(generate_image, client),
            'generate_document': generate_document,
            'generate_code': partial(generate_code, client),
            'execute_code': execute_code,
        }

    def execute_task(self, task: str) -> str:
        """
        Execute a complex task by automatically selecting and using appropriate tools.
        
        The method sends the task to the Gemini model, which decides which tools to use.
        If function calls are made, it executes them and sends the results back to the model
        for final processing and response generation.
        
        Args:
            task (str): A natural language description of the task to execute
            
        Returns:
            str: The final response text after tool execution and processing
            
        Example:
            >>> orchestrator = AgenticOrchestrator(client)
            >>> result = orchestrator.execute_task("Research quantum computing and create a summary")
            >>> print(result)
        """

        # First, let the model decide which tools to use
        response = self.client.models.generate_content(
            model=COMPLEX_MODEL,
            contents=task,
            config=types.GenerateContentConfig(
                tools=list(self.tools.values())
            )
        )

        # Handle function calls
        if response.function_calls:
            results = []
            for fc in response.function_calls:
                tool_func = self.tools[fc.name]
                result = tool_func(**dict(fc.args))
                results.append(result)

            # Send results back to model
            final_response = self.client.models.generate_content(
                model=COMPLEX_MODEL,
                contents=[
                    task,
                    response.candidates[0].content,
                    types.Content(
                        role="tool",
                        parts=[types.Part.from_function_response(
                            name=fc.name,
                            response={"result": result}
                        ) for fc, result in zip(response.function_calls, results)]
                    )
                ]
            )
            return final_response.text
        else:
            # No function calls needed, return direct response
            return response.text

    def stream_research_response(self, query: str):
        """
        Stream research responses in real-time for better user experience.
        
        This method generates responses incrementally, yielding text chunks and function call
        notifications as they become available. This is useful for long-running research tasks
        where you want to provide immediate feedback to users.
        
        Args:
            query (str): The research query to process
            
        Yields:
            str: Text chunks from the model response or function call notifications
            
        Example:
            >>> for chunk in orchestrator.stream_research_response("Find papers on neural networks"):
            ...     print(chunk, end='', flush=True)
        """
        response = self.client.models.generate_content_stream(
            model=DEFAULT_MODEL,
            contents=query,
            config=types.GenerateContentConfig(
                tools=[search_arxiv, search_wikipedia, search_pubmed, research_with_grounding, generate_code, generate_document, generate_image, execute_code]
            )
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text 
            elif chunk.function_calls:
                for fc in chunk.function_calls:
                    yield f"\n[Calling {fc.name}...]\n"

# Example Usage of all capabilities of the orchestrator
if __name__ == "__main__":
    client = create_client()
    orchestrator = AgenticOrchestrator(client=client)
    # a task other than researching quantum
    result = orchestrator.execute_task("")
    print(result)

    task = "Find recent papers about transformer architectures"
    result = orchestrator.execute_task(task)
    print(result)

    for chunk in orchestrator.stream_research_response("Find recent papers about transformer architectures"):
        print(chunk, end='', flush=True)

    image = orchestrator.tools['generate_image']("A quantum computer")
    image.save("quantum_computer.png")

    document = orchestrator.tools['generate_document']("A summary of the latest developments in quantum computing", title=str("Quantum Computing Summary"))
    print(f"Document saved as: {document}")

    code = orchestrator.tools['generate_code']("A web scraper for news articles")
    print(code)
    execution = orchestrator.tools['execute_code'](code)
    print(execution['stdout'])
    print(execution['stderr'])
    print(execution['returncode'])
    try:
        client.close()
    except Exception:
        pass