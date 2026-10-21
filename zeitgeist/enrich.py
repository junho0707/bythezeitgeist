"""
Adds what a reader needs to make sense of each topic, in place, to every item
in the snapshots:

  summary  one sentence: what it is and why it's in the news
  brief    2-3 sentences for the story page
  links    coverage: the news articles and the Wikipedia page
  image    a picture, when a source offers one

Context comes from free sources: Google Trends' RSS feed and "In the news"
articles (headlines and a picture), and Wikipedia's page summaries. summarize.py turns it into prose; without an API
key the summary falls back to the top headline.

Results are cached in output/summaries.json by topic, so a topic that stays
on the lists is looked up and paid for once a day, not on every pull.
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests

import summarize
from sources import google_trends
from sources.wikipedia_pageviews import _headers as wiki_headers

CACHE_PATH = Path(__file__).resolve().parent / "output" / "summaries.json"
REFRESH_AFTER = timedelta(hours=48)  # 24 h redid every topic daily, the bulk of the cost
# Upper bound on new topics per run.
MAX_NEW_PER_RUN = 200

TRENDS_RSS = "https://trends.google.com/trending/rss?geo=US"
HT = "{https://trends.google.com/trending/rss}"
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().lower())


def _title(item: dict) -> str | None:
    value = item.get("title") or item.get("term")
    return value if isinstance(value, str) and value.strip() else None


def _load_cache() -> dict:
    try:
        return json.loads(CACHE_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _fresh(entry: dict | None) -> bool:
    if not entry:
        return False
    try:
        at = datetime.fromisoformat(entry["updated_at"])
    except (KeyError, ValueError):
        return False
    # Headline-only entries are retried as soon as a model is available.
    if entry.get("by") != "model" and summarize.available():
        return False
    # So are headlines written before a phrase was banned.
    if entry.get("summary") and not summarize._clean(entry["summary"]) and summarize.available():
        return False
    return _now() - at < REFRESH_AFTER


# ---------------------------------------------------------------- sources


def _trends_rss() -> dict[str, dict]:
    """term -> {"headlines": [...], "picture": url} from Google's own feed."""
    try:
        resp = requests.get(TRENDS_RSS, timeout=20)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as e:
        print(f"[summaries] trends feed unavailable: {e}")
        return {}
    out = {}
    for node in root.iter("item"):
        term = node.findtext("title")
        if not term:
            continue
        headlines = []
        for news in node.findall(f"{HT}news_item"):
            title = news.findtext(f"{HT}news_item_title")
            url = news.findtext(f"{HT}news_item_url")
            if title and url:
                headlines.append({
                    "title": title.strip(),
                    "url": url.strip(),
                    "outlet": (news.findtext(f"{HT}news_item_source") or "").strip() or None,
                })
        out[_key(term)] = {"headlines": headlines, "picture": node.findtext(f"{HT}picture")}
    return out


# Google Trends' "In the news" articles: the reason a trend is trending.
# Trends rows carry article ids; the index maps each trend's term and its
# related searches to them, so Wikipedia topics that are also trending on
# Google (e.g. "Lizzie Borden") get the same news.
_trend_index: dict[str, list] | None = None


def _trend_news_index() -> dict[str, list]:
    global _trend_index
    if _trend_index is None:
        _trend_index = {}
        for hours, sort in [(4, google_trends.SORT_RECENCY), (24, google_trends.SORT_VOLUME),
                            (168, google_trends.SORT_VOLUME)]:
            try:
                items = google_trends._fetch_window(hours, sort, "US")
            except Exception as e:
                print(f"[summaries] trends index ({hours}h) unavailable: {e}")
                continue
            for item in items:
                if not item.get("news_ids"):
                    continue
                for name in [item["term"], *item.get("related", [])]:
                    _trend_index.setdefault(_key(name), item["news_ids"])
    return _trend_index


def _trend_headlines(item: dict, title: str) -> tuple[list[dict], str | None]:
    ids = item.get("news_ids") or _trend_news_index().get(_key(title))
    if not ids:
        return [], None
    try:
        articles = google_trends.news(ids)
    except Exception as e:
        print(f"[summaries] trends news failed for {title!r}: {e}")
        return [], None
    headlines = [{"title": a["title"], "url": a["url"], "outlet": a["outlet"]} for a in articles]
    picture = next((a["image"] for a in articles if a.get("image")), None)
    return headlines, picture


def _wiki_summary(page: str) -> dict | None:
    try:
        resp = requests.get(WIKI_SUMMARY + quote(page.replace(" ", "_"), safe=""),
                            headers=wiki_headers(), timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception:
        return None
    if data.get("type") == "disambiguation" or not data.get("extract"):
        return None
    return {
        "title": data.get("title") or page,
        "extract": data["extract"],
        "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page"),
        "thumbnail": (data.get("thumbnail") or {}).get("source"),
    }


def _wiki_search(term: str) -> dict | None:
    try:
        resp = requests.get(WIKI_API, headers=wiki_headers(), timeout=15, params={
            "action": "query", "list": "search", "srsearch": term,
            "srlimit": 1, "format": "json",
        })
        hits = resp.json().get("query", {}).get("search", [])
    except Exception:
        return None
    return _wiki_summary(hits[0]["title"]) if hits else None


# ---------------------------------------------------------------- context

_STOP = {
    "the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "who",
    "how", "why", "new", "news", "today", "live", "game", "games", "score", "scores",
    "near", "your", "you", "are", "was", "has", "have", "will", "its", "his", "her",
}


def _words(text: str) -> set[str]:
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    words = {w for w in re.findall(r"[a-z0-9]+", folded) if len(w) > 2 and w not in _STOP}
    # "classrooms" should match "classroom".
    return {w[:-1] if len(w) > 4 and w.endswith("s") else w for w in words}


def _on_topic(headlines: list[dict], title: str, related: list[str]) -> list[dict]:
    """Headlines that share a word with the topic or its related searches.
    Google sometimes files unrelated articles under a trend ("northwestern
    indiana" got a book review about Princess Diana); those would mislead
    the model."""
    words = _words(" ".join([title, *related]))
    if not words:  # e.g. a non-Latin title: nothing to compare against
        return headlines
    return [h for h in headlines if _words(h["title"]) & words]



def _context(source: str, item: dict, title: str, trends: dict) -> dict:
    """Everything we know about one topic, for the model and for the page."""
    headlines: list[dict] = []
    picture = None
    wiki = None

    from_feed = trends.get(_key(title))
    if from_feed and from_feed["headlines"]:
        headlines, picture = from_feed["headlines"], from_feed["picture"]
    else:
        headlines, picture = _trend_headlines(item, title)
    related = item.get("related") or []
    kept = _on_topic(headlines, title, related)
    if len(kept) < len(headlines):
        # The picture came with the articles; keep it only if one survived.
        picture = picture if kept else None
        headlines = kept
    wiki = _wiki_summary(title) if source == "wikipedia_pageviews" else _wiki_search(title)

    return {
        "topic": title,
        "headlines": headlines,
        "related": related,
        "wikipedia": wiki,
        "picture": picture or (wiki or {}).get("thumbnail"),
    }


def _links(ctx: dict) -> list[dict]:
    links = [dict(h) for h in ctx["headlines"]]
    wiki = ctx["wikipedia"]
    if wiki and wiki.get("url"):
        links.append({"title": wiki["title"], "url": wiki["url"], "outlet": "Wikipedia"})
    return links


def _fallback_summary(source: str, ctx: dict) -> str | None:
    # Only without a model: a raw news title reads as clickbait, can be in
    # another language, or be about something else entirely.
    if ctx["headlines"] and not summarize.available():
        return ctx["headlines"][0]["title"]
    if source == "wikipedia_pageviews" and ctx["wikipedia"]:
        first = re.split(r"(?<=[.!?])\s", ctx["wikipedia"]["extract"], maxsplit=1)[0]
        return first
    return None


# ---------------------------------------------------------------- entry point


def attach(snapshots: list[dict]) -> None:
    """Fill summary/brief/links/image on every item of these snapshots."""
    cache = _load_cache()
    entries = []  # (source, item, title, key)
    for snap in snapshots:
        for source, payload in (snap.get("sources") or {}).items():
            for item in payload.get("items") or []:
                title = _title(item)
                if title:
                    entries.append((source, item, title, _key(title)))

    todo, seen = [], set()
    for source, item, title, key in entries:
        if key in seen or _fresh(cache.get(key)):
            continue
        seen.add(key)
        todo.append((source, item, title, key))
    if len(todo) > MAX_NEW_PER_RUN:
        print(f"[summaries] {len(todo)} new topics; doing {MAX_NEW_PER_RUN} now, the rest next run")
        todo = todo[:MAX_NEW_PER_RUN]

    if todo:
        trends = _trends_rss()
        contexts = {}
        for source, item, title, key in todo:
            contexts[key] = (source, _context(source, item, title, trends))
            time.sleep(0.2)  # be gentle with Wikipedia

        # Only ask the model about topics we found something on; with nothing
        # to go on it could only guess.
        grounded = {k: v for k, v in contexts.items()
                    if v[1]["headlines"] or v[1]["wikipedia"] or v[1]["related"]}
        written = {}
        if summarize.available():
            written = summarize.summarize([
                {
                    "id": key,
                    "topic": ctx["topic"],
                    "headlines": [h["title"] + (f" ({h['outlet']})" if h.get("outlet") else "")
                                  for h in ctx["headlines"]],
                    "wikipedia": (ctx["wikipedia"] or {}).get("extract"),
                    "related_searches": ctx["related"],
                }
                for key, (source, ctx) in grounded.items()
            ])
        else:
            print("[summaries] no model set up (llm.py); using headlines")

        stamp = _now().isoformat(timespec="seconds")
        for key, (source, ctx) in contexts.items():
            model = written.get(key)
            cache[key] = {
                "summary": model["summary"] if model else _fallback_summary(source, ctx),
                "brief": model["brief"] if model else None,
                "links": _links(ctx),
                "image": ctx["picture"],
                "sports": bool(model and model["sports"]),
                "foreign": bool(model and model["foreign"]),
                "junk": bool(model and model["junk"]),
                "by": "model" if model else "headline",
                "updated_at": stamp,
            }
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False))
        print(f"[summaries] {len(written)} written by {summarize.MODEL}, "
              f"{len(contexts) - len(written)} from headlines")
        if summarize.llm.usage["requests"]:
            print("[summaries] tokens: {requests} requests, {input} in, {output} out "
                  "({reasoning} of them reasoning)".format(**summarize.llm.usage))

    for source, item, title, key in entries:
        entry = cache.get(key)
        if not entry:
            continue
        for field in ("summary", "brief", "links", "image"):
            if entry.get(field):
                item[field] = entry[field]
        # The model's read of the topic: lets the site hide sports, junk and
        # non-English topics.
        item["sports"] = bool(entry.get("sports"))
        item["junk"] = bool(entry.get("junk"))
        item["foreign"] = bool(entry.get("foreign"))
