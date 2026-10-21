# zeitgeist: the data pipeline

Hourly job that builds the site's lists from Google Trends and Wikipedia
Pageviews, adds context and summaries, and syncs the result to Vercel Blob.
It runs on GitHub Actions (`../.github/workflows/pipeline.yml`).

```bash
pip install -r requirements.txt
cp .env.example .env          # WIKI_CONTACT_EMAIL, OPENAI_API_KEY (optional)
python aggregate.py           # writes output/
```

With Blob (what the Action does):

```bash
(cd blob && npm ci && node sync.mjs pull)    # restore history + summaries cache
python aggregate.py
(cd blob && node sync.mjs push)              # upload changed files + manifest
```

## Files

| | |
|---|---|
| `aggregate.py` | runs the sources, writes `latest_{trending,day,week}.json` and `history/<date>.json` |
| `sources/google_trends.py` | trending searches with volume; the week view is rebuilt from saved history |
| `sources/wikipedia_pageviews.py` | top articles per day, summed for the week |
| `sources/timeframe.py` | shared day/week windows (U.S. Eastern) |
| `rank.py` | ranks each list by its own number only |
| `enrich.py` | headlines, Wikipedia intro, related searches and a picture per topic; summary cache (48 h) |
| `summarize.py` | batched summaries with phrase filters and a corrective retry; sports/junk/foreign flags |
| `llm.py` | one call, two backends: OpenAI Responses API or OpenCode (`LLM_PROVIDER`) |
| `blob/sync.mjs` | content-hashed upload/download + `manifest.json` |
| `blob/stage-video.mjs` | stages a finished Short for the site's TikTok page |
| `test_rank.py` | ranking tests (`python -m unittest test_rank`) |

Without an LLM configured, summaries fall back to the top headline.
