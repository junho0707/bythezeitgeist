import Link from "next/link";
import type { SourceList } from "@/lib/horizons";
import { addDays, formatDay, weekday } from "@/lib/days";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TOP = 5;

/**
 * Days from start to end on a Sunday-first grid. A saved day shows its top
 * five searches and opens the full day; a day not saved yet stays blank.
 */
export function DayCalendar({
  start,
  end,
  days,
}: {
  start: string;
  end: string;
  days: Map<string, SourceList[]>;
}) {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const lead = weekday(start);

  return (
    <div className="day-cal">
      {WEEKDAYS.map((w) => (
        <div key={w} className="day-cal-weekday" aria-hidden>
          {w}
        </div>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <div key={`lead-${i}`} className="day-cell pad" aria-hidden />
      ))}
      {dates.map((date) => {
        // The day's top Google searches; the day page has every list.
        const items = days.get(date)?.[0]?.items;
        const label = formatDay(date, { weekday: "long", month: "long", day: "numeric" });
        const num = Number(date.slice(8));
        if (!items || items.length === 0) {
          return (
            <div key={date} className="day-cell unsaved">
              <span className="day-num" title={label}>{num}</span>
            </div>
          );
        }
        return (
          <article key={date} className="day-cell">
            <h3 className="day-num">
              <Link href={`/day/${date}`} className="day-link" aria-label={label}>
                <span className="day-weekday">{formatDay(date, { weekday: "short" })} </span>
                {num}
              </Link>
            </h3>
            <ol className="day-top">
              {items.slice(0, TOP).map((item) => (
                <li key={item.key}>{item.title}</li>
              ))}
            </ol>
          </article>
        );
      })}
    </div>
  );
}
