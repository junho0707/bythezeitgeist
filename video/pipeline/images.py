"""
Zeitgeist step 3: one copyright-safe photo per story.

  python3 pipeline/images.py episodes/morning_2026-09-26

Order of preference, per story (script.json):
  1. the lead photo of the story's Wikipedia article, if it lives on Wikimedia
     Commons under a free licence (public domain, CC0, CC BY, CC BY-SA).
     Non-free files (film posters, logos, news photos) are local to Wikipedia
     and never on Commons, so they are skipped automatically.
  2. Pexels (free for commercial use) for the photo_query, if PEXELS_API_KEY is set
  3. a Commons search for the photo_query, same licence filter
  4. nothing: the story renders as a text card

Every source now offers a few candidates; a vision model (IMAGE_MODEL) looks at
them next to the story and keeps the best one scoring >= MIN_SCORE, else the
story gets a text card. Each pick and its score is logged to credits.json.

Writes images/NN.jpg (NN = story number) and credits.json, which carries the
author/licence for the on-screen credit line and the post description.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

ZG_DIR = Path(os.environ.get("ZEITGEIST_DIR", Path(__file__).resolve().parents[2] / "zeitgeist"))
sys.path.insert(0, str(ZG_DIR))
import env  # noqa: E402,F401
import llm  # noqa: E402
import requests  # noqa: E402

UA = {"User-Agent": f"TheZeitgeistShorts/0.1 ({os.environ.get('WIKI_CONTACT_EMAIL', 'contact@example.com')})"}
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
FREE = re.compile(r"^(public domain|pd\b|pd-|cc0|cc by(-sa)? ?\d|cc-by(-sa)?-\d|cc by(-sa)?$)", re.I)
MIN_WIDTH = 500
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "gpt-5.4-mini")
MIN_SCORE = int(os.environ.get("IMAGE_MIN_SCORE", "6"))


def strip(s) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", str(s or ""))).strip()


def commons_info(file_title: str, api: str = COMMONS) -> dict | None:
    """Metadata for one free file, or None. Commons first; Wikipedia's own
    uploads are checked too, since old public-domain photos often live there
    (non-free uploads carry NonFree=true and are rejected)."""
    r = requests.get(api, headers=UA, timeout=30, params={
        "action": "query", "format": "json", "titles": file_title, "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1400,
    }).json()
    page = next(iter(r.get("query", {}).get("pages", {}).values()), {})
    if "missing" in page or not page.get("imageinfo"):
        return commons_info(file_title, WIKI) if api == COMMONS else None
    info = page["imageinfo"][0]
    meta = {k: strip(v.get("value")) for k, v in (info.get("extmetadata") or {}).items()}
    lic = meta.get("LicenseShortName", "")
    if meta.get("NonFree", "").lower() == "true" or not FREE.match(lic):
        return None
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp") or info.get("width", 0) < MIN_WIDTH:
        return None
    if info.get("width", 0) < info.get("height", 1) * 0.5:
        return None  # banners/strips
    return {
        "url": info.get("thumburl") or info["url"],
        "page": info.get("descriptionurl"),
        "author": re.sub(r"\s+", " ", meta.get("Artist", "") or "Unknown")[:80],
        "license": lic,
        "license_url": meta.get("LicenseUrl"),
        "file": file_title,
    }


def wiki_lead(title: str) -> dict | None:
    r = requests.get(WIKI, headers=UA, timeout=30, params={
        "action": "query", "format": "json", "titles": title, "prop": "pageimages",
        "piprop": "name", "redirects": 1,
    }).json()
    page = next(iter(r.get("query", {}).get("pages", {}).values()), {})
    name = page.get("pageimage")
    return commons_info(f"File:{name}") if name else None


def commons_search(query: str, must_name: bool = False, limit: int = 1) -> list[dict]:
    """Up to `limit` free images for the query. must_name: the file's own title has to
    contain every word of the query (a photo of that person, not a namesake scene)."""
    r = requests.get(COMMONS, headers=UA, timeout=30, params={
        "action": "query", "format": "json", "list": "search", "srnamespace": 6,
        "srsearch": f"{query} filetype:bitmap", "srlimit": 8,
    }).json()
    words = re.findall(r"\w+", query.lower())
    out = []
    for hit in r.get("query", {}).get("search", []):
        if must_name and not all(w in hit["title"].lower() for w in words):
            continue
        info = commons_info(hit["title"])
        if info:
            out.append(info)
            if len(out) >= limit:
                break
    return out


def is_person(title: str) -> bool:
    """Wikidata says the article is about a human (instance of Q5)."""
    r = requests.get(WIKI, headers=UA, timeout=30, params={
        "action": "query", "format": "json", "titles": title, "prop": "pageprops",
        "ppprop": "wikibase_item", "redirects": 1,
    }).json()
    page = next(iter(r.get("query", {}).get("pages", {}).values()), {})
    qid = page.get("pageprops", {}).get("wikibase_item")
    if not qid:
        return False
    claims = requests.get("https://www.wikidata.org/w/api.php", headers=UA, timeout=30, params={
        "action": "wbgetclaims", "format": "json", "entity": qid, "property": "P31",
    }).json().get("claims", {}).get("P31", [])
    return any(c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == "Q5" for c in claims)


def pexels(query: str, limit: int = 5) -> list[dict]:
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return []
    r = requests.get("https://api.pexels.com/v1/search", timeout=30, headers={"Authorization": key},
                     params={"query": query, "per_page": limit, "orientation": "landscape"}).json()
    return [{"url": p["src"]["large2x"], "thumb": p["src"]["medium"], "page": p["url"], "author": p["photographer"],
             "license": "Pexels License", "license_url": "https://www.pexels.com/license/", "file": None}
            for p in r.get("photos", [])]


def judge(story: dict, cands: list[dict]) -> tuple[int | None, list[int], str, list[str]]:
    """Vision check: which candidate best illustrates the story. Returns
    (index or None, scores, reason, better searches to try)."""
    prompt = (
        "A news Short shows one photo while the narrator reads this story.\n"
        f"Headline: {story['title']}\nNarration: {story['narration']}\n\n"
        f"Score each of the {len(cands)} photos below 0-10 for how clearly a viewer would connect it "
        "to THIS story at a glance. 8-10: shows the actual subject (the person, place, product, event). "
        "5-7: a fitting generic scene. 0-4: off-topic, misleading, or a different identifiable person "
        "than the story is about; also 0 for visible logos/text of an unrelated brand. "
        "If no photo scores 8+, suggest 2 other stock-photo searches (1-3 plain words) that would show "
        "the subject itself: the product, object or kind of place, e.g. 'rubber clogs', 'bag of sugar', "
        "'capitol building'. Never a real person's name. "
        'Reply JSON only: {"scores": [..], "best": <0-based index>, "reason": "<short>", "retry": ["..", ".."]}')
    try:
        text = llm.respond("Score the photos as asked.", prompt, model=IMAGE_MODEL, timeout=300,
                           images=[c.get("thumb") or c["url"] for c in cands])
    except llm.LLMError as e:
        print(f"[images]    vision check failed ({e}); keeping the first candidate")
        return 0, [], "vision check failed", []
    try:
        r = json.loads(text[text.find("{"): text.rfind("}") + 1])
        scores = [int(x) for x in r["scores"]]
    except (ValueError, KeyError, TypeError):
        return 0, [], "unreadable vision reply", []
    best = max(range(len(scores)), key=scores.__getitem__) if scores else None
    retry = [q for q in r.get("retry") or [] if isinstance(q, str) and q.strip()][:2]
    if best is None or scores[best] < MIN_SCORE:
        return None, scores, r.get("reason", ""), retry
    return best, scores, r.get("reason", ""), retry if scores[best] < 8 else []


def title_from_url(url: str) -> str:
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", type=Path)
    args = ap.parse_args()
    ep = args.episode
    script = json.loads((ep / "script.json").read_text())
    (ep / "images").mkdir(exist_ok=True)

    credits = []
    for n, story in enumerate(script["stories"], start=1):
        # The article itself for Wikipedia stories; the model's pick otherwise
        # (the site's search-matched links can point at a namesake).
        titles = [story.get("wiki_title")]
        if story.get("kind") == "wikipedia":
            titles += [story["candidate"]] + [title_from_url(u) for u in story.get("wiki_links", [])]
        titles = [t for t in titles if t]
        cands = []  # (candidate, how)
        for t in dict.fromkeys(titles):
            lead = wiki_lead(t)
            if lead:
                cands.append((lead, f"wikipedia:{t}"))
                break
        # A free Commons photo named after the person, if the story is about one.
        for t in dict.fromkeys(titles):
            if is_person(t):
                name = re.sub(r"\s*\(.*?\)", "", t)
                cands += [(c, f"commons-name:{name}") for c in commons_search(name, must_name=True, limit=2)]
                break
        query = story.get("photo_query")
        if not query or str(query).strip().lower() in ("null", "none"):
            query = None
        # Generic scenes: Pexels (Commons search turns up news photos of
        # identifiable people for queries like "credit card refund").
        if query:
            cands += [(c, f"pexels:{query}") for c in pexels(query)]
            if len(cands) < 3:
                cands += [(c, f"commons:{query}") for c in commons_search(query, limit=3)]
        cands = cands[:8]
        i, scores, retry = None, [], []
        if cands:
            i, scores, reason, retry = judge(story, [c for c, _ in cands])
            print(f"[images] {n:02d} scores {scores} -> {'#' + str(i) if i is not None else 'none'} ({reason})")
        # Nothing clearly on-topic (< 8): one more round with the searches the
        # model suggested; the higher-scoring pick of the two rounds wins.
        if retry:
            more = [(c, f"pexels:{q}") for q in retry for c in pexels(q, limit=4)][:8]
            if more:
                j, s2, reason, _ = judge(story, [c for c, _ in more])
                print(f"[images] {n:02d} retry {retry} scores {s2} -> {'#' + str(j) if j is not None else 'none'} ({reason})")
                if j is not None and (i is None or s2[j] > scores[i]):
                    i, scores, cands = j, s2, more
        found = how = None
        if i is not None:
            found, how = cands[i]
            found = {k: v for k, v in found.items() if k != "thumb"}
            if scores:
                found["score"] = scores[i]
        if not found:
            print(f"[images] {n:02d} {story['title']}: no fitting free photo, text card")
            credits.append({"n": n, "image": None})
            continue
        path = ep / "images" / f"{n:02d}.jpg"
        img = requests.get(found["url"], headers=UA, timeout=60)
        img.raise_for_status()
        path.write_bytes(img.content)
        credits.append({"n": n, "image": f"images/{path.name}", "via": how, **found})
        print(f"[images] {n:02d} {story['title']}: {found['license']} by {found['author']} ({how})")

    (ep / "credits.json").write_text(json.dumps(credits, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
