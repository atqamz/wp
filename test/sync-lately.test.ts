import { test } from "node:test";
import assert from "node:assert/strict";
import type { Rejection, SyncResult } from "../shared/api.ts";
import type { ItemRow } from "../shared/tables.ts";
import { lately } from "../src/domain/lately.ts";
import { CLIENT_STAMP, NOW, STAMP, apply, createDb, id, mutation, task } from "./sync-db.ts";

const ok = (result: SyncResult | Rejection) => {
  assert.equal("errors" in result, false, JSON.stringify(result));
  return result as SyncResult;
};

const items = (sqlite: ReturnType<typeof createDb>["sqlite"]) => sqlite.prepare("SELECT * FROM items").all() as unknown as ItemRow[];

const recent = (rows: ItemRow[]) => lately(rows, []).map((activity) => `${activity.by} ${activity.verb} ${activity.title}`);

test("a create ignores the client clock: created_at and updated_at are the one server stamp", async () => {
  const { db, sqlite } = createDb();
  ok(await apply(db, [task(1, { created_at: CLIENT_STAMP, updated_at: CLIENT_STAMP })]));
  const [row] = items(sqlite);
  assert.deepEqual([row.created_at, row.updated_at], [STAMP, STAMP]);
});

test("two creates in one batch read added; a create then an edit in a later batch read added, then changed", async () => {
  const { db, sqlite } = createDb();
  ok(await apply(db, [task(1, { title: "first" }), task(2, { title: "second" })], "a", NOW));
  assert.deepEqual(recent(items(sqlite)), ["a added first", "a added second"]);

  ok(await apply(db, [mutation("update", "items", id(2), { title: "second, edited" })], "b", new Date("2026-10-06T05:00:01Z")));
  assert.deepEqual(recent(items(sqlite)), ["b changed second, edited", "a added first"]);
});

test("a row typed offline days before it syncs still reads added", async () => {
  const { db, sqlite } = createDb();
  ok(await apply(db, [task(1, { title: "offline", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" })], "a", NOW));
  assert.deepEqual(recent(items(sqlite)), ["a added offline"]);
});
