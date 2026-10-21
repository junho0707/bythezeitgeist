"""
Zeitgeist step 1: pull the candidate stories for one edition out of the
zeitgeist pipeline's output (../zeitgeist/output).

  python3 pipeline/pick.py episodes/morning_2026-09-26 morning
  python3 pipeline/pick.py <dir> weekly --date 2026-09-27

Editions (5 stories each). Google for everything live, Wikipedia only for
the day that's over:
  morning    This morning   Google topics that started since midnight, by searches
  midday     Today          Google topics that started in the last 12 hours
  evening    Today          Google's past 24 hours (the day's digest)
  yesterday  Yesterday      Wikipedia's most-read articles yesterday
  weekly     This week      Google's past 7 days
  monthly    Last month     Google topics summed over last month's archive

Google lists are pulled live (every topic, not the site's top 50) and fall
back to the last saved snapshot. Topics under the edition's search floor
are dropped unless that leaves too few to choose from.

Writes <dir>/candidates.json: per section, an ordered pool (more than needed)
with each topic's headline/paragraph from the site's summaries. write.py
then chooses and writes. Sports are dropped here and again by the model.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ZG_DIR = Path(os.environ.get("ZEITGEIST_DIR", Path(__file__).resolve().parents[2] / "zeitgeist"))
sys.path.insert(0, str(ZG_DIR))
OUT = ZG_DIR / "output"

POOL = 24  # candidates offered per section

# label, pool kind, stories
SECTIONS = {
    "morning": [("This morning", "since_midnight", 5)],
    "midday": [("Today", "last_12h", 5)],
    "evening": [("Today", "day", 5)],
    "yesterday": [("Yesterday", "wiki_yesterday", 5)],
    "weekly": [("This week", "week", 5)],
    "monthly": [("Last month", "month", 5)],
}
# Google topics below this many searches read as noise ("olivia rodrigo tour
# setlist", 200+); kept only when fewer than MIN_POOL clear the bar.
FLOOR = {"since_midnight": 2000, "last_12h": 5000, "day": 10000, "week": 50000, "month": 50000}
MIN_POOL = 10

SPORTS_CATEGORY = 17
SPORTS_RE = re.compile(
    r"\b(vs\.?|v\.?|score|scores|game today|game tonight|schedule|highlights|odds|"
    r"nfl|nba|mlb|nhl|wnba|mls|ncaa|ufc|fifa|uefa|premier league|la liga|serie a|"
    r"football|soccer|baseball|basketball|hockey|tennis|golf|grand prix|f1|"
    r"playoffs?|world series|super bowl|olympics?|asian games|world cup|draft|"
    r"quarterback|pitcher|medal table|fc|cf)\b",
    re.I,
)
TEAM_DASH_RE = re.compile(r"^[\w .'-]+ - [\w .'-]+$")  # "jamaica - guatemala"
WIKI_SKIP_RE = re.compile(r"^(Deaths in \d{4}|List of |\d{4} in |Portal:|Wikipedia:|Special:|Main Page)", re.I)


def is_sports(item: dict) -> bool:
    title = item.get("term") or item.get("title") or ""
    if SPORTS_CATEGORY in (item.get("categories") or []):
        return True
    return bool(SPORTS_RE.search(title) or TEAM_DASH_RE.match(title))


def traffic(s: str | None) -> int:
    return int(re.sub(r"\D", "", s or "") or 0)


def load(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def items(snap: dict | None, source: str) -> list[dict]:
    return list(((snap or {}).get("sources") or {}).get(source, {}).get("items") or [])


def google(item: dict, scope: str) -> dict:
    return {
        "title": item["term"],
        "kind": "google",
        "stat": {"value": traffic(item.get("approx_traffic")), "plus": True, "unit": "searches", "source": "Google", "scope": scope},
        "categories": item.get("categories") or [],
        "related": (item.get("related") or [])[:5],
        "news_ids": item.get("news_ids") or [],
        "started_at": item.get("started_at"),
    }


def wiki(title: str, views: int, scope: str) -> dict:
    return {
        "title": title,
        "kind": "wikipedia",
        "stat": {"value": views, "plus": False, "unit": "views", "source": "Wikipedia", "scope": scope},
        "categories": [],
    }


def history_day(d: date) -> dict | None:
    return load(OUT / "history" / f"{d.isoformat()}.json")


def wiki_day(d: date) -> list[dict]:
    """Yesterday's Wikipedia top list: the finished day, from history or last_ok."""
    for snap in (history_day(d), {"sources": {"wikipedia_pageviews": load(OUT / "last_ok/wikipedia_pageviews_day.json") or {}}}):
        payload = ((snap or {}).get("sources") or {}).get("wikipedia_pageviews") or {}
        if payload.get("date") == d.isoformat() and payload.get("items"):
            return [wiki(i["title"], i["views"], "yesterday") for i in payload["items"]]
    return []


def google_live(hours: int, fallback: str) -> list[dict]:
    """Google's whole list for the past `hours`, biggest first; the saved
    snapshot if the live call fails."""
    from sources import google_trends as gt  # zeitgeist/sources

    try:
        rows = gt._fetch_window(hours, gt.SORT_VOLUME, "US", limit=None)
    except Exception as exc:  # noqa: BLE001
        print(f"[pick] live Google {hours}h failed ({exc}); using {fallback}")
        rows = items(load(OUT / fallback), "google_trends")
    return rows


def by_searches(rows: list[dict], scope: str) -> list[dict]:
    out = [google(i, scope) for i in rows]
    return sorted(out, key=lambda c: (-c["stat"]["value"], -(c.get("started_at") or 0)))


def started_since(rows: list[dict], t: float) -> list[dict]:
    return [i for i in rows if (i.get("started_at") or 0) >= t]


def rollup(start: date, end: date, scope: str) -> list[dict]:
    """A month from the daily archive: Google topics scored by their best
    day's traffic plus how many days they lasted."""
    searches: dict[str, dict] = {}
    days = 0
    d = start
    while d <= end:
        snap = history_day(d)
        if snap:
            days += 1
            for i in items(snap, "google_trends"):
                g = searches.setdefault(i["term"].lower(), {"item": i, "best": 0, "total": 0, "days": 0})
                t = traffic(i.get("approx_traffic"))
                g["best"], g["total"], g["days"] = max(g["best"], t), g["total"] + t, g["days"] + 1
        d += timedelta(days=1)
    print(f"[pick] {scope}: {days} archived days between {start} and {end}")
    g = []
    for s in sorted(searches.values(), key=lambda s: (-s["best"], -s["days"])):
        item = google(s["item"], scope)
        item["stat"]["value"] = s["total"]
        item["days"] = s["days"]
        g.append(item)
    return g


def pool(kind: str, today: date) -> list[dict]:
    now = datetime.now().timestamp()
    if kind == "since_midnight":
        midnight = datetime.combine(today, datetime.min.time()).timestamp()
        return by_searches(started_since(google_live(24, "latest_day.json"), midnight), "this morning")
    if kind == "last_12h":
        return by_searches(started_since(google_live(24, "latest_day.json"), now - 12 * 3600), "today")
    if kind == "day":
        return by_searches(google_live(24, "latest_day.json"), "today")
    if kind == "wiki_yesterday":
        return wiki_day(today - timedelta(days=1))
    if kind == "week":
        return by_searches(google_live(168, "latest_week.json"), "this past week")
    if kind == "month":
        end = today.replace(day=1) - timedelta(days=1)
        return rollup(end.replace(day=1), end, "last month")
    raise ValueError(kind)


def floor(cands: list[dict], kind: str) -> list[dict]:
    """Drop small Google topics; lower the bar step by step if too few are left."""
    bar = FLOOR.get(kind, 0)
    for b in (bar, bar // 2, bar // 5, 0):
        kept = [c for c in cands if c["kind"] != "google" or c["stat"]["value"] >= b]
        if len(kept) >= MIN_POOL or b == 0:
            if b != bar:
                print(f"[pick] {kind}: too few topics over {bar:,} searches; bar lowered to {b:,}")
            return kept
    return cands


def candidates(kind: str, today: date) -> list[dict]:
    cands = clean(pool(kind, today))
    # Early on a quiet morning few topics have started since midnight: widen
    # to the last 12 hours rather than read out 500-search topics.
    if kind == "since_midnight" and sum(c["stat"]["value"] >= FLOOR[kind] for c in cands) < MIN_POOL:
        print("[pick] this morning is thin; using the last 12 hours")
        return floor(clean(pool("last_12h", today)), kind)
    return floor(cands, kind)


def clean(cands: list[dict]) -> list[dict]:
    out, seen = [], set()
    for c in cands:
        key = re.sub(r"\W+", " ", c["title"].lower()).strip()
        if key in seen or is_sports(c) or not re.search(r"[a-z]", key) or (c["kind"] == "wikipedia" and WIKI_SKIP_RE.match(c["title"])):
            continue
        seen.add(key)
        out.append(c)
    return out


def attach_context(sections: list[dict]) -> None:
    """Headline + paragraph for every candidate, from the site's summary cache
    (enrich.attach fills any that are missing, same as the website does)."""
    import enrich  # zeitgeist/enrich.py

    source_of = {"google": "google_trends", "wikipedia": "wikipedia_pageviews"}
    snap = {"sources": {}}
    for sec in sections:
        for c in sec["candidates"]:
            field = "term" if c["kind"] == "google" else "title"
            item = {field: c["title"], "related": c.get("related", [])}
            c["_item"] = item
            snap["sources"].setdefault(source_of[c["kind"]], {"items": []})["items"].append(item)
    enrich.attach([snap])
    for sec in sections:
        for c in sec["candidates"]:
            item = c.pop("_item")
            c["headline"] = item.get("summary")
            c["paragraph"] = item.get("brief")
            c["image_hint"] = item.get("image")
            c["wiki_links"] = [l["url"] for l in item.get("links") or [] if l.get("outlet") == "Wikipedia"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", type=Path)
    ap.add_argument("edition", choices=SECTIONS)
    ap.add_argument("--date", help="edition date, YYYY-MM-DD (default: today)")
    args = ap.parse_args()

    today = date.fromisoformat(args.date) if args.date else date.today()
    sections, used = [], set()
    for label, kind, count in SECTIONS[args.edition]:
        cands = [c for c in candidates(kind, today) if c["title"].lower() not in used][:POOL]
        used.update(c["title"].lower() for c in cands[:count])
        sections.append({"label": label, "count": count, "candidates": cands})
        print(f"[pick] {label}: {len(cands)} candidates -> " + ", ".join(c["title"] for c in cands[:8]))

    attach_context(sections)
    args.episode.mkdir(parents=True, exist_ok=True)
    payload = {
        "edition": args.edition,
        "date": today.isoformat(),
        "picked_at": datetime.now().isoformat(timespec="seconds"),
        "sections": sections,
    }
    (args.episode / "candidates.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"[pick] wrote {args.episode / 'candidates.json'}")


if __name__ == "__main__":
    main()
