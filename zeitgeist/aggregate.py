"""
Runs all three core sources and writes JSON your website can read.

Usage:
    python aggregate.py                 # runs both day + week, default
    python aggregate.py --range day
    python aggregate.py --range week
    python aggregate.py --range both

Output:
    output/latest_day.json      <- today's snapshot (raw counts)
    output/latest_week.json     <- this week's rollup (raw counts)
    output/latest_trending.json <- Trending list. Google column is "started trending".
    output/history/<date>.json  <- daily snapshot archive.

Run this once a day (cron) so the history directory fills in and Google
Trends' weekly rollup becomes meaningful. See README.md for a cron line.

Trending is Google's past 4 hours. Today is Google's past 24 hours. This week is Google's past 7 days plus Wikipedia
summed from the finished daily snapshots. Wikipedia for a day is archived
under that date the morning after the count is published.
"""

from __future__ import annotations
import json
import argparse
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import env  # noqa: F401  (loads zeitgeist/.env before sources read settings)
from sources import google_trends, wikipedia_pageviews
from sources.timeframe import build_range
import enrich

ROOT = Path(__file__).parent
OUTPUT_DIR = ROOT / "output"
HISTORY_DIR = OUTPUT_DIR / "history"
LAST_OK_DIR = OUTPUT_DIR / "last_ok"


def _last_ok_path(range_kind: str, source: str) -> Path:
    return LAST_OK_DIR / f"{source}_{range_kind}.json"


def _remember_ok(range_kind: str, source: str, payload: dict) -> None:
    LAST_OK_DIR.mkdir(parents=True, exist_ok=True)
    _last_ok_path(range_kind, source).write_text(json.dumps(payload, indent=2))


def _stale_from_last_ok(range_kind: str, source: str, err: dict) -> dict | None:
    """Serve the last successful pull when a source 429s or dies, so the
    newspaper never blanks a column just because this run failed."""
    path = _last_ok_path(range_kind, source)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
    payload["stale"] = True
    payload["stale_reason"] = err.get("error")
    return payload


def _set_source(snapshot: dict, range_kind: str, source: str, result, err) -> None:
    if err:
        snapshot["errors"][source] = err
        stale = _stale_from_last_ok(range_kind, source, err)
        if stale is not None:
            snapshot["sources"][source] = stale
        return
    snapshot["sources"][source] = result
    _remember_ok(range_kind, source, result)


def _safe_call(fn, *args, **kwargs):
    """Never let one broken source kill the whole run."""
    try:
        return fn(*args, **kwargs), None
    except Exception as e:
        return None, {"error": str(e), "trace": traceback.format_exc(limit=3)}


def _now() -> str:
    """When this snapshot was pulled, so the site can say "Updated 2:15 PM"."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _saved_day(day: date) -> dict:
    """A history file as saved so far, or a fresh one."""
    path = HISTORY_DIR / f"{day.isoformat()}.json"
    try:
        saved = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        saved = {}
    kept = {k: v for k, v in (saved.get("sources") or {}).items()
            if k in ("google_trends", "wikipedia_pageviews", "trending_seen")}
    return {"range": "day", "date": day.isoformat(), "updated_at": _now(),
            "sources": kept, "errors": {}}


def run_day() -> tuple[dict, list[dict]]:
    """Returns (today page, history files to write).

    Google's past 24 hours goes in today's file, rewritten every run, so the
    day's last pull (late evening) is what the day keeps. Wikipedia only
    publishes a day once it's over, so yesterday's file gets it, and only a
    real pull: a stale copy would be the day before's numbers."""
    rng = build_range("day")
    today_file = _saved_day(rng.end + timedelta(days=1))
    yesterday_file = _saved_day(rng.end)

    today = {"range": "day", "date": today_file["date"], "updated_at": _now(),
             "sources": {}, "errors": {}}
    result, err = _safe_call(google_trends.get_daily)
    _set_source(today, "day", "google_trends", result, err)
    if not err:
        today_file["sources"]["google_trends"] = result

    result, err = _safe_call(wikipedia_pageviews.get_daily, rng=rng)
    if err:
        print(f"[day]  wikipedia for {rng.end} not saved: {err['error']}")
    else:
        yesterday_file["sources"]["wikipedia_pageviews"] = result
        _remember_ok("day", "wikipedia_pageviews", result)

    return today, [f for f in (yesterday_file, today_file) if f["sources"]]


def _topic(item: dict) -> str:
    return str(item.get("title") or item.get("term") or "").strip().lower()


def _keep_trending(day_file: dict, trending: dict) -> None:
    """Every topic that trended today, kept in the day's file, so a story
    that only ever trended for a few hours still has a page afterwards."""
    now = (trending.get("sources") or {}).get("google_trends")
    if not now or now.get("stale"):
        return
    seen = (day_file["sources"].get("trending_seen") or {}).get("items") or []
    by_title = {_topic(i): i for i in seen}
    for item in now.get("items") or []:
        by_title[_topic(item)] = item  # newest read wins
    day_file["sources"]["trending_seen"] = {
        "source": "google_trends", "range": "trending", "items": list(by_title.values()),
    }


def run_trending() -> dict:
    snapshot = {"range": "trending", "date": date.today().isoformat(), "updated_at": _now(),
                "sources": {}, "errors": {}}
    result, err = _safe_call(google_trends.get_started)
    _set_source(snapshot, "trending", "google_trends", result, err)
    return snapshot


def run_week() -> dict:
    rng = build_range("week")
    snapshot = {
        "range": "week",
        "updated_at": _now(),
        "start": rng.start.isoformat(),
        "end": rng.end.isoformat(),
        "sources": {},
        "errors": {},
        "days": [],
    }

    result, err = _safe_call(google_trends.get_weekly)
    _set_source(snapshot, "week", "google_trends", result, err)

    wiki = wikipedia_pageviews.week_from_history(HISTORY_DIR, rng=rng)
    snapshot["sources"]["wikipedia_pageviews"] = {k: v for k, v in wiki.items() if k != "days"}
    snapshot["days"] = wiki["days"]
    _remember_ok("week", "wikipedia_pageviews", snapshot["sources"]["wikipedia_pageviews"])

    return snapshot


def _enrich(*snapshots: dict) -> None:
    """Summaries, coverage links and pictures. Never fails the run."""
    try:
        enrich.attach(list(snapshots))
    except Exception as e:
        print(f"[summaries] skipped: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--range", choices=["day", "week", "both"], default="both")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(exist_ok=True)
    LAST_OK_DIR.mkdir(exist_ok=True)

    if args.range in ("day", "both"):
        today, saved = run_day()
        trending = run_trending()
        _enrich(today, trending, *saved)
        # Enriched first, so the kept rows carry their headlines and pictures.
        today_file = next((d for d in saved if d["date"] == today["date"]), None)
        if today_file is None:
            today_file = _saved_day(date.fromisoformat(today["date"]))
            saved.append(today_file)
        _keep_trending(today_file, trending)
        saved = [d for d in saved if d["sources"]]
        (OUTPUT_DIR / "latest_day.json").write_text(json.dumps(today, indent=2))
        for day in saved:
            (HISTORY_DIR / f"{day['date']}.json").write_text(json.dumps(day, indent=2))
        print(f"[day]  wrote output/latest_day.json and history/"
              f"{', '.join(d['date'] for d in saved)}")

        (OUTPUT_DIR / "latest_trending.json").write_text(json.dumps(trending, indent=2))
        print(f"[trending] wrote output/latest_trending.json")

    if args.range in ("week", "both"):
        week_snapshot = run_week()
        _enrich(week_snapshot)
        (OUTPUT_DIR / "latest_week.json").write_text(json.dumps(week_snapshot, indent=2))
        print(f"[week] wrote output/latest_week.json "
              f"({len(week_snapshot['days'])} finished days)")


if __name__ == "__main__":
    main()
