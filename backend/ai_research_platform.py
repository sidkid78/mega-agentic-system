from google import genai
from typing import List, Dict, Any
from RAG_system import RAGSystem
from agentic_orchestration_system import AgenticOrchestrator
from research_assistant import ResearchAssistant
from code_generation import generate_code, execute_code
from image_generation import generate_image



class AIResearchPlatform:
    """
    Unified AI Research Platform integrating multiple AI capabilities.
    
    This platform provides a single interface for various AI-powered operations including
    research tasks, RAG-based question answering, code generation, image generation, and
    conversational chat. It orchestrates multiple specialized components to handle different
    types of requests.
    
    Attributes:
        client (genai.Client): The Gemini API client for AI operations
        rag (RAGSystem): Retrieval-Augmented Generation system for document-based Q&A
        orchestrator (AgenticOrchestrator): Orchestrator for complex research tasks
        assistant (ResearchAssistant): Conversational assistant with research capabilities
    
    Example:
        >>> platform = AIResearchPlatform()
        >>> result = platform.process_request("research", query="AI breakthroughs")
        >>> print(result['response'])
    """
    
    def __init__(self, api_key: str | None = None):
        """
        Initialize the AI Research Platform with all required components.

        Creates instances of the Gemini client and all specialized subsystems
        (RAG, orchestrator, and research assistant).

        BYOK: pass the caller's key; falls back to the env key for local dev.
        """
        self.client = genai.Client(api_key=api_key) if api_key else genai.Client()
        # RAGSystem uses file_search_stores API which may not be available
        try:
            self.rag = RAGSystem(self.client)
        except Exception as e:
            print(f"⚠️ RAGSystem not available: {e}")
            self.rag = None
        self.orchestrator = AgenticOrchestrator(self.client)
        self.assistant = ResearchAssistant(self.client)
    
    def process_request(self, request_type: str, **kwargs) -> Dict[str, Any]:
        """
        Main entry point for all requests to the platform.
        
        Routes requests to the appropriate subsystem based on the request type.
        Supports research tasks, RAG queries, code generation, image generation,
        and conversational chat.
        
        Args:
            request_type (str): Type of request to process. Valid values:
                - "research": Execute a research task using the orchestrator
                - "rag_query": Answer questions using RAG system
                - "generate_code": Generate and optionally execute code
                - "generate_image": Generate images from text prompts
                - "chat": Conversational interaction with research assistant
            **kwargs: Additional arguments specific to each request type:
                - research: query (str) - The research query
                - rag_query: question (str) - The question to answer
                - generate_code: requirements (str) - Code requirements
                - generate_image: prompt (str) - Image generation prompt
                - chat: message (str) - Chat message
        
        Returns:
            Dict[str, Any]: Response dictionary with results specific to request type:
                - research: {"response": str}
                - rag_query: {"answer": str}
                - generate_code: {"code": str, "execution": Any}
                - generate_image: {"image_path": str}
                - chat: {"response": str}
                - error: {"error": str} if request_type is invalid
        
        Example:
            >>> platform = AIResearchPlatform()
            >>> result = platform.process_request(
            ...     "research",
            ...     query="Find recent AI papers"
            ... )
            >>> print(result['response'])
        """
        
        if request_type == "research":
            return {"response": self.orchestrator.execute_task(kwargs['query'])}
        
        elif request_type == "rag_query":
            if self.rag is None:
                return {"error": "RAG system not available"}
            return {"answer": self.rag.answer_question(kwargs['question'])}
        
        elif request_type == "generate_code":
            code = generate_code(self.client, kwargs['requirements'])
            execution = execute_code(code)
            return {"code": code, "execution": execution}
        
        elif request_type == "generate_image":
            image = generate_image(self.client, kwargs['prompt'])
            return {"image_path": "generated_image.png"}
        
        elif request_type == "chat":
            return {"response": self.assistant.send_message(kwargs['message'])}
        
        else:
            return {"error": "Unknown request type"}

# Usage
# platform = AIResearchPlatform()

# # Research task
# result = platform.process_request(
#     "research",
#     query="Find and summarize recent AI breakthroughs"
# )
# print(result)

# # Code generation
# result = platform.process_request(
#     "generate_code",
#     requirements="Create a web scraper for news articles"
# )
# print(result)

# # Image generation
# result = platform.process_request(
#     "generate_image",
#     prompt="Modern AI laboratory"
# )
# print(result)

# # Chat
# result = platform.process_request(
#     "chat",
#     message="What are the latest developments in quantum computing?"
# )
# print(result)