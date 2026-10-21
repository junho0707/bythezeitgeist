import { loadAllFeeds, snapshotUpdatedAt, snapshotWindow } from "./feeds";
import { loadMonth, localToday } from "./days";
import { sourcesForRange } from "./sources";
import type { FeedItem, FeedPayload, RangeKind } from "./types";

/*
 * The site answers four questions: what's trending right now, today, this
 * week, this month. Each "horizon" merges the relevant source feeds into one
 * ranked list so the reader never has to reconcile three columns themselves.
 */

export type HorizonId = "now" | "today" | "week" | "month";

type HorizonConfig = {
  id: HorizonId;
  label: string;
  question: string;
  /** Snapshot range backing this horizon; null = not collected yet. */
  range: RangeKind | null;
  /** Sources in merge priority: on ties, earlier sources come first. */
  sources: string[];
  unavailableNote?: string;
};

// Each window reads the snapshot and the sources the pipeline picked for it.
export const HORIZONS: HorizonConfig[] = [
  {
    id: "now",
    label: "Trending now",
    question: "Trending now",
    range: "trending",
    sources: sourcesForRange("trending"),
  },
  {
    id: "today",
    label: "Today",
    question: "Today",
    range: "day",
    sources: sourcesForRange("day"),
  },
  {
    id: "week",
    label: "This week",
    question: "This week",
    range: "week",
    sources: sourcesForRange("week"),
  },
  {
    id: "month",
    label: "This month",
    question: "This month",
    range: null,
    sources: [],
    unavailableNote: "No days saved this month yet.",
  },
];

/** One source's list within a window. */
export type SourceList = {
  source: string;
  /** Address form, e.g. ?source=wikipedia. */
  slug: string;
  label: string;
  items: FeedItem[];
};

const LIST_NAMES: Record<string, { slug: string; label: string }> = {
  google_trends: { slug: "google", label: "Google searches" },
  wikipedia_pageviews: { slug: "wikipedia", label: "Wikipedia" },
};

export type Horizon = {
  id: HorizonId;
  label: string;
  question: string;
  available: boolean;
  note: string | null;
  /** Most recent data date across the merged sources, if known. */
  asOf: string | null;
  /** First and last day covered, for multi-day windows. */
  window: { start: string; end: string } | null;
  /** Latest timestamp on any item (e.g. Google's pub date), for "updated" labels. */
  updatedAt: string | null;
  /** One list per source, never mixed: numbers across sources don't compare. */
  lists: SourceList[];
  /** Sources that failed or were empty, so the page can say so honestly. */
  missing: { label: string; reason: string }[];
};

export function isHorizonId(value: string): value is HorizonId {
  return HORIZONS.some((h) => h.id === value);
}

function latestStamp(items: FeedItem[]): string | null {
  let best: number | null = null;
  for (const item of items) {
    const raw = item.extra?.pubDate ?? item.extra?.seendate;
    if (typeof raw !== "string") continue;
    const t = Date.parse(raw);
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** Google's category 17, or the summarizer's own read (Google misses
 *  some, e.g. "northwestern indiana"). */
const SPORTS = 17;

export function isSports(item: FeedItem): boolean {
  const cats = item.extra?.categories;
  return item.extra?.sports === true || (Array.isArray(cats) && cats.includes(SPORTS));
}

/** Not news for a general reader: blog posts, code repos, appeals. */
export function isJunk(item: FeedItem): boolean {
  return item.extra?.junk === true || /free bet|promo code/i.test(item.title);
}

/** A search in another language: the summarizer's flag, or letters from a
 *  non-Latin script (e.g. 刘欢). */
export function isForeign(item: FeedItem): boolean {
  return item.extra?.foreign === true || /(?!\p{Script=Latin})\p{L}/u.test(item.title);
}

/** Sports would crowd every list, junk isn't news, and the site is in
 *  English: all three stay out. */
export function keepItem(item: FeedItem): boolean {
  return !isJunk(item) && !isSports(item) && !isForeign(item);
}

/** Each source as its own list, sports and junk taken out. */
export function sourceLists(feeds: FeedPayload[]): SourceList[] {
  return feeds.flatMap((f) => {
    const items = f.items.filter(keepItem);
    const name = LIST_NAMES[f.source] ?? { slug: f.source, label: f.label };
    return items.length ? [{ source: f.source, ...name, items }] : [];
  });
}

/** The list the address asks for (?source=wikipedia), else the first. */
export function pickList(lists: SourceList[], slug?: string): SourceList | null {
  return lists.find((l) => l.slug === slug) ?? lists[0] ?? null;
}

export function loadHorizon(id: HorizonId): Horizon {
  const cfg = HORIZONS.find((h) => h.id === id)!;
  const base = { id: cfg.id, label: cfg.label, question: cfg.question };
  if (id === "month") {
    // Built from the saved days, not a snapshot of its own.
    const month = loadMonth(localToday());
    return {
      ...base,
      available: month.lists.length > 0,
      note: month.lists.length ? null : cfg.unavailableNote ?? null,
      asOf: null,
      window: { start: month.start, end: month.end },
      updatedAt: null,
      lists: month.lists,
      missing: [],
    };
  }
  if (!cfg.range) {
    return {
      ...base,
      available: false,
      note: cfg.unavailableNote ?? null,
      asOf: null,
      window: null,
      updatedAt: null,
      lists: [],
      missing: [],
    };
  }

  const feeds = loadAllFeeds(cfg.range, cfg.sources);
  const live = feeds.filter((f) => f.items.length > 0);
  const missing = feeds
    .filter((f) => f.items.length === 0)
    .map((f) => ({ label: f.label, reason: f.error ?? "No data yet" }));
  const lists = sourceLists(live);
  const items = lists.flatMap((l) => l.items);
  const asOf = live.map((f) => f.asOf).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;

  return {
    ...base,
    available: items.length > 0,
    note: items.length ? null : "Nothing filed for this window yet.",
    asOf,
    window: cfg.range === "week" ? snapshotWindow("week") : null,
    updatedAt: latestStamp(items) ?? snapshotUpdatedAt(cfg.range),
    lists,
    missing,
  };
}

export function loadHorizons(): Horizon[] {
  return HORIZONS.map((h) => loadHorizon(h.id));
}

/** Every list a story appears in, with its rank there. */
/**
 * Where a window's stories live: /trending/<window>/<date>, the date being
 * the day (trending now, today), the week's first day, or the month.
 */
export function horizonBase(h: Pick<Horizon, "id" | "asOf" | "window">): string {
  const date =
    h.id === "month"
      ? (h.window?.start ?? localToday()).slice(0, 7)
      : h.id === "week"
        ? (h.window?.start ?? localToday())
        : (h.asOf ?? localToday()).slice(0, 10);
  return `/trending/${h.id}/${date}`;
}

export function placements(title: string): { id: HorizonId; label: string; rank: number }[] {
  const k = title.toLowerCase();
  return loadHorizons().flatMap((h) =>
    h.lists.flatMap((l) => {
      const i = l.items.findIndex((item) => item.title.toLowerCase() === k);
      return i < 0 ? [] : [{ id: h.id, label: h.label, rank: i + 1 }];
    }),
  );
}
