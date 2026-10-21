"""
Google Trends Trending Now.

The public RSS feed is only about ten searches and has no time window.
The Trending Now page does. Same call, different hours:

  started trending  -> past 4 hours, newest first   (our Trending tab)
  past 24 hours     -> by search volume             (our Today tab)
  past 7 days       -> by search volume             (our This week tab)

Hours Google accepts: 4, 24, 48, 168.
"""

from __future__ import annotations

import json
import re
from datetime import date

import requests

SOURCE_NAME = "google_trends"

BATCH_URL = "https://trends.google.com/_/TrendsUi/data/batchexecute"
RPC_ID = "i0OFE"
NEWS_RPC_ID = "w4opAf"
NEWS_LIMIT = 5  # articles per trend, enough to say why it's trending
LIST_LIMIT = 50  # room for the site to hide a category (e.g. sports) and still fill a list

# Google's topic categories (row slot 10). 17 is sports.
CATEGORY_SPORTS = 17

# Google's own sort keys.
SORT_VOLUME = 2
SORT_RECENCY = 3

WINDOWS = {
    "started": {"hours": 4, "sort": SORT_RECENCY, "note": "Started trending. Past 4 hours, newest first."},
    "day": {"hours": 24, "sort": SORT_VOLUME, "note": "Past 24 hours, ranked by approximate searches."},
    "week": {"hours": 168, "sort": SORT_VOLUME, "note": "Past 7 days, ranked by approximate searches."},
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; zeitgeist-project/0.1)",
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    "Origin": "https://trends.google.com",
    "Referer": "https://trends.google.com/trending",
}

_SPAM_PHRASES = ("free bet", "promo code")


def _is_spam(term: str | None) -> bool:
    if not term:
        return True
    low = term.lower()
    return any(phrase in low for phrase in _SPAM_PHRASES)


def _volume_label(value) -> str | None:
    if isinstance(value, (int, float)):
        return f"{int(value)}+"
    if isinstance(value, str) and value:
        return value
    return None


def _parse_rows(text: str) -> list:
    body = text.lstrip()
    if body.startswith(")]}'"):
        body = body[4:]
    payload = json.loads(body)
    for entry in payload:
        if (
            isinstance(entry, list)
            and len(entry) >= 3
            and entry[0] == "wrb.fr"
            and entry[1] == RPC_ID
            and isinstance(entry[2], str)
        ):
            parsed = json.loads(entry[2])
            rows = parsed[1] if isinstance(parsed, list) and len(parsed) > 1 else []
            return rows if isinstance(rows, list) else []
    raise RuntimeError("Google Trends response had no trending list")


def _started_at(row: list) -> int:
    stamp = row[3] if len(row) > 3 else None
    if isinstance(stamp, list) and stamp and isinstance(stamp[0], (int, float)):
        return int(stamp[0])
    return 0


def _volume(row: list) -> int:
    value = row[6] if len(row) > 6 else 0
    return int(value) if isinstance(value, (int, float)) else 0


_FILLER_WORDS = {"vs", "v", "versus", "game", "games", "score", "scores", "today",
                 "tonight", "live", "news", "the", "at", "and", "-"}


def _topic_key(term: str) -> frozenset[str]:
    """Word set without filler, so "rangers vs twins" == "twins vs rangers"."""
    words = re.findall(r"[\w']+", term.lower())
    return frozenset(w for w in words if w not in _FILLER_WORDS) or frozenset(words)


def _dedupe(rows: list) -> list:
    """Keep the higher-ranked of two rows about the same thing: same words in
    any order, or one term listed among the other's related searches."""
    kept, keys, related = [], [], []
    for row in rows:
        term = row[0].lower()
        key = _topic_key(term)
        own_related = {q.lower() for q in (row[9] if len(row) > 9 and isinstance(row[9], list) else [])
                       if isinstance(q, str)}
        duplicate = any(
            key == k or term in rel or kt in own_related
            for k, rel, kt in zip(keys, related, (r[0].lower() for r in kept))
        )
        if duplicate:
            continue
        kept.append(row)
        keys.append(key)
        related.append(own_related)
    return kept


def _ended_at(row: list) -> int | None:
    stamp = row[4] if len(row) > 4 else None
    if isinstance(stamp, list) and stamp and isinstance(stamp[0], (int, float)):
        return int(stamp[0])
    return None


def _fetch_window(hours: int, sort_key: int, geo: str, limit: int | None = LIST_LIMIT) -> list[dict]:
    inner = [None, None, geo, 0, "en", hours, sort_key]
    request_payload = [[[RPC_ID, json.dumps(inner), None, "generic"]]]
    resp = requests.post(
        BATCH_URL,
        params={"rpcids": RPC_ID, "source-path": "/trending", "hl": "en"},
        data={"f.req": json.dumps(request_payload)},
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    rows = [
        row for row in _parse_rows(resp.text)
        if isinstance(row, list) and row and isinstance(row[0], str) and not _is_spam(row[0])
    ]
    if sort_key == SORT_RECENCY:
        rows.sort(key=lambda row: -_started_at(row))
    else:
        rows.sort(key=lambda row: (-_volume(row), -_started_at(row)))
    rows = _dedupe(rows)
    items = []
    for row in rows[:limit]:
        related = row[9] if len(row) > 9 and isinstance(row[9], list) else []
        items.append({
            "rank": len(items) + 1,
            "term": row[0],
            "approx_traffic": _volume_label(row[6] if len(row) > 6 else None),
            # Unix seconds; ended_at is None while the trend is still active.
            "started_at": _started_at(row) or None,
            "ended_at": _ended_at(row),
            # Google's related searches: names and angles that say what the topic is.
            "related": [q for q in related if isinstance(q, str) and q != row[0]][:6],
            "categories": [c for c in (row[10] if len(row) > 10 and isinstance(row[10], list) else [])
                           if isinstance(c, int)],
            # Google's "In the news" article ids for this trend; news() resolves them.
            "news_ids": [n for n in (row[11] if len(row) > 11 and isinstance(row[11], list) else [])
                         if isinstance(n, list) and n and isinstance(n[0], int)][:NEWS_LIMIT],
        })
    return items


def news(news_ids: list) -> list[dict]:
    """The articles Google shows under a trend: why it is trending."""
    if not news_ids:
        return []
    request_payload = [[[NEWS_RPC_ID, json.dumps([news_ids]), None, "generic"]]]
    resp = requests.post(
        BATCH_URL,
        params={"rpcids": NEWS_RPC_ID, "source-path": "/trending", "hl": "en"},
        data={"f.req": json.dumps(request_payload)},
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.text.lstrip()
    if body.startswith(")]}'"):
        body = body[4:]
    for entry in json.loads(body):
        if isinstance(entry, list) and len(entry) >= 3 and entry[:2] == ["wrb.fr", NEWS_RPC_ID] \
                and isinstance(entry[2], str):
            parsed = json.loads(entry[2])
            articles = parsed[0] if isinstance(parsed, list) and parsed else []
            out = []
            for a in articles or []:
                if isinstance(a, list) and len(a) >= 3 and a[0] and a[1]:
                    out.append({
                        "title": a[0].strip(),
                        "url": a[1],
                        "outlet": a[2] or None,
                        "published": a[3][0] if len(a) > 3 and isinstance(a[3], list) and a[3] else None,
                        "image": a[4] if len(a) > 4 else None,
                    })
            return out
    return []


def _pack(window: str, geo: str) -> dict:
    spec = WINDOWS[window]
    return {
        "source": SOURCE_NAME,
        "range": "day" if window != "week" else "week",
        "window": window,
        "hours": spec["hours"],
        "geo": geo,
        "fetched_at": date.today().isoformat(),
        "note": spec["note"],
        "items": _fetch_window(spec["hours"], spec["sort"], geo),
    }


def get_started(geo: str = "US") -> dict:
    """Trending tab. What just started, past 4 hours."""
    return _pack("started", geo)


def get_daily(geo: str = "US") -> dict:
    """Today tab. Past 24 hours by search volume."""
    return _pack("day", geo)


def get_weekly(geo: str = "US", history_dir=None, rng=None) -> dict:
    """This week tab. Past 7 days by search volume. Live, not a local rollup."""
    del history_dir, rng
    return _pack("week", geo)
