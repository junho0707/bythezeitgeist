import path from "node:path";
import { createClient, type Client, type InArgs } from "@libsql/client";

/*
 * Users and comments. In production a Turso database (TURSO_DATABASE_URL,
 * TURSO_AUTH_TOKEN); locally the SQLite file web/data/zeitgeist.db.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS layouts (
    user_id TEXT PRIMARY KEY,
    sources_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    item_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_key, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`,
  // One pending sign-in code per email (hashed), for sign-up and resets.
  `CREATE TABLE IF NOT EXISTS email_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS votes (
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    PRIMARY KEY (user_id, comment_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (comment_id) REFERENCES comments(id)
  )`,
];

let ready: Promise<Client> | null = null;

async function open(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  let client: Client;
  if (url) {
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    const fs = await import("node:fs");
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${path.join(dir, "zeitgeist.db")}` });
  }
  await client.batch(SCHEMA, "write");
  return client;
}

export function getDb(): Promise<Client> {
  ready ??= open().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** First row of a query, typed, or undefined. */
export async function one<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const res = await (await getDb()).execute({ sql, args });
  return res.rows[0] as T | undefined;
}

/** Every row of a query, typed. */
export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const res = await (await getDb()).execute({ sql, args });
  return res.rows as T[];
}

export async function run(sql: string, args: InArgs = []): Promise<void> {
  await (await getDb()).execute({ sql, args });
}
