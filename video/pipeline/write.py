"""
Zeitgeist step 2: choose the stories and write the narration.

  python3 pipeline/write.py episodes/morning_2026-09-26

Reads candidates.json (pick.py), asks an OpenAI model to choose the stories
for each section (skipping sports, duplicates and topics with no news) and
to write the voice-over from the site's own headline/paragraph only. Writes:

  script.json        the chosen stories + narration + image hints
  script.prose.txt   what the voice reads (tts.py)
  script.txt         the same words laid out as caption lines, "(pic N)" after
                     each segment (captions.py turns those into cut times)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
from datetime import date, timedelta
from pathlib import Path

ZG_DIR = Path(os.environ.get("ZEITGEIST_DIR", Path(__file__).resolve().parents[2] / "zeitgeist"))
sys.path.insert(0, str(ZG_DIR))
import env  # noqa: E402,F401  (zeitgeist/.env)
import llm  # noqa: E402  (zeitgeist/llm.py: OpenCode by default, LLM_PROVIDER=openai for OpenAI)

OPENAI_MODEL = os.environ.get("SCRIPT_MODEL", "gpt-5.4-mini")
MODEL = llm.model_name(OPENAI_MODEL)
CAPTION_CHARS = 26  # per caption line; two lines per caption

SLOGAN = "Brought to you by the Zeitgeist."
EDITIONS = {  # name, opening (said over the top-5 list, before the slogan), when it posts
    "morning": ("Morning Brief", "Good morning.", (7, 0)),
    "midday": ("Midday Update", "Good afternoon.", (12, 0)),
    "evening": ("Evening Digest", "Good evening.", (18, 30)),
    "yesterday": ("Yesterday's Brief", "Yesterday's Brief.", (7, 0)),
    "weekly": ("The Week", "Good morning.", (9, 0)),
    "monthly": ("The Month", "Good morning.", (9, 0)),
}
# How each edition is named in "Next, ..." and what it brings.
COMING = {
    "morning": ("the morning brief", "what's trending so far this morning"),
    "midday": ("the midday update", "the biggest searches since midnight"),
    "evening": ("the evening digest", "what the day was about"),
    "yesterday": ("yesterday's brief", "what America read about yesterday"),
    "weekly": ("the week in review", "the stories that held all week"),
    "monthly": ("the month in review", "the stories that defined the month"),
}
SPOKEN_TIME = {(7, 0): "seven", (12, 0): "noon", (18, 30): "six thirty", (9, 0): "nine"}


def runs_on(edition: str, d: date) -> bool:
    if edition == "weekly":
        return d.weekday() == 6
    if edition == "monthly":
        return d.day == 1
    return True


def next_editions(edition: str, d: date) -> tuple[list[str], date, tuple[int, int]]:
    """The edition(s) that post right after this one (cron schedule in HANDOFF)."""
    after = (d, EDITIONS[edition][2])
    slots = sorted(
        (d + timedelta(days=k), EDITIONS[e][2], e)
        for k in range(3) for e in EDITIONS if runs_on(e, d + timedelta(days=k))
    )
    day, hm = next((day, hm) for day, hm, _ in slots if (day, hm) > after)
    return [e for dd, h, e in slots if (dd, h) == (day, hm)], day, hm


def outro_line(edition: str, d: date) -> str:
    nxt, day, hm = next_editions(edition, d)
    t = SPOKEN_TIME[hm]
    when = f"at {t}" if day == d else f"tomorrow at {t}"
    if nxt[0] == "evening" and day == d:
        when = f"tonight at {t}"
    what = " and ".join(f"{COMING[e][0]}, {COMING[e][1]}" if len(nxt) == 1 else COMING[e][0] for e in nxt)
    return f"{SLOGAN} Next, {when}: {what}." if len(nxt) > 1 else f"{SLOGAN} Next, {COMING[nxt[0]][0]}, {when}: {COMING[nxt[0]][1]}."


def cta_line(edition: str, d: date) -> str:
    """The same as outro_line, for the screen."""
    nxt, day, (h, m) = next_editions(edition, d)
    clock = "noon" if (h, m) == (12, 0) else f"{(h - 1) % 12 + 1}{f':{m:02d}' if m else ''} {'am' if h < 12 else 'pm'}"
    names = " + ".join(COMING[e][0] for e in nxt)
    return f"Next: {names[0].upper()}{names[1:]}, {'tomorrow ' if day != d else ''}{clock}"


INSTRUCTIONS = """\
You write the voice-over for "By The Zeitgeist", a 45-second vertical news \
video about what people in the U.S. are searching on Google (or, for the \
yesterday edition, reading on Wikipedia). A calm, older male narrator reads \
it. You get sections, each with a number of stories to pick and a list of \
candidates, biggest first. Each candidate has a title, an attention number \
(Google searches or Wikipedia views, with when) and, usually, a headline \
and a paragraph.

PICK, per section, exactly "count" candidates, preferring bigger ones and \
real news (events, decisions, deaths, weather, releases, public figures in \
the news) over evergreen or trivial lookups ("rotten tomatoes", "is tonight \
a full moon", tour setlists, ticket prices). Skip:
- ANYTHING about sports: games, matchups, teams, athletes, coaches, leagues, \
tournaments, scores, drafts, the Olympics or Asian Games. No exceptions.
- a topic that is the same story as one already picked (e.g. a person and \
the show about them): pick one and mention the other inside it.
- topics with no news behind them (headline is only a definition, or both \
headline and paragraph are empty), unless nothing else is left.
- anything sexual, gory or a private individual.
- topics mainly about another country that Americans wouldn't follow.

WRITE, for each picked story:
- "title": the on-screen name, 1-4 words, Title Case, max 26 characters \
(e.g. "Lizzie Borden", "Dolly Parton Day", "Coastal Flood Warning").
- "narration": 18-28 words, one or two short sentences. Say what happened, \
using ONLY facts in the candidates' headlines and paragraphs (you may \
combine facts from candidates that are the same story). Never add names, \
dates, numbers, causes or quotes that are not there. If the material only \
says what the subject is, say that plainly and briefly; don't invent a reason.
- If the material says something is still to come (a storm arriving, a \
vote, a premiere, a deadline, a launch), end with what's ahead and when, \
as stated ("The storm reaches Boston tonight.").
- Work the attention number in once, rounded down and spoken naturally, \
with "people" ("over fifty thousand people searched it this morning"). \
Google numbers are floors: say "over". Use the time given with the number \
("this morning", "today", "yesterday", "this past week", "last month"). \
If the number is under ten thousand, leave it out.
- Never write "reports said", "coverage said", "according to", \
"headlines", "searched for information", "people are curious".
- "wiki_title": the English Wikipedia article whose lead photo best shows \
the subject (a person, place, thing), exactly as titled on Wikipedia, or \
null if no article fits.
- "photo_query": 2-4 plain words for a generic stock photo of the scene, \
used only if no Wikipedia photo works (e.g. "flooded coastal street"). \
Always give one: for people, films, shows, books and brands use the setting \
of the story ("courtroom", "prison corridor", "movie theater seats", \
"film festival crowd"). Never "poster", "logo" or a person's name.

Good narration:
"Netflix's new series Monster sent four hundred thousand people to read \
about Lizzie Borden yesterday, the woman acquitted of the 1892 axe murders."
"Over fifty thousand people searched coastal flood warnings today as a \
nor'easter pushed toward New York, New Jersey and Boston."

Vary the stories: lead with the news, not the number, and never open two \
stories the same way.

Style: plain spoken English, short sentences, no hype, no exclamation \
marks, no "trending", no "buzz", no questions to the viewer. Write every \
number and symbol as words (\"four hundred thousand\", \"percent\"). No \
abbreviations the narrator could misread; spell out "versus", "Doctor", etc.

QUESTION: also write one closing "question" for viewers to answer in the \
comments (the one exception to "no questions"), 4-10 words, about ONE of \
the picked stories. It asks about the viewer's own life, so anyone can \
answer in a word or two: did it reach them, have they watched/tried/seen \
it, will they. Good: "Have you watched the Lizzie Borden series yet?", \
"Did the storm affect your area?", "Will you catch the harvest moon \
tonight?", "Is anything in your pantry on the recall list?". Best on \
weather, shows, films, products, sky events, recalls. Never about a \
politician, party, policy, crime, death, religion or who is to blame; no \
"what do you think". Name the thing so it stands alone.

Reply with JSON only:
{"stories": [{"section": "<section label>", "candidate": "<candidate title exactly>", "title": "...", "narration": "...", "wiki_title": "..." | null, "photo_query": "..."}], "question": "..."}
Stories in section order."""


def ask(payload: dict) -> dict:
    try:
        text = llm.respond(INSTRUCTIONS, json.dumps(payload, ensure_ascii=False), model=OPENAI_MODEL, timeout=600)
    except llm.LLMError as e:
        raise SystemExit(str(e)) from None
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


def spoken_date(d: date) -> str:
    n = d.day
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{d:%A}, {d:%B} {n}{suffix}"


def dateline(edition: str, d: date) -> str:
    if edition == "weekly":
        return "Week in review"
    if edition == "monthly":
        return f"{d.replace(day=1) - timedelta(days=1):%B %Y}"
    if edition == "yesterday":
        d -= timedelta(days=1)
    return f"{d:%a, %b} {d.day}"


def caption_lines(text: str) -> str:
    """Lay one segment's words out as caption lines, two per caption block."""
    lines = textwrap.wrap(text, CAPTION_CHARS, break_long_words=False, break_on_hyphens=False)
    blocks = ["\n".join(lines[i:i + 2]) for i in range(0, len(lines), 2)]
    return "\n\n".join(blocks)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", type=Path)
    args = ap.parse_args()
    ep = args.episode

    cands = json.loads((ep / "candidates.json").read_text())
    edition, d = cands["edition"], date.fromisoformat(cands["date"])
    name, greeting, _ = EDITIONS[edition]

    payload = {
        "edition": name,
        "date": spoken_date(d),
        "sections": [
            {
                "label": s["label"],
                "count": s["count"],
                "candidates": [
                    {
                        "title": c["title"],
                        "attention": f"{c['stat']['value']:,}{'+' if c['stat']['plus'] else ''} {c['stat']['source']} {c['stat']['unit']} ({c['stat']['scope']})",
                        "headline": c.get("headline"),
                        "paragraph": c.get("paragraph"),
                    }
                    for c in s["candidates"]
                ],
            }
            for s in cands["sections"]
        ],
    }
    want = {s["label"]: s["count"] for s in cands["sections"]}
    for attempt in range(3):
        reply = ask(payload)
        got = {k: sum(1 for x in reply["stories"] if x.get("section") == k) for k in want}
        titles = [x.get("candidate") for x in reply["stories"]]
        if got == want and len(set(titles)) == len(titles):
            break
        print(f"[write] attempt {attempt + 1}: wanted {want}, got {got}; retrying")
        payload["previous_reply_was_wrong"] = f"You returned {got}. Return exactly {want} stories, no topic twice."
    else:
        raise SystemExit("[write] model never returned the right stories")

    by_title = {c["title"]: c for s in cands["sections"] for c in s["candidates"]}
    stories = []
    for s in reply["stories"]:
        c = by_title.get(s["candidate"])
        if not c:
            raise SystemExit(f"model picked an unknown candidate: {s['candidate']!r}")
        stories.append({**s, "stat": c["stat"], "kind": c["kind"], "headline": c.get("headline"), "wiki_links": c.get("wiki_links", [])})

    intro = f"{greeting} {SLOGAN}"
    question = (reply.get("question") or "").strip()
    if question and not question.endswith("?"):
        question = ""
    outro = (f"{question} Tell us in the comments. " if question else "") + outro_line(edition, d)
    cta = cta_line(edition, d)
    script = {
        "edition": edition,
        "name": name,
        "date": d.isoformat(),
        "dateline": dateline(edition, d),
        "cta": cta,
        "model": MODEL,
        "intro": intro,
        "stories": stories,
        "question": question or None,
        "outro": outro,
    }
    (ep / "script.json").write_text(json.dumps(script, indent=2, ensure_ascii=False))

    segments = [intro] + [s["narration"].strip() for s in stories] + [outro]
    (ep / "script.prose.txt").write_text("\n\n".join(segments) + "\n")
    (ep / "script.txt").write_text(
        "\n\n".join(f"{caption_lines(seg)}\n(pic {i + 1})" for i, seg in enumerate(segments)) + "\n"
    )
    for s in stories:
        print(f"[write] {s['section']:>10} | {s['title']:<26} | {s['narration']}")
    print(f"[write] {sum(len(x.split()) for x in segments)} words -> {ep}/script.txt")


if __name__ == "__main__":
    main()
