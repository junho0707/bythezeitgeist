"""
Wikipedia Pageviews source (Wikimedia REST API — free, no key).

Unlike Google Trends, Wikipedia actually gives us real daily data for
any past date, so "weekly" here is a genuine aggregation of 7 real
API calls (one per day), not a derived guess from local history.

Docs: https://wikimedia.org/api/rest_v1/#/Pageviews%20data
Endpoint used:
  /metrics/pageviews/top/{project}/{access}/{year}/{month}/{day}

Wikimedia's etiquette policy asks for a descriptive User-Agent with a
real contact — set WIKI_CONTACT_EMAIL below or via env var before running.
"""

from __future__ import annotations
import json
import os
import re
import time
from datetime import date
from pathlib import Path

import requests

from .timeframe import Range, build_range

SOURCE_NAME = "wikipedia_pageviews"

WIKI_CONTACT_EMAIL = os.environ.get("WIKI_CONTACT_EMAIL", "REPLACE_ME@example.com")
BASE_URL = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top"

# Wikipedia's top-articles list is dominated by non-article pages —
# not just "Main_Page" exactly, but anything in a meta namespace
# (Wikipedia:, Special:, Portal:, Category:, Talk:, User:, File:,
# Template:, Help:, Draft:, MediaWiki:). Filter by namespace prefix,
# not by exact title match.
_EXCLUDED_NAMESPACES = (
    "Main_Page", "Special:", "Wikipedia:", "Portal:", "Category:",
    "Talk:", "User:", "User_talk:", "File:", "Template:", "Help:",
    "Draft:", "MediaWiki:", "Module:",
)

# Dot-tld pages such as ".xyz" sit in the top list every day. They are not stories.
_TLD_TITLE = re.compile(r"^\.[a-z0-9-]+$", re.IGNORECASE)


def _is_real_article(title: str) -> bool:
    if _TLD_TITLE.match(title):
        return False
    return not any(title == ns or title.startswith(ns) for ns in _EXCLUDED_NAMESPACES)


def _headers() -> dict:
    if WIKI_CONTACT_EMAIL == "REPLACE_ME@example.com":
        raise RuntimeError(
            "Set WIKI_CONTACT_EMAIL (env var) or edit WIKI_CONTACT_EMAIL in "
            "wikipedia_pageviews.py before running — Wikimedia requires a "
            "real contact in the User-Agent."
        )
    return {"User-Agent": f"zeitgeist-project/0.1 ({WIKI_CONTACT_EMAIL})"}


def _fetch_one_day(day: date, project: str, access: str) -> list[dict]:
    url = f"{BASE_URL}/{project}/{access}/{day.year}/{day.month:02d}/{day.day:02d}"
    resp = requests.get(url, headers=_headers(), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    articles = data["items"][0]["articles"]
    return [a for a in articles if _is_real_article(a["article"])]


def get_daily(project: str = "en.wikipedia", access: str = "all-access", rng: Range | None = None) -> dict:
    rng = rng or build_range("day")
    day = rng.days[0]
    articles = _fetch_one_day(day, project, access)
    return {
        "source": SOURCE_NAME,
        "range": "day",
        "date": day.isoformat(),
        "project": project,
        "items": [
            {"rank": i + 1, "title": a["article"].replace("_", " "), "views": a["views"]}
            for i, a in enumerate(articles[:50])
        ],
    }


def _wiki_from_snapshot(payload: dict, day: date) -> list[dict] | None:
    """A finished day is the file saved once that date's pageviews exist."""
    wiki = (payload.get("sources") or {}).get(SOURCE_NAME) or {}
    if wiki.get("date") != day.isoformat():
        return None
    items = wiki.get("items") or []
    if not items:
        return None
    return items


def week_from_history(history_dir: Path, rng: Range | None = None, project: str = "en.wikipedia") -> dict:
    """Sum the daily snapshots already saved. A day shows up the morning after."""
    rng = rng or build_range("week")
    totals: dict[str, int] = {}
    days: list[dict] = []

    for day in rng.days:
        path = history_dir / f"{day.isoformat()}.json"
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        items = _wiki_from_snapshot(payload, day)
        if not items:
            continue
        for item in items:
            title = item.get("title")
            views = item.get("views")
            if isinstance(title, str) and isinstance(views, (int, float)):
                totals[title] = totals.get(title, 0) + int(views)
        days.append({"date": day.isoformat(), "items": items[:15]})

    ranked = sorted(totals.items(), key=lambda kv: -kv[1])
    return {
        "source": SOURCE_NAME,
        "range": "week",
        "start": rng.start.isoformat(),
        "end": rng.end.isoformat(),
        "days_included": len(days),
        "days_requested": len(rng.days),
        "project": project,
        "note": (
            f"{len(days)} of this week's {len(rng.days)} days saved. "
            "A day is added the morning after Wikipedia publishes it."
        ),
        "items": [
            {"rank": i + 1, "title": title, "views": views}
            for i, (title, views) in enumerate(ranked[:50])
        ],
        "days": days,
    }


if __name__ == "__main__":
    print(json.dumps(get_daily(), indent=2))
