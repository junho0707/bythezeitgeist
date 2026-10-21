# web: bythezeitgeist.com

Next.js 15 (App Router) + React 19 + Tailwind 4, deployed on Vercel.

```bash
npm install
npm run dev        # reads ../zeitgeist/output/ from disk; set DATA_URL to read Vercel Blob
```

## Where things are

| | |
|---|---|
| `app/page.tsx`, `components/Front.tsx` | the front page: Trending now, Today, This week, This month |
| `app/trending/`, `app/day/`, `app/story/` | list, day-archive and story pages |
| `app/@modal/(.)…` | the same pages as modals over the list (intercepting routes) |
| `app/calendar/`, `components/DayCalendar.tsx` | the archive by day |
| `app/search/`, `lib/search.ts` | search over every story the lists have carried |
| `app/api/auth/`, `lib/auth.ts`, `lib/emailCodes.ts` | email-code / password / Google sign-in, encrypted JWT sessions |
| `app/api/comments/`, `lib/comments.ts`, `lib/db.ts` | comments, stored in Turso (libSQL) |
| `app/tiktok/`, `lib/tiktok.ts` | posting a staged video through TikTok's Content Posting API |
| `lib/store.ts` | data loading: Blob manifest, content-hashed files, one-minute check |
| `lib/feeds.ts`, `lib/horizons.ts`, `lib/stories.ts` | files to lists to story threads |

## Environment

`DATA_URL` (Blob base URL), `AUTH_SECRET`, `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`; for TikTok, `TIKTOK_CLIENT_KEY` and
`TIKTOK_CLIENT_SECRET`. Without the database variables it uses a local SQLite
file.
