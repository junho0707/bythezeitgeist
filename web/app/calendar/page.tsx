import { DayCalendar } from "@/components/DayCalendar";
import { Masthead } from "@/components/Masthead";
import { formatDay, loadDays, monthBounds, savedMonths } from "@/lib/days";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Every saved day, month by month, newest month first. */
export default async function CalendarPage() {
  await loadData();
  const months = savedMonths();
  return (
    <div className="shell">
      <Masthead active="calendar" />
      <main className="list-page">
        <header className="horizon-head list-head">
          <h1 className="horizon-label">Calendar</h1>
        </header>
        {months.length === 0 && <p className="horizon-empty">No days saved yet.</p>}
        {months.map((month) => {
          const { start, end } = monthBounds(`${month}-01`);
          return (
            <section key={month} className="horizon day-section" aria-label={month}>
              <header className="horizon-head">
                <h2 className="horizon-label">{formatDay(start, { month: "long", year: "numeric" })}</h2>
              </header>
              <DayCalendar start={start} end={end} days={loadDays(start, end)} />
            </section>
          );
        })}
      </main>
    </div>
  );
}
