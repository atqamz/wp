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

const now = "2026-10-06T05:00:00Z";
const item = (overrides: Record<string, string | number | null> = {}) => {
  const row = { id: "i1", kind: "task", title: "t", rev: 1, created_at: now, updated_at: now, ...overrides };
  const cols = Object.keys(row);
  return [`INSERT INTO items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, Object.values(row)] as const;
};

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
  const db = migrated();
  const [sql, params] = item();
  db.prepare(sql).run(...params);
});

const bad: Record<string, Record<string, string | number | null>> = {
  "bad created_at": { created_at: "2026-10-06" },
  "bad due_on": { due_on: "06-10-2026" },
  "bad who": { who: "c" },
  "bad updated_by": { updated_by: "someone@example.test" },
  "negative amount": { amount: -1 },
  "bad currency": { currency: "RP" },
  "invalid json data": { data: "{" },
};

for (const [name, overrides] of Object.entries(bad)) {
  test(`items rejects ${name}`, () => {
    const db = migrated();
    const [sql, params] = item(overrides);
    assert.throws(() => db.prepare(sql).run(...params), /CHECK constraint failed/);
  });
}

test("items rejects a dangling parent_id", () => {
  const db = migrated();
  const [sql, params] = item({ parent_id: "missing" });
  assert.throws(() => db.prepare(sql).run(...params), /FOREIGN KEY constraint failed/);
});

test("sync_state rejects a second row", () => {
  assert.throws(() => migrated().exec("INSERT INTO sync_state (id, rev) VALUES (2, 0)"), /CHECK constraint failed/);
});

test("budget_entries rejects a payment without budget_id", () => {
  const db = migrated();
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO budget_entries (id, entry_type, title, status, amount, rev, created_at, updated_at) VALUES ('p1', 'payment', 't', 'due', 1, 1, ?, ?)",
        )
        .run(now, now),
    /CHECK constraint failed/,
  );
});
