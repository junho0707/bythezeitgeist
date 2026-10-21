"""
Zeitgeist take check: the automatic stand-in for listening to the voice take.

  python3 pipeline/check.py episodes/morning_2026-09-26

Compares what whisper heard (.asr-cache.json, written by captions.py) with
the script. Exit 1 (bad take) when words were skipped, a phrase was said
twice, or the take ends early. run.sh then re-voices once.
"""

from __future__ import annotations

import difflib
import json
import re
import sys
from pathlib import Path

MIN_MATCH = 0.88   # share of script words heard
MAX_EXTRA = 4      # heard words that aren't in the script (a repeat/garble)
NGRAM = 4


NUMBER_WORDS = set("""zero one two three four five six seven eight nine ten eleven twelve thirteen
fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty
ninety hundred thousand million billion and a dollars percent""".split())


def words(text: str) -> list[str]:
    """Comparable words: lowercase, no punctuation, and no numbers at all --
    the script spells them out ("fifty thousand") while whisper writes digits
    ("50,000", "$1"), so they can't be compared word for word."""
    text = text.lower().replace("’", "'").replace(" '", "'")
    out = []
    for w in text.split():
        w = re.sub(r"[^\w']", "", w).strip("'")
        if w and not re.search(r"\d", w) and w not in NUMBER_WORDS:
            out.append(w)
    return out


def main() -> int:
    ep = Path(sys.argv[1])
    script = words(ep.joinpath("script.prose.txt").read_text())
    heard = words(" ".join(w["text"] for w in json.loads(ep.joinpath(".asr-cache.json").read_text())["words"]))

    sm = difflib.SequenceMatcher(a=script, b=heard, autojunk=False)
    matched = sum(b.size for b in sm.get_matching_blocks())
    rate = matched / max(1, len(script))
    extra = len(heard) - matched

    grams = lambda ws: [" ".join(ws[i:i + NGRAM]) for i in range(len(ws) - NGRAM + 1)]
    once = {g for g in grams(script) if grams(script).count(g) == 1}
    heard_grams = grams(heard)
    repeats = sorted({g for g in once if heard_grams.count(g) > 1})

    tail_ok = script[-3:] == heard[-3:] or rate > 0.97
    problems = []
    if rate < MIN_MATCH:
        problems.append(f"only {rate:.0%} of script words heard")
    if extra > MAX_EXTRA:
        problems.append(f"{extra} extra words heard")
    if repeats:
        problems.append(f"repeated: {repeats[:3]}")
    if not tail_ok:
        problems.append(f"ends early: heard ...{' '.join(heard[-4:])}")

    print(f"[check] {rate:.0%} heard, {extra} extra" + (f" -> BAD TAKE: {'; '.join(problems)}" if problems else " -> ok"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
