"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Result = { title: string; summary: string; image: string | null; href: string; seen: string | null };

/**
 * The masthead search: matching stories drop down as you type (click one to
 * open it); Enter goes to the full results page.
 */
export function SearchBox({ query = "" }: { query?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults(data.results ?? []);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Close when clicking anywhere else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && open && active >= 0 && results[active]) {
      e.preventDefault();
      setOpen(false);
      router.push(results[active].href);
    }
  }

  const shown = open && q.trim() !== "";
  return (
    <form
      ref={box}
      action="/search"
      role="search"
      className="search-box"
      onSubmit={() => setOpen(false)}
    >
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search stories"
        aria-label="Search stories"
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls="search-results"
      />
      {shown && (
        <div className="search-drop" id="search-results" role="listbox">
          {results.length === 0 ? (
            <p className="search-none">No stories match.</p>
          ) : (
            results.map((r, i) => (
              <Link
                key={r.href}
                href={r.href}
                role="option"
                aria-selected={i === active}
                className={i === active ? "search-hit on" : "search-hit"}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="search-hit-text">
                  <span className="search-hit-title">{r.title}</span>
                  <span className="search-hit-summary">{r.summary}</span>
                  {r.seen && <span className="search-hit-seen">{r.seen}</span>}
                </span>
                {r.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" loading="lazy" />
                )}
              </Link>
            ))
          )}
          <Link href={`/search?q=${encodeURIComponent(q.trim())}`} className="search-all" onClick={() => setOpen(false)}>
            All results for “{q.trim()}” →
          </Link>
        </div>
      )}
    </form>
  );
}
