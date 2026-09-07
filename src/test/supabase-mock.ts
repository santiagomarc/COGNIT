import { vi } from 'vitest';

export type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number;
};

type MockOptions = {
  user?: { id: string } | null;
  /** Result per table name. Missing tables resolve to `{ data: null, error: null }`. */
  tables?: Record<string, QueryResult>;
  /** Result per RPC name. */
  rpcs?: Record<string, QueryResult>;
};

/**
 * Minimal chainable stub for the PostgREST query builder.
 *
 * Enough to exercise the ownership and validation branches in Server Actions
 * without a live database. It deliberately does NOT emulate filtering: each
 * table returns whatever the test supplied, so tests stay explicit about the
 * rows the action is reacting to.
 */
export function createSupabaseMock(options: MockOptions = {}) {
  const { user = { id: 'user-1' }, tables = {}, rpcs = {} } = options;

  const inserted: Record<string, unknown[]> = {};

  const builder = (table: string) => {
    const result = tables[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};

    for (const method of [
      'select', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'or',
      'not', 'lt', 'lte', 'gt', 'gte', 'order', 'limit', 'range',
    ]) {
      chain[method] = vi.fn(() => chain);
    }

    // Records payloads so a test can assert what an action tried to write.
    chain.insert = vi.fn((payload: unknown) => {
      inserted[table] = [...(inserted[table] ?? []), payload];
      return chain;
    });

    chain.single = vi.fn(async () => result);
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve);

    return chain;
  };

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(builder),
    rpc: vi.fn(async (name: string) => rpcs[name] ?? { data: null, error: null }),
    /** Test helper — payloads passed to .insert(), keyed by table. */
    __inserted: inserted,
  };
}
