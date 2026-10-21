# video: the news Shorts

Turns an edition's top stories from the site's data into a ~60 s vertical
video: script, photos, narration, captions and a cover. The result lands in
`../to-post/` for posting by hand.

```bash
./zg.sh                 # whatever edition is due by the clock
./zg.sh evening         # a given edition, today
./run.sh weekly 2026-09-27
```

Editions: `morning` (topics since midnight), `yesterday` (Wikipedia's day),
`midday` (Google, last 12 h), `evening` (24 h digest), `weekly`, `monthly`.

## Steps

| | |
|---|---|
| `pipeline/pick.py` | candidates for the edition's window, volume floor, no sports |
| `pipeline/write.py` | five stories + intro/outro from the site's headlines (LLM via `../zeitgeist/llm.py`) |
| `pipeline/images.py` | license-filtered Wikimedia Commons / Pexels photos, scored by a vision model |
| `pipeline/tts.py` | Chatterbox narration cloned from `voices/` (public-domain LibriVox readers) |
| `pipeline/captions.py` | faster-whisper timings aligned onto the script's exact words |
| `pipeline/check.py` | transcript vs script; one automatic re-take |
| `pipeline/build.mjs` | Remotion props, music leveled under the voice |
| `remotion/` | the `Zeitgeist` composition and `ZeitgeistCover` still |
| `pipeline/post.py` | titles, descriptions, captions and photo credits |

Every step writes into `episodes/<edition>_<date>/` and is skipped if its
output exists, so a re-run resumes where it stopped (delete a file to redo
that step).

## Setup

- **Node 22:** `cd remotion && npm install`
- **Python 3:** `pip install requests` (plus the site pipeline's
  `../zeitgeist/requirements.txt`)
- **Chatterbox TTS** in a conda env named `chatterbox` (or set `CHATTERBOX_ENV`)
- **faster-whisper** in `.venv-captions/` (or set `CAPTIONS_PYTHON`); a CUDA
  GPU is assumed (`WHISPER_DEVICE=cpu` works, slowly)
- **LLM:** OpenCode logged in to a plan that serves `opencode-go/kimi-k2.7-code`,
  or `LLM_PROVIDER=openai` with `OPENAI_API_KEY`
- **Photos:** `PEXELS_API_KEY` in `../zeitgeist/.env` (optional; Commons
  works without one)
- **Music:** put a licensed track at `music/bythezeitgeist.mp3` (not in the
  repo); without one the video has no music

Cron can make editions ahead of their slot (`cron.sh yesterday morning`).
It shares a lock with `zg.sh`, so the two never render at the same time.
