import { Pool, types } from "pg";

// Return BIGINT/NUMERIC as JS numbers and DATE as plain 'YYYY-MM-DD' strings (no timezone drift).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __pool?: Pool };

export function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__pool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  return g.__pool;
}

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query(sql, params);
  return r.rows as T[];
}
