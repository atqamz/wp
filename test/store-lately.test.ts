import { test } from "node:test";
import assert from "node:assert/strict";
import { lately } from "../src/domain/lately.ts";
import { live, overlay, toMaps } from "../src/store/outbox.ts";
import type { Pending } from "../src/store/persistence.ts";
import { entry, item } from "./domain-rows.ts";
import { client, idOf, task } from "./store-client.ts";
import { createServer } from "./store-server.ts";

const empty = { items: [], budget_entries: [], settings: [] };
const mutation = (fields: Partial<Pending>): Pending => ({
  id: "00000000-0000-4000-8000-0000000000f0",
  table: "items",
  op: "update",
  row_id: "",
  patch: {},
  seq: 1,
  at: "2026-10-07T08:00:00Z",
  ...fields,
});

const recent = (rows: ReturnType<typeof live>) =>
  lately(rows.items, rows.budget_entries).map((activity) => `${activity.by} ${activity.verb} ${activity.title}`);

test("an offline edit of the other person's row is credited to the signed-in person", () => {
  const venue = item({ title: "Venue hall", kind: "vendor", status: "option", updated_by: "b", updated_at: "2026-10-05T00:00:00Z" });
  const base = toMaps({ ...empty, items: [venue] });
  const edit = mutation({ row_id: venue.id, patch: { title: "Venue hall renamed", updated_at: "2026-10-07T08:00:00Z" } });
  assert.deepEqual(recent(live(overlay(base, [edit], "a"))), ["a changed Venue hall renamed"]);
  assert.deepEqual(recent(live(overlay(base, [edit], "b"))), ["b changed Venue hall renamed"]);
  assert.deepEqual(recent(live(overlay(base, [edit]))), ["b changed Venue hall renamed"]);
  assert.equal(base.items.get(venue.id)?.updated_by, "b");
});

test("an unsynced create shows up as added, newest first, under the signed-in person", () => {
  const id = "00000000-0000-4000-8000-0000000000c1";
  const older = item({ title: "older", updated_by: "b", updated_at: "2026-10-06T00:00:00Z" });
  const create = mutation({
    op: "create",
    row_id: id,
    patch: {
      id,
      kind: "task",
      title: "Offline made",
      status: "todo",
      created_at: "2026-10-07T08:00:00Z",
      updated_at: "2026-10-07T08:00:00Z",
    },
  });
  const view = live(overlay(toMaps({ ...empty, items: [older] }), [create], "a"));
  assert.deepEqual(recent(view), ["a added Offline made", "b changed older"]);
});

test("an unsynced create stays added however long ago it was typed, and a later offline tick reads ticked", () => {
  const id = "00000000-0000-4000-8000-0000000000c2";
  const patch = {
    id,
    kind: "task",
    title: "Typed on the train",
    status: "todo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  const queue = [
    mutation({ op: "create", row_id: id, patch, at: "2026-10-01T00:00:00Z" }),
    mutation({ row_id: id, patch: { status: "done", done_on: "2026-10-07", updated_at: "2026-10-07T08:00:00Z" }, seq: 2 }),
  ];
  assert.deepEqual(recent(live(overlay(toMaps(empty), queue.slice(0, 1), "a"))), ["a added Typed on the train"]);
  assert.deepEqual(recent(live(overlay(toMaps(empty), queue, "a"))), ["a ticked Typed on the train"]);
});

test("an unsynced create edited again offline is still added", () => {
  const id = "00000000-0000-4000-8000-0000000000c3";
  const at = "2026-10-07T08:00:00Z";
  const queue = [
    mutation({ op: "create", row_id: id, patch: { id, kind: "task", title: "Draft", status: "todo", created_at: at, updated_at: at }, at }),
    mutation({ row_id: id, patch: { title: "Draft, renamed", updated_at: "2026-10-07T08:30:00Z" }, seq: 2 }),
  ];
  assert.deepEqual(recent(live(overlay(toMaps(empty), queue, "a"))), ["a added Draft, renamed"]);
});

test("an offline payment marked paid is credited to the signed-in person", () => {
  const line = entry({ title: "Venue", amount: 100 });
  const payment = entry({ entry_type: "payment", budget_id: line.id, title: "Down payment", status: "due", amount: 10, updated_by: "b" });
  const base = toMaps({ ...empty, budget_entries: [line, payment] });
  const pay = mutation({
    table: "budget_entries",
    row_id: payment.id,
    patch: { status: "paid", done_on: "2026-10-07", updated_at: "2026-10-07T08:00:00Z" },
  });
  assert.deepEqual(recent(live(overlay(base, [pay], "a"))).slice(0, 1), ["a paid Down payment"]);
});

test("a row deleted offline leaves lately", () => {
  const row = item({ title: "gone", updated_by: "a" });
  const view = live(overlay(toMaps({ ...empty, items: [row] }), [mutation({ op: "delete", row_id: row.id })], "a"));
  assert.deepEqual(recent(view), []);
});

test("the store credits an offline edit and an offline create to the signed-in side", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-06T10:00:00Z") });
  const server = createServer();
  const other = client(server, "b");
  await other.store.open();
  idOf(await other.store.create("items", task("Made by the other side")));

  t.mock.timers.setTime(Date.parse("2026-10-06T10:05:00Z"));
  const mine = client(server, "a");
  await mine.store.open();
  server.control.down = true;
  const [existing] = mine.store.getSnapshot().rows.items;
  assert.equal(existing.updated_by, "b");
  idOf(await mine.store.update("items", existing.id, { title: "Renamed offline" }));
  idOf(await mine.store.create("items", task("Typed offline")));

  assert.deepEqual(recent(mine.store.getSnapshot().rows).sort(), ["a added Typed offline", "a changed Renamed offline"]);
});
