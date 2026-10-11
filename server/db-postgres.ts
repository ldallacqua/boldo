import postgres from 'postgres';
import type { Db } from './db';

/** Um Postgres externo (ex.: o do Supabase), pela URL de conexão. */
export function openPostgres(url: string): Db {
  const root = postgres(url, {
    // Funciona tanto na conexão direta quanto atrás do pooler em modo transação.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    onnotice: () => {},
  });

  const wrap = (sql: postgres.Sql | postgres.TransactionSql, isRoot: boolean): Db => ({
    async query<T>(text: string, params: unknown[] = []) {
      return [...(await sql.unsafe(text, params as never[]))] as T[];
    },
    async exec(text) {
      await sql.unsafe(text);
    },
    transaction<T>(work: (tx: Db) => Promise<T>) {
      return isRoot
        ? ((sql as postgres.Sql).begin((tx) => work(wrap(tx, false))) as Promise<T>)
        : work(wrap(sql, false));
    },
    close: () => root.end(),
  });

  return wrap(root, true);
}
