/**
 * O mínimo que o Boldo precisa de um Postgres. Há dois adaptadores:
 * - db-pglite.ts: Postgres embutido (PGlite), usado em testes, desenvolvimento e Docker;
 * - db-postgres.ts: um Postgres de verdade (ex.: Supabase), usado na hospedagem.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Roda várias instruções de uma vez, sem parâmetros (criação do esquema). */
  exec(sql: string): Promise<void>;
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
