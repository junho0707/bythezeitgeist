"""
Narrate <episode>/script.prose.txt with Chatterbox (zero-shot voice cloning).

Run inside the chatterbox conda env:

  conda run --no-capture-output -n chatterbox python pipeline/tts.py episodes/midday_2026-10-21

Any previous output.wav is kept as output.take<N>.wav so a better earlier take
is never lost. The voice reference is <episode>/reference.wav, falling back to
video/reference.wav.
"""

import argparse
from pathlib import Path

import soundfile as sf
from chatterbox.tts import ChatterboxTTS

ROOT = Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument("episode", type=Path)
ap.add_argument("--script", default="script.prose.txt")
ap.add_argument("--cfg-weight", type=float, default=0.7)
ap.add_argument("--exaggeration", type=float, default=0.5)
ap.add_argument("--temperature", type=float, default=0.8)
ap.add_argument("--max-chars", type=int, default=0,
                help="split into chunks of whole sentences up to this many chars (Chatterbox stops at ~40s)")
ap.add_argument("--paragraphs", action="store_true",
                help="one chunk per paragraph (blank-line separated); long ones still split by --max-chars")
ap.add_argument("--gap", type=float, default=0.3, help="seconds of silence between chunks")
args = ap.parse_args()

ep = args.episode.resolve()
text = (ep / args.script).read_text(encoding="utf-8").strip()
if not text:
    raise SystemExit(f"{ep / args.script} is empty")
ref = ep / "reference.wav"
if not ref.exists():
    ref = ROOT / "reference.wav"

out = ep / "output.wav"
if out.exists():
    n = 1
    while (ep / f"output.take{n}.wav").exists():
        n += 1
    out.rename(ep / f"output.take{n}.wav")
    print(f"kept previous take as output.take{n}.wav")

print("Loading model...")
model = ChatterboxTTS.from_pretrained(device="cuda")
print("Generating audio...")
import re

import numpy as np


def split(text: str) -> list[str]:
    if not args.max_chars:
        return [text]
    chunks, cur = [], ""
    sents = []
    for piece in re.split(r"(?<=[.!?])\s+", text):
        # "Ms. Periwinkle": don't treat a title's period as a sentence end.
        if sents and re.search(r"\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof)\.$", sents[-1]):
            sents[-1] += " " + piece
        else:
            sents.append(piece)
    for sent in sents:
        if cur and len(cur) + len(sent) + 1 > args.max_chars:
            chunks.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    chunks.append(cur)
    return chunks


paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()] if args.paragraphs else [text]
chunks = [c for p in paras for c in split(p)]
print(f"{len(chunks)} chunks: {[len(c) for c in chunks]}")
parts = []
for c in chunks:
    w = model.generate(
        c,
        audio_prompt_path=str(ref),
        cfg_weight=args.cfg_weight,
        exaggeration=args.exaggeration,
        temperature=args.temperature,
    )
    parts.append(w.squeeze().detach().cpu().numpy())
    parts.append(np.zeros(int(args.gap * model.sr), dtype=parts[-1].dtype))
sf.write(str(out), np.concatenate(parts[:-1]), model.sr)
print(f"wrote {out}")
