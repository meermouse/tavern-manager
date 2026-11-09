export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (used for migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function createDb(opts: { url: string | null; pgliteDir: string | null }): Promise<Db> {
  if (opts.url) {
    const mod = await import('pg');
    const pg = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const needsSsl = !/localhost|127\.0\.0\.1/.test(opts.url) && !/sslmode=disable/.test(opts.url);
    const pool = new pg.Pool({
      connectionString: opts.url,
      // Serverless functions should hold very few connections each.
      max: Number(process.env.DATABASE_POOL_MAX ?? 3),
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    return {
      async query(text, params) {
        const res = await pool.query(text, params as unknown[]);
        return res.rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  // Embedded Postgres (WASM) for local development and tests.
  const { PGlite } = await import('@electric-sql/pglite');
  if (opts.pgliteDir) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(opts.pgliteDir, { recursive: true });
  }
  const lite = opts.pgliteDir ? new PGlite(opts.pgliteDir) : new PGlite();
  return {
    async query(text, params) {
      const res = await lite.query(text, params);
      return res.rows as never[];
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}
