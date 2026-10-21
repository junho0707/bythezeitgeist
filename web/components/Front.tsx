import Link from "next/link";
import { PagedColumn } from "./PagedColumn";
import type { CSSProperties } from "react";
import { horizonBase, type Horizon, type SourceList } from "@/lib/horizons";
import type { FeedItem } from "@/lib/types";
import { formatDateRange, formatLongDate, formatTime, itemHref, stat, summaryOf } from "./stories/format";

/*
 * The front page sets trending now and today side by side, with this week
 * across the bottom. Every story is a row — rank, headline, one-sentence
 * summary, number — all set at one size, and the whole row opens the story.
 */

export function freshness(h: Horizon): string | null {
  if (h.id === "now") {
    const t = formatTime(h.updatedAt);
    if (t) {
      // Never let stale data pass for live: name the day unless it's today.
      const sameDay = new Date(h.updatedAt!).toDateString() === new Date().toDateString();
      return sameDay ? `Updated ${t}` : `Updated ${formatLongDate(h.updatedAt)}, ${t}`;
    }
  }
  if (h.window) return formatDateRange(h.window.start, h.window.end);
  return formatLongDate(h.asOf);
}

/** Quiet meta line: the number, and a hint that the row opens. */
export function StoryMeta({ item, note }: { item: FeedItem; note?: string }) {
  const s = stat(item);
  return (
    <p className="actions">
      <span className="meta-stat">
        {s.value} {s.unit}
      </span>
      {note && <span className="meta-stat">{note}</span>}
      <span className="read-more" aria-hidden>
        Read more →
      </span>
    </p>
  );
}

export function StoryRow({
  item,
  rank,
  note,
  base,
  withImage = false,
}: {
  item: FeedItem;
  rank: number;
  /** The list's place, for the story's address (see itemHref). */
  base?: string;
  /** Extra context on the meta line, e.g. where a search result ranked. */
  note?: string;
  /** Show the story's picture when the pipeline supplies one. */
  withImage?: boolean;
}) {
  const image = withImage ? item.image : null;
  return (
    <article className={image ? "story-row has-image" : "story-row"}>
      <span className="story-rank">{rank}</span>
      <div className="story-body">
        <h3 className="hl story-title">
          {/* Stretched over the whole row, so any click on it opens the story. */}
          <Link href={itemHref(item, base)} className="story-link">
            {item.title}
          </Link>
        </h3>
        <p className="story-summary">{summaryOf(item)}</p>
        <StoryMeta item={item} note={note} />
      </div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="story-image" src={image} alt="" loading="lazy" />
      )}
    </article>
  );
}

/**
 * Stories in `cols` columns, filled row by row (1, 2, 3 across the first
 * row), or — with `wide` — one full-width list: rank, headline with its
 * summary beneath, the number at right.
 */
export function StoryList({
  items,
  cols = 1,
  images = Infinity,
  wide = false,
  firstRank = 1,
  notes,
  base,
  bases,
}: {
  items: FeedItem[];
  notes?: string[];
  base?: string;
  /** Per-row bases, when rows come from different lists (search). */
  bases?: string[];
  cols?: 1 | 2 | 3;
  images?: number;
  wide?: boolean;
  firstRank?: number;
}) {
  const style = { "--rows": items.length } as CSSProperties;
  return (
    <div className={wide ? "story-list wide" : `story-list cols-${cols}`} style={style}>
      {items.map((item, i) => (
        <StoryRow
          key={item.key}
          item={item}
          rank={firstRank + i}
          note={notes?.[i]}
          base={bases?.[i] ?? base}
          withImage={i < images}
        />
      ))}
    </div>
  );
}

/**
 * One source's list in a window, on the front page. Pairs sit side by side
 * (`side`) and share row lines, so story N on the left sits level with
 * story N on the right.
 */
export function HorizonSection({
  horizon,
  list,
  label = horizon.label,
  fresh = freshness(horizon),
  side,
  limit = 5,
}: {
  horizon: Horizon;
  list: SourceList | null;
  label?: string;
  fresh?: string | null;
  side: "left" | "right";
  limit?: number;
}) {
  const items = list?.items ?? [];
  const shown = items.slice(0, limit);
  const more = items.length > shown.length;
  // Header + one grid row per story + "See all".
  const rows = 1 + Math.max(shown.length, 1) + (more ? 1 : 0);
  const id = `${horizon.id}-${list?.slug ?? "none"}`;
  const href = `/trending/${horizon.id}${list && horizon.lists.length > 1 ? `?source=${list.slug}` : ""}`;

  return (
    <section
      className={`horizon pair ${side}`}
      id={id}
      aria-labelledby={`${id}-label`}
      style={{ "--section-rows": rows } as CSSProperties}
    >
      <header className="horizon-head">
        <h2 id={`${id}-label`} className="horizon-label">
          {label}
        </h2>
        {fresh && <p className="horizon-fresh">{fresh}</p>}
      </header>

      {shown.length === 0 ? (
        <p className="horizon-empty">{horizon.note ?? "Nothing filed yet."}</p>
      ) : (
        <>
          <StoryList items={shown} base={horizonBase(horizon)} />
          {more && (
            <p className="see-all">
              <Link href={href}>See all {items.length} →</Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * A window's lists for one page: a single source runs full width; Google
 * searches and Wikipedia sit side by side, rows lined up across the two.
 */
export function SourceLists({
  lists,
  offset,
  perPage,
  images = Infinity,
  base,
  pager,
}: {
  lists: SourceList[];
  /** Single list: where this page starts. */
  offset: number;
  perPage: number;
  images?: number;
  base?: string;
  /** Paired lists page each column on its own: ?google=2&wikipedia=3. */
  pager?: { pages: Record<string, string | undefined> };
}) {
  if (lists.length === 1) {
    return (
      <StoryList
        items={lists[0].items.slice(offset, offset + perPage)}
        wide
        firstRank={offset + 1}
        images={images}
        base={base}
      />
    );
  }
  const pair = lists.slice(0, 2);
  return (
    <div className="front list-pair">
      {pair.map((list, i) => {
        const side = i === 0 ? "left" : "right";
        if (!pager) {
          const shown = list.items.slice(offset, offset + perPage);
          return (
            <section
              key={list.slug}
              className={`horizon pair ${side}`}
              aria-labelledby={`${list.slug}-label`}
              style={{ "--section-rows": 1 + Math.max(shown.length, 1) } as CSSProperties}
            >
              <header className="horizon-head">
                <h2 id={`${list.slug}-label`} className="horizon-label">
                  {list.label}
                </h2>
              </header>
              {shown.length === 0 ? (
                <p className="horizon-empty">No more on this page.</p>
              ) : (
                <StoryList items={shown} firstRank={offset + 1} images={images} base={base} />
              )}
            </section>
          );
        }
        // Each column pages on its own, in the browser (see PagedColumn).
        const chunks: FeedItem[][] = [];
        for (let at = 0; at < Math.max(list.items.length, 1); at += perPage) {
          chunks.push(list.items.slice(at, at + perPage));
        }
        const asked = Number(pager.pages[list.slug]) || 1;
        return (
          <PagedColumn
            key={list.slug}
            slug={list.slug}
            label={list.label}
            side={side}
            counts={chunks.map((c) => c.length)}
            initial={Math.min(chunks.length, Math.max(1, asked))}
            pages={chunks.map((chunk, n) =>
              chunk.length === 0 ? (
                <p key={n} className="horizon-empty">
                  Nothing here yet.
                </p>
              ) : (
                <StoryList key={n} items={chunk} firstRank={n * perPage + 1} images={images} base={base} />
              ),
            )}
          />
        );
      })}
    </div>
  );
}

/** Pages needed so the longest list fits. */
export function pageCount(lists: SourceList[], perPage: number): number {
  return Math.max(1, ...lists.map((l) => Math.ceil(l.items.length / perPage)));
}
