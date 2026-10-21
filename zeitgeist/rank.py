"""Two separate lists. Each one is ranked only by that source's own number.

  Wikipedia  — pageviews
  Google     — approximate search count

Nothing is scored against another source, and nothing is scored against
its own past.
"""

from __future__ import annotations

import json
from pathlib import Path

SOURCE_WIKI = "wikipedia_pageviews"
SOURCE_GOOGLE = "google_trends"


def _wiki_keep(title: str) -> bool:
    """Dot-tld pages (".xyz") sit on the list every day. They are not stories."""
    return bool(title) and not title.startswith(".")


def rank_wikipedia(current: dict) -> list[dict]:
    items = current.get("sources", {}).get(SOURCE_WIKI, {}).get("items") or []
    rows = []
    for item in items:
        title = item.get("title")
        views = item.get("views")
        if isinstance(title, str) and _wiki_keep(title) and isinstance(views, (int, float)):
            rows.append({"title": title, "views": int(views)})
    rows.sort(key=lambda row: (-row["views"], row["title"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def rank_google(current: dict) -> list[dict]:
    """Keep the order Google already applied for this window."""
    items = current.get("sources", {}).get(SOURCE_GOOGLE, {}).get("items") or []
    ranked = []
    for item in items:
        term = item.get("term") or ""
        if "free bet" in term.lower() or "promo code" in term.lower():
            continue
        ranked.append({
            "rank": len(ranked) + 1,
            "term": item.get("term"),
            "approx_traffic": item.get("approx_traffic"),
            "pub_date": item.get("pub_date"),
        })
    return ranked


def build_trending(day_snapshot: dict, history: list[dict] | None = None) -> dict:
    """Each source keeps its own ranking. `history` is unused."""
    del history
    sources_in = day_snapshot.get("sources") or {}
    errors_in = day_snapshot.get("errors") or {}
    sources: dict = {}
    errors: dict = {}

    if SOURCE_WIKI in sources_in:
        payload = sources_in[SOURCE_WIKI]
        sources[SOURCE_WIKI] = {
            "source": SOURCE_WIKI,
            "range": "trending",
            "method": "pageviews",
            "date": payload.get("date") or day_snapshot.get("date"),
            "note": "Ranked by Wikipedia pageviews.",
            "items": rank_wikipedia(day_snapshot),
        }
    elif SOURCE_WIKI in errors_in:
        errors[SOURCE_WIKI] = errors_in[SOURCE_WIKI]

    if SOURCE_GOOGLE in sources_in:
        payload = sources_in[SOURCE_GOOGLE]
        sources[SOURCE_GOOGLE] = {
            "source": SOURCE_GOOGLE,
            "range": "trending",
            "method": "search_count",
            "date": payload.get("fetched_at") or day_snapshot.get("date"),
            "geo": payload.get("geo"),
            "note": payload.get("note") or "Ranked by approximate US searches.",
            "items": rank_google(day_snapshot),
        }
    elif SOURCE_GOOGLE in errors_in:
        errors[SOURCE_GOOGLE] = errors_in[SOURCE_GOOGLE]

    return {
        "range": "trending",
        "date": day_snapshot.get("date"),
        "sources": sources,
        "errors": errors,
    }


def load_history_snapshots(
    history_dir: Path,
    exclude_date: str | None = None,
) -> list[dict]:
    """Daily snapshots, oldest first, skipping a date that is the current `now`."""
    snapshots = []
    for path in sorted(history_dir.glob("*.json")):
        if exclude_date and path.stem == exclude_date:
            continue
        try:
            snapshots.append(json.loads(path.read_text()))
        except json.JSONDecodeError:
            continue
    return snapshots
