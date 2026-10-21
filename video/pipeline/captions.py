#!/usr/bin/env python
"""
Turn a narration wav + its source script into speech-timed caption groups.

Whisper supplies the timing; the script supplies the text. ASR output is aligned
back onto the original words so captions carry the script's exact spelling,
punctuation and capitalisation rather than whatever the recogniser heard.

Grouping reproduces what CapCut's auto-captions did in the reference video:
greedily pack words while the group still wraps into at most MAX_LINES lines of
at most MAX_CHARS_PER_LINE characters.
"""

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

MAX_CHARS_PER_LINE = 17
MAX_LINES = 2

_PUNCT = re.compile(r"[^\w']+", re.UNICODE)
# Scripts mark image changes inline, e.g. "(pic 7)" on its own line. The marker
# is not narrated, so it must come out of the caption text -- but it records
# exactly where the image should cut, which beats guessing.
_PIC = re.compile(r"\(\s*pic\s*(\d+)\s*\)", re.IGNORECASE)


def normalize(word: str) -> str:
    # Curly apostrophes in the script vs straight ones from the recogniser.
    return _PUNCT.sub("", word.lower().replace("\u2019", "'"))


def parse_script(text):
    """
    Read a script that already carries its own caption layout.

    Each non-empty line is one caption line, blank lines separate blocks, and
    "(pic N)" marks an image change. Returns:
      words     flat word list, markers removed
      lines     [{"start": word_idx, "end": word_idx, "block": n}, ...]
      pic_cuts  word index at which each image's span ends

    Line breaks are authored, not derived: the script says where text should
    break, so re-wrapping it would throw away the intent.
    """
    words, lines, pic_cuts = [], [], []
    block = 0
    saw_text_in_block = False

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if saw_text_in_block:
                block += 1
                saw_text_in_block = False
            continue
        if _PIC.fullmatch(line):
            pic_cuts.append(len(words))
            continue
        # A marker sharing a line with text still ends that image's span.
        marker = _PIC.search(line)
        if marker:
            line = _PIC.sub("", line).strip()

        toks = line.split()
        if toks:
            lines.append({"start": len(words), "end": len(words) + len(toks), "block": block})
            words.extend(toks)
            saw_text_in_block = True
        if marker:
            pic_cuts.append(len(words))

    return words, lines, pic_cuts


def preload_cuda_libs() -> None:
    """
    ctranslate2 dlopen()s libcublas/libcudnn at call time and will not find the
    copies pip installed inside this venv. Loading them by absolute path first
    puts them in the process so the later dlopen resolves.
    """
    import ctypes
    import glob

    site = Path(__file__).resolve().parent.parent / ".venv-captions" / "lib"
    for pattern in (
        "python*/site-packages/nvidia/cublas/lib/libcublas.so*",
        "python*/site-packages/nvidia/cublas/lib/libcublasLt.so*",
        "python*/site-packages/nvidia/cudnn/lib/libcudnn*.so*",
    ):
        for path in sorted(glob.glob(str(site / pattern))):
            try:
                ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


def transcribe(wav: Path, model_size: str, device: str):
    if device == "cuda":
        preload_cuda_libs()
    from faster_whisper import WhisperModel

    compute_type = "float16" if device == "cuda" else "int8"
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(wav),
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            token = w.word.strip()
            if not token:
                continue
            words.append({"text": token, "start": float(w.start), "end": float(w.end)})
    return words, float(info.duration)


def align(script_words, asr_words):
    """Give every script word a (start, end), borrowed from the matching ASR word."""
    a = [normalize(w) for w in script_words]
    b = [normalize(w["text"]) for w in asr_words]

    timed = [None] * len(script_words)
    matched = [False] * len(script_words)
    matcher = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    last_asr = -1
    for i, j, n in matcher.get_matching_blocks():
        for k in range(n):
            src = asr_words[j + k]
            timed[i + k] = [src["start"], src["end"]]
            matched[i + k] = True
            last_asr = j + k

    # Interpolate anything the recogniser missed or mangled.
    first = next((i for i, t in enumerate(timed) if t), None)
    if first is None:
        raise SystemExit("No script word could be aligned to the audio.")
    last = len(timed) - 1 - next(i for i, t in enumerate(reversed(timed)) if t)

    for i in range(first):
        timed[i] = [timed[first][0], timed[first][0]]
    # Trailing script words the recogniser split differently ("common-sense."
    # heard as "common" "sense.") still have ASR words after the last match:
    # spread them over those instead of stacking them at zero length.
    tail = len(timed) - 1 - last
    spare = asr_words[last_asr + 1 :]
    if tail and spare:
        t0, t1 = spare[0]["start"], spare[-1]["end"]
        step = (t1 - t0) / tail
        for k in range(tail):
            timed[last + 1 + k] = [t0 + step * k, t0 + step * (k + 1)]
            matched[last + 1 + k] = True
    else:
        for i in range(last + 1, len(timed)):
            timed[i] = [timed[last][1], timed[last][1]]

    i = first
    while i <= last:
        if timed[i]:
            i += 1
            continue
        gap_start = i - 1
        gap_end = i
        while timed[gap_end] is None:
            gap_end += 1
        t0, t1 = timed[gap_start][1], timed[gap_end][0]
        span = gap_end - gap_start
        for k in range(1, span):
            frac0 = (k - 1) / (span - 1) if span > 1 else 0.0
            frac1 = k / (span - 1) if span > 1 else 1.0
            timed[gap_start + k] = [t0 + (t1 - t0) * frac0, t0 + (t1 - t0) * frac1]
        i = gap_end

    return timed, matched


def group_lines(lines, timings, words, max_lines=MAX_LINES):
    """
    Pair the script's own lines into groups of at most `max_lines`, never
    straddling a block boundary (a block is one image's worth of text).

    Each line carries its own start time so it can be revealed in turn: line 1
    appears, line 2 appears beneath it, then both clear for the next group.
    """
    groups = []
    current = []
    current_block = None

    for ln in lines:
        if current and (ln["block"] != current_block or len(current) >= max_lines):
            groups.append(current)
            current = []
        current.append(ln)
        current_block = ln["block"]
    if current:
        groups.append(current)

    out = []
    for g in groups:
        entries = []
        for ln in g:
            entries.append(
                {
                    "text": " ".join(words[ln["start"] : ln["end"]]),
                    "start": timings[ln["start"]][0],
                }
            )
        out.append(
            {
                "start": entries[0]["start"],
                "end": timings[g[-1]["end"] - 1][1],
                "lines": entries,
            }
        )

    # Groups are contiguous: each holds until the next begins.
    for i in range(len(out) - 1):
        out[i]["end"] = out[i + 1]["start"]

    MIN = 0.08
    for i, g in enumerate(out):
        if g["end"] - g["start"] < MIN:
            g["end"] = g["start"] + MIN
            if i + 1 < len(out) and out[i + 1]["start"] < g["end"]:
                out[i + 1]["start"] = g["end"]
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("episode", type=Path, help="episode directory (holds script.txt + output.wav)")
    p.add_argument("--wav", default="output.wav")
    p.add_argument("--script", default="script.txt")
    p.add_argument("--out", default="captions.json")
    p.add_argument("--model", default="large-v3")
    p.add_argument("--device", default="cuda")
    p.add_argument("--no-cache", action="store_true", help="force re-transcription")
    p.add_argument(
        "--max-chars",
        type=int,
        default=MAX_CHARS_PER_LINE,
        help="advisory only: authored lines longer than this are reported, not re-wrapped",
    )
    p.add_argument("--max-lines", type=int, default=MAX_LINES)
    args = p.parse_args()

    wav = args.episode / args.wav
    script = args.episode / args.script
    for f in (wav, script):
        if not f.exists():
            raise SystemExit(f"missing {f}")

    script_words, script_lines, pic_cuts = parse_script(script.read_text(encoding="utf-8"))
    print(
        f"script: {len(script_words)} words, {len(script_lines)} authored lines, "
        f"{len(pic_cuts)} (pic N) markers",
        file=sys.stderr,
    )

    cache = args.episode / ".asr-cache.json"
    key = f"{wav.stat().st_mtime_ns}:{wav.stat().st_size}:{args.model}"
    asr_words = duration = None
    if cache.exists() and not args.no_cache:
        try:
            blob = json.loads(cache.read_text(encoding="utf-8"))
            if blob.get("key") == key:
                asr_words, duration = blob["words"], blob["duration"]
                print("using cached transcription", file=sys.stderr)
        except (ValueError, KeyError):
            pass
    if asr_words is None:
        print("transcribing...", file=sys.stderr)
        asr_words, duration = transcribe(wav, args.model, args.device)
        cache.write_text(
            json.dumps({"key": key, "words": asr_words, "duration": duration}),
            encoding="utf-8",
        )
    print(f"asr: {len(asr_words)} words over {duration:.2f}s", file=sys.stderr)

    timings, matched = align(script_words, asr_words)

    rate = sum(matched) / len(matched)
    if rate < 0.75:
        print(f"warning: only {rate:.0%} of script words aligned to the audio", file=sys.stderr)

    # The TTS often stops short of a long script. Anything after the last word
    # the recogniser actually heard was never spoken, so it must not be captioned
    # -- otherwise those words pile up into zero-length groups at the end.
    last_heard = max(i for i, m in enumerate(matched) if m)
    if last_heard < len(script_words) - 1:
        cut = last_heard + 1
        dropped = len(script_words) - cut
        print(
            f"note: audio ends at script word {cut} of {len(script_words)}; "
            f"dropping {dropped} unspoken word(s)",
            file=sys.stderr,
        )
        script_words, timings = script_words[:cut], timings[:cut]
        script_lines = [ln for ln in script_lines if ln["end"] <= cut]

    groups = group_lines(script_lines, timings, script_words, args.max_lines)
    narration = max(g["end"] for g in groups)

    # Turn the markers into cut times. Each image runs until the word its marker
    # follows, so the cut lands on the start of the next word.
    pic_times = []
    for idx in pic_cuts:
        if idx <= 0 or idx > len(timings):
            continue
        pic_times.append(timings[idx][0] if idx < len(timings) else timings[-1][1])
    # Snap every cut onto a caption boundary; the reference edit never cut mid-group.
    starts = [g["start"] for g in groups]
    snapped = [0.0] + [min(starts, key=lambda s: abs(s - t)) for t in pic_times[:-1]]
    snapped = sorted(set(snapped))

    # The images should hold until the audio actually ends, not until the last
    # word: a trailing pause with the end card already up reads as a mistake.
    payload = {
        "narrationSeconds": max(narration, duration),
        "lastWordSeconds": narration,
        "audioSeconds": duration,
        "captions": groups,
    }
    if snapped:
        payload["picCuts"] = snapped
        print(f"{len(snapped)} image cuts from markers", file=sys.stderr)
    (args.episode / args.out).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    durs = [g["end"] - g["start"] for g in groups]
    widest = max((len(l["text"]) for g in groups for l in g["lines"]), default=0)
    print(
        f"{len(groups)} groups over {narration:.2f}s "
        f"(avg {sum(durs)/len(durs):.2f}s, range {min(durs):.2f}-{max(durs):.2f}s)",
        file=sys.stderr,
    )
    print(f"longest line: {widest} characters", file=sys.stderr)
    if duration - narration > 0.05:
        print(
            f"audio runs {duration - narration:.2f}s past the last word; "
            "images hold for it",
            file=sys.stderr,
        )
    over = [l["text"] for g in groups for l in g["lines"] if len(l["text"]) > args.max_chars]
    if over:
        print(
            f"note: {len(over)} authored line(s) exceed --max-chars={args.max_chars}; "
            "they are kept as written",
            file=sys.stderr,
        )
        for t in over:
            print(f"    {len(t):3d}  {t}", file=sys.stderr)
    print(f"wrote {args.episode / args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
