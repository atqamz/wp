import type { BudgetEntryRow } from "../../shared/tables.ts";
import { bySort, compare } from "./order.ts";

export const EVENT_ORDER = ["engagement", "ceremony", "reception"];

export type Line = {
  row: BudgetEntryRow;
  payments: BudgetEntryRow[];
  planned: number | null;
  paid: number;
  due: number;
  remaining: number | null;
};

export type Totals = { planned: number; unestimated: number; paid: number; due: number; remaining: number };

export type Group = Totals & { key: string; lines: Line[] };

export type Budget = Totals & { groups: Group[] };

const sum = (rows: readonly BudgetEntryRow[]) => rows.reduce((total, row) => total + (row.amount ?? 0), 0);

const rank = (key: string) => {
  const index = EVENT_ORDER.indexOf(key);
  return index === -1 ? EVENT_ORDER.length : index;
};

const totalsOf = (lines: readonly Line[]): Totals => ({
  planned: lines.reduce((total, line) => total + (line.planned ?? 0), 0),
  unestimated: lines.filter((line) => line.planned === null).length,
  paid: lines.reduce((total, line) => total + line.paid, 0),
  due: lines.reduce((total, line) => total + line.due, 0),
  remaining: lines.reduce((total, line) => total + (line.remaining ?? 0), 0),
});

export const budgetOf = (entries: readonly BudgetEntryRow[]): Budget => {
  const lines = entries
    .filter((entry) => entry.entry_type === "planned")
    .sort(bySort)
    .map((row): Line => {
      const payments = entries.filter((entry) => entry.entry_type === "payment" && entry.budget_id === row.id);
      const paid = sum(payments.filter((payment) => payment.status === "paid"));
      return {
        row,
        payments: payments.sort(bySort),
        planned: row.amount,
        paid,
        due: sum(payments.filter((payment) => payment.status === "due")),
        remaining: row.amount === null ? null : row.amount - paid,
      };
    });
  const keys = [...new Set(lines.map((line) => line.row.group_key ?? ""))].sort((a, b) => rank(a) - rank(b) || compare(a, b));
  const groups = keys.map((key) => {
    const own = lines.filter((line) => (line.row.group_key ?? "") === key);
    return { key, lines: own, ...totalsOf(own) };
  });
  return { groups, ...totalsOf(lines) };
};
