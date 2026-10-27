#!/usr/bin/env bash
# Full pipeline: script.json -> voiceover -> 3D render -> music -> final mix.
#   ./build.sh            everything
#   ./build.sh mix        just redo the audio mix on an existing render
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" != "mix" ]]; then
  python3 tts.py
  node render.js --fps 30
fi
python3 music.py

ffmpeg -y -v error -i build/frames.mp4 -i build/voice.wav -i build/music.wav -filter_complex "
  [1:a]aresample=44100,pan=stereo|c0=c0|c1=c0,highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,
       acompressor=threshold=-20dB:ratio=3:attack=5:release=90,volume=1.6,asplit=2[voice][key];
  [2:a][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[bed];
  [voice][bed]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[out]" \
  -map 0:v -map "[out]" -c:v copy -c:a aac -b:a 192k -ar 44100 -shortest build/final.mp4

echo "done -> $(pwd)/build/final.mp4"
