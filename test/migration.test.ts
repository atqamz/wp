import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

function migrated() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migration);
  return db;
}

type Row = Record<string, string | number | null>;

const now = "2026-10-06T05:00:00Z";
const stamps = { rev: 1, created_at: now, updated_at: now };

function insert(db: DatabaseSync, table: string, row: Row) {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...Object.values(row));
}

const itemRow = (overrides: Row = {}) => ({ id: "i1", kind: "task", title: "t", ...stamps, ...overrides });
const plannedRow = (overrides: Row = {}) => ({ id: "b1", entry_type: "planned", title: "t", group_key: "g", amount: 1, ...stamps, ...overrides });
const paymentRow = (overrides: Row = {}) => ({ id: "p1", entry_type: "payment", budget_id: "b1", title: "t", status: "due", amount: 1, ...stamps, ...overrides });

test("creates the four tables", () => {
  const rows = migrated()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  assert.deepEqual(
    rows.map((r) => r.name),
    ["budget_entries", "items", "settings", "sync_state"],
  );
});

test("sync_state starts at rev 0", () => {
  assert.deepEqual({ ...migrated().prepare("SELECT id, rev FROM sync_state").get() }, { id: 1, rev: 0 });
});

test("accepts a valid item", () => {
  insert(migrated(), "items", itemRow());
});

const bad: Record<string, Row> = {
  "bad created_at": { created_at: "2026-10-06" },
  "bad due_on": { due_on: "06-10-2026" },
  "bad who": { who: "c" },
  "bad updated_by": { updated_by: "someone@example.test" },
  "negative amount": { amount: -1 },
  "negative qty": { qty: -1 },
  "bad currency": { currency: "RP" },
  "invalid json data": { data: "{" },
};

for (const [name, overrides] of Object.entries(bad)) {
  test(`items rejects ${name}`, () => {
    assert.throws(() => insert(migrated(), "items", itemRow(overrides)), /CHECK constraint failed/);
  });
}

test("items rejects a dangling parent_id", () => {
  assert.throws(() => insert(migrated(), "items", itemRow({ parent_id: "missing" })), /FOREIGN KEY constraint failed/);
});

test("settings rejects a bad updated_by", () => {
  const row = { key: "k", value: "v", ...stamps, updated_by: "someone@example.test" };
  assert.throws(() => insert(migrated(), "settings", row), /CHECK constraint failed/);
});

test("sync_state rejects a second row", () => {
  assert.throws(() => migrated().exec("INSERT INTO sync_state (id, rev) VALUES (2, 0)"), /CHECK constraint failed/);
});

test("budget_entries accepts a planned row and its payments", () => {
  const db = migrated();
  insert(db, "budget_entries", plannedRow());
  insert(db, "budget_entries", paymentRow());
  insert(db, "budget_entries", paymentRow({ id: "p2", status: "paid", done_on: "2026-10-06" }));
});

const badEntries: Record<string, Row> = {
  "planned without group_key": plannedRow({ id: "b2", group_key: null }),
  "planned with budget_id": plannedRow({ id: "b2", budget_id: "b1" }),
  "planned with status": plannedRow({ id: "b2", status: "due" }),
  "planned with due_on": plannedRow({ id: "b2", due_on: "2026-10-06" }),
  "planned with done_on": plannedRow({ id: "b2", done_on: "2026-10-06" }),
  "negative amount": plannedRow({ id: "b2", amount: -1 }),
  "payment without budget_id": paymentRow({ budget_id: null }),
  "payment with vendor_id": paymentRow({ vendor_id: "i1" }),
  "payment without status": paymentRow({ status: null }),
  "due payment with done_on": paymentRow({ done_on: "2026-10-06" }),
  "unknown entry_type": plannedRow({ id: "b2", entry_type: "other" }),
};

for (const [name, row] of Object.entries(badEntries)) {
  test(`budget_entries rejects ${name}`, () => {
    const db = migrated();
    insert(db, "items", itemRow());
    insert(db, "budget_entries", plannedRow());
    assert.throws(() => insert(db, "budget_entries", row), /CHECK constraint failed/);
  });
}
