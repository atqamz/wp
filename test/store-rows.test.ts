import { test } from "node:test";
import assert from "node:assert/strict";
import { merge, overlay, toMaps } from "../src/store/outbox.ts";
import type { Pending } from "../src/store/persistence.ts";
import { item } from "./domain-rows.ts";

const empty = { items: [], budget_entries: [], settings: [] };
const changes = (...items: ReturnType<typeof item>[]) => ({ ...empty, items });
const mutation = (fields: Partial<Pending>): Pending => ({
  id: "00000000-0000-4000-8000-0000000000f0",
  table: "items",
  op: "update",
  row_id: "",
  patch: {},
  seq: 1,
  at: "2026-10-06T00:00:00Z",
  ...fields,
});

test("rows apply by rev: newer replaces, older and equal are ignored", () => {
  const row = item({ title: "v5", rev: 5 });
  const base = toMaps({ ...empty, items: [row] });
  assert.equal(merge(base, changes({ ...row, title: "v3", rev: 3 })).items, undefined);
  assert.equal(merge(base, changes({ ...row, title: "same", rev: 5 })).items, undefined);
  assert.equal(base.items.get(row.id)?.title, "v5");
  const touched = merge(base, changes({ ...row, title: "v6", rev: 6 }));
  assert.equal(touched.items?.length, 1);
  assert.equal(base.items.get(row.id)?.title, "v6");
});

test("a new row is always taken", () => {
  const base = toMaps(empty);
  assert.equal(merge(base, changes(item({ rev: 1 }))).items?.length, 1);
  assert.equal(base.items.size, 1);
});

test("tombstones are stored like any other row", () => {
  const row = item({ rev: 2, deleted_at: "2026-10-06T00:00:00Z" });
  const base = toMaps({ ...empty, items: [item({ ...row, rev: 1, deleted_at: null })] });
  merge(base, changes(row));
  assert.equal(base.items.get(row.id)?.deleted_at, "2026-10-06T00:00:00Z");
});

test("pending mutations sit on top of the server rows, in order", () => {
  const row = item({ title: "server", amount: 5, rev: 9 });
  const base = toMaps({ ...empty, items: [row] });
  const view = overlay(base, [
    mutation({ row_id: row.id, patch: { title: "mine" } }),
    mutation({ row_id: row.id, patch: { title: "mine again" }, seq: 2 }),
  ]);
  assert.deepEqual([view.items.get(row.id)?.title, view.items.get(row.id)?.amount], ["mine again", 5]);
  assert.equal(base.items.get(row.id)?.title, "server");
});

test("a pending delete tombstones, a pending undo clears it, an orphan update is skipped", () => {
  const row = item({ rev: 2 });
  const base = toMaps({ ...empty, items: [row] });
  const deleted = overlay(base, [mutation({ op: "delete", row_id: row.id })]);
  assert.equal(deleted.items.get(row.id)?.deleted_at, "2026-10-06T00:00:00Z");
  const undone = overlay(base, [mutation({ op: "delete", row_id: row.id }), mutation({ row_id: row.id, patch: { deleted_at: null }, seq: 2 })]);
  assert.equal(undone.items.get(row.id)?.deleted_at, null);
  assert.equal(overlay(base, [mutation({ row_id: "00000000-0000-4000-8000-0000000000ee", patch: { title: "x" } })]).items.size, 1);
});

test("a pending create appears with defaults and rev 0; an existing settings key takes the new value", () => {
  const id = "00000000-0000-4000-8000-0000000000c1";
  const created = overlay(toMaps(empty), [
    mutation({ op: "create", row_id: id, patch: { id, kind: "task", title: "new", created_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z" } }),
  ]).items.get(id);
  assert.deepEqual([created?.rev, created?.currency, created?.sort, created?.deleted_at, created?.due_on], [0, "IDR", 0, null, null]);

  const setting = { key: "partner_a_label", value: "old", rev: 3, created_at: "x", updated_at: "x", updated_by: "a" as const, deleted_at: null };
  const view = overlay(toMaps({ ...empty, settings: [setting] }), [
    mutation({ table: "settings", op: "create", row_id: setting.key, patch: { key: setting.key, value: "new" } }),
  ]);
  assert.equal(view.settings.get(setting.key)?.value, "new");
});
