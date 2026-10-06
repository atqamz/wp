import type { BudgetEntryRow, ItemRow } from "../shared/tables.ts";

const stamps = {
  rev: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  updated_by: null,
  deleted_at: null,
};

let counter = 0;
const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export const item = (fields: Partial<ItemRow>): ItemRow => ({
  id: id(),
  project_id: null,
  kind: "task",
  parent_id: null,
  title: "Item",
  status: "todo",
  group_key: null,
  due_on: null,
  done_on: null,
  amount: null,
  currency: "IDR",
  qty: null,
  who: null,
  note: null,
  data: null,
  sort: 0,
  ...stamps,
  ...fields,
});

export const entry = (fields: Partial<BudgetEntryRow>): BudgetEntryRow => ({
  id: id(),
  project_id: null,
  entry_type: "planned",
  budget_id: null,
  vendor_id: null,
  title: "Line",
  group_key: "reception",
  status: null,
  amount: null,
  currency: "IDR",
  due_on: null,
  done_on: null,
  who: null,
  note: null,
  data: null,
  sort: 0,
  ...stamps,
  ...fields,
});

export const payment = (line: BudgetEntryRow, fields: Partial<BudgetEntryRow>): BudgetEntryRow =>
  entry({ entry_type: "payment", budget_id: line.id, group_key: null, status: "due", amount: 0, ...fields });
