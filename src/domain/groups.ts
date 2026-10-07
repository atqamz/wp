import { compare } from "./order.ts";

export type Section<T> = { key: string | null; rows: T[] };

const spelled = (row: { group_key: string | null }) => row.group_key?.trim().replace(/\s+/g, " ") || null;

const folded = (key: string | null) => key?.toLowerCase() ?? null;

const byKey = (a: string | null, b: string | null) => (a === null ? Number(b !== null) : b === null ? -1 : compare(a, b));

export const sectionsOf = <T extends { group_key: string | null }>(rows: readonly T[]): Section<T>[] => {
  const sections = new Map<string | null, Section<T>>();
  for (const row of rows) {
    const key = spelled(row);
    const section = sections.get(folded(key)) ?? { key, rows: [] };
    section.rows.push(row);
    sections.set(folded(key), section);
  }
  return [...sections].sort(([a], [b]) => byKey(a, b)).map(([, section]) => section);
};
