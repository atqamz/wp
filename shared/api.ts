import { tables } from "./tables.ts";
import type { Row, TableName } from "./tables.ts";

export type Side = "a" | "b";

export type Op = "create" | "update" | "delete";

export type Mutation = {
  id: string;
  table: TableName;
  op: Op;
  row_id: string;
  patch: Record<string, unknown>;
};

export type Changes = { [T in TableName]: Row<T>[] };

export type SyncResponse = {
  rev: number;
  me: Side;
  changes: Changes;
};

export type SyncRequest = {
  mutations: Mutation[];
};

export type SyncResult = {
  rev: number;
  rows: Changes;
};

export const rowKey = <T extends TableName>(table: T, row: Row<T>): string =>
  (row as Record<string, string>)[tables[table].key];
