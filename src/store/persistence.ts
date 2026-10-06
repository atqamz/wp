import type { Mutation, Side } from "../../shared/api.ts";
import { tableNames } from "../../shared/tables.ts";
import type { Row, TableName } from "../../shared/tables.ts";

export type Pending = Mutation & { seq: number; at: string; rejected?: string[] };

export type Rows = { [T in TableName]: Row<T>[] };

export type Meta = { rev: number; me: Side | null; epoch: string | null };

export type Persisted = { rows: Rows; outbox: Pending[]; meta: Meta };

export type Write = {
  reset?: true;
  rows?: Partial<Rows>;
  outbox?: { put?: Pending[]; drop?: number[] };
  meta?: Partial<Meta>;
};

export type Persistence = {
  load(): Promise<Persisted>;
  write(write: Write): Promise<void>;
};

export const assemble = (results: readonly unknown[]): Persisted => {
  const [outbox, rev, me, epoch] = results.slice(tableNames.length);
  return {
    rows: Object.fromEntries(tableNames.map((table, index) => [table, results[index]])),
    outbox,
    meta: { rev: rev ?? 0, me: me ?? null, epoch: epoch ?? null },
  } as Persisted;
};
