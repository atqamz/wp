import type { Mutation, Side } from "../../shared/api.ts";
import type { Row, TableName } from "../../shared/tables.ts";

export type Pending = Mutation & { seq: number; at: string; rejected?: string[] };

export type Rows = { [T in TableName]: Row<T>[] };

export type Meta = { rev: number; me: Side | null };

export type Persisted = { rows: Rows; outbox: Pending[]; meta: Meta };

export type Write = {
  rows?: Partial<Rows>;
  outbox?: { put?: Pending[]; drop?: number[] };
  meta?: Partial<Meta>;
};

export type Persistence = {
  load(): Promise<Persisted>;
  write(write: Write): Promise<void>;
};
