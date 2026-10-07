import type { BudgetEntryRow, ItemRow } from "../../shared/tables.ts";
import { compare } from "./order.ts";

export const LATELY_COUNT = 5;

export type Activity = {
  id: string;
  by: "a" | "b";
  verb: "added" | "ticked" | "paid" | "changed";
  title: string;
  at: string;
};

const verbOf = (row: ItemRow | BudgetEntryRow): Activity["verb"] =>
  "kind" in row && row.kind === "task" && row.status === "done"
    ? "ticked"
    : "entry_type" in row && row.entry_type === "payment" && row.status === "paid"
      ? "paid"
      : row.rev === 0 || row.created_at === row.updated_at
        ? "added"
        : "changed";

export const lately = (items: readonly ItemRow[], entries: readonly BudgetEntryRow[], limit = LATELY_COUNT): Activity[] =>
  [...items, ...entries]
    .flatMap((row) =>
      row.updated_by === "a" || row.updated_by === "b"
        ? [{ id: row.id, by: row.updated_by, verb: verbOf(row), title: row.title, at: row.updated_at }]
        : [],
    )
    .sort((a, b) => compare(b.at, a.at) || compare(a.id, b.id))
    .slice(0, limit);
