/**
 * Database connection layer.
 *
 * - If DATABASE_URL is set  -> connects to a real PostgreSQL server (e.g. the Docker one).
 * - Otherwise               -> uses PGlite: the real PostgreSQL engine compiled to WebAssembly,
 *                              stored in ./data/pgdata. Zero installation needed.
 *
 * Both expose the same tiny interface so the rest of the app only writes plain SQL.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type Row = Record<string, any>;
export interface Db {
  kind: 'postgres' | 'pglite';
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /** Runs a single statement in a READ ONLY transaction (used by the SQL Lab). */
  readOnly(sql: string): Promise<{ rows: Row[]; fields: string[] }>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Return DATE as 'YYYY-MM-DD' strings and NUMERIC / BIGINT as JS numbers.
const DATE = 1082, NUMERIC = 1700, INT8 = 20;

async function createPgDb(url: string): Promise<Db> {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(DATE, (v: string) => v);
  pg.types.setTypeParser(NUMERIC, (v: string) => Number(v));
  pg.types.setTypeParser(INT8, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    kind: 'postgres',
    async query(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async readOnly(sql) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL statement_timeout = '5s'`);
        // queryMode 'extended' => server accepts exactly one statement
        const res = await client.query({ text: sql, queryMode: 'extended' } as any);
        return { rows: res.rows, fields: res.fields.map((f: { name: string }) => f.name) };
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    },
  };
}

async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  await mkdir(path.join(root, 'data'), { recursive: true });
  const pglite = await PGlite.create(path.join(root, 'data', 'pgdata'), {
    parsers: {
      [DATE]: (v: string) => v,
      [NUMERIC]: (v: string) => Number(v),
      [INT8]: (v: string) => Number(v),
    },
  });
  return {
    kind: 'pglite',
    async query(sql, params = []) {
      return (await pglite.query(sql, params)).rows as any[];
    },
    async exec(sql) {
      await pglite.exec(sql);
    },
    async readOnly(sql) {
      return pglite.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        const res = await tx.query(sql); // extended protocol => single statement only
        await tx.rollback();
        return { rows: res.rows as Row[], fields: res.fields.map((f) => f.name) };
      });
    },
  };
}

export const db: Db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb();

/** Drops everything and recreates schema + sample data. */
export async function resetDatabase() {
  const schema = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
  const seed = await readFile(path.join(root, 'db', 'seed.sql'), 'utf8');
  await db.exec(schema);
  await db.exec(seed);
}

/** Creates the schema on first run. */
export async function ensureDatabase() {
  const [{ exists }] = await db.query<{ exists: boolean }>(
    `SELECT to_regclass('public.members') IS NOT NULL AS exists`,
  );
  if (!exists) {
    console.log('First run: creating schema and loading sample data...');
    await resetDatabase();
  }
}
