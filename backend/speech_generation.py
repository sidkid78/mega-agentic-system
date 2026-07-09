"""
Speech generation (Text-to-Speech) using the Gemini TTS models.

Wraps Google's controllable TTS models, which can turn text into natural,
expressive speech for a single speaker or a multi-speaker conversation. Style,
tone, pace and emotion are steered with natural language in the prompt
(e.g. "Say cheerfully:" or inline tags like [whispers], [excitedly], [laughs]).

The models return raw 16-bit PCM at 24 kHz mono. We wrap that into a WAV
container so the audio is directly playable in a browser <audio> element.

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
"""

import base64
import io
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
# All support single- and multi-speaker (up to 2 speakers) TTS.
TTS_MODELS = [
    "gemini-2.5-flash-preview-tts",   # fast, default
    "gemini-2.5-pro-preview-tts",     # highest quality
    "gemini-3.1-flash-tts-preview",   # newest preview
]
DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview"

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


def _extract_pcm(response) -> bytes:
    """Pull the inline audio bytes out of a generate_content response."""
    for candidate in response.candidates or []:
        content = candidate.content
        if not content:
            continue
        for part in content.parts or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data
    raise ValueError("No audio data returned by the TTS model")


def generate_speech(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    model: str = DEFAULT_TTS_MODEL,
    client: Optional[genai.Client] = None,
) -> dict:
    """
    Generate single-speaker speech from text.

    Args:
        prompt: Text to speak. May include style direction in natural language,
            e.g. "Say cheerfully: Have a wonderful day!" or inline tags such as
            "[whispers] this is a secret".
        voice: One of the prebuilt voice names in VOICES.
        model: A TTS model id from TTS_MODELS.
        client: Optional existing genai client (created if not provided).

    Returns:
        dict with audio_base64 (WAV), mime_type, voice, model_used.
    """
    if voice not in VOICES:
        raise ValueError(f"Unknown voice '{voice}'. Valid voices: {', '.join(VOICES)}")
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} chars). TTS has a 32k-token context window; "
            "split long transcripts into smaller chunks."
        )

    own_client = client is None
    client = client or create_client()
    try:
        response = _generate_with_retry(
            client,
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice
                        )
                    )
                ),
            ),
        )
        audio_b64 = _pcm_to_wav_base64(_extract_pcm(response))
        return {
            "audio_base64": audio_b64,
            "mime_type": "audio/wav",
            "voice": voice,
            "model_used": model,
        }
    finally:
        if own_client:
            try:
                client.close()
            except Exception:
                pass


def generate_multi_speaker_speech(
    prompt: str,
    speakers: List[Dict[str, str]],
    model: str = DEFAULT_TTS_MODEL,
    client: Optional[genai.Client] = None,
) -> dict:
    """
    Generate multi-speaker (conversational) speech.

    Up to two speakers are supported. The prompt should reference the speaker
    names, e.g.:

        TTS the following conversation between Joe and Jane:
        Joe: How's it going today Jane?
        Jane: Not too bad, how about you?

    Args:
        prompt: Conversation text that names each speaker.
        speakers: List of {"speaker": <name>, "voice": <voice>} mappings. The
            speaker names must match the names used in the prompt.
        model: A TTS model id from TTS_MODELS.
        client: Optional existing genai client (created if not provided).

    Returns:
        dict with audio_base64 (WAV), mime_type, speakers, model_used.
    """
    if not 1 <= len(speakers) <= 2:
        raise ValueError("Multi-speaker TTS supports 1 or 2 speakers")
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} chars). TTS has a 32k-token context window; "
            "split long transcripts into smaller chunks."
        )

    speaker_voice_configs = []
    for entry in speakers:
        name = entry.get("speaker", "").strip()
        voice = entry.get("voice", "").strip()
        if not name:
            raise ValueError("Each speaker requires a 'speaker' name")
        if voice not in VOICES:
            raise ValueError(f"Unknown voice '{voice}' for speaker '{name}'")
        speaker_voice_configs.append(
            types.SpeakerVoiceConfig(
                speaker=name,
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                ),
            )
        )

    own_client = client is None
    client = client or create_client()
    try:
        response = _generate_with_retry(
            client,
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                        speaker_voice_configs=speaker_voice_configs
                    )
                ),
            ),
        )
        audio_b64 = _pcm_to_wav_base64(_extract_pcm(response))
        return {
            "audio_base64": audio_b64,
            "mime_type": "audio/wav",
            "speakers": speakers,
            "model_used": model,
        }
    finally:
        if own_client:
            try:
                client.close()
            except Exception:
                pass


# Usage examples
if __name__ == "__main__":
    import os

    # Single speaker
    single = generate_speech(
        "Say cheerfully: Have a wonderful day!",
        voice="Kore",
    )
    with open("speech_single.wav", "wb") as f:
        f.write(base64.b64decode(single["audio_base64"]))
    print("✓ Saved speech_single.wav")

    # Multi-speaker
    convo = generate_multi_speaker_speech(
        prompt=(
            "TTS the following conversation between Joe and Jane:\n"
            "Joe: How's it going today Jane?\n"
            "Jane: Not too bad, how about you?"
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
