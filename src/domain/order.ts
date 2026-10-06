export type Sortable = { id: string; sort: number; created_at: string };

export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const bySort = (a: Sortable, b: Sortable) =>
  a.sort - b.sort || compare(a.created_at, b.created_at) || compare(a.id, b.id);

export const sortBefore = (rows: readonly Sortable[]) => rows.reduce((low, row) => Math.min(low, row.sort), 1) - 1;
