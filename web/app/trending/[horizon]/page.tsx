import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SourceLists, freshness, pageCount } from "@/components/Front";
import { Masthead } from "@/components/Masthead";
import { Pager } from "@/components/Pager";
import { horizonBase, isHorizonId, loadHorizon } from "@/lib/horizons";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

export default async function HorizonPage({
  params,
  searchParams,
}: {
  params: Promise<{ horizon: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await loadData();
  const { horizon: id } = await params;
  if (!isHorizonId(id)) notFound();
  const query = await searchParams;
  const horizon = loadHorizon(id);
  // Paired lists (Google | Wikipedia) page per column; a single list pages here.
  const paired = horizon.lists.length > 1;
  const pages = paired ? 1 : pageCount(horizon.lists, PER_PAGE);
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
  const offset = (page - 1) * PER_PAGE;

  return (
    <div className="shell">
      {id === "now" && <AutoRefresh seconds={15 * 60} />}
      <Masthead active={id} />
      <main className="list-page">
        <header className="horizon-head list-head">
          <h1 className="horizon-label">{horizon.question}</h1>
          <p className="horizon-fresh">
            {[
              freshness(horizon),
              pages > 1 ? `page ${page} of ${pages}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {horizon.lists.length === 0 ? (
          <p className="horizon-empty">{horizon.note}</p>
        ) : (
          <SourceLists
            lists={horizon.lists}
            offset={offset}
            perPage={PER_PAGE}
            base={horizonBase(horizon)}
            pager={{ pages: query }}
          />
        )}

        {pages > 1 && (
          <Pager
            base={`/trending/${id}`}
            page={page}
            pages={pages}
          />
        )}


        {horizon.missing.length > 0 && (
          <footer className="method">
            <p>
              Not in this list:{" "}
              {horizon.missing.map((m) => `${m.label} (${m.reason})`).join("; ")}.
            </p>
          </footer>
        )}
      </main>
    </div>
  );
}
