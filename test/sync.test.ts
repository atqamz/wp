import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY_BYTES, MAX_MUTATIONS } from "../shared/api.ts";
import type { Mutation, Rejection, SyncResult } from "../shared/api.ts";
import { getSync, postSync } from "../worker/sync.ts";
import { CLIENT_STAMP, NOW, STAMP, apply, count, createDb, currentRev, id, mutation, payment, planned, project, setting, stored, task, vendor } from "./sync-db.ts";

const fresh = async (...seed: Mutation[]) => {
  const env = createDb();
  if (seed.length > 0) assert.equal("errors" in (await apply(env.db, seed)), false);
  return env;
};

const rejected = async (promise: Promise<SyncResult | Rejection>, status: number, index: number, pattern: RegExp) => {
  const result = (await promise) as Rejection;
  assert.equal(result.status, status);
  assert.equal(result.index, index);
  assert.match(result.errors.join("\n"), pattern);
};

const ok = (result: SyncResult | Rejection) => {
  assert.equal("errors" in result, false, JSON.stringify(result));
  return result as SyncResult;
};

const post = (db: ReturnType<typeof createDb>["db"], body: unknown, headers: Record<string, string> = {}) =>
  postSync(new Request("https://wp.example.test/api/sync", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }), db, "a");

const tree = [project(1), project(2), vendor(20, 1), vendor(21, 2), planned(10, 1), planned(11, 2)];

test("accepts a full request of 20 mutations and rejects 21", async () => {
  const { db, sqlite } = await fresh(project(1));
  const twenty = Array.from({ length: MAX_MUTATIONS }, (_, i) => task(100 + i, 1));
  assert.equal((await post(db, { mutations: twenty })).status, 200);
  assert.equal(count(sqlite, "items"), 21);
  const response = await post(db, { mutations: [...twenty, task(200, 1)] });
  assert.equal(response.status, 400);
  const body = (await response.json()) as Rejection;
  assert.equal(body.status, 400);
  assert.equal("index" in body, false);
  assert.match(body.errors[0], /at most 20/);
  assert.equal(count(sqlite, "items"), 21);
});

test("rejects a body over the cap before parsing, with or without a content-length", async () => {
  const { db, calls } = createDb();
  const declared = await post(db, "{}", { "content-length": String(MAX_BODY_BYTES + 1) });
  assert.equal(declared.status, 413);
  let pulled = 0;
  const chunk = new Uint8Array(256 * 1024).fill(32);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled++ < 100) controller.enqueue(chunk);
      else controller.close();
    },
  });
  const request = new Request("https://wp.example.test/api/sync", { method: "POST", body, duplex: "half" } as RequestInit);
  const streamed = await postSync(request, db, "a");
  assert.equal(streamed.status, 413);
  assert.ok(pulled < 100);
  assert.equal(((await streamed.json()) as Rejection).status, 413);
  assert.deepEqual(calls, []);
});

test("accepts a body of exactly the cap", async () => {
  const { db } = createDb();
  const padding = " ".repeat(MAX_BODY_BYTES - JSON.stringify({ mutations: [] }).length);
  assert.equal((await post(db, `{"mutations":[]}${padding}`)).status, 200);
});

test("malformed bodies are 4xx rejections without an index", async () => {
  const { db } = createDb();
  const cases: [unknown, RegExp][] = [
    ["{", /must be JSON/],
    ["", /must be JSON/],
    ["[]", /must be an object/],
    ["null", /must be an object/],
    [{ mutations: [], extra: 1 }, /extra: unknown field/],
    [{}, /mutations: must be an array/],
    [{ mutations: {} }, /mutations: must be an array/],
  ];
  for (const [body, pattern] of cases) {
    const response = await post(db, body);
    assert.equal(response.status, 400);
    const rejection = (await response.json()) as Rejection;
    assert.equal(rejection.status, 400);
    assert.equal("index" in rejection, false);
    assert.match(rejection.errors.join(), pattern);
  }
  const invalidUtf8 = new Request("https://wp.example.test/api/sync", { method: "POST", body: new Uint8Array([0x7b, 0xff, 0x7d]) });
  assert.equal((await postSync(invalidUtf8, db, "a")).status, 400);
});

test("an unknown field inside a mutation carries that mutation's index", async () => {
  const { db, sqlite } = await fresh(project(1));
  const extra = { ...task(5, 1), surprise: true };
  await rejected(apply(db, [task(4, 1), extra]), 400, 1, /surprise: unknown field/);
  assert.equal(count(sqlite, "items"), 1);
});

test("the envelope is validated for every mutation", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [{ ...task(4, 1), op: "merge" }]), 400, 0, /op: must be one of/);
  await rejected(apply(db, [mutation("delete", "items", id(4), { title: "x" })]), 400, 0, /patch: must be empty for delete/);
  await rejected(apply(db, [mutation("create", "items", id(4), { ...task(5, 1).patch })]), 400, 0, /patch.id: must equal row_id/);
  await rejected(apply(db, [mutation("delete", "settings", "timezone")]), 400, 0, /settings are never deleted/);
  await rejected(apply(db, [mutation("create", "nothing" as "items", id(4))]), 400, 0, /unknown table/);
  await rejected(apply(db, ["x"]), 400, 0, /must be an object/);
});

test("a create is validated against the registry", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [task(4, 1, { status: "sent" })]), 400, 0, /status: must be one of/);
  await rejected(apply(db, [task(4, 1, { nope: 1 })]), 400, 0, /nope: unknown column/);
  await rejected(apply(db, [task(4, 1, { data: { bogus: 1 } })]), 400, 0, /data.bogus: unknown key/);
});

test("the index is the first failing mutation, state failures before later envelope failures", async () => {
  const { db } = await fresh(project(1));
  const missing = mutation("update", "items", id(77), { title: "x" });
  const malformed = { ...task(4, 1), op: "merge" };
  await rejected(apply(db, [task(3, 1), malformed, missing]), 400, 1, /op:/);
  await rejected(apply(db, [task(3, 1), missing, malformed]), 404, 1, /no such row/);
  await rejected(apply(db, [missing, malformed]), 404, 0, /no such row/);
});

test("mutations are validated against the stored rows plus the earlier mutations", async () => {
  const { db, sqlite } = await fresh(project(1));
  const result = ok(
    await apply(db, [
      vendor(20, 1),
      planned(10, 1, { vendor_id: id(20) }),
      payment(30, 10, 1),
      mutation("update", "budget_entries", id(30), { status: "paid", done_on: "2026-10-05" }),
      mutation("update", "items", id(20), { title: "Renamed" }),
      task(40, 1),
      mutation("delete", "items", id(40)),
      mutation("update", "items", id(40), { title: "after delete" }),
    ]),
  );
  assert.equal(result.rev, 2);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.status, "paid");
  assert.equal(stored(sqlite, "items", id(20))?.title, "Renamed");
  assert.equal(stored(sqlite, "items", id(40))?.title, "Task");
  assert.equal(stored(sqlite, "items", id(40))?.deleted_at, STAMP);
});

test("order matters: a payment before its planned row is rejected", async () => {
  const { db, sqlite } = await fresh(project(1));
  await rejected(apply(db, [payment(30, 10, 1), planned(10, 1)]), 409, 0, /budget_id: must point at a live budget_entries row/);
  assert.equal(count(sqlite, "budget_entries"), 0);
});

test("the overlay carries column defaults, so a currency mismatch is caught inside one request", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [planned(10, 1), payment(30, 10, 1, { currency: "USD" })]), 409, 1, /currency: must equal/);
});

test("replaying a create is a successful no-op and leaves the first row", async () => {
  const { db, sqlite } = await fresh(project(1));
  const first = task(4, 1, { title: "First" });
  ok(await apply(db, [first]));
  const replay = ok(await apply(db, [{ ...first, patch: { ...first.patch, title: "Second" } }]));
  assert.equal(replay.rev, 2);
  assert.equal(stored(sqlite, "items", id(4))?.title, "First");
  assert.equal(replay.rows.items[0].title, "First");
  assert.equal(currentRev(sqlite), 2);
});

test("creating the same id twice in one request writes it once", async () => {
  const { db, sqlite } = await fresh(project(1));
  ok(await apply(db, [task(4, 1, { title: "First" }), task(4, 1, { title: "Second" })]));
  assert.equal(stored(sqlite, "items", id(4))?.title, "First");
});

test("a create on an existing settings key updates the value, last write wins", async () => {
  const { db, sqlite } = await fresh();
  ok(await apply(db, [setting("timezone", "Asia/Jakarta")], "a"));
  const second = ok(await apply(db, [setting("timezone", "Asia/Makassar")], "b", new Date("2026-10-07T00:00:00Z")));
  const row = stored(sqlite, "settings", "timezone");
  assert.equal(row?.value, "Asia/Makassar");
  assert.equal(row?.updated_by, "b");
  assert.equal(row?.rev, 2);
  assert.equal(row?.created_at, CLIENT_STAMP);
  assert.equal(second.rev, 2);
  assert.equal(count(sqlite, "settings"), 1);
});

test("a settings value is validated for its key, on create and on replay", async () => {
  const { db } = await fresh(setting("ceremony_date", "2026-12-12"));
  await rejected(apply(db, [setting("ceremony_date", "tomorrow")]), 400, 0, /value:/);
  await rejected(apply(db, [setting("hijri_offset_days", "7")]), 400, 0, /value:/);
});

test("a settings create with the same value is a no-op", async () => {
  const { db, sqlite } = await fresh(setting("timezone", "Asia/Jakarta"));
  ok(await apply(db, [setting("timezone", "Asia/Jakarta")]));
  assert.equal(currentRev(sqlite), 1);
});

test("settings can be updated by patch", async () => {
  const { db, sqlite } = await fresh(setting("timezone", "Asia/Jakarta"));
  ok(await apply(db, [mutation("update", "settings", "timezone", { value: "Asia/Makassar" })]));
  assert.equal(stored(sqlite, "settings", "timezone")?.value, "Asia/Makassar");
});

test("an update or a delete of a missing row is a rejection", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [mutation("update", "items", id(77), { title: "x" })]), 404, 0, /no such row/);
  await rejected(apply(db, [mutation("delete", "items", id(77))]), 404, 0, /no such row/);
  await rejected(apply(db, [mutation("update", "settings", "nothing", { value: "x" })]), 404, 0, /no such row/);
});

test("an update is validated as stored row plus patch, with the stored kind as the variant", async () => {
  const { db, sqlite } = await fresh(project(1), vendor(20, 1, { data: { phone: "+628123456789" } }));
  await rejected(apply(db, [mutation("update", "items", id(20), { due_on: "2026-10-10" })]), 400, 0, /due_on: not used by kind vendor/);
  await rejected(apply(db, [mutation("update", "items", id(20), { status: "done" })]), 400, 0, /status: must be one of option, confirmed, cancelled/);
  await rejected(apply(db, [mutation("update", "items", id(20), { kind: "task" })]), 400, 0, /kind: cannot be changed/);
  await rejected(apply(db, [mutation("update", "items", id(20), { data: { bogus: 1 } })]), 400, 0, /data.bogus: unknown key/);
  await rejected(apply(db, [mutation("update", "items", id(20), { title: "" })]), 400, 0, /title:/);
  ok(await apply(db, [mutation("update", "items", id(20), { data: { pic: "Sam" } })]));
  assert.deepEqual(JSON.parse(stored(sqlite, "items", id(20))?.data as string), { phone: "+628123456789", pic: "Sam" });
});

test("the server owns rev, updated_by and deleted_at", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [task(4, 1, { rev: 9 })]), 400, 0, /rev: set by the server/);
  await rejected(apply(db, [task(4, 1, { updated_by: "a" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [task(4, 1, { updated_by: "import" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [task(4, 1, { deleted_at: CLIENT_STAMP })]), 400, 0, /deleted_at: cannot be set when creating/);
  ok(await apply(db, [task(4, 1)]));
  await rejected(apply(db, [mutation("update", "items", id(4), { rev: 9 })]), 400, 0, /rev: set by the server/);
  await rejected(apply(db, [mutation("update", "items", id(4), { updated_by: "b" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [mutation("update", "items", id(4), { deleted_at: CLIENT_STAMP })]), 400, 0, /deleted_at: can only be cleared/);
  await rejected(apply(db, [mutation("update", "items", id(4), { created_at: CLIENT_STAMP })]), 400, 0, /created_at: cannot be changed/);
});

test("updated_at and deleted_at use the server clock, updated_by is the authenticated side", async () => {
  const { db, sqlite } = await fresh();
  ok(await apply(db, [project(1), task(4, 1, { updated_at: "2020-01-01T00:00:00Z" })], "b"));
  let row = stored(sqlite, "items", id(4));
  assert.equal(row?.created_at, CLIENT_STAMP);
  assert.equal(row?.updated_at, STAMP);
  assert.equal(row?.updated_by, "b");
  assert.equal(row?.deleted_at, null);
  const later = new Date("2026-11-01T10:20:30.999Z");
  ok(await apply(db, [mutation("update", "items", id(4), { title: "Later", updated_at: "2020-01-01T00:00:00Z" })], "a", later));
  row = stored(sqlite, "items", id(4));
  assert.equal(row?.updated_at, "2026-11-01T10:20:30Z");
  assert.equal(row?.updated_by, "a");
  ok(await apply(db, [mutation("delete", "items", id(4))], "b", NOW));
  row = stored(sqlite, "items", id(4));
  assert.equal(row?.deleted_at, STAMP);
  assert.equal(row?.updated_by, "b");
});

test("a delete is a tombstone: nothing is removed and nothing cascades", async () => {
  const { db, sqlite } = await fresh(project(1), planned(10, 1), payment(30, 10, 1));
  const result = ok(await apply(db, [mutation("delete", "budget_entries", id(10))]));
  assert.equal(stored(sqlite, "budget_entries", id(10))?.deleted_at, STAMP);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.deleted_at, null);
  assert.equal(result.rev, 2);
  assert.equal(count(sqlite, "budget_entries"), 2);
});

test("a project is archived, never deleted", async () => {
  const { db, sqlite } = await fresh(project(1));
  await rejected(apply(db, [mutation("delete", "items", id(1))]), 409, 0, /archived with status/);
  assert.equal(stored(sqlite, "items", id(1))?.deleted_at, null);
  ok(await apply(db, [mutation("update", "items", id(1), { status: "archived" })]));
});

test("updates and deletes aimed at a tombstone are successful no-ops", async () => {
  const { db, sqlite } = await fresh(project(1), task(4, 1));
  ok(await apply(db, [mutation("delete", "items", id(4))]));
  const before = stored(sqlite, "items", id(4));
  const replay = ok(
    await apply(db, [
      mutation("update", "items", id(4), { title: "late edit" }),
      mutation("delete", "items", id(4)),
      mutation("update", "items", id(4), { status: "not even valid" }),
    ], "b", new Date("2026-12-01T00:00:00Z")),
  );
  assert.deepEqual(stored(sqlite, "items", id(4)), before);
  assert.equal(replay.rev, 2);
  assert.equal(replay.rows.items[0].deleted_at, STAMP);
});

test("undo is an update whose only change is deleted_at null", async () => {
  const { db, sqlite } = await fresh(project(1), task(4, 1));
  ok(await apply(db, [mutation("delete", "items", id(4))]));
  ok(await apply(db, [mutation("update", "items", id(4), { deleted_at: null, title: "mixed" })]));
  assert.equal(stored(sqlite, "items", id(4))?.deleted_at, STAMP);
  assert.equal(stored(sqlite, "items", id(4))?.title, "Task");
  const result = ok(await apply(db, [mutation("update", "items", id(4), { deleted_at: null, updated_at: "2026-10-06T06:00:00Z" })], "b"));
  const row = stored(sqlite, "items", id(4));
  assert.equal(row?.deleted_at, null);
  assert.equal(row?.updated_by, "b");
  assert.equal(row?.rev, result.rev);
  assert.equal(result.rows.items[0].deleted_at, null);
});

test("an undo on a live row changes nothing", async () => {
  const { db, sqlite } = await fresh(project(1), task(4, 1));
  const rev = currentRev(sqlite);
  ok(await apply(db, [mutation("update", "items", id(4), { deleted_at: null })]));
  assert.equal(currentRev(sqlite), rev);
});

test("an update that changes nothing is a no-op", async () => {
  const { db, sqlite } = await fresh(project(1), task(4, 1));
  const before = stored(sqlite, "items", id(4));
  ok(await apply(db, [mutation("update", "items", id(4), {}), mutation("update", "items", id(4), { title: "Task", updated_at: "2026-10-06T06:00:00Z" })]));
  assert.deepEqual(stored(sqlite, "items", id(4)), before);
});

test("project_id must point at a live project", async () => {
  const { db } = await fresh(project(1), task(4, 1));
  await rejected(apply(db, [task(5, 99)]), 409, 0, /project_id: must point at a live items row/);
  await rejected(apply(db, [task(5, 4)]), 409, 0, /project_id: must point at a project row/);
  ok(await apply(db, [mutation("update", "items", id(1), { status: "archived" })]));
  ok(await apply(db, [task(6, 1)]));
});

test("a row cannot refer to itself", async () => {
  const { db } = await fresh(project(1));
  await rejected(apply(db, [task(5, 5)]), 409, 0, /project_id: must point at a live items row/);
  ok(await apply(db, [task(5, 1)]));
  await rejected(apply(db, [mutation("update", "items", id(5), { project_id: id(5) })]), 409, 0, /project_id: must point at a project row/);
});

test("project_id may not name a tombstone, but unrelated updates of rows whose target was tombstoned later pass", async () => {
  const { db, sqlite } = await fresh(project(1), vendor(20, 1), planned(10, 1, { vendor_id: id(20) }), payment(30, 10, 1));
  ok(await apply(db, [mutation("delete", "items", id(20)), mutation("delete", "budget_entries", id(10))]));
  await rejected(apply(db, [payment(31, 10, 1)]), 409, 0, /budget_id: must point at a live budget_entries row/);
  await rejected(apply(db, [planned(11, 1, { vendor_id: id(20) })]), 409, 0, /vendor_id: must point at a live items row/);
  ok(await apply(db, [mutation("update", "budget_entries", id(30), { amount: 500 }), mutation("update", "budget_entries", id(10), { title: "x" })]));
  assert.equal(stored(sqlite, "budget_entries", id(30))?.amount, 500);
});

test("vendor_id must point at a live vendor in the same project", async () => {
  const { db } = await fresh(...tree);
  await rejected(apply(db, [planned(12, 1, { vendor_id: id(21) })]), 409, 0, /vendor_id: must belong to the same project/);
  await rejected(apply(db, [planned(12, 1, { vendor_id: id(1) })]), 409, 0, /vendor_id: must point at a vendor row/);
  await rejected(apply(db, [planned(12, 1, { vendor_id: id(99) })]), 409, 0, /vendor_id: must point at a live items row/);
  ok(await apply(db, [planned(12, 1, { vendor_id: id(20) })]));
  await rejected(apply(db, [mutation("update", "budget_entries", id(12), { vendor_id: id(21) })]), 409, 0, /vendor_id: must belong to the same project/);
  ok(await apply(db, [mutation("update", "budget_entries", id(12), { vendor_id: null })]));
});

test("budget_id must point at a live planned row in the same project", async () => {
  const { db } = await fresh(...tree);
  ok(await apply(db, [payment(30, 10, 1)]));
  await rejected(apply(db, [payment(31, 30, 1)]), 409, 0, /budget_id: must point at a planned row/);
  await rejected(apply(db, [payment(31, 11, 1)]), 409, 0, /budget_id: must belong to the same project/);
  await rejected(apply(db, [payment(31, 99, 1)]), 409, 0, /budget_id: must point at a live budget_entries row/);
});

test("moving a payment checks the stored budget target", async () => {
  const { db } = await fresh(...tree, payment(30, 10, 1));
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { project_id: id(2) })]), 409, 0, /budget_id: must belong to the same project/);
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { budget_id: id(11) })]), 409, 0, /budget_id: must belong to the same project/);
  ok(await apply(db, [planned(12, 1), mutation("update", "budget_entries", id(30), { budget_id: id(12) })]));
});

test("a payment's currency equals its planned row's currency", async () => {
  const { db, sqlite } = await fresh(project(1), planned(10, 1, { currency: "USD" }));
  await rejected(apply(db, [payment(30, 10, 1)]), 409, 0, /currency: must equal the currency of the planned row/);
  ok(await apply(db, [payment(30, 10, 1, { currency: "USD" })]));
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { currency: "IDR" })]), 409, 0, /currency: must equal/);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.currency, "USD");
});

test("a failing mutation writes nothing, not even the earlier ones", async () => {
  const { db, sqlite } = await fresh(project(1));
  const rev = currentRev(sqlite);
  await rejected(apply(db, [task(4, 1), task(5, 1), payment(30, 99, 1)]), 409, 2, /budget_id/);
  assert.equal(count(sqlite, "items"), 1);
  assert.equal(currentRev(sqlite), rev);
});

test("rev is bumped once per request that writes, and every written row carries it", async () => {
  const { db, sqlite } = await fresh();
  const first = ok(await apply(db, [project(1), task(4, 1), task(5, 1)]));
  assert.equal(first.rev, 1);
  assert.deepEqual([project(1), task(4, 1)].map((m) => stored(sqlite, "items", m.row_id)?.rev), [1, 1]);
  const second = ok(await apply(db, [mutation("update", "items", id(4), { title: "x" })]));
  assert.equal(second.rev, 2);
  assert.equal(stored(sqlite, "items", id(5))?.rev, 1);
  assert.equal(stored(sqlite, "items", id(4))?.rev, 2);
  assert.equal(currentRev(sqlite), 2);
});

test("a request in which every mutation is a no-op does not bump rev or write", async () => {
  const { db, sqlite, calls } = await fresh(project(1), task(4, 1));
  ok(await apply(db, [mutation("delete", "items", id(4))]));
  const rev = currentRev(sqlite);
  calls.length = 0;
  const result = ok(await apply(db, [task(4, 1), mutation("delete", "items", id(4)), mutation("update", "items", id(4), { title: "x" }), mutation("update", "items", id(1), {})]));
  assert.equal(result.rev, rev);
  assert.equal(currentRev(sqlite), rev);
  assert.equal(calls.flat().some((sql) => /^(UPDATE|INSERT)/.test(sql)), false);
});

test("the response carries the rows touched, read back after the write", async () => {
  const { db } = await fresh(project(1), vendor(20, 1, { data: { phone: "+628123456789" } }));
  const result = ok(await apply(db, [task(4, 1), mutation("update", "items", id(20), { data: { pic: "Sam" } }), setting("timezone", "Asia/Jakarta")]));
  assert.deepEqual(Object.keys(result.rows).sort(), ["budget_entries", "items", "settings"]);
  assert.deepEqual(result.rows.items.map((row) => row.id).sort(), [id(20), id(4)].sort());
  assert.deepEqual(result.rows.settings.map((row) => row.key), ["timezone"]);
  assert.deepEqual(result.rows.budget_entries, []);
  const edited = result.rows.items.find((row) => row.id === id(20));
  assert.deepEqual(edited?.data, { phone: "+628123456789", pic: "Sam" });
  assert.equal(edited?.rev, result.rev);
  assert.equal(edited?.updated_at, STAMP);
  assert.equal(result.rows.items.some((row) => row.id === id(1)), false);
});

test("an empty request is a no-op", async () => {
  const { db, sqlite } = await fresh(project(1));
  const result = ok(await apply(db, []));
  assert.equal(result.rev, 1);
  assert.deepEqual(result.rows, { items: [], budget_entries: [], settings: [] });
  assert.equal(currentRev(sqlite), 1);
});

test("a request of 20 mutations reads once per table and writes in one batch", async () => {
  const { db, calls } = await fresh(project(1), planned(10, 1));
  calls.length = 0;
  const mutations = [...Array.from({ length: 10 }, (_, i) => task(100 + i, 1)), ...Array.from({ length: 10 }, (_, i) => payment(200 + i, 10, 1))];
  ok(await apply(db, mutations));
  assert.equal(calls.length, 2);
  const [reads, writes] = calls;
  assert.equal(reads.length, 3);
  for (const table of ["items", "budget_entries", "settings"]) {
    assert.equal(reads.filter((sql) => new RegExp(`^SELECT \\* FROM ${table} WHERE`).test(sql)).length, 1);
  }
  assert.equal(writes.filter((sql) => /^UPDATE sync_state/.test(sql)).length, 1);
  assert.equal(writes.filter((sql) => /^INSERT/.test(sql)).length, 20);
});

test("the worst case stays under D1's 100 bound parameters per query", async () => {
  const { db } = createDb();
  const wide = Array.from({ length: MAX_MUTATIONS }, (_, i) =>
    mutation("create", "budget_entries", id(300 + i), { ...payment(300 + i, 400 + i, 500 + i).patch }),
  );
  await rejected(apply(db, wide), 409, 0, /project_id/);
  const vendors = Array.from({ length: MAX_MUTATIONS }, (_, i) => planned(300 + i, 500 + i, { vendor_id: id(600 + i) }));
  await rejected(apply(db, vendors), 409, 0, /project_id/);
});

test("a database failure is thrown to the router, which answers with a generic 500", async () => {
  const { db } = createDb();
  const failing = { ...db, batch: async () => { throw new Error("SQLITE_BUSY at /secret/path"); } };
  await assert.rejects(apply(failing, [project(1)]), /SQLITE_BUSY/);
});

test("pull returns rows after since, tombstones included, for all three tables", async () => {
  const { db } = await fresh(project(1), task(4, 1), planned(10, 1), setting("timezone", "Asia/Jakarta"));
  ok(await apply(db, [mutation("delete", "items", id(4))], "a"));
  const all = (await (await getSync(new URL("https://x.test/api/sync"), db, "b")).json()) as { rev: number; me: string; changes: Record<string, { id?: string; deleted_at: string | null; rev: number }[]> };
  assert.equal(all.rev, 2);
  assert.equal(all.me, "b");
  assert.deepEqual(Object.keys(all.changes).sort(), ["budget_entries", "items", "settings"]);
  assert.equal(all.changes.items.length, 2);
  assert.equal(all.changes.items.find((row) => row.id === id(4))?.deleted_at, STAMP);
  assert.equal(all.changes.budget_entries.length, 1);
  assert.equal(all.changes.settings.length, 1);
  const since = (await (await getSync(new URL("https://x.test/api/sync?since=1"), db, "a")).json()) as typeof all;
  assert.deepEqual(since.changes.items.map((row) => row.id), [id(4)]);
  assert.equal(since.me, "a");
  assert.deepEqual([since.changes.budget_entries, since.changes.settings], [[], []]);
  const none = (await (await getSync(new URL("https://x.test/api/sync?since=2"), db, "a")).json()) as typeof all;
  assert.deepEqual(none.changes, { items: [], budget_entries: [], settings: [] });
  assert.equal(none.rev, 2);
});

test("pull parses data into an object", async () => {
  const { db } = await fresh(project(1), vendor(20, 1, { data: { phone: "+628123456789" } }));
  const body = (await (await getSync(new URL("https://x.test/api/sync?since=0"), db, "a")).json()) as { changes: { items: { id: string; data: unknown }[] } };
  assert.deepEqual(body.changes.items.find((row) => row.id === id(20))?.data, { phone: "+628123456789" });
});

for (const since of ["-1", "abc", "1.5", "", "1e3", "01", "0x10", "9007199254740993", " 1", "1 "]) {
  test(`pull rejects since=${JSON.stringify(since)}`, async () => {
    const { db } = createDb();
    const response = await getSync(new URL(`https://x.test/api/sync?since=${encodeURIComponent(since)}`), db, "a");
    assert.equal(response.status, 400);
    const body = (await response.json()) as Rejection;
    assert.equal(body.status, 400);
    assert.match(body.errors[0], /since/);
    assert.equal("index" in body, false);
  });
}

test("two phones editing different fields of one row both survive; the same field is last write wins", async (t: TestContext) => {
  const { db, sqlite } = await fresh(project(1), vendor(20, 1, { data: { phone: "+628123456789" } }));
  const edit = (who: "a" | "b", patch: Record<string, unknown>) => apply(db, [mutation("update", "items", id(20), patch)], who);
  ok(await edit("a", { amount: 700 }));
  ok(await edit("b", { status: "confirmed" }));
  let row = stored(sqlite, "items", id(20));
  assert.equal(row?.amount, 700);
  assert.equal(row?.status, "confirmed");
  ok(await edit("a", { title: "from a" }));
  ok(await edit("b", { title: "from b" }));
  assert.equal(stored(sqlite, "items", id(20))?.title, "from b");
  assert.equal(stored(sqlite, "items", id(20))?.amount, 700);
  await t.test("data keys merge", async () => {
    ok(await edit("a", { data: { pic: "Sam" } }));
    ok(await edit("b", { data: { contract_url: "https://example.test/c" } }));
    ok(await edit("a", { data: { phone: null } }));
    row = stored(sqlite, "items", id(20));
    assert.deepEqual(JSON.parse(row?.data as string), { pic: "Sam", contract_url: "https://example.test/c" });
  });
});

test("replaying an update is idempotent and does not bump rev", async () => {
  const { db, sqlite } = await fresh(project(1), task(4, 1));
  const edit = mutation("update", "items", id(4), { title: "Once", amount: 5 });
  ok(await apply(db, [edit]));
  const rev = currentRev(sqlite);
  ok(await apply(db, [edit]));
  assert.equal(currentRev(sqlite), rev);
});

test("rows with data null or removed keys round-trip", async () => {
  const { db, sqlite } = await fresh(project(1), vendor(20, 1, { data: { phone: "+628123456789" } }));
  ok(await apply(db, [mutation("update", "items", id(20), { data: { phone: null } })]));
  assert.equal(stored(sqlite, "items", id(20))?.data, "{}");
  ok(await apply(db, [mutation("update", "items", id(20), { data: { pic: "Sam" } })]));
  assert.equal(stored(sqlite, "items", id(20))?.data, '{"pic":"Sam"}');
});
