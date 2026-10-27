"""Turn script.json into a voiceover track plus a timeline the renderer follows.

Outputs (in build/):
  voice.wav      the full narration
  timeline.json  shot start/end times and caption chunk timings
"""
import json
import subprocess
import tarfile
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
CACHE = ROOT / ".cache"
LEAD_IN = 0.35   # seconds of silence before the first word
TAIL = 1.2       # seconds of video after the last word
VOICE_URL = "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-{}.tar.gz"


def ensure_voice(name):
    model = CACHE / f"{name}.onnx"
    if not model.exists():
        CACHE.mkdir(exist_ok=True)
        tgz = CACHE / f"{name}.tgz"
        print(f"downloading voice {name}...")
        urllib.request.urlretrieve(VOICE_URL.format(name), tgz)
        with tarfile.open(tgz) as tar:
            tar.extractall(CACHE)
        tgz.unlink()
    return model


def synth(model, text, length_scale, out):
    subprocess.run(
        ["python3", "-m", "piper", "-m", str(model), "-f", str(out),
         "--length-scale", str(length_scale)],
        input=text.encode(), check=True, capture_output=True)
    with wave.open(str(out)) as w:
        rate = w.getframerate()
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return rate, trim_silence(audio, rate)


def trim_silence(audio, rate, thresh=300):
    loud = np.where(np.abs(audio) > thresh)[0]
    if len(loud) == 0:
        return audio
    pad = int(0.03 * rate)
    return audio[max(0, loud[0] - pad): loud[-1] + pad]


def caption_chunks(text, start, end):
    """Split a line into 1-3 word chunks, timed by character count."""
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) == 3 or w[-1] in ",.:?!" or (len(cur) == 2 and len(" ".join(cur)) > 14):
            chunks.append(" ".join(cur))
            cur = []
    if cur:
        chunks.append(" ".join(cur))
    # a lone word reads badly on screen; fold it into the chunk before
    merged = []
    for c in chunks:
        if merged and " " not in c and merged[-1].count(" ") < 3 and merged[-1][-1] not in ".?!":
            merged[-1] += " " + c
        else:
            merged.append(c)
    chunks = merged
    weights = [len(c) + 4 for c in chunks]
    total = sum(weights)
    out, t = [], start
    for c, wgt in zip(chunks, weights):
        dur = (end - start) * wgt / total
        out.append({"text": c, "start": round(t, 3), "end": round(t + dur, 3)})
        t += dur
    return out


def main():
    script = json.loads((ROOT / "script.json").read_text())
    voice = script["voice"]
    model = ensure_voice(voice["model"])
    BUILD.mkdir(exist_ok=True)

    pieces, shots, rate = [], [], None
    t = LEAD_IN
    for i, line in enumerate(script["lines"]):
        rate, audio = synth(model, line["text"], voice["lengthScale"], BUILD / f"line{i:02d}.wav")
        dur = len(audio) / rate
        gap = voice["gapAfter"] + (0.25 if line["text"].endswith(("?", ".")) else 0)
        pieces.append((t, audio))
        shot_start = 0.0 if i == 0 else shots[-1]["end"]
        shots.append({
            **line,
            "start": round(shot_start, 3),
            "end": round(t + dur + gap, 3),
            "speechStart": round(t, 3),
            "speechEnd": round(t + dur, 3),
            "captions": caption_chunks(line["text"], t, t + dur),
        })
        t += dur + gap
    shots[-1]["end"] = round(t + TAIL, 3)

    total = shots[-1]["end"]
    mix = np.zeros(int(total * rate) + 1, dtype=np.int16)
    for start, audio in pieces:
        i = int(start * rate)
        mix[i:i + len(audio)] = audio
    with wave.open(str(BUILD / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(mix.tobytes())

    timeline = {"title": script["title"], "channel": script["channel"],
                "duration": total, "shots": shots}
    (BUILD / "timeline.json").write_text(json.dumps(timeline, indent=2))
    print(f"voiceover: {total:.1f}s across {len(shots)} shots")


if __name__ == "__main__":
    main()
