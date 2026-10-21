import { StoryList } from "@/components/Front";
import { Masthead } from "@/components/Masthead";
import { Pager } from "@/components/Pager";
import { searchStories } from "@/lib/search";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/** Find a story by name, across the live windows and every saved day. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await loadData();
  const { q = "", page: asked } = await searchParams;
  const query = q.trim();
  const results = query ? searchStories(query) : [];
  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(asked) || 1));
  const offset = (page - 1) * PER_PAGE;

  return (
    <div className="shell">
      <Masthead active="search" query={query} />
      <main className="list-page">
        <header className="horizon-head list-head">
          <h1 className="horizon-label">{query ? `“${query}”` : "Search"}</h1>
          {query && (
            <p className="horizon-fresh">
              {results.length === 0
                ? "No stories"
                : `${results.length} ${results.length === 1 ? "story" : "stories"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
            </p>
          )}
        </header>

        {!query ? (
          <p className="horizon-empty">Search every story on the lists and every saved day.</p>
        ) : results.length === 0 ? (
          <p className="horizon-empty">Nothing matches “{query}”. Try fewer words.</p>
        ) : (
          <StoryList
            items={results.slice(offset, offset + PER_PAGE).map((s) => s.item)}
            notes={results.slice(offset, offset + PER_PAGE).map((s) => s.seen[0]?.label ?? "")}
            bases={results.slice(offset, offset + PER_PAGE).map((s) => s.seen[0]?.base ?? "/story")}
            wide
            firstRank={offset + 1}
          />
        )}

        {pages > 1 && (
          <Pager base="/search" extra={`q=${encodeURIComponent(query)}`} page={page} pages={pages} />
        )}
      </main>
    </div>
  );
}
