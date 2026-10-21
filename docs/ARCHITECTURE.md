# Architecture

Three parts share one data set: an hourly **data pipeline** (`zeitgeist/`),
the **site** that reads it (`web/`), and the **video pipeline** (`video/`)
that turns an edition's top stories into a Short.

## Data pipeline (`zeitgeist/`)

Runs hourly on GitHub Actions (`.github/workflows/pipeline.yml`):

1. `blob/sync.mjs pull` restores the saved state (history, summaries cache)
   from Vercel Blob. The runner keeps nothing between runs.
2. `aggregate.py` fetches each source and writes `latest_trending.json`,
   `latest_day.json`, `latest_week.json`, plus `history/<date>.json`.
   - **Google Trends:** today's trending searches with approximate volume,
     deduplicated by topic, with spam terms dropped. Sports, junk and
     non-English topics are flagged later by the summary model, so the site can
     hide them.
     Google has no "this week" list, so the week view is rebuilt from the saved
     daily history.
   - **Wikipedia Pageviews:** the top articles per day, summed over 7 days for
     the week view; non-article pages are dropped.
   - Each list is ranked only by its own number. Sources are never blended
     into one score, so every rank on the site is explainable.
3. `enrich.py` collects context per topic (news headlines, the Wikipedia
   intro, Google's related searches, a picture), then asks `summarize.py` for
   a one-line summary and a short brief. Results are cached for 48 h and
   capped per run, so a burst of new topics is spread over a few runs.
4. `blob/sync.mjs push` uploads only the changed files, each under its content
   hash, then a small `manifest.json` that names the current version of each.

**Why Blob and a manifest:** the site never waits on the pipeline and the
files are immutable. Pages check the manifest at most once a minute and
re-fetch only files whose hash changed. There's no database for the feed data
at all.

**LLM use, kept cheap:** summaries use GPT-5.4 nano with reasoning off. Hidden
reasoning tokens are billed as output, and they were most of the bill.
`llm.py` puts one function in front of two backends: the OpenAI Responses API
and OpenCode (`opencode run` with every tool denied, in an empty directory).
The Action uses OpenAI; the video pipeline uses OpenCode's Kimi K2.7.

## Site (`web/`)

Next.js 15 App Router on Vercel.

- `lib/store.ts` reads from Blob in production (`DATA_URL`) and from local disk
  in dev; `lib/feeds.ts` and `lib/horizons.ts` turn the files into the four
  horizons (Trending now, Today, This week, This month).
- Story pages, day pages and trending items open as **modals over the list**
  through intercepting routes (`app/@modal/(.)…`), and as full pages on a
  direct visit or refresh.
- Topics with the same title merge into one story thread across days
  (`lib/slug.ts`), so a story's page shows its whole run on the lists.
- Accounts and comments live in Turso (libSQL). Sign-in is email-first: a
  password if the account has one, otherwise a 6-digit code sent with Resend.
  Google OAuth is implemented by hand (no auth library). Sessions are encrypted
  JWT cookies.
- Dates are pinned to America/New_York, since "today" means the U.S. day and
  Vercel runs in UTC.

## Video pipeline (`video/`)

`run.sh <edition>` runs the steps below. Each writes its output into
`episodes/<edition>_<date>/` and is skipped when that file already exists, so
a failed run resumes where it stopped.

| Step | File | What it does |
|---|---|---|
| pick | `pipeline/pick.py` | Stories in the edition's window (e.g. midday = Google's last 12 h), above a volume floor, no sports |
| write | `pipeline/write.py` | LLM writes five stories plus intro, outro and a comment prompt, from the site's headlines only (no outside facts) |
| images | `pipeline/images.py` | License-filtered Commons and Pexels candidates; a vision model scores them against the story and retries with better searches |
| voice | `pipeline/tts.py` | Chatterbox clones a public-domain LibriVox reader from a 14 s reference, in chunks under its ~40 s limit |
| captions | `pipeline/captions.py` | faster-whisper word timings aligned onto the script text; `(pic N)` markers become cut points |
| check | `pipeline/check.py` | Compares the transcript with the script; a bad take is re-recorded once |
| build + render | `pipeline/build.mjs`, `remotion/` | Props for the `Zeitgeist` composition; music leveled ~15 dB under the voice; renders the video and a `ZeitgeistCover` still |
| copy | `pipeline/post.py` | Titles, descriptions and captions with photo credits; the Facebook one leads with the searchable names |

The finished video, cover and copy go to `to-post/` for **posting by hand**.
Fully automated posting via the YouTube and Meta APIs worked, but reach was
better for posts published by hand, so the pipeline stops at drafts.
`zg.sh` picks the edition due by the clock and reuses anything cron already
rendered.
