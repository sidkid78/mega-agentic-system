from google import genai
from google.genai import types
import os
import threading
from contextvars import ContextVar
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
import json

def create_client() -> genai.Client:
    return genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))

DEFAULT_MODEL = "gemini-3.5-flash"
COMPLEX_MODEL = "gemini-3.1-pro-preview"
LITE_MODEL = "gemini-3.1-flash-lite"
EMBEDDING_MODEL = "gemini-embedding-001"

# ============================================================================
# TOKEN USAGE TRACKING
# ============================================================================
# A single, thread-safe accumulator plus a drop-in wrapper around
# generate_content. Route calls through `gemini_generate()` and every request's
# token usage is captured automatically, attributed to a label (feature name or
# task id) via a contextvar so callers don't have to thread it through manually.

# Attribution label for the current context (set per-task / per-request).
_usage_label: ContextVar[str] = ContextVar("_usage_label", default="uncategorized")


def set_usage_label(label: str):
    """Set the token-attribution label for gemini_generate() calls in this context.

    Returns the contextvars Token so callers may reset it if desired.
    """
    return _usage_label.set(label or "uncategorized")


def extract_usage(response: Any) -> Tuple[int, int, int, int, int]:
    """Pull (prompt, output, thoughts, cached, total) token counts from a response.

    Tolerates missing/None fields and older/newer response shapes.
    """
    um = getattr(response, "usage_metadata", None)
    if not um:
        return (0, 0, 0, 0, 0)
    prompt = getattr(um, "prompt_token_count", 0) or 0
    output = getattr(um, "candidates_token_count", 0) or 0
    thoughts = getattr(um, "thoughts_token_count", 0) or 0
    cached = getattr(um, "cached_content_token_count", 0) or 0
    total = getattr(um, "total_token_count", 0) or 0
    if not total:
        total = prompt + output + thoughts
    return (prompt, output, thoughts, cached, total)


@dataclass
class _UsageBucket:
    calls: int = 0
    prompt_tokens: int = 0
    output_tokens: int = 0
    thoughts_tokens: int = 0
    cached_tokens: int = 0
    total_tokens: int = 0

    def add(self, prompt: int, output: int, thoughts: int, cached: int, total: int) -> None:
        self.calls += 1
        self.prompt_tokens += prompt
        self.output_tokens += output
        self.thoughts_tokens += thoughts
        self.cached_tokens += cached
        self.total_tokens += total

    def to_dict(self) -> Dict[str, int]:
        return {
            "calls": self.calls,
            "prompt_tokens": self.prompt_tokens,
            "output_tokens": self.output_tokens,
            "thoughts_tokens": self.thoughts_tokens,
            "cached_tokens": self.cached_tokens,
            "total_tokens": self.total_tokens,
        }


class TokenUsageTracker:
    """Thread-safe accumulator of Gemini token usage, broken down by model and label."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._total = _UsageBucket()
        self._by_model: Dict[str, _UsageBucket] = {}
        self._by_label: Dict[str, _UsageBucket] = {}

    def record(self, model: str, response: Any, label: Optional[str] = None) -> Dict[str, int]:
        """Record one response's usage. Returns this call's {prompt,output,total} tokens."""
        prompt, output, thoughts, cached, total = extract_usage(response)
        label = label or _usage_label.get()
        with self._lock:
            self._total.add(prompt, output, thoughts, cached, total)
            self._by_model.setdefault(model, _UsageBucket()).add(prompt, output, thoughts, cached, total)
            self._by_label.setdefault(label, _UsageBucket()).add(prompt, output, thoughts, cached, total)
        return {"prompt_tokens": prompt, "output_tokens": output, "total_tokens": total}

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "total": self._total.to_dict(),
                "by_model": {k: v.to_dict() for k, v in self._by_model.items()},
                "by_label": {k: v.to_dict() for k, v in self._by_label.items()},
            }

    def reset(self) -> None:
        with self._lock:
            self._total = _UsageBucket()
            self._by_model = {}
            self._by_label = {}


# Module-level singleton — import this everywhere usage should be aggregated.
usage_tracker = TokenUsageTracker()


def gemini_generate(
    client: genai.Client,
    model: str,
    contents: Any,
    config: Any = None,
    *,
    label: Optional[str] = None,
):
    """Drop-in wrapper around client.models.generate_content that records token usage.

    Usage tracking never raises into the caller — a failure to record is swallowed.
    """
    response = client.models.generate_content(model=model, contents=contents, config=config)
    try:
        usage_tracker.record(model, response, label=label)
    except Exception:
        pass
    return response


def count_tokens(client: genai.Client, model: str, contents: Any) -> int:
    """Best-effort pre-flight token count for `contents` (0 on any error)."""
    try:
        resp = client.models.count_tokens(model=model, contents=contents)
        return getattr(resp, "total_tokens", 0) or 0
    except Exception:
        return 0

# ============ RESEARCH & KNOWLEDGE TOOLS============

def search_arxiv(query: str, max_results: int = 5) -> str:
    """Search Arxiv for academic papers"""
    import arxiv
    client = arxiv.Client()
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance
    )
    results = []
    for paper in client.results(search):
        results.append({
            'title': paper.title,
            'authors': [a.name for a in paper.authors],
            'summary': paper.summary,
            'url': paper.pdf_url,
            'published': paper.published.strftime('%Y-%m-%d') if paper.published else '',
            'arxiv_id': paper.entry_id.split('/')[-1],
            'categories': paper.categories,
        })
    return json.dumps(results)

def search_pubmed(query: str, max_results: int = 5) -> str:
    """Search PubMed for medical papers and return full article details"""
    from Bio import Entrez
    Entrez.email = "sidkid78@gmail.com"

    # Step 1: search for matching IDs
    search_handle = Entrez.esearch(db="pubmed", term=query, retmax=max_results, sort="relevance")
    search_record = Entrez.read(search_handle)
    search_handle.close()
    ids = search_record.get("IdList", [])
    if not ids:
        return json.dumps([])

    # Step 2: fetch full records for those IDs
    fetch_handle = Entrez.efetch(db="pubmed", id=",".join(ids), rettype="xml", retmode="xml")
    articles_raw = Entrez.read(fetch_handle)
    fetch_handle.close()

    results = []
    for article in articles_raw.get("PubmedArticle", []):
        try:
            medline = article["MedlineCitation"]
            art = medline["Article"]

            # Title
            title = str(art.get("ArticleTitle", ""))

            # Authors
            authors = []
            for a in art.get("AuthorList", []):
                last = str(a.get("LastName", ""))
                fore = str(a.get("ForeName", ""))
                if last:
                    authors.append(f"{fore} {last}".strip())

            # Abstract
            abstract_obj = art.get("Abstract", {})
            abstract_texts = abstract_obj.get("AbstractText", [])
            if isinstance(abstract_texts, list):
                abstract = " ".join(str(t) for t in abstract_texts)
            else:
                abstract = str(abstract_texts)

            # Journal & year
            journal = str(art.get("Journal", {}).get("Title", ""))
            pub_date = art.get("Journal", {}).get("JournalIssue", {}).get("PubDate", {})
            year = str(pub_date.get("Year", pub_date.get("MedlineDate", "")))

            # PMID & DOI
            pmid = str(medline.get("PMID", ""))
            doi = ""
            for id_obj in art.get("ELocationID", []):
                if str(id_obj.attributes.get("EIdType", "")) == "doi":
                    doi = str(id_obj)
                    break

            results.append({
                "pmid": pmid,
                "title": title,
                "authors": authors,
                "abstract": abstract,
                "journal": journal,
                "year": year,
                "doi": doi,
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "doi_url": f"https://doi.org/{doi}" if doi else "",
            })
        except Exception:
            # Skip malformed records gracefully
            continue

    return json.dumps(results)



# Use with Gemini function calling
if __name__ == "__main__":
    client = create_client()
    try:
        response = client.models.generate_content(
            model=DEFAULT_MODEL,
            contents="Find recent papers about transformer architectures",
            config=types.GenerateContentConfig(
                tools=[search_arxiv, search_pubmed]
            )
        )
    finally:
        try:
            client.close()
        except Exception:
            pass

# ============== Wkipedia & Web Search Tools=============

def search_wikipedia(query: str) -> str:
    """Search Wikipedia and return article content"""
    import wikipedia
    try:
        page = wikipedia.page(query, auto_suggest=True)
        return json.dumps({
            'title': page.title,
            'summary': page.summary,
            'url': page.url,
            'content': page.content[:3000],
        })
    except wikipedia.DisambiguationError as e:
        # Try the first suggested option
        try:
            page = wikipedia.page(e.options[0], auto_suggest=False)
            return json.dumps({
                'title': page.title,
                'summary': page.summary,
                'url': page.url,
                'content': page.content[:3000],
                'disambiguation_note': f'Showing result for "{e.options[0]}" (disambiguated from "{query}")',
            })
        except Exception:
            return json.dumps({'error': f'Ambiguous query. Options: {", ".join(e.options[:5])}'})
    except wikipedia.PageError:
        # Try a search and return the best match
        try:
            suggestions = wikipedia.search(query, results=1)
            if suggestions:
                page = wikipedia.page(suggestions[0], auto_suggest=False)
                return json.dumps({
                    'title': page.title,
                    'summary': page.summary,
                    'url': page.url,
                    'content': page.content[:3000],
                })
        except Exception:
            pass
        return json.dumps({'error': f'No Wikipedia article found for "{query}"'})
    except Exception as e:
        return json.dumps({'error': str(e)})

def generate_music(
    prompt: str,
    model: str = "lyria-3-clip-preview",
    output_format: str = "mp3",
    images: list[dict] | None = None,
    client=None,
) -> dict:
    """
    Generate music with Lyria 3 using the Gemini API.
    Returns base64-encoded audio, MIME type, and any lyrics/structure text.
    Models:
      lyria-3-clip-preview  — always 30 seconds, MP3 only
      lyria-3-pro-preview   — full-length song (~2 min), MP3 or WAV
    Optional `images` (Pro model): up to 10 inspiration images, each a dict with
    `data` (base64 string) and `mime_type` (e.g. "image/jpeg").
    """
    import base64

    client = client or create_client()
    try:
        config_kwargs: dict = {}
        mime_type = "audio/mpeg"

        if model == "lyria-3-pro-preview" and output_format == "wav":
            config_kwargs = dict(
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO", "TEXT"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                        )
                    ),
                )
            )
            mime_type = "audio/wav"  # May be overridden by part.inline_data.mime_type

        # Build multimodal contents: text prompt plus up to 10 inspiration images.
        if images:
            parts: list[types.Part] = [types.Part(text=prompt)]
            for img in images[:10]:
                raw = img.get("data") or ""
                # Tolerate a data: URI prefix if the caller forgot to strip it.
                if "," in raw and raw.strip().startswith("data:"):
                    raw = raw.split(",", 1)[1]
                try:
                    img_bytes = base64.b64decode(raw)
                except Exception:
                    continue
                parts.append(
                    types.Part(
                        inline_data=types.Blob(
                            data=img_bytes,
                            mime_type=img.get("mime_type", "image/jpeg"),
                        )
                    )
                )
            contents: Any = [types.Content(role="user", parts=parts)]
        else:
            contents = prompt

        response = gemini_generate(
            client,
            model,
            contents,
            config_kwargs.get("config"),
            label="music",
        )

        audio_b64: str | None = None
        lyrics_parts: list[str] = []

        for part in response.parts:
            if part.text is not None:
                lyrics_parts.append(part.text)
            elif part.inline_data is not None:
                audio_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                # Trust declared MIME type from the part if available
                if part.inline_data.mime_type:
                    mime_type = part.inline_data.mime_type

        return {
            "audio_base64": audio_b64,
            "mime_type": mime_type,
            "lyrics": "\n\n".join(lyrics_parts),
            "model_used": model,
        }
    finally:
        try:
            client.close()
        except Exception:
            pass


def research_with_grounding(query: str, client=None) -> dict:
    """Use Google Search Grounding for up-to-date information"""
    client = client or create_client()
    try:
        response = gemini_generate(
            client,
            DEFAULT_MODEL,
            query,
            types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            ),
            label="research_grounded",
        )

        # Extract grounding metadata if available
        sources = []
        search_queries = []
        try:
            grounding_meta = response.candidates[0].grounding_metadata
            if grounding_meta:
                for chunk in (grounding_meta.grounding_chunks or []):
                    if chunk.web:
                        sources.append({
                            'title': chunk.web.title or '',
                            'url': chunk.web.uri or '',
                        })
                for sq in (grounding_meta.web_search_queries or []):
                    search_queries.append(sq)
        except Exception:
            pass

        return {
            'answer': response.text,
            'search_queries': search_queries,
            'sources': sources,
        }
    finally:
        try:
            client.close()
        except Exception:
            pass
