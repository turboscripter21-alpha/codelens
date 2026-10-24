/**
 * Tiny pluggable SQL layer for sign-in + history.
 * - DATABASE_URL=postgres://… (Neon free tier works; ?sslmode=require is honoured): the `postgres` driver.
 * - DATABASE_URL=pglite:memory or pglite:/path (local dev + tests only, never in production): in-process PGlite.
 * Tables are created on first use. All queries are parameterised ($1, $2 …): no string-built SQL with user input.
 */
import "server-only";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cl_users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     created_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cl_login_codes (
     email TEXT PRIMARY KEY,
     code_hash TEXT NOT NULL,
     expires_at BIGINT NOT NULL,
     attempts INT NOT NULL DEFAULT 0,
     sends INT NOT NULL DEFAULT 1,
     window_start BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cl_history (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES cl_users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     url TEXT,
     stats TEXT NOT NULL,
     analysis TEXT,
     created_at BIGINT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS cl_history_user ON cl_history (user_id, created_at DESC)`,
];

let ready: Promise<Db> | null = null;

export function dbConfigured(): boolean {
  const u = process.env.DATABASE_URL ?? "";
  if (u.startsWith("pglite:")) return process.env.NODE_ENV !== "production";
  return /^postgres(ql)?:\/\//.test(u);
}

/** In local dev with no DATABASE_URL, an in-memory PGlite DB is used so sign-in + history can be tried. */
export function devFallbackDb(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL || (devFallbackDb() ? "pglite:memory" : "");
  let db: Db;
  if (url.startsWith("pglite:")) {
    if (process.env.NODE_ENV === "production") throw new Error("PGlite is for local development only.");
    const { PGlite } = await import("@electric-sql/pglite");
    const where = url.slice("pglite:".length);
    const pg = where && where !== "memory" ? new PGlite(where) : new PGlite();
    db = { query: async (sql, params = []) => (await pg.query(sql, params)).rows as never[] };
  } else if (/^postgres(ql)?:\/\//.test(url)) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, onnotice: () => {} });
    db = { query: async (q, params = []) => (await sql.unsafe(q, params as never[])) as never[] };
  } else {
    throw new Error("DATABASE_URL is not set.");
  }
  for (const s of SCHEMA) await db.query(s);
  return db;
}

export function getDb(): Promise<Db> {
  if (!ready) ready = connect().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Tests only: start from a fresh database. */
export function _resetDb() { ready = null; }
