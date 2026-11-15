"""
Speech generation (Text-to-Speech) using the Gemini TTS models.

Wraps Google's controllable TTS models, which can turn text into natural,
expressive speech for a single speaker or a multi-speaker conversation.

The 3.8 models speak the text verbatim. Sustained delivery (emotion, pace,
pitch) goes in `speech_metadata.style` per turn - here via a `style` argument,
"(style) text" lines, or "Name (style): text" for conversations - and a change
of delivery mid-line means a new turn. Inline angle-bracket tags are only for
momentary vocal events: <sigh>, <breath>, <laugh>, <gasp>, <cough>,
<short pause>, <long pause>. The legacy 3.1 preview still takes
natural-language direction inside the text ("Say cheerfully: ...").

Voices: the 30 classic prebuilt names, the Extended Voice Library (~1,000
catalog voices with ids like "en-gb-storyteller-1"), and custom voices made
with Voice design or Voice replication ("voice_..." ids). The library and
custom voices only work on the 3.8 models. `list_voices`, `design_voice`,
`replicate_voice`, `get_voice` and `delete_voice` wrap the Voices API
(client.voices, google-genai >= 2.25).

Output format depends on the model. The 3.1 preview returns raw 16-bit
PCM at 24 kHz mono, which we wrap in a WAV container so a browser <audio>
element can play it. The 3.8 models already return a complete WAV, so wrapping
again would produce a file with two RIFF headers - `_audio_to_wav_base64`
checks the payload rather than assuming.

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
"""

import base64
import io
import re
import time
import wave
from typing import List, Dict, Optional

from google import genai
from google.genai import types

try:
    from google.genai.errors import ServerError
except ImportError:  # pragma: no cover - fallback if error types unavailable
    ServerError = Exception

from main import create_client, gemini_generate

# Per the docs, a TTS session has a 32k-token context window, and quality drifts
# on outputs longer than a few minutes — split long transcripts into chunks.
# 32k tokens is roughly ~120k characters; we guard well under that to fail fast
# with a clear message instead of an opaque API error.
MAX_PROMPT_CHARS = 100_000


def _generate_with_retry(client: genai.Client, *, model: str, contents: str, config, retries: int = 3):
    """Call generate_content, retrying on the transient 500s the TTS models occasionally throw."""
    delay = 1.0
    for attempt in range(retries):
        try:
            return gemini_generate(client, model=model, contents=contents, config=config, label="speech")
        except ServerError:
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2


# ── Models ──────────────────────────────────────────────────────────────────
# gemini-2.5-flash/pro-preview-tts shut down on 2026-11-17, so they were removed.
# gemini-3.1-flash-tts-preview has no shutdown date yet, but Google names
# 3.8 Flash-Lite TTS as its replacement, so it is kept only as deprecated.
TTS_MODELS = [
    "gemini-3.8-flash-tts",           # newest, default, highest fidelity
    "gemini-3.8-flash-lite-tts",      # fastest, cheapest
    "gemini-3.1-flash-tts-preview",   # deprecated preview
]
DEPRECATED_TTS_MODELS = {"gemini-3.1-flash-tts-preview"}
DEFAULT_TTS_MODEL = "gemini-3.8-flash-tts"

# 3.8 treats input as a verbatim transcript and takes structured per-turn
# speaker/style annotations through the Interactions API. The legacy previews
# take one conversation blob through generate_content.
INTERACTIONS_TTS_MODELS = {
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
}

# Streaming is supported from TTS 3.1 onward, and goes through the
# Interactions API rather than generate_content.
STREAMING_MODELS = {
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
    "gemini-3.1-flash-tts-preview",
}

# Every listed model supports two speakers. The 3.8 models need each turn as a
# separate text item carrying `speech_metadata.speaker` (google-genai >= 2.25),
# so `generate_multi_speaker_speech` splits the "Name: line" transcript into
# turns for them; the legacy previews still get the blob as-is.
MULTI_SPEAKER_MODELS = list(TTS_MODELS)
DEFAULT_MULTI_SPEAKER_MODEL = "gemini-3.8-flash-tts"
MAX_SPEAKERS = 2

# ── Voices ──────────────────────────────────────────────────────────────────
# 30 prebuilt voices, each with a short characteristic descriptor.
VOICES: Dict[str, str] = {
    "Zephyr": "Bright",
    "Puck": "Upbeat",
    "Charon": "Informative",
    "Kore": "Firm",
    "Fenrir": "Excitable",
    "Leda": "Youthful",
    "Orus": "Firm",
    "Aoede": "Breezy",
    "Callirrhoe": "Easy-going",
    "Autonoe": "Bright",
    "Enceladus": "Breathy",
    "Iapetus": "Clear",
    "Umbriel": "Easy-going",
    "Algieba": "Smooth",
    "Despina": "Smooth",
    "Erinome": "Clear",
    "Algenib": "Gravelly",
    "Rasalgethi": "Informative",
    "Laomedeia": "Upbeat",
    "Achernar": "Soft",
    "Alnilam": "Firm",
    "Schedar": "Even",
    "Gacrux": "Mature",
    "Pulcherrima": "Forward",
    "Achird": "Friendly",
    "Zubenelgenubi": "Casual",
    "Vindemiatrix": "Gentle",
    "Sadachbia": "Lively",
    "Sadaltager": "Knowledgeable",
    "Sulafat": "Warm",
}
DEFAULT_VOICE = "Kore"

# Sample format the TTS models emit.
_SAMPLE_RATE = 24000
_CHANNELS = 1
_SAMPLE_WIDTH = 2  # 16-bit


def _pcm_to_wav_base64(pcm_bytes: bytes) -> str:
    """Wrap raw 16-bit/24 kHz/mono PCM into a WAV container and base64-encode it."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(_CHANNELS)
        wf.setsampwidth(_SAMPLE_WIDTH)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm_bytes)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _audio_to_wav_base64(data: bytes, mime_type: str = "") -> str:
    """Return playable WAV base64 from whatever the model handed back.

    3.1 returns raw PCM (audio/l16); 3.8 returns a finished WAV. Wrapping
    a WAV again yields a RIFF header inside a RIFF header, which plays as noise
    or not at all, so detect rather than assume. The magic bytes are checked
    first because the declared MIME type has varied in spelling
    ("audio/L16;codec=pcm;rate=24000" vs "audio/l16; rate=24000; channels=1").
    """
    if data[:4] == b"RIFF" or "wav" in (mime_type or "").lower():
        return base64.b64encode(data).decode("utf-8")
    return _pcm_to_wav_base64(data)


def _extract_audio(response) -> tuple[bytes, str]:
    """Pull the inline audio bytes and their MIME type from a response."""
    for candidate in response.candidates or []:
        content = candidate.content
        if not content:
            continue
        for part in content.parts or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data, (part.inline_data.mime_type or "")
    raise ValueError("No audio data returned by the TTS model")


def _extract_pcm(response) -> bytes:
    """Backwards-compatible shim; prefer _extract_audio."""
    return _extract_audio(response)[0]


def _is_custom_voice(voice: str) -> bool:
    """Voice design / replication IDs, usable on the 3.8 models only."""
    return voice.startswith(("voice_", "voicekey_"))


_VOICE_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")


def _check_voice(voice: str, model: str) -> None:
    """The 30 classic names work everywhere. Anything else - an Extended Voice
    Library id ("en-gb-storyteller-1") or a custom voice_/voicekey_ id - needs
    a 3.8 model; the API itself says whether the id exists."""
    if voice in VOICES:
        return
    if not voice or not _VOICE_ID_RE.match(voice):
        raise ValueError(f"'{voice}' is not a valid voice id.")
    if model in INTERACTIONS_TTS_MODELS:
        return
    raise ValueError(
        f"'{voice}' is a library or custom voice, which needs a 3.8 TTS model; "
        f"{model} only takes the 30 prebuilt voices ({', '.join(VOICES)})."
    )


_STYLED_LINE_RE = re.compile(r"^\s*\(([^)]*)\)\s*(.*)$")


def parse_styled_turns(prompt: str, style: Optional[str] = None) -> List[Dict[str, str]]:
    """Split a single-speaker script into turns for the 3.8 TTS models.

    3.8 speaks `text` verbatim, so sustained delivery belongs in
    speech_metadata.style and a change of delivery needs a new turn. A line
    starting with "(style)" opens a new turn with that style; other lines join
    the current turn (a blank line also starts a new one). `style` is the
    default for turns without their own. Inline tags such as <sigh> or
    <short pause> stay in the text, where 3.8 expects them.

        (cold, measured) Be it so. <short pause>
        (bitter, sharp) Whom reason hath equalled...
    """
    turns: List[Dict[str, str]] = []
    current: Optional[Dict[str, str]] = None
    for line in prompt.splitlines():
        if not line.strip():
            current = None
            continue
        match = _STYLED_LINE_RE.match(line)
        if match:
            current = {"text": match.group(2).strip(), "style": match.group(1).strip()}
            turns.append(current)
        elif current is None:
            current = {"text": line.strip(), "style": (style or "").strip()}
            turns.append(current)
        else:
            current["text"] = f"{current['text']} {line.strip()}".strip()
    turns = [t for t in turns if t["text"]]
    if not turns:
        raise ValueError("Nothing to speak: the prompt has no text.")
    return turns


def _turns_input(turns: List[Dict[str, str]]) -> list:
    """Interactions `input` for a list of {"text", "style"?, "speaker"?} turns."""
    content = []
    for turn in turns:
        annotation = {"type": "speech_metadata"}
        if turn.get("speaker"):
            annotation["speaker"] = turn["speaker"]
        if turn.get("style"):
            annotation["style"] = turn["style"]
        item = {"type": "text", "text": turn["text"]}
        if len(annotation) > 1:
            item["annotations"] = [annotation]
        content.append(item)
    return [{"type": "user_input", "content": content}]


def _interaction_audio(interaction) -> tuple[bytes, str]:
    audio = getattr(interaction, "output_audio", None)
    if audio is None or not getattr(audio, "data", None):
        raise ValueError("No audio data returned by the TTS model")
    data = audio.data
    raw = base64.b64decode(data) if isinstance(data, str) else data
    return raw, getattr(audio, "mime_type", "") or ""


def generate_speech(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    model: str = DEFAULT_TTS_MODEL,
    language: Optional[str] = None,
    client: Optional[genai.Client] = None,
    style: Optional[str] = None,
) -> dict:
    """
    Generate single-speaker speech from text.

    Args:
        prompt: Text to speak. On the 3.8 models it is spoken verbatim: put
            delivery in `style` or in "(style) text" lines (see
            `parse_styled_turns`), and use inline tags only for momentary
            sounds and pauses (<sigh>, <breath>, <laugh>, <short pause>,
            <long pause>). Legacy models take natural-language direction in
            the text itself ("Say cheerfully: ...").
        voice: A prebuilt voice from VOICES, or on 3.8 an Extended Voice
            Library id or a Voice design / replication ID (voice_..., voicekey_...).
        model: A TTS model id from TTS_MODELS.
        language: Optional BCP-47 code (e.g. "fr-FR"). The models detect the
            input language on their own, so this is only needed to force one.
        client: Optional existing genai client (created if not provided).
        style: Default delivery for the whole prompt, e.g. "cold and
            commanding, speaking slowly". Per-line "(style)" overrides it.

    Returns:
        dict with audio_base64 (WAV), mime_type, voice, model_used, and turns
        (the parsed turn count; 3.8 only).
    """
    _check_voice(voice, model)
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} chars). TTS has a 32k-token context window; "
            "split long transcripts into smaller chunks."
        )

    turns = parse_styled_turns(prompt, style) if model in INTERACTIONS_TTS_MODELS else None

    own_client = client is None
    client = client or create_client()
    try:
        if turns is not None:
            speech: Dict[str, str] = {"voice": voice}
            if language:
                speech["language"] = language
            interaction = _interactions_with_retry(
                client,
                model=model,
                input=_turns_input(turns),
                response_format={"type": "audio"},
                generation_config={"speech_config": [speech]},
            )
            raw, mime = _interaction_audio(interaction)
        else:
            text = f"Say {style.strip()}: {prompt}" if style and style.strip() else prompt
            response = _generate_with_retry(
                client,
                model=model,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice
                            )
                        ),
                        **({"language_code": language} if language else {}),
                    ),
                ),
            )
            raw, mime = _extract_audio(response)
        result = {
            "audio_base64": _audio_to_wav_base64(raw, mime),
            "mime_type": "audio/wav",
            "voice": voice,
            "language": language,
            "model_used": model,
        }
        if turns is not None:
            result["turns"] = len(turns)
        return result
    finally:
        if own_client:
            try:
                client.close()
            except Exception:
                pass


_TURN_RE = re.compile(r"^\s*([^:()\n]{1,60}?)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$")


def parse_dialogue_turns(prompt: str, speaker_names: List[str]) -> List[Dict[str, str]]:
    """Split a "Name: line" transcript into turns for the 3.8 TTS models.

    3.8 reads every text item aloud verbatim, so the speaker prefix, any
    preamble ("TTS the following conversation...") and parenthetical
    directions must come out of the text:

        Joe (cheerfully): How's it going?   -> speaker Joe, style "cheerfully"
        Jane: Not bad.                      -> speaker Jane
        <unprefixed line>                   -> appended to the previous turn

    Only names in `speaker_names` (case-insensitive) start a turn, so a colon
    inside a line ("Note: ...") isn't mistaken for a speaker. Lines before the
    first turn are treated as preamble and dropped.
    """
    by_lower = {n.lower(): n for n in speaker_names}
    turns: List[Dict[str, str]] = []
    for line in prompt.splitlines():
        if not line.strip():
            continue
        match = _TURN_RE.match(line)
        name = by_lower.get(match.group(1).strip().lower()) if match else None
        if name:
            turn = {"speaker": name, "text": match.group(3).strip()}
            style = (match.group(2) or "").strip()
            if style:
                turn["style"] = style
            turns.append(turn)
        elif turns:
            turns[-1]["text"] = f"{turns[-1]['text']} {line.strip()}".strip()
    turns = [t for t in turns if t["text"]]
    if not turns:
        raise ValueError(
            "No dialogue turns found. Write one line per turn as 'Name: text', using "
            f"the configured speaker names ({', '.join(speaker_names)})."
        )
    return turns


def _interactions_with_retry(client: genai.Client, retries: int = 3, **kwargs):
    """interactions.create, retrying on the transient 500s the TTS models occasionally throw."""
    delay = 1.0
    for attempt in range(retries):
        try:
            return client.interactions.create(**kwargs)
        except ServerError:
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2


def generate_multi_speaker_speech(
    prompt: str,
    speakers: List[Dict[str, str]],
    model: str = DEFAULT_MULTI_SPEAKER_MODEL,
    client: Optional[genai.Client] = None,
) -> dict:
    """
    Generate multi-speaker (conversational) speech.

    Up to two speakers are supported. Write one line per turn, prefixed with
    the speaker's name and optionally a parenthetical direction:

        Joe (cheerfully): How's it going today Jane?
        Jane: Not too bad, how about you?

    On the 3.8 models the transcript is split into per-speaker turns (see
    `parse_dialogue_turns`) and sent through the Interactions API with
    `speech_metadata` annotations. The legacy previews receive the prompt as
    one blob via generate_content.

    Args:
        prompt: Conversation text, one "Name: line" per turn.
        speakers: List of {"speaker": <name>, "voice": <voice>} mappings. The
            speaker names must match the names used in the prompt.
        model: A TTS model id from MULTI_SPEAKER_MODELS.
        client: Optional existing genai client (created if not provided).

    Returns:
        dict with audio_base64 (WAV), mime_type, speakers, model_used, and
        turns (the parsed turn count; 3.8 only).
    """
    if not 1 <= len(speakers) <= MAX_SPEAKERS:
        raise ValueError(f"Multi-speaker TTS supports 1 or {MAX_SPEAKERS} speakers")
    if model not in MULTI_SPEAKER_MODELS:
        raise ValueError(
            f"{model} does not support multi-speaker TTS. "
            f"Use one of: {', '.join(MULTI_SPEAKER_MODELS)}."
        )
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} chars). TTS has a 32k-token context window; "
            "split long transcripts into smaller chunks."
        )

    cleaned: List[Dict[str, str]] = []
    for entry in speakers:
        name = entry.get("speaker", "").strip()
        voice = entry.get("voice", "").strip()
        if not name:
            raise ValueError("Each speaker requires a 'speaker' name")
        try:
            _check_voice(voice, model)
        except ValueError as exc:
            raise ValueError(f"Speaker '{name}': {exc}") from None
        cleaned.append({"speaker": name, "voice": voice})

    turns: Optional[List[Dict[str, str]]] = None
    if model in INTERACTIONS_TTS_MODELS:
        # Parse before touching the network so a malformed transcript is a 400.
        turns = parse_dialogue_turns(prompt, [s["speaker"] for s in cleaned])

    own_client = client is None
    client = client or create_client()
    try:
        if turns is not None:
            interaction = _interactions_with_retry(
                client,
                model=model,
                input=_turns_input(turns),
                response_format={"type": "audio"},
                generation_config={"speech_config": {"speakers": cleaned}},
            )
            raw, mime = _interaction_audio(interaction)
        else:
            response = _generate_with_retry(
                client,
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                            speaker_voice_configs=[
                                types.SpeakerVoiceConfig(
                                    speaker=s["speaker"],
                                    voice_config=types.VoiceConfig(
                                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                            voice_name=s["voice"]
                                        )
                                    ),
                                )
                                for s in cleaned
                            ]
                        )
                    ),
                ),
            )
            raw, mime = _extract_audio(response)
        result = {
            "audio_base64": _audio_to_wav_base64(raw, mime),
            "mime_type": "audio/wav",
            "speakers": speakers,
            "model_used": model,
        }
        if turns is not None:
            result["turns"] = len(turns)
        return result
    finally:
        if own_client:
            try:
                client.close()
            except Exception:
                pass


def stream_speech(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    model: str = DEFAULT_TTS_MODEL,
    language: Optional[str] = None,
    client: Optional[genai.Client] = None,
    style: Optional[str] = None,
):
    """Yield speech audio chunks as the model produces them.

    Streaming runs through the Interactions API, not generate_content; every
    listed model supports it. On 3.8 the prompt is split into styled
    turns exactly as in `generate_speech`.

    Yields dicts, so the caller can serialise them without knowing the SDK:
      {"type": "audio",  "data": <base64 PCM chunk>, "index": n}
      {"type": "done",   "chunks": n, "bytes": n}
      {"type": "error",  "message": str}

    The chunks are raw PCM fragments of one continuous stream, not standalone
    WAV files - a header per chunk would make them unplayable as a sequence.
    The caller concatenates them and wraps the result once (`pcm_chunks_to_wav`).
    """
    _check_voice(voice, model)
    if model not in STREAMING_MODELS:
        raise ValueError(
            f"{model} does not support streaming. Use one of: "
            f"{', '.join(sorted(STREAMING_MODELS))}."
        )
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} chars). TTS has a 32k-token context window; "
            "split long transcripts into smaller chunks."
        )
    if client is None:
        raise ValueError("A Gemini client is required (BYOK).")

    speech: Dict[str, str] = {"voice": voice}
    if language:
        speech["language"] = language

    if model in INTERACTIONS_TTS_MODELS:
        stream_input = _turns_input(parse_styled_turns(prompt, style))
    else:
        stream_input = f"Say {style.strip()}: {prompt}" if style and style.strip() else prompt

    chunks = 0
    total = 0
    try:
        stream = client.interactions.create(
            model=model,
            input=stream_input,
            response_format={"type": "audio"},
            generation_config={"speech_config": [speech]},
            stream=True,
        )
        for event in stream:
            if getattr(event, "event_type", None) != "step.delta":
                continue
            delta = getattr(event, "delta", None)
            if delta is None or getattr(delta, "type", None) != "audio":
                continue
            data = getattr(delta, "data", "") or ""
            if not data:
                continue
            chunks += 1
            total += len(base64.b64decode(data))
            yield {"type": "audio", "data": data, "index": chunks}
    except Exception as exc:
        yield {"type": "error", "message": str(exc)}
        return

    yield {"type": "done", "chunks": chunks, "bytes": total}


def pcm_chunks_to_wav(chunks: List[str]) -> str:
    """Join base64 PCM chunks from stream_speech into one playable WAV."""
    pcm = b"".join(base64.b64decode(c) for c in chunks if c)
    return _pcm_to_wav_base64(pcm)


# ── Voices API (Extended Voice Library, Voice design, Voice replication) ────
# Docs: /docs/speech-generation#voice-library, /docs/voice-design,
# /docs/voice-replication. Custom voices are stored in the caller's project and
# expire after a year without use; using one extends it.

VOICE_TYPES = ("prebuilt", "prompted", "replicated")

# The statement the speaker must read, word for word, in the consent recording.
CONSENT_PHRASE_EN = (
    "I am the owner of this voice and I consent to Google using this voice "
    "to create a synthetic voice model."
)

# Replication wants 10-30 s of clean speech (24 kHz mono 16-bit WAV is
# recommended); 30 s of that is ~1.4 MB, so 15 MB leaves room for other formats.
MAX_VOICE_AUDIO_BYTES = 15 * 1024 * 1024
VOICE_AUDIO_MIME_TYPES = {
    "audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3",
    "audio/flac", "audio/ogg", "audio/aac", "audio/mp4", "audio/webm",
}


def _b64(data) -> str:
    if data is None:
        return ""
    return data if isinstance(data, str) else base64.b64encode(data).decode("utf-8")


def _voice_to_dict(voice, include_sample: bool = False) -> dict:
    """Flatten an SDK Voice into JSON-friendly fields. The sample audio of a
    designed voice is megabytes of base64, so it is only included on request."""
    raw = voice.model_dump(exclude_none=True) if hasattr(voice, "model_dump") else dict(voice)
    sample = raw.pop("sample_audio", None)
    prompted = raw.pop("prompted", None) or {}
    raw.pop("replicated", None)
    raw.pop("usage", None)
    expire = raw.get("expire_time")
    if expire is not None and not isinstance(expire, str):
        raw["expire_time"] = expire.isoformat()
    model = raw.get("model")
    if isinstance(model, str) and model.startswith("models/"):
        raw["model"] = model[len("models/"):]
    if prompted.get("input"):
        raw["prompt"] = prompted["input"]
    pitch = raw.get("pitch")
    if pitch is not None and not isinstance(pitch, str):
        raw["pitch"] = str(getattr(pitch, "value", pitch))
    if include_sample and sample and sample.get("data"):
        raw["sample_audio_base64"] = _b64(sample["data"])
        raw["sample_mime_type"] = sample.get("mime_type") or "audio/wav"
    return raw


def list_voices(
    client: genai.Client,
    *,
    types: Optional[List[str]] = None,
    search: Optional[str] = None,
    gender: Optional[str] = None,
    language_code: Optional[str] = None,
    accent: Optional[str] = None,
    pitch: Optional[str] = None,
    page_size: int = 50,
    page_token: Optional[str] = None,
) -> dict:
    """One page of the Voices API: the caller's custom voices (newest first),
    then the Extended Voice Library. Filters are exact, case-insensitive
    matches except `search`, a substring match on name and description."""
    if types:
        bad = [t for t in types if t not in VOICE_TYPES]
        if bad:
            raise ValueError(f"Unknown voice type(s) {bad}; use {', '.join(VOICE_TYPES)}.")
    kwargs: Dict[str, object] = {"page_size": max(1, min(int(page_size), 1000))}
    if types:
        kwargs["type_"] = list(types)
    if search and search.strip():
        kwargs["search"] = search.strip()[:2048]
    if gender:
        kwargs["gender"] = [gender]
    if language_code:
        kwargs["language_code"] = [language_code]
    if accent:
        kwargs["accent"] = [accent]
    if pitch:
        kwargs["pitch"] = [pitch]
    if page_token:
        kwargs["page_token"] = page_token
    response = client.voices.list(**kwargs)
    return {
        "voices": [_voice_to_dict(v) for v in (response.voices or [])],
        "next_page_token": getattr(response, "next_page_token", None) or None,
    }


def list_custom_voices(client: genai.Client, limit: int = 1000) -> List[dict]:
    """Every designed and replicated voice in the project (paging through)."""
    voices: List[dict] = []
    token: Optional[str] = None
    while len(voices) < limit:
        page = list_voices(client, types=["prompted", "replicated"], page_size=1000, page_token=token)
        voices.extend(page["voices"])
        token = page["next_page_token"]
        if not token:
            break
    return voices[:limit]


def _check_custom_voice_id(voice_id: str) -> str:
    voice_id = (voice_id or "").strip()
    if not re.match(r"^voice_[A-Za-z0-9]{1,64}$", voice_id):
        raise ValueError("Expected a stored custom voice id like voice_abc123.")
    return voice_id


def get_voice(client: genai.Client, voice_id: str, include_sample: bool = True) -> dict:
    """A stored custom voice. Designed voices come with their sample audio."""
    voice = client.voices.get(id=_check_custom_voice_id(voice_id))
    return _voice_to_dict(voice, include_sample=include_sample)


def delete_voice(client: genai.Client, voice_id: str) -> None:
    client.voices.delete(id=_check_custom_voice_id(voice_id))


def design_voice(
    client: genai.Client,
    *,
    display_name: str,
    description: str,
    gender: Optional[str] = None,
    language_code: Optional[str] = None,
    model: Optional[str] = None,
) -> dict:
    """Create and store a voice from a text description (Voice design).

    The description should hold permanent traits only - age, gender, pitch,
    timbre, texture, accent, pacing - in a sentence or two. Situational
    emotion belongs in each turn's style. Returns the new voice with its
    `sample_audio_base64` preview so it can be auditioned immediately.
    """
    display_name = (display_name or "").strip()
    description = (description or "").strip()
    if not display_name:
        raise ValueError("Give the voice a name.")
    if not description:
        raise ValueError("Describe the voice.")
    if len(description) > 4000:
        raise ValueError("Keep the description under 4,000 characters; one or two specific sentences work best.")
    # Leave the model out by default: the API then uses its voice creation
    # model (3.8 Flash-Lite TTS rejects Voice design despite the docs), and
    # the voice still synthesizes on every 3.8 model.
    voice: Dict[str, object] = {
        "type": "prompted",
        "display_name": display_name[:200],
        "prompted": {"input": description},
    }
    if model:
        voice["model"] = model
    if gender:
        voice["gender"] = gender
    if language_code:
        voice["language_code"] = language_code
    created = client.voices.create(store=True, voice=voice)
    return _voice_to_dict(created, include_sample=True)


def _check_voice_audio(data: bytes, mime_type: str, label: str) -> str:
    if not data:
        raise ValueError(f"The {label} recording is empty.")
    if len(data) > MAX_VOICE_AUDIO_BYTES:
        raise ValueError(f"The {label} recording is over {MAX_VOICE_AUDIO_BYTES // (1024 * 1024)} MB.")
    mime = (mime_type or "").split(";")[0].strip().lower()
    if data[:4] == b"RIFF":
        mime = "audio/wav"
    if mime not in VOICE_AUDIO_MIME_TYPES:
        raise ValueError(f"The {label} recording must be audio (WAV recommended), not '{mime_type}'.")
    if mime in {"audio/x-wav", "audio/wave"}:
        mime = "audio/wav"
    if mime == "audio/mp3":
        mime = "audio/mpeg"
    return mime


def replicate_voice(
    client: genai.Client,
    *,
    display_name: str,
    source_audio: bytes,
    source_mime_type: str,
    consent_audio: bytes,
    consent_mime_type: str,
    model: Optional[str] = None,
) -> dict:
    """Create and store a copy of a real speaker's voice (Voice replication).

    Needs two recordings of the same adult speaker: 10-30 s of natural speech
    (`source_audio`) and the speaker reading CONSENT_PHRASE_EN (or the
    supported-language equivalent) as `consent_audio`. Google checks the
    consent recording against the source and rejects the request if they
    don't match.
    """
    display_name = (display_name or "").strip()
    if not display_name:
        raise ValueError("Give the voice a name.")
    source_mime = _check_voice_audio(source_audio, source_mime_type, "voice sample")
    consent_mime = _check_voice_audio(consent_audio, consent_mime_type, "consent")
    voice: Dict[str, object] = {
        "type": "replicated",
        "display_name": display_name[:200],
        "replicated": {
            "source_audio": {"mime_type": source_mime, "data": _b64(source_audio)},
            "consent_audio": {"mime_type": consent_mime, "data": _b64(consent_audio)},
        },
    }
    if model:
        voice["model"] = model
    created = client.voices.create(store=True, voice=voice)
    return _voice_to_dict(created)


# Usage examples
if __name__ == "__main__":
    import os

    # Single speaker
    single = generate_speech(
        "Have a wonderful day!",
        voice="Kore",
        style="cheerful and friendly",
    )
    with open("speech_single.wav", "wb") as f:
        f.write(base64.b64decode(single["audio_base64"]))
    print("✓ Saved speech_single.wav")

    # Multi-speaker
    convo = generate_multi_speaker_speech(
        prompt=(
            "Joe (cheerful and friendly): How's it going today Jane?\n"
            "Jane (calm and relaxed): Not too bad, how about you?"
        ),
        speakers=[
            {"speaker": "Joe", "voice": "Kore"},
            {"speaker": "Jane", "voice": "Puck"},
        ],
    )
    with open("speech_multi.wav", "wb") as f:
        f.write(base64.b64decode(convo["audio_base64"]))
    print("✓ Saved speech_multi.wav")
    print(os.path.abspath("speech_multi.wav"))