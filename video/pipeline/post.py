"""
Zeitgeist step 8: post.json (titles, descriptions, captions) for post.mjs.

  python3 pipeline/post.py episodes/morning_2026-09-26

Built from script.json and credits.json, no model call: the stories' own
headlines, and the photo credits every CC BY / CC BY-SA image requires.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, timedelta
from pathlib import Path

SITE = os.environ.get("ZEITGEIST_SITE", "bythezeitgeist.com")
TAGS = "#news #trending #bythezeitgeist #shorts"


def credit_line(c: dict) -> str:
    author = (c.get("author") or "").strip()
    half = len(author) // 2
    if author and author[:half] == author[half:]:
        author = author[:half]
    lic = c["license"] + (f" ({c['license_url']})" if c.get("license_url") else "")
    return f"{c.get('n')}. {author or 'Unknown author'}, {lic}. {c.get('page') or ''}".strip()


def hashtag(title: str) -> str:
    return "#" + "".join(w[:1].upper() + w[1:] for w in re.sub(r"[^\w\s]", "", title).split())


def facebook_caption(script: dict, when: str, ask: str, photo_block: str) -> str:
    """Search-friendly: the names people search for in the first line (what FB
    shows above "See more"), each story's headline as text, and one tag per
    story instead of generic ones."""
    stories = script["stories"]
    scope = {"weekly": "this week", "monthly": "this month"}.get(script["edition"], "today")
    hook = f"{', '.join(s['title'] for s in stories[:3])} and more: what America searched {scope} ({when})"
    rundown = "\n".join(f"{i}. {s['title']}: {s.get('headline') or s['narration']}" for i, s in enumerate(stories, 1))
    tags = " ".join(dict.fromkeys([*(hashtag(s["title"]) for s in stories), "#news", "#trending", "#bythezeitgeist"]))
    return f"{hook}\n\n{rundown}{ask}\n\nFull lists, updated all day: {SITE}\n\n{tags}{photo_block}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", type=Path)
    ep = ap.parse_args().episode
    script = json.loads((ep / "script.json").read_text())
    credits = [c for c in json.loads((ep / "credits.json").read_text()) if c.get("image")] if (ep / "credits.json").exists() else []
    d = date.fromisoformat(script["date"])
    stories = script["stories"]

    shown = d - timedelta(days=1) if script["edition"] == "yesterday" else d
    when = f"{shown:%b} {shown.day}" if script["edition"] not in ("weekly", "monthly") else script["dateline"]
    names = [s["title"] for s in stories]
    title = f"{script['name']}, {when}: " + ", ".join(names[:3])
    while len(title) > 95 and len(names) > 1:
        names.pop()
        title = f"{script['name']}, {when}: " + ", ".join(names)

    rundown = "\n".join(f"{i}. {s['title']}: {s['narration']}" for i, s in enumerate(stories, 1))
    photos = "\n".join(credit_line(c) for c in credits)
    photo_block = f"\n\nPhotos:\n{photos}" if photos else ""
    short = "\n".join(f"{i}. {s['title']}" for i, s in enumerate(stories, 1))
    ask = f"\n\n{script['question']} Tell us in the comments." if script.get("question") else ""

    post = {
        "youtube": {
            "title": title,
            "description": f"What the U.S. searched on Google and read on Wikipedia.\n\n{rundown}{ask}\n\nFull lists, updated all day: https://{SITE}{photo_block}\n\n{TAGS}",
            "tags": ["news", "trending", "google trends", "wikipedia", "zeitgeist", "by the zeitgeist"],
            "privacy": "public",
        },
        "facebook": {"caption": facebook_caption(script, when, ask, photo_block)},
        "instagram": {
            "caption": f"{script['name']} · {when} 🗞️\n\n{short}{ask}\n\nFull lists at {SITE} (link in bio){photo_block}\n\n{TAGS}",
        },
    }
    (ep / "post.json").write_text(json.dumps(post, indent=2, ensure_ascii=False))
    print(f"[post] {title}")


if __name__ == "__main__":
    main()
