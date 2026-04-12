import { Pool } from "pg";
import { getEnv } from "./env";

const globalForPool = globalThis as unknown as {
  __pgPool?: Pool;
};

let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!globalForPool.__pgPool) {
    globalForPool.__pgPool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
    });
  }
  return globalForPool.__pgPool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runMigrations();
  }
  await schemaReady;
}

export async function withDb<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  await ensureSchema();
  return fn(getPool());
}

async function runMigrations(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      id SERIAL PRIMARY KEY,
      code VARCHAR(32) NOT NULL UNIQUE,
      long_url TEXT NOT NULL UNIQUE,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS click_events (
      id SERIAL PRIMARY KEY,
      link_id INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_click_events_created ON click_events (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_click_events_link ON click_events (link_id);
  `);
}

export type LinkRow = {
  id: number;
  code: string;
  long_url: string;
  click_count: number;
  created_at: number;
};

export function shortUrlForCode(code: string): string {
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/s/${code}`;
}

export function linkJson(row: LinkRow) {
  return {
    code: row.code,
    shortUrl: shortUrlForCode(row.code),
    longUrl: row.long_url,
    clickCount: row.click_count,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export function toUnixSeconds(value: unknown): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === "string") {
    return Math.floor(new Date(value).getTime() / 1000);
  }
  return Number(value);
}

export function toIsoTimestamp(value: unknown): string {
  return new Date(toUnixSeconds(value) * 1000).toISOString();
}

function mapLinkRow(row: Record<string, unknown>): LinkRow {
  return {
    id: Number(row.id),
    code: String(row.code),
    long_url: String(row.long_url),
    click_count: Number(row.click_count),
    created_at: toUnixSeconds(row.created_at),
  };
}

const CODE_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export async function getLinkByCode(code: string): Promise<LinkRow | undefined> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, code, long_url, click_count, created_at FROM links WHERE code = $1`,
    [code],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapLinkRow(row) : undefined;
}

export async function getLinkByLongUrl(
  longUrl: string,
): Promise<LinkRow | undefined> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, code, long_url, click_count, created_at FROM links WHERE long_url = $1`,
    [longUrl],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapLinkRow(row) : undefined;
}

export async function insertLink(
  longUrl: string,
): Promise<{ row: LinkRow; created: boolean }> {
  await ensureSchema();
  const pool = getPool();

  const existing = await getLinkByLongUrl(longUrl);
  if (existing) return { row: existing, created: false };

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode(8);
    try {
      const { rows } = await pool.query(
        `INSERT INTO links (code, long_url)
         VALUES ($1, $2)
         RETURNING id, code, long_url, click_count, created_at`,
        [code, longUrl],
      );
      return {
        row: mapLinkRow(rows[0] as Record<string, unknown>),
        created: true,
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const again = await getLinkByLongUrl(longUrl);
        if (again) return { row: again, created: false };
        continue;
      }
      throw e;
    }
  }
  throw new Error("Could not allocate a unique short code");
}

export async function recordRedirectAndIncrement(
  linkId: number,
  ip: string,
  userAgent: string | null,
): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO click_events (link_id, ip, user_agent) VALUES ($1, $2, $3)`,
      [linkId, ip, userAgent],
    );
    await client.query(
      `UPDATE links SET click_count = click_count + 1 WHERE id = $1`,
      [linkId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
