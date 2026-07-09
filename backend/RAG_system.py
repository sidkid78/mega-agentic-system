"""
RAG Knowledge Base — powered by gemini-embedding-2
- Multimodal embedding model (text, images, PDFs) — 8 192 token limit
- Proper task-prefix formatting for retrieval asymmetry
- Document chunking with configurable size + overlap
- Rich metadata: id, title, source, chunk index, timestamp
- Returns similarity scores alongside retrieved chunks
- PDF ingestion via Files API (Gemini natively reads the visual content)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from google import genai
from google.genai import types

from main import DEFAULT_MODEL, create_client, gemini_generate

# ── Model choices ────────────────────────────────────────────────────────────
EMBEDDING_MODEL_V2  = "gemini-embedding-2"   # multimodal, 8 192 tokens, April 2026
EMBEDDING_MODEL_V1  = "gemini-embedding-001" # text-only, 2 048 tokens

# For gemini-embedding-2, use prompt prefixes (task_type param is NOT supported)
def _doc_prefix(title: str, text: str) -> str:
    safe_title = title if title else "none"
    return f"title: {safe_title} | text: {text}"

def _query_prefix(query: str) -> str:
    return f"task: search result | query: {query}"


# ── Document record ───────────────────────────────────────────────────────────
@dataclass
class RAGDocument:
    text:        str
    title:       str = ""
    source:      str = ""
    chunk_index: int = 0
    id:          str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    added_at:    str = field(default_factory=lambda: datetime.utcnow().isoformat())


# ── Chunking helper ───────────────────────────────────────────────────────────
def _chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks by word boundary."""
    words = text.split()
    if not words:
        return []
    chunks: List[str] = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += chunk_size - overlap
    return chunks


# ── Main class ────────────────────────────────────────────────────────────────
class RAGSystem:
    def __init__(
        self,
        client: genai.Client,
        embedding_model: str = EMBEDDING_MODEL_V2,
        chunk_size: int = 800,
        overlap: int = 150,
    ):
        self.client = client
        self.embedding_model = embedding_model
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.documents: List[RAGDocument] = []
        self.embeddings: List[List[float]] = []

    # ── Embedding helpers ─────────────────────────────────────────────────────

    def _embed_document(self, doc: RAGDocument) -> List[float]:
        """Embed a single document chunk with the right task prefix."""
        if self.embedding_model == EMBEDDING_MODEL_V2:
            text = _doc_prefix(doc.title, doc.text)
            result = self.client.models.embed_content(
                model=self.embedding_model,
                contents=text,
            )
        else:
            # gemini-embedding-001: use task_type parameter
            result = self.client.models.embed_content(
                model=self.embedding_model,
                contents=doc.text,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
            )
        return list(result.embeddings[0].values)

    def _embed_query(self, query: str) -> List[float]:
        """Embed a search query with the right task prefix."""
        if self.embedding_model == EMBEDDING_MODEL_V2:
            text = _query_prefix(query)
            result = self.client.models.embed_content(
                model=self.embedding_model,
                contents=text,
            )
        else:
            result = self.client.models.embed_content(
                model=self.embedding_model,
                contents=query,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
            )
        return list(result.embeddings[0].values)

    # ── Public API ────────────────────────────────────────────────────────────

    def add_documents(
        self,
        texts: List[str],
        titles: Optional[List[str]] = None,
        sources: Optional[List[str]] = None,
    ) -> int:
        """
        Chunk and embed a list of text documents.
        Returns the number of chunks added.
        """
        added = 0
        for i, text in enumerate(texts):
            title  = (titles[i]  if titles  and i < len(titles)  else "") or ""
            source = (sources[i] if sources and i < len(sources) else "") or ""

            chunks = _chunk_text(text, self.chunk_size, self.overlap)
            if not chunks:
                continue

            for ci, chunk in enumerate(chunks):
                doc = RAGDocument(
                    text=chunk,
                    title=title,
                    source=source,
                    chunk_index=ci,
                )
                embedding = self._embed_document(doc)
                self.documents.append(doc)
                self.embeddings.append(embedding)
                added += 1

        return added

    def add_pdf(self, pdf_bytes: bytes, title: str = "", source: str = "") -> int:
        """
        Upload a PDF via the Files API, let Gemini extract its text content,
        then chunk + embed the extracted text.
        """
        import io

        # Upload to Files API
        uploaded = self.client.files.upload(
            file=io.BytesIO(pdf_bytes),
            config={"mime_type": "application/pdf"},
        )

        # Extract text using Gemini vision
        response = gemini_generate(self.client, label="rag",
            model=DEFAULT_MODEL,
            contents=[
                uploaded,
                "Extract all text content from this document. "
                "Preserve headings and paragraph structure. "
                "Return plain text only, no commentary.",
            ],
        )
        extracted_text = response.text or ""

        # Clean up uploaded file
        try:
            self.client.files.delete(name=uploaded.name)
        except Exception:
            pass

        if not extracted_text.strip():
            return 0

        return self.add_documents(
            [extracted_text],
            titles=[title or "PDF Document"],
            sources=[source],
        )

    def query(
        self, query: str, top_k: int = 5, min_score: float = 0.0
    ) -> List[dict]:
        """
        Retrieve top-k chunks matching the query.
        Returns list of { text, title, source, chunk_index, score, id }.
        """
        if not self.embeddings:
            return []

        q_emb = self._embed_query(query)
        scores = cosine_similarity([q_emb], self.embeddings)[0]

        # Get indices sorted by score descending
        ranked = np.argsort(scores)[::-1]

        results = []
        for idx in ranked:
            if len(results) >= top_k:
                break
            score = float(scores[idx])
            if score < min_score:
                break
            doc = self.documents[idx]
            results.append({
                "id":          doc.id,
                "text":        doc.text,
                "title":       doc.title,
                "source":      doc.source,
                "chunk_index": doc.chunk_index,
                "score":       round(score, 4),
                "added_at":    doc.added_at,
            })

        return results

    def answer_question(self, question: str, top_k: int = 5) -> dict:
        """
        Full RAG pipeline: retrieve → generate grounded answer.
        Returns { answer, sources } where sources has title/snippet/score.
        """
        chunks = self.query(question, top_k=top_k)

        if not chunks:
            response = gemini_generate(self.client, label="rag",
                model=DEFAULT_MODEL,
                contents=question,
            )
            return {"answer": response.text, "sources": []}

        # Build context block
        context_parts = []
        for ci, c in enumerate(chunks, 1):
            label = f"[{ci}] {c['title']}" if c["title"] else f"[{ci}]"
            context_parts.append(f"{label}\n{c['text']}")
        context = "\n\n---\n\n".join(context_parts)

        prompt = (
            f"You are a helpful assistant. Answer the question using ONLY the "
            f"provided document excerpts. Cite sources using [1], [2], etc. "
            f"If the answer is not in the documents, say so clearly.\n\n"
            f"Documents:\n{context}\n\n"
            f"Question: {question}\n\nAnswer:"
        )

        response = gemini_generate(self.client, label="rag",
            model=DEFAULT_MODEL,
            contents=prompt,
        )

        sources = [
            {
                "index": i + 1,
                "title": c["title"] or "(untitled)",
                "source": c["source"],
                "score":  c["score"],
                "snippet": c["text"][:200] + ("…" if len(c["text"]) > 200 else ""),
            }
            for i, c in enumerate(chunks)
        ]

        return {"answer": response.text, "sources": sources}

    def stats(self) -> dict:
        titles = {d.title for d in self.documents if d.title}
        return {
            "document_count": len(self.documents),
            "unique_sources": len(titles),
            "embedding_model": self.embedding_model,
            "chunk_size": self.chunk_size,
            "overlap": self.overlap,
        }


# ── Standalone smoke test ─────────────────────────────────────────────────────
if __name__ == "__main__":
    client = create_client()
    rag = RAGSystem(client=client)
    rag.add_documents(
        ["Gemini is Google's most capable multimodal AI model family."],
        titles=["Gemini overview"],
        sources=["google.com"],
    )
    result = rag.answer_question("What is Gemini?")
    print(result["answer"])
