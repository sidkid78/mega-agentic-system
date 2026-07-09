from google import genai
from google.genai import types
from main import search_arxiv, search_wikipedia, search_pubmed, DEFAULT_MODEL, create_client, research_with_grounding
from typing import List, Dict

class ResearchAssistant:
    def __init__(self, client: genai.Client):
        self.client = client 
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