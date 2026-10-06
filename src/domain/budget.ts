import type { BudgetEntryRow } from "../../shared/tables.ts";
import { bySort, compare } from "./order.ts";

export const EVENT_ORDER = ["engagement", "ceremony", "reception"];

export type Line = {
  row: BudgetEntryRow;
  payments: BudgetEntryRow[];
  planned: number | null;
  paid: number;
  remaining: number | null;
  over: number;
};

export type Totals = {
  planned: number;
  paid: number;
  paidUnestimated: number;
  remaining: number;
  over: number;
  unestimated: number;
};

export type Group = Totals & { key: string; lines: Line[] };

export type Budget = Totals & { groups: Group[] };

const sum = (rows: readonly BudgetEntryRow[]) => rows.reduce((total, row) => total + (row.amount ?? 0), 0);

const rank = (key: string) => {
  const index = EVENT_ORDER.indexOf(key);
  return index === -1 ? EVENT_ORDER.length : index;
};

const add = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const totalsOf = (lines: readonly Line[]): Totals => {
  const estimated = lines.filter((line) => line.planned !== null);
  return {
    planned: add(estimated.map((line) => line.planned!)),
    paid: add(estimated.map((line) => line.paid)),
    paidUnestimated: add(lines.filter((line) => line.planned === null).map((line) => line.paid)),
    remaining: add(estimated.map((line) => line.remaining!)),
    over: add(estimated.map((line) => line.over)),
    unestimated: lines.length - estimated.length,
  };
};

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
        remaining: row.amount === null ? null : Math.max(0, row.amount - paid),
        over: row.amount === null ? 0 : Math.max(0, paid - row.amount),
      };
    });
  const keys = [...new Set(lines.map((line) => line.row.group_key ?? ""))].sort((a, b) => rank(a) - rank(b) || compare(a, b));
  const groups = keys.map((key) => {
    const own = lines.filter((line) => (line.row.group_key ?? "") === key);
    return { key, lines: own, ...totalsOf(own) };
  });
  return { groups, ...totalsOf(lines) };
};
