"""
One-sentence summary and a short paragraph per topic, written by a small
model from the context enrich.py gathers (headlines, Wikipedia intro,
Google's related searches).

The model call goes through llm.py (OpenCode by default, or OpenAI with
LLM_PROVIDER=openai); when it isn't set up, available() is False and enrich.py
falls back to the top headline.
"""

from __future__ import annotations

import json
import os
import re

import env  # noqa: F401  (loads zeitgeist/.env)
import llm

OPENAI_MODEL = os.environ.get("SUMMARY_MODEL", "gpt-5.4-nano")
# Hidden reasoning is billed as output and was most of the bill; these short
# summaries don't need it.
REASONING = os.environ.get("SUMMARY_REASONING", "none")
MODEL = llm.model_name(OPENAI_MODEL)
BATCH_SIZE = 10

INSTRUCTIONS = """\
You write for a news site that shows what people in the U.S. are searching \
for and reading. For each topic you get recent headlines, maybe a Wikipedia \
intro, and Google's related searches.

For every topic, write:
- "summary": the headline. ONE sentence, at most 25 words, that answers \
"why is this popping right now?" by stating the news from the headlines: \
what happened. Example: "Chinese singer Liu Huan died at 63." or "Sunny \
Hostin's claim that she was a holdout juror in a 1991 murder trial is being \
disputed." Build it from the headlines, never from the Wikipedia intro; a \
definition ("X is a ...") is not a headline.
- "brief": 2-3 sentences with the key facts behind it. The Wikipedia intro \
may add background here.
- "sports": true if the topic is about sports (a game, team, athlete, \
league or match), else false.
- "foreign": true if the topic is a search term written in a language \
other than English (e.g. "turquía - francia", "刘欢"). Names and English \
terms are not foreign. Else false.
- "junk": true if the topic is not real news for a general reader: a \
personal blog post, a code repository or software release notes, a \
fundraising appeal, a press release, spam or a quirky local oddity. \
Otherwise false.

Rules:
- Use only facts found in the provided material. Never invent scores, \
numbers, dates or quotes.
- State the news directly. Never write about attention itself: no "in the \
news", "in focus", "back in focus", "in the spotlight", "drawing \
attention", "is searched", "searches", "search interest", "people/fans \
look up", "remains popular", "trending", "is being discussed", "is \
prompting", "coverage", "outlets".
- Never mention your sources or what's missing from them: no "headlines", \
"related searches", "Wikipedia", "reports say", "according to a report", \
"no headlines", "provided", "material", "recap", "article", "preview", \
"according to".
- Only when there are no headlines at all, write what the subject is \
(e.g. "Matt LaFleur is the head coach of the Green Bay Packers."), \
never that news is missing. If \
you can't tell which of several things the topic means, say only what the \
material clearly supports; never pick one at random.
- Headlines can be about unrelated stories. Use only the ones clearly \
about the topic; if none are, treat it as having no headlines.
- The Wikipedia intro can be about a namesake. Ignore it when it doesn't \
match the other material.
- Plain, neutral newspaper English. No hype. Start with the subject.

A topic may carry "rejected_because": your last headline for it broke a \
rule. Write a new one that doesn't.

Reply with JSON only, in this shape:
{"items": [{"id": "<id>", "summary": "...", "brief": "...", "sports": false, "foreign": false, "junk": false}]}"""




def available() -> bool:
    return llm.available()


def _parse(text: str) -> list[dict]:
    body = text.strip()
    if body.startswith("```"):
        body = body.strip("`")
        body = body[body.find("{"):]
    data = json.loads(body[body.find("{"): body.rfind("}") + 1])
    items = data.get("items") if isinstance(data, dict) else None
    return items if isinstance(items, list) else []


# Filler and source-talk the prompt bans; a headline containing any of these
# is asked for again, and dropped if the retry still has it.
_BANNED = re.compile(
    r"\b(in the news|in focus|spotlight|drawing attention|searche[sd]|searching|"
    r"search (interest|terms?|quer(y|ies))|being sought|look(ing)? up|trending|being discussed|prompting|coverage|"
    r"outlets|headlines?|related searches|wikipedia|(were|was|is|are) provided|"
    r"the (provided )?material|news items?|no (recent )?news|recaps?|articles?|according to)\b",
    re.IGNORECASE,
)


# Talk about the sources themselves, or what they lack; checked in briefs,
# where a banned word elsewhere ("coverage", "prompting") can be fine.
_SOURCE_TALK = re.compile(
    r"\b(headlines?|related searches|wikipedia|searche[sd]|searching|(were|was|is|are) provided|"
    r"the (provided )?material|news items?|no (recent )?news)\b",
    re.IGNORECASE,
)


def _clean(summary: str) -> bool:
    return not _BANNED.search(summary)


def _ask(batch: list[dict]) -> list[dict]:
    return _parse(llm.respond(INSTRUCTIONS, "Topics (JSON):\n" + json.dumps({"topics": batch}, ensure_ascii=False),
                              model=OPENAI_MODEL, json_mode=True, reasoning=REASONING, timeout=300))


def summarize(contexts: list[dict]) -> dict[str, dict]:
    """contexts: [{"id", "topic", "headlines", "wikipedia", "related"}].
    Returns {id: {"summary", "brief", "sports", "foreign", "junk"}} for the topics the model answered."""
    out: dict[str, dict] = {}
    rejected: dict[str, str] = {}  # id -> why the last headline was refused
    todo = contexts
    # Later passes: topics whose batch failed or whose headline broke the
    # rules, told what was wrong with the last try.
    for attempt in range(2):
        for start in range(0, len(todo), BATCH_SIZE):
            batch = [
                {**c, "rejected_because": rejected[c["id"]]} if c["id"] in rejected else c
                for c in todo[start:start + BATCH_SIZE]
            ]
            try:
                rows = _ask(batch)
            except Exception as e:  # one bad batch shouldn't sink the run
                print(f"[summaries] batch {start // BATCH_SIZE + 1} failed: {e}")
                continue
            for row in rows:
                if not isinstance(row, dict) or not row.get("id"):
                    continue
                summary = str(row.get("summary") or "").strip()
                brief = str(row.get("brief") or "").strip()
                hit = _BANNED.search(summary)
                if hit:
                    rejected[str(row["id"])] = (
                        f'your headline "{summary}" used the banned phrase "{hit.group(0)}"; '
                        "state the news without it"
                    )
                    continue
                if summary:
                    out[str(row["id"])] = {
                        "summary": summary,
                        # A brief that talks about its sources is dropped; the
                        # story page falls back to the headline.
                        "brief": brief if brief and not _SOURCE_TALK.search(brief) else None,
                        "sports": row.get("sports") is True,
                        "foreign": row.get("foreign") is True,
                        "junk": row.get("junk") is True,
                    }
        todo = [c for c in contexts if c["id"] not in out]
        if not todo or attempt == 1:
            break
        print(f"[summaries] retrying {len(todo)} topics")
    return out
