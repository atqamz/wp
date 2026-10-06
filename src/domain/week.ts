import type { BudgetEntryRow, ItemRow } from "../../shared/tables.ts";
import { addDays, isOverdue } from "./dates.ts";
import { bySort, compare } from "./order.ts";

export const WEEK_DAYS = 7;

export type WeekEntry = { type: "task"; row: ItemRow } | { type: "payment"; row: BudgetEntryRow };

export type Week = { overdue: WeekEntry[]; soon: WeekEntry[]; undated: ItemRow[] };

const byDue = (a: WeekEntry, b: WeekEntry) => compare(a.row.due_on!, b.row.due_on!) || bySort(a.row, b.row);

export const thisWeek = (items: readonly ItemRow[], entries: readonly BudgetEntryRow[], today: string): Week => {
  const horizon = addDays(today, WEEK_DAYS);
  const lines = new Set(entries.filter((entry) => entry.entry_type === "planned").map((entry) => entry.id));
  const open = items.filter((item) => item.kind === "task" && item.status !== "done");
  const dated: WeekEntry[] = [
    ...open.filter((item) => item.due_on !== null).map((row) => ({ type: "task" as const, row })),
    ...entries
      .filter(
        (entry) =>
          entry.entry_type === "payment" &&
          entry.status === "due" &&
          entry.due_on !== null &&
          entry.budget_id !== null &&
          lines.has(entry.budget_id),
      )
      .map((row) => ({ type: "payment" as const, row })),
  ].sort(byDue);
  return {
    overdue: dated.filter((entry) => isOverdue(entry.row.due_on, today)),
    soon: dated.filter((entry) => entry.row.due_on! >= today && entry.row.due_on! <= horizon),
    undated: open.filter((item) => item.due_on === null).sort(bySort),
  };
};
