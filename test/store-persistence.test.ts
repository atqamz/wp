import { test } from "node:test";
import assert from "node:assert/strict";
import { tableNames } from "../shared/tables.ts";
import { memoryPersistence } from "../src/store/memory.ts";
import { assemble } from "../src/store/persistence.ts";
import { item } from "./domain-rows.ts";

const settingRow = (key: string) => ({ key, value: "v", rev: 1, created_at: "x", updated_at: "x", updated_by: null, deleted_at: null });

test("assemble puts every result under its own table name, whatever the table order", () => {
  const reads = [...tableNames.map((name) => [{ marker: name }]), [{ seq: 1 }], 7, "b"];
  const loaded = assemble(reads);
  for (const name of tableNames) assert.deepEqual(loaded.rows[name], [{ marker: name }], name);
  assert.deepEqual(loaded.outbox, [{ seq: 1 }]);
  assert.deepEqual(loaded.meta, { rev: 7, me: "b" });
});

test("assemble defaults the cursor and the identity of an empty database", () => {
  const loaded = assemble([...tableNames.map(() => []), [], undefined, undefined]);
  assert.deepEqual(loaded.meta, { rev: 0, me: null });
  assert.deepEqual(loaded.rows, { items: [], budget_entries: [], settings: [] });
});

test("the order of the tables is the order of the reads: a swap would put settings under items", () => {
  const reads = tableNames.map((name) => name);
  const loaded = assemble([...reads, [], 0, null]);
  assert.equal(loaded.rows.settings as unknown, "settings");
  assert.equal(loaded.rows.items as unknown, "items");
  assert.equal(loaded.rows.budget_entries as unknown, "budget_entries");
});

test("a memory database keeps each table's rows apart across a reload", async () => {
  const persistence = memoryPersistence();
  const task = item({ title: "task" });
  const vendor = item({ title: "vendor", kind: "vendor" });
  await persistence.write({
    rows: { items: [task, vendor], budget_entries: [], settings: [settingRow("partner_a_label")] },
    meta: { rev: 4, me: "a" },
  });
  const loaded = await persistence.load();
  assert.deepEqual(loaded.rows.items.map((row) => row.title).sort(), ["task", "vendor"]);
  assert.deepEqual(loaded.rows.settings.map((row) => row.key), ["partner_a_label"]);
  assert.deepEqual(loaded.rows.budget_entries, []);
  assert.deepEqual(loaded.meta, { rev: 4, me: "a" });
});
