import { AutoRefresh } from "@/components/AutoRefresh";
import Link from "next/link";
import { HorizonSection, freshness } from "@/components/Front";
import { Masthead } from "@/components/Masthead";
import { loadHorizons, pickList } from "@/lib/horizons";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

// Trending now | today on top; this week's Google and Wikipedia lists below.
export default async function Home() {
  await loadData();
  const horizons = loadHorizons();
  const get = (id: string) => horizons.find((h) => h.id === id)!;
  const [now, today, week] = [get("now"), get("today"), get("week")];
  const missing = [
    ...new Map([now, today, week].flatMap((h) => h.missing).map((m) => [m.label, m])).values(),
  ];

  return (
    <div className="shell">
      <AutoRefresh seconds={15 * 60} />
      <Masthead />
      <main className="front">
        <HorizonSection horizon={now} list={pickList(now.lists)} side="left" limit={7} />
        <HorizonSection horizon={today} list={pickList(today.lists, "google")} side="right" limit={7} />

        {/* This week: Google searches | Wikipedia, each its own list. */}
        <header className="horizon-head front-band">
          <h2 className="horizon-label">
            <Link href="/trending/week">{week.label}</Link>
          </h2>
          <p className="horizon-fresh">{freshness(week)}</p>
        </header>
        {["google", "wikipedia"].map((slug, i) => {
          const list = week.lists.find((l) => l.slug === slug) ?? null;
          return (
            <HorizonSection
              key={slug}
              horizon={week}
              list={list}
              label={list?.label ?? (slug === "google" ? "Google searches" : "Wikipedia")}
              fresh={null}
              side={i === 0 ? "left" : "right"}
              limit={7}
            />
          );
        })}

        <footer className="method">
          <p>
            Google counts searches; Wikipedia counts page views. The numbers don’t
            compare, so each keeps its own list.
          </p>
          {missing.length > 0 && (
            <p>
              Not in this edition:{" "}
              {missing.map((m) => `${m.label} (${m.reason})`).join("; ")}.
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}
