import type { FeedItem, FeedPayload, MetricKind, RangeKind, StoryLink } from "./types";
import { sourceMeta } from "./sources";
import { listFiles, readJson } from "./store";

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function itemKey(source: string, range: RangeKind, title: string): string {
  return `${source}:${range}:${slug(title)}`;
}

function commas(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function parseTraffic(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function metric(
  kind: MetricKind,
  value: number,
  display: string,
  caption: string,
): FeedItem["metric"] {
  return { kind, value, display, caption };
}

function asRange(value: unknown, fallback: RangeKind): RangeKind {
  if (value === "week" || value === "day" || value === "trending") return value;
  return fallback;
}

function snapshotFile(range: RangeKind): string {
  if (range === "week") return "latest_week.json";
  if (range === "trending") return "latest_trending.json";
  return "latest_day.json";
}

function readSnapshot(range: RangeKind): Record<string, unknown> | null {
  return readJson(snapshotFile(range)) as Record<string, unknown> | null;
}

// The pipeline's per-topic cache (summary, links, sports/junk flags), so
// saved days pick up the latest read of a topic.
function cachedSummary(title: string): Record<string, unknown> | null {
  const data = readJson("summaries.json") as Record<string, Record<string, unknown>> | null;
  return data?.[title.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

function storyLinks(raw: unknown): StoryLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    const link = (l ?? {}) as Record<string, unknown>;
    if (typeof link.title !== "string" || typeof link.url !== "string") return [];
    return [{ title: link.title, url: link.url, outlet: typeof link.outlet === "string" ? link.outlet : null }];
  });
}

function normalizeItems(
  source: string,
  range: RangeKind,
  payload: Record<string, unknown>,
): FeedItem[] {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((raw, idx) => {
    let row = (raw ?? {}) as Record<string, unknown>;
    // Google sends lowercase terms ("sugar recall"); headlines start with a capital.
    const term = String(row.title ?? row.term ?? "Untitled").trim();
    const title = term.charAt(0).toUpperCase() + term.slice(1);
    // The cache holds the newest headline and the sports/junk read; it
    // wins over what an older saved day stored.
    const cached = cachedSummary(title);
    if (cached) row = { ...row, ...cached };
    const rank = typeof row.rank === "number" ? row.rank : idx + 1;
    const url = typeof row.url === "string" ? row.url : null;
    const domain = typeof row.domain === "string" ? row.domain : null;

    let m: FeedItem["metric"];
    if (source === "wikipedia_pageviews") {
      const views = typeof row.views === "number" ? row.views : 0;
      m = metric(
        "views",
        views,
        commas(views),
        range === "week" ? "views this week" : "views",
      );
    } else if (source === "google_trends") {
      if (typeof row.days_appeared === "number") {
        m = metric(
          "days_appeared",
          row.days_appeared,
          String(row.days_appeared),
          row.days_appeared === 1 ? "day in the last 7" : "days in the last 7",
        );
      } else {
        const trafficRaw = String(row.approx_traffic ?? "");
        const value = parseTraffic(trafficRaw);
        m = metric(
          "traffic",
          value,
          trafficRaw || "—",
          "approx. US searches",
        );
      }
    } else {
      m = metric("rank", rank, `#${rank}`, domain ? `via ${domain}` : "news mention");
    }

    return {
      key: itemKey(source, range, title),
      source,
      range,
      rank,
      title,
      url,
      domain,
      metric: m,
      image: typeof row.image === "string" ? row.image : null,
      summary: typeof row.summary === "string" ? row.summary : null,
      brief: typeof row.brief === "string" ? row.brief : null,
      links: storyLinks(row.links),
      extra: {
        pubDate: row.pub_date ?? null,
        seendate: row.seendate ?? null,
        categories: Array.isArray(row.categories) ? row.categories : [],
        sports: row.sports === true,
        junk: row.junk === true,
        foreign: row.foreign === true,
        // Google's related searches: more words for search to match on.
        related: Array.isArray(row.related) ? row.related.filter((r) => typeof r === "string") : [],
      },
    };
  });
}

export function loadFeed(
  source: string,
  range: RangeKind,
  snapshot: Record<string, unknown> | null = readSnapshot(range),
): FeedPayload {
  const meta = sourceMeta(source);
  const label = meta?.label ?? source;
  const kicker = meta?.kicker ?? source;
  const pollAfterSeconds = meta?.pollAfterSeconds ?? 300;
  const empty: FeedPayload = {
    source,
    label,
    kicker,
    range,
    asOf: null,
    fetchedAt: null,
    stale: false,
    staleReason: null,
    note: null,
    error: null,
    pollAfterSeconds,
    itemCount: 0,
    items: [],
  };

  if (!snapshot) {
    return { ...empty, error: "No snapshot on disk. Run python aggregate.py." };
  }

  const sources = (snapshot.sources ?? {}) as Record<string, Record<string, unknown>>;
  const errors = (snapshot.errors ?? {}) as Record<string, { error?: string }>;
  const payload = sources[source];
  const err = errors[source]?.error ?? null;

  if (!payload) {
    return { ...empty, error: err ?? `No data for ${source}` };
  }

  const items = normalizeItems(source, asRange(payload.range, range), payload);
  return {
    source,
    label,
    kicker,
    range,
    asOf: String(
      payload.date ?? payload.end ?? payload.fetched_at ?? snapshot.date ?? "",
    ) || null,
    fetchedAt: String(payload.fetched_at ?? snapshot.date ?? "") || null,
    stale: Boolean(payload.stale),
    staleReason: payload.stale_reason ? String(payload.stale_reason) : err,
    note: payload.note ? String(payload.note) : null,
    error: payload.stale ? null : err,
    pollAfterSeconds,
    itemCount: items.length,
    items,
  };
}

export function loadAllFeeds(range: RangeKind, sourceIds: string[]): FeedPayload[] {
  return sourceIds.map((id) => loadFeed(id, range));
}

/** When a snapshot was pulled, as the pipeline stamped it. */
export function snapshotUpdatedAt(range: RangeKind): string | null {
  const stamp = readSnapshot(range)?.updated_at;
  return typeof stamp === "string" ? stamp : null;
}

/** The dates a snapshot covers, as the pipeline declares them. */
export function snapshotWindow(range: RangeKind): { start: string; end: string } | null {
  const snapshot = readSnapshot(range);
  const start = snapshot?.start;
  const end = snapshot?.end;
  return typeof start === "string" && typeof end === "string" ? { start, end } : null;
}

// ---------------------------------------------------------------- saved days

const DAY_SOURCES = ["google_trends", "wikipedia_pageviews"];

// Days before this were test pulls; the archive starts here.
const FIRST_DAY = "2026-09-25";

/** Every saved day, oldest first ("2026-09-25"). */
export function listDays(): string[] {
  return listFiles("history")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d >= FIRST_DAY)
    .sort();
}

function readDay(date: string): Record<string, unknown> | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FIRST_DAY) return null;
  return readJson(`history/${date}.json`) as Record<string, unknown> | null;
}

/** One saved day's feeds (Google, Wikipedia, news), or null if not saved. */
export function loadDayFeeds(date: string): FeedPayload[] | null {
  const snapshot = readDay(date);
  if (!snapshot) return null;
  return DAY_SOURCES.map((id) => loadFeed(id, "day", snapshot));
}

/** Every topic that trended now on a saved day, even if it never made the day's list. */
export function loadDaySeen(date: string): FeedItem[] {
  const payload = ((readDay(date)?.sources ?? {}) as Record<string, Record<string, unknown>>).trending_seen;
  return payload ? normalizeItems("google_trends", "trending", payload) : [];
}

export function findItem(key: string): FeedItem | null {
  for (const range of ["trending", "day", "week"] as RangeKind[]) {
    const snapshot = readSnapshot(range);
    if (!snapshot) continue;
    const sources = (snapshot.sources ?? {}) as Record<string, Record<string, unknown>>;
    for (const [source, payload] of Object.entries(sources)) {
      // Keyed as loadFeed keys them: by the payload's own range when it names one.
      const match = normalizeItems(source, asRange(payload.range, range), payload).find(
        (item) => item.key === key,
      );
      if (match) return match;
    }
  }
  // Stories from saved days, newest first.
  for (const date of listDays().reverse()) {
    const feeds = loadDayFeeds(date) ?? [];
    for (const feed of feeds) {
      const match = feed.items.find((item) => item.key === key);
      if (match) return match;
    }
  }
  return null;
}
