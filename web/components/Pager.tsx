import Link from "next/link";

/** Previous · 1 2 3 · Next, for long lists. */
export function Pager({
  base,
  extra,
  param = "page",
  page,
  pages,
}: {
  base: string;
  /** The query param holding the page number (one per column on paired lists). */
  param?: string;
  /** Other query params to keep. */
  extra?: string;
  page: number;
  pages: number;
}) {
  const href = (n: number) => {
    const params = [n === 1 ? "" : `${param}=${n}`, extra ?? ""].filter(Boolean).join("&");
    return params ? `${base}?${params}` : base;
  };
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="pager-pages">
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
          n === page ? (
            <span key={n} className="on" aria-current="page">
              {n}
            </span>
          ) : (
            <Link key={n} href={href(n)}>
              {n}
            </Link>
          ),
        )}
      </span>
      {page < pages ? <Link href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
