import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

let pool: Pool | null = null;
let dbConnected = false;

export function getDatabaseUrl(): string | undefined {
  let url = Deno.env.get('DATABASE_URL');
  if (!url) {
    // Attempt reading from .env files
    const envPaths = ['.env.local', '.env', 'backend/.env'];
    for (const p of envPaths) {
      try {
        const text = Deno.readTextFileSync(p);
        for (const line of text.split('\n')) {
          const match = line.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/);
          if (match) {
            url = match[1];
            break;
          }
        }
        if (url) break;
      } catch {}
    }
  }
  return url || undefined;
}

export function isDbAvailable(): boolean {
  return dbConnected && pool !== null;
}

export function getPool(): Pool | null {
  if (pool) return pool;
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    return null;
  }

  try {
    // 5 connections max in pool, lazy connect
    pool = new Pool(dbUrl, 5, true);
    console.log('[DB] PostgreSQL pool configured with URL:', dbUrl.split('@')[1] ? '...@' + dbUrl.split('@')[1] : 'configured');
    return pool;
  } catch (err) {
    console.warn('[DB] Failed to configure PostgreSQL pool:', err);
    return null;
  }
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  let retries = 2;
  while (retries > 0) {
    const p = getPool();
    if (!p) {
      throw new Error('Database not configured (DATABASE_URL not set)');
    }
    try {
      const client = await p.connect();
      try {
        const result = await client.queryObject<T>(sql, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (err: any) {
      retries--;
      const msg = String(err?.message || err);
      const isConnectionDrop = msg.includes('terminated') || msg.includes('closed') || msg.includes('ConnectionError') || msg.includes('EOF');
      if (retries === 0 || !isConnectionDrop) {
        throw err;
      }
      // Reset pool to acquire fresh TCP socket to Neon
      try {
        await p.end();
      } catch {}
      pool = null;
    }
  }
  return [];
}

export async function queryOne<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  await query(sql, params);
}

/**
 * Initializes database connection and runs schema migrations if DATABASE_URL is present.
 */
export async function initDatabase(schemaSql?: string): Promise<boolean> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.log('[DB] DATABASE_URL not set. Running in resilient In-Memory Mode.');
    dbConnected = false;
    return false;
  }

  try {
    const p = getPool();
    if (!p) return false;

    // Test connection with simple SELECT 1
    const client = await p.connect();
    try {
      await client.queryObject`SELECT 1 as test`;
      dbConnected = true;
      console.log('[DB] ✅ PostgreSQL connection established successfully!');

      if (schemaSql) {
        console.log('[DB] Applying schema migrations...');
        await client.queryArray(schemaSql);
        try {
          await client.queryArray(`
            ALTER TABLE call_history ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 5;
            ALTER TABLE vip_fan_passes ADD COLUMN IF NOT EXISTS amount INTEGER DEFAULT 499;
          `);
        } catch {}
        console.log('[DB] ✅ Schema migrations applied successfully.');
      }
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] ❌ Failed to connect to PostgreSQL. Falling back to In-Memory Mode:', err);
    dbConnected = false;
    return false;
  }
}
