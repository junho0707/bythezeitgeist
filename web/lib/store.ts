import fs from "node:fs";
import path from "node:path";

/*
 * Where the pipeline's JSON lives. Locally: zeitgeist/output on disk. In
 * production: Vercel Blob, listed by manifest.json ({files: {name: {url,
 * hash}}}), which the pipeline's upload step rewrites every run.
 *
 * Reads are synchronous so the list code stays simple; in production a page
 * awaits loadData() first, which fetches whatever changed.
 */

const OUTPUT_DIR = path.resolve(process.cwd(), "..", "zeitgeist", "output");

/** The Blob store's public address, set on Vercel only; unset, read disk. */
const REMOTE = process.env.DATA_URL?.replace(/\/+$/, "") || null;

type Manifest = { files: Record<string, { url: string; hash: string }> };

// Remote: the files as last fetched, by name ("history/2026-09-25.json").
const remote = new Map<string, { hash: string; data: unknown }>();
let checkedAt = 0;
let loading: Promise<void> | null = null;

async function refresh(): Promise<void> {
  const res = await fetch(`${REMOTE}/manifest.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  // last_ok/ is the pipeline's own fallback; the site never reads it.
  for (const name of Object.keys(manifest.files)) if (name.startsWith("last_ok/")) delete manifest.files[name];
  await Promise.all(
    Object.entries(manifest.files).map(async ([name, f]) => {
      if (remote.get(name)?.hash === f.hash) return;
      // Each version has its own address, so it can be cached for good.
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      remote.set(name, { hash: f.hash, data: await r.json() });
    }),
  );
  for (const name of remote.keys()) if (!(name in manifest.files)) remote.delete(name);
  checkedAt = Date.now();
}

/** Before a page reads any data: in production, fetch what changed (at most once a minute). */
export async function loadData(): Promise<void> {
  if (!REMOTE || Date.now() - checkedAt < 60_000) return;
  loading ??= refresh()
    .catch((e) => {
      // Keep serving what we have; with nothing at all, fail loudly.
      if (remote.size === 0) throw e;
      console.error("[data] refresh failed:", e);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// Local: parsed files, reread when the file changes.
const local = new Map<string, { mtime: number; data: unknown }>();

/** A data file by name ("latest_day.json", "history/2026-09-25.json"), or null. */
export function readJson(name: string): unknown {
  if (REMOTE) return remote.get(name)?.data ?? null;
  const file = path.join(OUTPUT_DIR, name);
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = local.get(name);
    if (hit?.mtime === mtime) return hit.data;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    local.set(name, { mtime, data });
    return data;
  } catch {
    return null;
  }
}

/** File names under a folder ("history"), without the folder. */
export function listFiles(dir: string): string[] {
  if (REMOTE) {
    const prefix = `${dir}/`;
    return [...remote.keys()].filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
  }
  try {
    return fs.readdirSync(path.join(OUTPUT_DIR, dir));
  } catch {
    return [];
  }
}

/** Changes whenever any data file does, so callers can cache on it. */
export function dataVersion(): string {
  if (REMOTE) return [...remote.values()].map((f) => f.hash).join("|");
  const stamp = (name: string) => {
    try {
      return fs.statSync(path.join(OUTPUT_DIR, name)).mtimeMs;
    } catch {
      return 0;
    }
  };
  const names = ["latest_trending.json", "latest_day.json", "latest_week.json", "summaries.json"];
  names.push(...listFiles("history").map((f) => `history/${f}`));
  return names.map((n) => `${n}@${stamp(n)}`).join("|");
}
