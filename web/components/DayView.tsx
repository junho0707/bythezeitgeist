import Link from "next/link";
import { SourceLists, pageCount } from "@/components/Front";
import { Pager } from "@/components/Pager";
import { formatDay, type SavedDay } from "@/lib/days";
import { listDays } from "@/lib/feeds";

const PER_PAGE = 25;

/** One saved day, in the Today format: its page, or a modal over the calendar. */
export function DayView({ day, query }: { day: SavedDay; query: Record<string, string | undefined> }) {
  const { date } = day;
  // Paired lists (Google | Wikipedia) page per column; a single list pages here.
  const pages = day.lists.length > 1 ? 1 : pageCount(day.lists, PER_PAGE);
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
  const offset = (page - 1) * PER_PAGE;

  const saved = listDays();
  const i = saved.indexOf(date);
  const prev = i > 0 ? saved[i - 1] : null;
  const next = i >= 0 && i < saved.length - 1 ? saved[i + 1] : null;

  return (
    <main className="list-page">
      <header className="horizon-head list-head">
        <h1 className="horizon-label">
          {formatDay(date, { weekday: "long", month: "long", day: "numeric" })}
        </h1>
        <p className="horizon-fresh">
          {[formatDay(date, { year: "numeric" }), pages > 1 ? `page ${page} of ${pages}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {day.lists.length === 0 ? (
        <p className="horizon-empty">Nothing was saved for this day.</p>
      ) : (
        <SourceLists
          lists={day.lists}
          offset={offset}
          perPage={PER_PAGE}
          base={`/day/${date}`}
          pager={{ pages: query }}
        />
      )}

      {pages > 1 && <Pager base={`/day/${date}`} page={page} pages={pages} />}

      <nav className="day-nav" aria-label="Other days">
        {prev ? (
          <Link href={`/day/${prev}`}>← {formatDay(prev, { weekday: "short", month: "short", day: "numeric" })}</Link>
        ) : (
          <span />
        )}
        <Link href="/calendar">Calendar</Link>
        {next ? (
          <Link href={`/day/${next}`}>{formatDay(next, { weekday: "short", month: "short", day: "numeric" })} →</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
