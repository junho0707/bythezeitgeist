// Moves the pipeline's output to and from Vercel Blob, where the site reads it.
//
//   node sync.mjs pull   # before a run: fetch the saved state into ../output
//   node sync.mjs push   # after a run: upload what changed, then the manifest
//
// Needs BLOB_READ_WRITE_TOKEN. Each file version is stored under its own
// content hash, so readers can cache it for good; manifest.json (cached 60s)
// names the current version of each file.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BlobNotFoundError, del, head, put } from "@vercel/blob";

const OUTPUT = path.resolve(import.meta.dirname, "..", "output");
const LOCAL_MANIFEST = path.join(OUTPUT, ".manifest.json");
const FOREVER = 60 * 60 * 24 * 365;

/** The files the site and the next run need, by name relative to output/. */
function localFiles() {
  const names = ["latest_trending.json", "latest_day.json", "latest_week.json", "summaries.json"];
  for (const dir of ["history", "last_ok"]) {
    for (const f of fs.existsSync(path.join(OUTPUT, dir)) ? fs.readdirSync(path.join(OUTPUT, dir)) : []) {
      if (f.endsWith(".json")) names.push(`${dir}/${f}`);
    }
  }
  return names.filter((n) => fs.existsSync(path.join(OUTPUT, n)));
}

async function remoteManifest() {
  try {
    const { url } = await head("manifest.json");
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (e) {
    // The very first run: nothing saved yet.
    if (!(e instanceof BlobNotFoundError)) throw e;
  }
  return { files: {} };
}

async function pull() {
  const manifest = await remoteManifest();
  const entries = Object.entries(manifest.files);
  await Promise.all(
    entries.map(async ([name, f]) => {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      const file = path.join(OUTPUT, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }),
  );
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(LOCAL_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`[blob] pulled ${entries.length} files`);
}

async function push() {
  const old = await remoteManifest();
  const files = {};
  const replaced = [];
  let uploaded = 0;
  for (const name of localFiles()) {
    const body = fs.readFileSync(path.join(OUTPUT, name));
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    const prev = old.files[name];
    if (prev?.hash === hash) {
      files[name] = prev;
      continue;
    }
    const blob = await put(`data/${name.replace(/\.json$/, "")}-${hash}.json`, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: FOREVER,
    });
    files[name] = { url: blob.url, hash };
    if (prev) replaced.push(prev.url);
    uploaded++;
  }
  const manifest = { updated_at: new Date().toISOString(), files };
  await put("manifest.json", JSON.stringify(manifest), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  // Old versions go only after the manifest stops naming them. A reader
  // holding the old manifest for up to a minute still finds them in the CDN.
  if (replaced.length) await del(replaced);
  fs.writeFileSync(LOCAL_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`[blob] uploaded ${uploaded} of ${Object.keys(files).length} files`);
}

const cmd = process.argv[2];
if (cmd === "pull") await pull();
else if (cmd === "push") await push();
else {
  console.error("usage: node sync.mjs pull|push");
  process.exit(2);
}
