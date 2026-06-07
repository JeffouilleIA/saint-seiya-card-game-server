#!/usr/bin/env python3
"""
Generate synthetic French bronze-knight attack voice + SFX (original, no copyrighted audio).

Outputs (assets/audio/attacks/):
  seiya_meteores.mp3, shiryu_dragon.mp3, hyoga_diamond_dust.mp3

Deps: pip install edge-tts numpy pydub
Requires ffmpeg on PATH for MP3 export (falls back to WAV).

Run from repo root: python scripts/generate_attack_voices.py
"""

from __future__ import annotations

import asyncio
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

try:
    from pydub import AudioSegment
except ImportError:
    print("Install: pip install pydub", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "audio" / "attacks"
SAMPLE_RATE = 44100
VOICE_MAX_MS = 1000
TOTAL_MS = 2800

# fr-FR male — energetic battle cry
TTS_VOICE = "fr-FR-HenriNeural"


def _t(length: float) -> np.ndarray:
    return np.linspace(0, length, int(SAMPLE_RATE * length), endpoint=False)


def _env(length: float, attack: float = 0.01, release: float = 0.08) -> np.ndarray:
    n = int(SAMPLE_RATE * length)
    a = max(1, int(SAMPLE_RATE * attack))
    r = max(1, int(SAMPLE_RATE * release))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] = np.linspace(1, 0, r)
    return e


def _mix_at(base: np.ndarray, clip: np.ndarray, start_sec: float, gain: float = 1.0) -> np.ndarray:
    start = int(start_sec * SAMPLE_RATE)
    end = start + len(clip)
    if start >= len(base):
        return base
    seg = (clip * gain)[: max(0, len(base) - start)]
    base[start : start + len(seg)] += seg
    return base


def _normalize(arr: np.ndarray, peak: float = 0.92) -> np.ndarray:
    m = np.max(np.abs(arr))
    if m < 1e-9:
        return arr
    return arr * (peak / m)


def array_to_segment(arr: np.ndarray) -> AudioSegment:
    arr = np.clip(arr, -1, 1)
    pcm = (arr * 32767).astype(np.int16)
    return AudioSegment(
        pcm.tobytes(),
        frame_rate=SAMPLE_RATE,
        sample_width=2,
        channels=1,
    )


def segment_to_array(seg: AudioSegment) -> np.ndarray:
    seg = seg.set_frame_rate(SAMPLE_RATE).set_channels(1)
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    return samples / 32768.0


# --- Procedural SFX ---


def sfx_cosmos_rise(dur: float = 0.45) -> np.ndarray:
    t = _t(dur)
    f0, f1 = 180.0, 2400.0
    phase = 2 * np.pi * (f0 * t + 0.5 * (f1 - f0) * t * t / dur)
    tone = np.sin(phase) * _env(dur, 0.02, 0.12)
    shimmer = 0.25 * np.sin(2 * np.pi * 6 * t) * np.sin(phase * 2)
    return tone + shimmer


def sfx_energy_whistle(dur: float = 0.35) -> np.ndarray:
    t = _t(dur)
    f = 3200 + 1800 * (t / dur)
    w = np.sin(2 * np.pi * np.cumsum(f) / SAMPLE_RATE) * _env(dur, 0.005, 0.1)
    return w * 0.7


def sfx_impact_barrage(count: int = 8, spacing: float = 0.055) -> np.ndarray:
    total = count * spacing + 0.08
    out = np.zeros(int(SAMPLE_RATE * total))
    for i in range(count):
        hit = np.random.uniform(-1, 1, int(SAMPLE_RATE * 0.04)).astype(np.float64)
        hit *= _env(0.04, 0.001, 0.03)
        hit += 0.5 * np.sin(2 * np.pi * (120 + i * 40) * _t(0.04)) * _env(0.04, 0.001, 0.02)
        _mix_at(out, hit, i * spacing, gain=0.55 - i * 0.03)
    return out


def sfx_small_explosion(dur: float = 0.22) -> np.ndarray:
    t = _t(dur)
    noise = np.random.uniform(-1, 1, len(t)) * _env(dur, 0.002, dur * 0.7)
    boom = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 18) * 0.8
    return noise * 0.5 + boom


def sfx_dragon_roar(dur: float = 0.5) -> np.ndarray:
    t = _t(dur)
    growl = np.random.uniform(-1, 1, len(t))
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 7 * t)
    growl = growl * lfo * _env(dur, 0.02, 0.15)
    low = np.sin(2 * np.pi * (55 + 30 * np.sin(2 * np.pi * 3 * t)) * t) * _env(dur, 0.03, 0.2)
    return growl * 0.6 + low * 0.5


def sfx_power_breath(dur: float = 0.4) -> np.ndarray:
    t = _t(dur)
    noise = np.random.uniform(-1, 1, len(t)) * _env(dur, 0.05, 0.2)
    sweep = np.sin(2 * np.pi * np.cumsum(400 + 800 * t / dur) / SAMPLE_RATE)
    return (noise * 0.35 + sweep * 0.4) * _env(dur, 0.04, 0.15)


def sfx_massive_impact(dur: float = 0.35) -> np.ndarray:
    t = _t(dur)
    noise = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 9)
    thump = np.sin(2 * np.pi * 48 * t) * np.exp(-t * 6)
    return noise * 0.55 + thump * 0.9


def sfx_light_echo(dur: float = 0.5) -> np.ndarray:
    t = _t(dur)
    ping = np.sin(2 * np.pi * 520 * t) * np.exp(-t * 5) * _env(dur, 0.01, dur * 0.9)
    return ping * 0.35


def sfx_icy_wind(dur: float = 0.55) -> np.ndarray:
    t = _t(dur)
    noise = np.random.uniform(-1, 1, len(t))
    # high-pass-ish via differencing
    hp = np.diff(noise, prepend=noise[0]) * 2
    return hp * _env(dur, 0.08, 0.2) * 0.45


def sfx_ice_crystals(dur: float = 0.45) -> np.ndarray:
    freqs = [2400, 3100, 3800, 4200, 3600]
    out = np.zeros(int(SAMPLE_RATE * dur))
    for i, f in enumerate(freqs):
        ping_len = 0.06
        ping = np.sin(2 * np.pi * f * _t(ping_len)) * _env(ping_len, 0.002, 0.04)
        _mix_at(out, ping, 0.04 + i * 0.07, gain=0.22)
    return out


def sfx_freeze(dur: float = 0.35) -> np.ndarray:
    t = _t(dur)
    tone = np.sin(2 * np.pi * 880 * t) * _env(dur, 0.02, 0.15)
    grit = np.random.uniform(-0.3, 0.3, len(t)) * _env(dur, 0.05, 0.12)
    return tone * 0.35 + grit


def sfx_ice_crack(dur: float = 0.25) -> np.ndarray:
    t = _t(dur)
    crack = np.random.uniform(-1, 1, len(t)) * _env(dur, 0.001, 0.08)
    snap = np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 25) * 0.4
    return crack * 0.5 + snap


def build_seiya_sfx(length_sec: float) -> np.ndarray:
    buf = np.zeros(int(SAMPLE_RATE * length_sec))
    _mix_at(buf, sfx_cosmos_rise(), 0.0, 0.35)
    _mix_at(buf, sfx_energy_whistle(), 0.35, 0.4)
    _mix_at(buf, sfx_impact_barrage(), 0.55, 0.5)
    _mix_at(buf, sfx_small_explosion(), 1.15, 0.45)
    return buf


def build_shiryu_sfx(length_sec: float) -> np.ndarray:
    buf = np.zeros(int(SAMPLE_RATE * length_sec))
    _mix_at(buf, sfx_dragon_roar(), 0.05, 0.42)
    _mix_at(buf, sfx_power_breath(), 0.45, 0.38)
    _mix_at(buf, sfx_massive_impact(), 0.95, 0.55)
    _mix_at(buf, sfx_light_echo(), 1.25, 0.4)
    return buf


def build_hyoga_sfx(length_sec: float) -> np.ndarray:
    buf = np.zeros(int(SAMPLE_RATE * length_sec))
    _mix_at(buf, sfx_icy_wind(), 0.0, 0.38)
    _mix_at(buf, sfx_ice_crystals(), 0.4, 0.42)
    _mix_at(buf, sfx_freeze(), 0.95, 0.4)
    _mix_at(buf, sfx_ice_crack(), 1.35, 0.48)
    return buf


async def synthesize_voice(text: str, rate: str = "+18%") -> AudioSegment:
    import edge_tts

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    communicate = edge_tts.Communicate(text, TTS_VOICE, rate=rate)
    await communicate.save(tmp_path)
    seg = AudioSegment.from_file(tmp_path)
    os.unlink(tmp_path)
    return seg.set_frame_rate(SAMPLE_RATE).set_channels(1)


def trim_voice(seg: AudioSegment, max_ms: int = VOICE_MAX_MS) -> AudioSegment:
    if len(seg) <= max_ms:
        return seg
    # Keep attack transient, fade tail
    trimmed = seg[:max_ms]
    return trimmed.fade_out(40)


def time_stretch_to_fit(seg: AudioSegment, max_ms: int) -> AudioSegment:
    if len(seg) <= max_ms:
        return seg
    ratio = len(seg) / max_ms
    # pydub speedup via frame rate trick
    faster = seg._spawn(
        seg.raw_data,
        overrides={"frame_rate": int(seg.frame_rate * ratio)},
    ).set_frame_rate(SAMPLE_RATE)
    return trim_voice(faster, max_ms)


def compose_attack(
    voice_text: str,
    sfx_builder,
    voice_rate: str = "+18%",
    voice_gain_db: float = 4.0,
    sfx_gain_db: float = -4.0,
) -> AudioSegment:
    length_sec = TOTAL_MS / 1000.0
    voice = asyncio.run(synthesize_voice(voice_text, rate=voice_rate))
    voice = time_stretch_to_fit(voice, VOICE_MAX_MS)
    voice = voice + voice_gain_db

    sfx = _normalize(sfx_builder(length_sec))
    sfx_seg = array_to_segment(sfx) + sfx_gain_db

    total_ms = int(length_sec * 1000)
    bed = AudioSegment.silent(duration=total_ms, frame_rate=SAMPLE_RATE)
    bed = bed.overlay(sfx_seg, position=0)
    bed = bed.overlay(voice, position=0)  # voice on top at t=0
    return bed.normalize(headroom=1.0)


def export_mp3(seg: AudioSegment, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        seg.export(str(path), format="mp3", bitrate="192k")
    except Exception as e:
        wav_path = path.with_suffix(".wav")
        seg.export(str(wav_path), format="wav")
        print(f"MP3 export failed ({e}), wrote {wav_path}")


ATTACKS = [
    (
        "seiya_meteores.mp3",
        "Par les Météores de Pégase !",
        build_seiya_sfx,
        "+22%",
    ),
    (
        "shiryu_dragon.mp3",
        "Colère du Dragon !",
        build_shiryu_sfx,
        "+12%",
    ),
    (
        "hyoga_diamond_dust.mp3",
        "Poussière de Diamant !",
        build_hyoga_sfx,
        "+8%",
    ),
]


def main() -> None:
    np.random.seed(42)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output: {OUT_DIR}")
    for filename, text, builder, rate in ATTACKS:
        print(f"  Generating {filename} …")
        seg = compose_attack(text, builder, voice_rate=rate)
        export_mp3(seg, OUT_DIR / filename)
        print(f"    -> {OUT_DIR / filename} ({len(seg)} ms)")
    print("Done.")


if __name__ == "__main__":
    main()
