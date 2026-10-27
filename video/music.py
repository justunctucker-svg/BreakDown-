"""Synthesize a tense documentary music bed plus sound effects, timed to build/timeline.json.

Output: build/music.wav (44.1 kHz stereo). Nothing here is sampled; it's all generated,
so there are no licensing questions.
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
SR = 44100
BPM = 96
rng = np.random.default_rng(3)


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def env(n, attack, release):
    a = np.minimum(1, np.arange(n) / max(1, attack * SR))
    r = np.exp(-np.arange(n) / max(1, release * SR))
    return a * r


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = (t * freq * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / 3


def drone(total):
    # D minor pad: D1 + A1 + D2 + F2, slowly opening filter
    n = int(total * SR)
    t = np.arange(n) / SR
    pad = np.zeros(n)
    for f, g in [(36.71, 1.0), (55.0, 0.6), (73.42, 0.5), (87.31, 0.35)]:
        pad += saw(f, n, 0.004) * g
    cutoff_lo = lp(pad, 220)
    cutoff_hi = lp(pad, 900)
    mix = np.clip(t / total, 0, 1) ** 1.5
    pad = cutoff_lo * (1 - mix) + cutoff_hi * mix
    pad *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.25 * t)
    return pad


def kick():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 42 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.16)


def tick():
    n = int(0.05 * SR)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.0005, 0.012)


def boom():
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = 30 + 60 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.004, 0.9)
    noise = lp(rng.standard_normal(n), 900) * env(n, 0.002, 0.35) * 0.6
    return sub + noise


def whoosh(length=0.7):
    n = int(length * SR)
    x = rng.standard_normal(n)
    # sweep a band-pass up across the whoosh by crossfading three bands
    t = np.linspace(0, 1, n)
    bands = [bp(x, 300, 900), bp(x, 900, 2500), bp(x, 2500, 7000)]
    w = [np.clip(1 - abs(t * 2 - k), 0, 1) for k in (0, 1, 2)]
    sig = sum(b * ww for b, ww in zip(bands, w))
    shape = np.sin(np.pi * t) ** 2
    return sig * shape


def riser(length):
    n = int(length * SR)
    t = np.linspace(0, 1, n)
    x = hp(rng.standard_normal(n), 1500) * t ** 3 * 0.6
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * t ** 2) / SR) * t ** 2 * 0.25
    return x + tone


def roar(length, bright=2500):
    # jet / rocket motor: rumbling noise with a quick attack
    n = int(length * SR)
    x = lp(rng.standard_normal(n), bright) + 0.6 * lp(rng.standard_normal(n), 180)
    t = np.arange(n) / SR
    shape = np.minimum(1, t / 0.05) * np.exp(-t / (length * 0.45))
    return x * shape


def main():
    tl = json.loads((BUILD / "timeline.json").read_text())
    total = tl["duration"]
    shots = {s["shot"]: s for s in tl["shots"]}
    buf = np.zeros((int(total * SR) + SR, 2))

    pad = drone(total + 1)
    add(buf, 0, pad, 0.22)

    # pulse: kick on every beat, ticks on 16ths, from the reveal onward
    beat = 60 / BPM
    start = shots["reveal"]["start"]
    end = shots["endcard"]["start"]
    t = start
    k, tk = kick(), tick()
    i = 0
    while t < end:
        add(buf, t, k, 0.55)
        for s in range(4):
            add(buf, t + s * beat / 4, tk, 0.10 if s else 0.16, pan=0.3 if s % 2 else -0.3)
        t += beat
        i += 1

    # whooshes on every cut, booms on the big moments
    for s in tl["shots"][1:]:
        add(buf, s["start"] - 0.35, whoosh(), 0.35, pan=rng.uniform(-0.4, 0.4))
    add(buf, 0.0, boom(), 0.6)
    add(buf, shots["reveal"]["start"] - 1.2, riser(1.2), 0.5)
    add(buf, shots["reveal"]["start"], boom(), 0.85)
    d = shots["deploy"]
    ign = d["start"] + 0.57 * (d["end"] - d["start"])
    add(buf, ign, roar(2.2, 3000), 0.5)
    add(buf, ign, boom(), 0.5)
    r = shots["release"]
    for i in range(2):
        add(buf, r["start"] + 0.55 + i * 0.4 + 0.47, roar(1.6, 5000), 0.45, pan=-0.3 + 0.6 * i)
    add(buf, r["start"] + 0.1, whoosh(0.5), 0.25)
    add(buf, shots["escape"]["start"], roar(3.0, 1800), 0.35)
    add(buf, shots["endcard"]["start"], boom(), 0.9)
    add(buf, shots["chase"]["start"], roar(3.5, 1500), 0.25)

    # fade out and normalise to leave headroom for the voice
    fade = int(1.5 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)[:, None]
    buf /= np.max(np.abs(buf)) + 1e-9
    buf *= 0.7
    with wave.open(str(BUILD / "music.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())
    print(f"music: {total:.1f}s")


if __name__ == "__main__":
    main()
