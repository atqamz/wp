import { compare } from "./order.ts";

export type Section<T> = { key: string | null; rows: T[] };

const keyOf = (row: { group_key: string | null }) => row.group_key?.trim() || null;

const byKey = (a: string | null, b: string | null) =>
  a === null ? Number(b !== null) : b === null ? -1 : compare(a.toLowerCase(), b.toLowerCase()) || compare(a, b);

export const sectionsOf = <T extends { group_key: string | null }>(rows: readonly T[]): Section<T>[] =>
  [...new Set(rows.map(keyOf))].sort(byKey).map((key) => ({ key, rows: rows.filter((row) => keyOf(row) === key) }));
