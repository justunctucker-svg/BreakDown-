# BreakDown

A code-only pipeline for faceless 3D explainer Shorts (vertical 1080×1920, ~40 s).
No video editor, no stock footage. A script goes in and a finished MP4 comes out.

```
video/script.json ──► tts.py ──► voice.wav + timeline.json
                                       │
                 scene/ (Three.js) ◄───┘
                        │
               render.js (headless Chromium, frame by frame)
                        │
                   frames.mp4 ──┐
         music.py ► music.wav ──┴─► ffmpeg mix ─► build/final.mp4
```

## Setup

```bash
npm install                 # three.js + font
pip install piper-tts scipy numpy
# also needs ffmpeg and Playwright's Chromium
```

The Piper voice (`en-us-ryan-high`) downloads itself into `video/.cache/` on first run.

## Make a video

```bash
cd video
./build.sh            # voice -> render -> music -> final mix  (render ≈ 20-40 min on CPU)
./build.sh mix        # re-do only the audio on an existing render
```

Output: `video/build/final.mp4`

Handy while iterating:

```bash
python3 tts.py                                   # regenerate voice + timeline
node render.js --stills 2,8.5,14                 # single frames -> build/still-<t>.jpg
node render.js --from 12 --to 18 --out build/clip.mp4
```

## Changing the video

- **Words, info cards, tags:** edit `video/script.json`. Each line is one shot; its length
  follows the voiceover automatically. `card` is the top-left info box, `tag` the small
  label ("Illustration").
- **Camera moves / what happens in a shot:** `video/scene/shots.js`. One entry per `shot`
  name, with `enter()` (set up the stage) and `update(s, p)` (pose everything at `s`
  seconds / `p` progress).
- **Aircraft:** `video/scene/models.js` (F-15, X-68A LongShot with swing wings + bay,
  AIM-120 missiles, engine flames).
- **Skies, clouds, desert, smoke:** `video/scene/world.js` (`PALETTES` holds the looks).
- **Captions, cards, watermark styling:** `video/scene/index.html`.
- **Music / sound effects:** `video/music.py` (all synthesized, so no licensing issues).

## Sources for the current script (X-68A LongShot)

- GA-ASI: [Air Force Awards DARPA/GA-ASI LongShot New Designation: X-68A](https://www.ga.com/air-force-awards-darpa-ga-asi-longshot-new-designation-x-68a)
- AIAA: [LongShot Air Combat Drone Officially Named X-68A](https://aiaa.org/2026/02/18/general-atomics-longshot-air-combat-drone-officially-named-x-68a/)
