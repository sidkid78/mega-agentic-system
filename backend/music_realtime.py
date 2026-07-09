"""
Lyria RealTime — interactive, steerable, streaming music generation.

Wraps the experimental `models/lyria-realtime-exp` live-music session from the
google-genai SDK. The model emits a continuous stream of raw PCM audio
(48 kHz, 16-bit, stereo) that the caller can steer in real time by:

  * sending one or more *weighted prompts* (text + relative weight), and
  * adjusting a `LiveMusicGenerationConfig` (bpm, scale, density, brightness,
    guidance, temperature, top_k, seed, mute_bass, mute_drums,
    only_bass_and_drums, music_generation_mode).

Transport (play / pause / stop / reset_context) is controlled per-session.

This module only builds/parses the SDK objects and owns the v1alpha client;
the WebSocket bridge that pumps audio to the browser lives in `api_server.py`.
"""

from __future__ import annotations

import os
from typing import Any

from google import genai
from google.genai import types

# The live-music model id. The leading "models/" prefix is required by the
# live endpoint.
LYRIA_REALTIME_MODEL = "models/lyria-realtime-exp"

# Native output format of the Lyria RealTime stream.
SAMPLE_RATE = 48_000
CHANNELS = 2
SAMPLE_WIDTH_BYTES = 2  # 16-bit signed little-endian PCM
OUTPUT_MIME_TYPE = f"audio/pcm;rate={SAMPLE_RATE}"

# Config fields that, when changed, require a hard reset (reset_context) for the
# new value to take effect without bleeding the previous musical context.
HARD_TRANSITION_FIELDS = ("bpm", "scale")


def get_realtime_client(api_key: str | None = None) -> genai.Client:
    """Return a genai client pinned to the v1alpha API (required for live music).

    BYOK: pass the caller's key; falls back to the env key for local dev.
    """
    return genai.Client(
        api_key=api_key or os.environ.get("GEMINI_API_KEY"),
        http_options={"api_version": "v1alpha"},
    )


def available_scales() -> list[str]:
    """Human-facing scale names (the SCALE_UNSPECIFIED sentinel is hidden)."""
    return [s.name for s in types.Scale if s != types.Scale.SCALE_UNSPECIFIED]


def available_modes() -> list[str]:
    """Selectable music generation modes (the UNSPECIFIED sentinel is hidden)."""
    return [
        m.name
        for m in types.MusicGenerationMode
        if m != types.MusicGenerationMode.MUSIC_GENERATION_MODE_UNSPECIFIED
    ]


def _parse_scale(value: Any) -> types.Scale | None:
    if value is None:
        return None
    if isinstance(value, types.Scale):
        return value
    try:
        return types.Scale[str(value).upper()]
    except KeyError:
        return None


def _parse_mode(value: Any) -> types.MusicGenerationMode | None:
    if value is None:
        return None
    if isinstance(value, types.MusicGenerationMode):
        return value
    try:
        return types.MusicGenerationMode[str(value).upper()]
    except KeyError:
        return None


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def build_weighted_prompts(raw: list[dict] | None) -> list[types.WeightedPrompt]:
    """Convert ``[{"text": str, "weight": float}, ...]`` into WeightedPrompt objects.

    Empty texts are skipped and zero/negative weights are bumped to a small
    positive value (the API rejects a weight of 0).
    """
    prompts: list[types.WeightedPrompt] = []
    for item in raw or []:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        try:
            weight = float(item.get("weight", 1.0))
        except (TypeError, ValueError):
            weight = 1.0
        if weight <= 0:
            weight = 0.01
        prompts.append(types.WeightedPrompt(text=text, weight=weight))
    return prompts


def build_generation_config(raw: dict | None) -> types.LiveMusicGenerationConfig:
    """Build a LiveMusicGenerationConfig from a partial dict, clamping to valid ranges.

    Only fields present (and non-null) in ``raw`` are set so SDK defaults apply
    to everything else.
    """
    raw = raw or {}
    kwargs: dict[str, Any] = {}

    if raw.get("temperature") is not None:
        kwargs["temperature"] = _clamp(float(raw["temperature"]), 0.0, 3.0)
    if raw.get("top_k") is not None:
        kwargs["top_k"] = int(_clamp(float(raw["top_k"]), 1, 1000))
    if raw.get("seed") is not None:
        kwargs["seed"] = int(raw["seed"])
    if raw.get("guidance") is not None:
        kwargs["guidance"] = _clamp(float(raw["guidance"]), 0.0, 6.0)
    if raw.get("bpm") is not None:
        kwargs["bpm"] = int(_clamp(float(raw["bpm"]), 60, 200))
    if raw.get("density") is not None:
        kwargs["density"] = _clamp(float(raw["density"]), 0.0, 1.0)
    if raw.get("brightness") is not None:
        kwargs["brightness"] = _clamp(float(raw["brightness"]), 0.0, 1.0)

    scale = _parse_scale(raw.get("scale"))
    if scale is not None:
        kwargs["scale"] = scale

    if raw.get("mute_bass") is not None:
        kwargs["mute_bass"] = bool(raw["mute_bass"])
    if raw.get("mute_drums") is not None:
        kwargs["mute_drums"] = bool(raw["mute_drums"])
    if raw.get("only_bass_and_drums") is not None:
        kwargs["only_bass_and_drums"] = bool(raw["only_bass_and_drums"])

    mode = _parse_mode(raw.get("music_generation_mode"))
    if mode is not None:
        kwargs["music_generation_mode"] = mode

    return types.LiveMusicGenerationConfig(**kwargs)


def realtime_metadata() -> dict:
    """Static metadata the frontend uses to render controls."""
    return {
        "model": LYRIA_REALTIME_MODEL,
        "sample_rate": SAMPLE_RATE,
        "channels": CHANNELS,
        "sample_width_bytes": SAMPLE_WIDTH_BYTES,
        "mime_type": OUTPUT_MIME_TYPE,
        "scales": available_scales(),
        "modes": available_modes(),
        "hard_transition_fields": list(HARD_TRANSITION_FIELDS),
        "config_ranges": {
            "bpm": {"min": 60, "max": 200, "default": 120, "step": 1},
            "guidance": {"min": 0.0, "max": 6.0, "default": 4.0, "step": 0.1},
            "density": {"min": 0.0, "max": 1.0, "default": 0.5, "step": 0.05},
            "brightness": {"min": 0.0, "max": 1.0, "default": 0.5, "step": 0.05},
            "temperature": {"min": 0.0, "max": 3.0, "default": 1.1, "step": 0.1},
            "top_k": {"min": 1, "max": 1000, "default": 40, "step": 1},
        },
    }
