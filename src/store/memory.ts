import { tableNames, tables } from "../../shared/tables.ts";
import type { TableName } from "../../shared/tables.ts";
import type { Meta, Pending, Persistence, Persisted } from "./persistence.ts";

type Dict = Record<string, unknown>;

export const memoryPersistence = (): Persistence => {
  const rows = new Map<TableName, Map<string, Dict>>(tableNames.map((table) => [table, new Map()]));
  const outbox = new Map<number, Pending>();
  const meta: Meta = { rev: 0, me: null, epoch: null, generation: null };
  return {
    load: async () =>
      structuredClone({
        rows: Object.fromEntries(tableNames.map((table) => [table, [...rows.get(table)!.values()]])),
        outbox: [...outbox.values()],
        meta,
      }) as Persisted,
    write: async (write) => {
      const copy = structuredClone(write);
      for (const table of tableNames) {
        for (const row of (copy.rows?.[table] ?? []) as Dict[]) rows.get(table)!.set(row[tables[table].key] as string, row);
      }
      for (const entry of copy.outbox?.put ?? []) outbox.set(entry.seq, entry);
      for (const seq of copy.outbox?.drop ?? []) outbox.delete(seq);
      Object.assign(meta, copy.meta);
    },
    reset: async (expected, next) => {
      if (meta.generation !== expected) return null;
      for (const table of tableNames) rows.get(table)!.clear();
      outbox.clear();
      Object.assign(meta, structuredClone(next), { generation: crypto.randomUUID() });
      return meta.generation;
    },
  };
};
