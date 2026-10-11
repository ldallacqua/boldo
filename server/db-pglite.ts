import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Db } from './db';

/** Postgres embutido. Sem `dataDir`, fica só na memória (testes). */
export async function openPglite(dataDir?: string): Promise<Db> {
  const pg = new PGlite(dataDir);
  await pg.waitReady;

  const wrap = (runner: PGlite | Transaction): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      return (await runner.query<T>(sql, params)).rows;
    },
    async exec(sql) {
      await runner.exec(sql);
    },
    transaction<T>(work: (tx: Db) => Promise<T>) {
      // Dentro de uma transação, `runner` já é ela: transações aninhadas viram uma só.
      return runner instanceof PGlite
        ? runner.transaction((tx) => work(wrap(tx)))
        : work(wrap(runner));
    },
    close: () => pg.close(),
  });

  return wrap(pg);
}
