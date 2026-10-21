import { formatDay, loadDay, localToday } from "./days";
import { listDays, loadDaySeen } from "./feeds";
import { dataVersion } from "./store";
import { horizonBase, isHorizonId, keepItem, loadHorizon, loadHorizons, type SourceList } from "./horizons";
import { storySlug } from "./slug";
import type { FeedItem } from "./types";

/*
 * Every story the site has shown — the live windows and every saved day —
 * one entry per topic, so a reader can find one by name instead of by when
 * it trended.
 */

export type Sighting = {
  /** "No. 3 today" or "No. 3 on Sep 24". */
  label: string;
  /** The list's page. */
  href: string;
  /** Where the story's address hangs off (see itemHref). */
  base: string;
  rank: number;
};

export type Story = {
  slug: string;
  /** The newest row for the topic: live windows first, then saved days, newest first. */
  item: FeedItem;
  seen: Sighting[];
  /** Order of recency: 0 = in a live window; higher = an older saved day. */
  age: number;
};

// Rebuilt only when the pipeline writes new data (or the date turns).
let cached: { version: string; stories: Map<string, Story> } | null = null;

export function loadStories(): Map<string, Story> {
  const version = `${localToday()}|${dataVersion()}`;
  if (cached?.version !== version) cached = { version, stories: buildStories() };
  return cached.stories;
}

function buildStories(): Map<string, Story> {
  const stories = new Map<string, Story>();
  const add = (item: FeedItem, sighting: Sighting, age: number) => {
    const slug = storySlug(item.title);
    const story = stories.get(slug);
    if (story) story.seen.push(sighting);
    else stories.set(slug, { slug, item, seen: [sighting], age });
  };

  for (const h of loadHorizons()) {
    for (const list of h.lists) {
      list.items.forEach((item, i) =>
        add(item, { label: `No. ${i + 1} ${h.label.toLowerCase()}`, href: `/trending/${h.id}`, base: horizonBase(h), rank: i + 1 }, 0),
      );
    }
  }
  listDays()
    .reverse()
    .forEach((date, d) => {
      const day = loadDay(date);
      const when = formatDay(date, { month: "short", day: "numeric" });
      for (const list of day?.lists ?? []) {
        list.items.forEach((item, i) =>
          add(item, { label: `No. ${i + 1} on ${when}`, href: `/day/${date}`, base: `/day/${date}`, rank: i + 1 }, d + 1),
        );
      }
      // Topics that only trended for a few hours: still findable, after the rest.
      for (const item of loadDaySeen(date).filter(keepItem)) {
        const known = stories.get(storySlug(item.title));
        if (known?.seen.some((s) => s.base === `/day/${date}`)) continue;
        add(item, { label: `Trending on ${when}`, href: `/day/${date}`, base: `/day/${date}`, rank: 100 }, d + 1);
      }
    });
  return stories;
}

export function findStory(slug: string): Story | null {
  return loadStories().get(slug) ?? null;
}

export type StoryAt = { item: FeedItem; seen: Sighting[]; ranks: string[] };

function inLists(lists: SourceList[], slug: string): { item: FeedItem; rank: number } | null {
  for (const list of lists) {
    const i = list.items.findIndex((item) => storySlug(item.title) === slug);
    if (i >= 0) return { item: list.items[i], rank: i + 1 };
  }
  return null;
}

/**
 * A story as found in one list: /trending/<window>/<date>/<slug> or
 * /day/<date>/<slug>. The row from that list when it's still there (its
 * number fits the list); otherwise the story's newest row, so an old link
 * still opens.
 */
export function findStoryAt(
  where: { horizon: string; date: string } | { day: string },
  slug: string,
): StoryAt | null {
  const story = findStory(slug);
  let hit: { item: FeedItem; rank: number } | null = null;
  let label = "";
  if ("day" in where) {
    const day = loadDay(where.day);
    hit = day ? inLists(day.lists, slug) : null;
    label = `on ${formatDay(where.day, { month: "short", day: "numeric" })}`;
  } else {
    if (!isHorizonId(where.horizon)) return null;
    const h = loadHorizon(where.horizon);
    // Only while the list still covers the date in the address.
    if (horizonBase(h).endsWith(`/${where.date}`)) hit = inLists(h.lists, slug);
    label = h.label.toLowerCase();
  }
  if (!hit && !story) return null;
  const item = hit?.item ?? story!.item;
  const seen = story?.seen ?? [];
  const ranks = hit ? [`No. ${hit.rank} ${label}`] : seen.slice(0, 1).map((x) => x.label);
  return { item, seen, ranks };
}

function fold(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Rough English stem, so "recalls", "recalled" and "recalling" meet "recall". */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Edit distance, stopping early once it passes max. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, row[j]);
    }
    if (low > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * How well one query word matches a field's words: exact 1, same stem 0.9,
 * a prefix of a word 0.8 (so results show while typing), a typo 0.6.
 */
function wordScore(q: string, words: string[], typing: boolean): number {
  const qs = stem(q);
  // Short words are too close to each other ("cold" -> "gold", "bold"):
  // typos only count from five letters.
  const typos = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  let best = 0;
  for (const w of words) {
    if (w === q) return 1;
    if (stem(w) === qs) best = Math.max(best, 0.9);
    else if (typing && q.length >= 2 && w.startsWith(q)) best = Math.max(best, 0.8);
    else if (typos && best < 0.6 && within(q, w, typos)) best = 0.6;
  }
  return best;
}

type Indexed = { story: Story; fields: { words: string[]; weight: number }[]; best: number };

// Built once per set of stories, not per keystroke.
let index: { stories: Map<string, Story>; rows: Indexed[] } | null = null;

function searchIndex(): Indexed[] {
  const stories = loadStories();
  if (index?.stories === stories) return index.rows;
  const rows = [...stories.values()].map((story) => {
    const { item } = story;
    const related = Array.isArray(item.extra?.related) ? (item.extra.related as string[]) : [];
    return {
      story,
      best: Math.min(...story.seen.map((s) => s.rank)),
      // Title counts most, then the headline and paragraph, then related
      // searches and the source articles' titles.
      fields: [
        { words: tokens(item.title), weight: 3 },
        { words: tokens(`${item.summary ?? ""} ${item.brief ?? ""}`), weight: 2 },
        { words: tokens([...related, ...(item.links ?? []).map((l) => l.title)].join(" ")), weight: 1 },
      ],
    };
  });
  index = { stories, rows };
  return rows;
}

/**
 * Stories matching every word of the query, forgiving typos and word
 * endings; the last word may be half typed. Best matches first, then the
 * most recent and best ranked.
 */
export function searchStories(query: string): Story[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const scored: { row: Indexed; score: number }[] = [];
  for (const row of searchIndex()) {
    let score = 0;
    const all = words.every((q, i) => {
      const typing = i === words.length - 1;
      const s = Math.max(...row.fields.map((f) => wordScore(q, f.words, typing) * f.weight));
      score += s;
      return s > 0;
    });
    if (all) scored.push({ row, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.row.story.age - b.row.story.age || a.row.best - b.row.best,
  );
  return scored.map((s) => s.row.story);
}
