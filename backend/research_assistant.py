from google import genai
from google.genai import types
from main import (
    search_arxiv, search_wikipedia, search_pubmed, DEFAULT_MODEL, create_client,
    research_with_grounding as _research_with_grounding,
)
from typing import List, Dict

class ResearchAssistant:
    def __init__(self, client: genai.Client):
        self.client = client

        # `research_with_grounding` has a `client=None` parameter that the SDK's
        # automatic function-calling schema generator can't serialize. Expose a
        # clean (query: str) wrapper and bind the BYOK client here (binding also
        # avoids the underlying `create_client()` env-key fallback).
        def research_with_grounding(query: str) -> dict:
            """Use Google Search grounding for up-to-date information."""
            return _research_with_grounding(query, client=client)

        self.chat = client.chats.create(
            model=DEFAULT_MODEL,
            config=types.GenerateContentConfig(
                system_instruction="""You are a research assistant with access to
                academic papers, web search, and knowledge bases. Help users with
                research tasks, code generation, and document creation""",
                tools=[search_arxiv, search_wikipedia, search_pubmed, research_with_grounding]
            )
        )
    
    def send_message(self, message: str) -> str:
        response = self.chat.send_message(message)
        return response.text 

    def get_history(self) -> List[Dict]:
        history = [] 
        for msg in self.chat.get_history():
            history.append({
                'role': msg.role,
                'content': msg.parts[0].text if msg.parts else ""
            })
        return history

# assistant = ResearchAssistant(client=create_client())
# print(assistant.send_message("Find papers about neural networks"))
# print(assistant.send_message("Summarize the top 3 results"))