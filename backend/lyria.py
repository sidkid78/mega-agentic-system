"""
Lyria 3.5 music generation
==========================
Lyria 3.5 goes through the Interactions API, not generate_content, so it sits
here rather than in main.generate_music (which stays on generate_content for
the Lyria 3 models).

What this key actually serves, as of writing, differs from the published guide
and the code follows the measured behaviour:

  * The guide documents `lyria-3.5-clip-preview` (30s) and
    `lyria-3.5-pro-preview` (full song). Both 404 here. The only 3.5 model
    models.list reports is a single `lyria-3.5`.
  * That model produces full-length songs by default - roughly three minutes,
    about 4.2 MB of MP3 - so it behaves like the documented Pro, not Clip.
  * Duration is steerable from the prompt. A prompt whose timestamps stopped
    at 1:00 produced ~62 seconds instead of ~176.
  * `response_format={"type": "audio"}`, which the guide presents as the way
    to get WAV, still returned audio/mpeg. MP3 is what you get.

Lyrics come back in an undocumented shape that is not meant for display:

    [[A0]]
    [[B1]]
    [:] Walking through the neon glow,
    [:] City lights reflect below.

`[[X#]]` marks a song section and `[:]` prefixes a sung line. An instrumental
track returns section markers and no `[:]` lines at all, which is how you can
tell one apart. parse_song_structure turns that into sections with lines.
"""

import base64
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger("MegaAgenticSystem")

# The single 3.5 model this key serves. The documented clip/pro ids 404.
LYRIA_35_MODEL = "lyria-3.5"

# The guide's cap on inspiration images.
MAX_IMAGES = 10

# A section marker like [[A0]] or [[B12]].
_SECTION_RE = re.compile(r"^\[\[([A-Za-z])(\d+)\]\]$")
# A sung line: "[:] some words"
_LYRIC_RE = re.compile(r"^\[:\]\s?(.*)$")


def parse_song_structure(raw: str) -> Dict[str, Any]:
    """Turn Lyria's [[A0]] / [:] output into sections, lyrics and a flag.

    Returns {sections, lyrics, is_instrumental, raw}. `sections` is a list of
    {label, index, lines}; `lyrics` is just the sung lines joined, for anyone
    who wants the plain text.
    """
    sections: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    loose: List[str] = []

    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue

        section = _SECTION_RE.match(line)
        if section:
            current = {
                "label": section.group(1).upper(),
                "index": int(section.group(2)),
                "lines": [],
            }
            sections.append(current)
            continue

        lyric = _LYRIC_RE.match(line)
        text = lyric.group(1).strip() if lyric else line
        if not text:
            continue
        if current is None:
            loose.append(text)
        else:
            current["lines"].append(text)

    if loose:
        sections.insert(0, {"label": "-", "index": 0, "lines": loose})

    lyrics = "\n".join(l for s in sections for l in s["lines"])
    return {
        "sections": sections,
        "lyrics": lyrics,
        # Section markers with no sung lines means an instrumental track.
        "is_instrumental": not lyrics.strip(),
        "raw": raw or "",
    }


def _build_input(prompt: str, images: Optional[List[Dict[str, str]]]) -> Any:
    """A bare string for text-only, or the typed block list for multimodal."""
    if not images:
        return prompt

    blocks: List[Dict[str, str]] = [{"type": "text", "text": prompt}]
    for image in images[:MAX_IMAGES]:
        data = (image.get("data") or "").strip()
        if not data:
            continue
        # Tolerate a data: URI if the caller forgot to strip the prefix.
        if data.startswith("data:") and "," in data:
            data = data.split(",", 1)[1]
        blocks.append({
            "type": "image",
            "mime_type": image.get("mime_type") or "image/jpeg",
            "data": data,
        })
    return blocks


def generate_music_35(
    prompt: str,
    images: Optional[List[Dict[str, str]]] = None,
    client=None,
) -> Dict[str, Any]:
    """Generate a song with Lyria 3.5.

    Returns audio_base64, mime_type, the parsed structure, and the model used.
    Raises ValueError with a readable message when the safety filter blocks the
    prompt - that is common enough to deserve better than a 500.
    """
    if client is None:
        raise ValueError("A Gemini client is required (BYOK).")

    try:
        interaction = client.interactions.create(
            model=LYRIA_35_MODEL,
            input=_build_input(prompt, images),
        )
    except Exception as exc:
        message = str(exc)
        # Observed: the same benign prompt succeeded once and was blocked the
        # next call, so this is worth naming rather than surfacing as a 500.
        if "content_blocked" in message or "blocked" in message.lower():
            raise ValueError(
                "Lyria's safety filter blocked this prompt. It also rejects "
                "requests for a named artist's voice or copyrighted lyrics. "
                "Rewording usually works - results vary between calls."
            ) from exc
        raise

    audio = getattr(interaction, "output_audio", None)
    audio_b64 = getattr(audio, "data", None) if audio else None
    mime_type = (getattr(audio, "mime_type", None) if audio else None) or "audio/mpeg"

    raw_text = getattr(interaction, "output_text", None) or ""
    structure = parse_song_structure(raw_text)

    size_bytes = 0
    if audio_b64:
        try:
            size_bytes = len(base64.b64decode(audio_b64))
        except Exception:
            size_bytes = 0

    return {
        "audio_base64": audio_b64,
        "mime_type": mime_type,
        "bytes": size_bytes,
        "lyrics": structure["lyrics"],
        "sections": structure["sections"],
        "is_instrumental": structure["is_instrumental"],
        "raw_structure": structure["raw"],
        "model_used": LYRIA_35_MODEL,
        "images_used": min(len(images), MAX_IMAGES) if images else 0,
    }
