import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY_BYTES, MAX_MUTATIONS } from "../shared/api.ts";
import type { Mutation, Rejection, SyncResult } from "../shared/api.ts";
import { getSync, postSync } from "../worker/sync.ts";
import { CLIENT_STAMP, NOW, STAMP, apply, count, createDb, currentEpoch, currentRev, id, mutation, payment, planned, setting, stored, task, vendor } from "./sync-db.ts";

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

const tree = [vendor(20), vendor(21), planned(10), planned(11)];

test("accepts a full request of 20 mutations and rejects 21", async () => {
  const { db, sqlite } = await fresh();
  const twenty = Array.from({ length: MAX_MUTATIONS }, (_, i) => task(100 + i));
  assert.equal((await post(db, { mutations: twenty })).status, 200);
  assert.equal(count(sqlite, "items"), 20);
  const response = await post(db, { mutations: [...twenty, task(200)] });
  assert.equal(response.status, 400);
  const body = (await response.json()) as Rejection;
  assert.equal(body.status, 400);
  assert.equal("index" in body, false);
  assert.match(body.errors[0], /at most 20/);
  assert.equal(count(sqlite, "items"), 20);
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

test("a streamed body one byte over the cap is rejected, exactly the cap is accepted", async () => {
  const { db } = createDb();
  const stream = (size: number) => {
    const head = new TextEncoder().encode('{"mutations":[]}');
    const bytes = new Uint8Array(size).fill(32);
    bytes.set(head);
    return new Request("https://wp.example.test/api/sync", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), duplex: "half" } as RequestInit);
  };
  assert.equal((await postSync(stream(MAX_BODY_BYTES + 1), db, "a")).status, 413);
  assert.equal((await postSync(stream(MAX_BODY_BYTES), db, "a")).status, 200);
});

test("a body with an invalid UTF-8 byte inside a valid create is rejected, not repaired", async () => {
  const { db, sqlite } = await fresh();
  const text = JSON.stringify({ mutations: [task(4, { title: "XX" })] });
  const [head, tail] = text.split("XX");
  const bytes = Buffer.concat([Buffer.from(head + "a"), Buffer.from([0xff]), Buffer.from("b" + tail)]);
  const response = await postSync(new Request("https://wp.example.test/api/sync", { method: "POST", body: bytes }), db, "a");
  assert.equal(response.status, 400);
  assert.equal(count(sqlite, "items"), 0);
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
  const { db, sqlite } = await fresh();
  const extra = { ...task(5), surprise: true };
  await rejected(apply(db, [task(4), extra]), 400, 1, /surprise: unknown field/);
  assert.equal(count(sqlite, "items"), 0);
});

test("the envelope is validated for every mutation", async () => {
  const { db } = await fresh();
  await rejected(apply(db, [{ ...task(4), op: "merge" }]), 400, 0, /op: must be one of/);
  await rejected(apply(db, [mutation("delete", "items", id(4), { title: "x" })]), 400, 0, /patch: must be empty for delete/);
  await rejected(apply(db, [mutation("create", "items", id(4), { ...task(5).patch })]), 400, 0, /patch.id: must equal row_id/);
  await rejected(apply(db, [mutation("delete", "settings", "timezone")]), 400, 0, /settings are never deleted/);
  await rejected(apply(db, [mutation("create", "nothing" as "items", id(4))]), 400, 0, /unknown table/);
  await rejected(apply(db, ["x"]), 400, 0, /must be an object/);
});

test("a create is validated against the registry", async () => {
  const { db } = await fresh();
  await rejected(apply(db, [task(4, { status: "sent" })]), 400, 0, /status: must be one of/);
  await rejected(apply(db, [task(4, { nope: 1 })]), 400, 0, /nope: unknown column/);
  await rejected(apply(db, [task(4, { data: { bogus: 1 } })]), 400, 0, /data.bogus: unknown key/);
});

test("the index is the first failing mutation, state failures before later envelope failures", async () => {
  const { db } = await fresh();
  const missing = mutation("update", "items", id(77), { title: "x" });
  const malformed = { ...task(4), op: "merge" };
  await rejected(apply(db, [task(3), malformed, missing]), 400, 1, /op:/);
  await rejected(apply(db, [task(3), missing, malformed]), 404, 1, /no such row/);
  await rejected(apply(db, [missing, malformed]), 404, 0, /no such row/);
});

test("mutations are validated against the stored rows plus the earlier mutations", async () => {
  const { db, sqlite } = await fresh();
  const result = ok(
    await apply(db, [
      vendor(20),
      planned(10, { vendor_id: id(20) }),
      payment(30, 10),
      mutation("update", "budget_entries", id(30), { status: "paid", done_on: "2026-10-05" }),
      mutation("update", "items", id(20), { title: "Renamed" }),
      task(40),
      mutation("delete", "items", id(40)),
      mutation("update", "items", id(40), { title: "after delete" }),
    ]),
  );
  assert.equal(result.rev, 1);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.status, "paid");
  assert.equal(stored(sqlite, "items", id(20))?.title, "Renamed");
  assert.equal(stored(sqlite, "items", id(40))?.title, "Task");
  assert.equal(stored(sqlite, "items", id(40))?.deleted_at, STAMP);
});

test("order matters: a payment before its planned row is rejected", async () => {
  const { db, sqlite } = await fresh();
  await rejected(apply(db, [payment(30, 10), planned(10)]), 409, 0, /budget_id: must point at a live budget_entries row/);
  assert.equal(count(sqlite, "budget_entries"), 0);
});

test("the overlay carries column defaults, so a currency mismatch is caught inside one request", async () => {
  const { db } = await fresh();
  await rejected(apply(db, [planned(10), payment(30, 10, { currency: "USD" })]), 409, 1, /currency: must equal/);
});

test("replaying a create is a successful no-op and leaves the first row", async () => {
  const { db, sqlite } = await fresh();
  const first = task(4, { title: "First" });
  ok(await apply(db, [first]));
  const replay = ok(await apply(db, [{ ...first, patch: { ...first.patch, title: "Second" } }]));
  assert.equal(replay.rev, 1);
  assert.equal(stored(sqlite, "items", id(4))?.title, "First");
  assert.equal(replay.rows.items[0].title, "First");
  assert.equal(currentRev(sqlite), 1);
});

test("creating the same id twice in one request writes it once", async () => {
  const { db, sqlite } = await fresh();
  ok(await apply(db, [task(4, { title: "First" }), task(4, { title: "Second" })]));
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
  assert.equal(row?.created_at, STAMP);
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
  const { db } = await fresh();
  await rejected(apply(db, [mutation("update", "items", id(77), { title: "x" })]), 404, 0, /no such row/);
  await rejected(apply(db, [mutation("delete", "items", id(77))]), 404, 0, /no such row/);
  await rejected(apply(db, [mutation("update", "settings", "nothing", { value: "x" })]), 404, 0, /no such row/);
});

test("an update is validated as stored row plus patch, with the stored kind as the variant", async () => {
  const { db, sqlite } = await fresh(vendor(20, { data: { phone: "+628123456789" } }));
  await rejected(apply(db, [mutation("update", "items", id(20), { due_on: "2026-10-10" })]), 400, 0, /due_on: not used by kind vendor/);
  await rejected(apply(db, [mutation("update", "items", id(20), { status: "done" })]), 400, 0, /status: must be one of option, confirmed, cancelled/);
  await rejected(apply(db, [mutation("update", "items", id(20), { kind: "task" })]), 400, 0, /kind: cannot be changed/);
  await rejected(apply(db, [mutation("update", "items", id(20), { data: { bogus: 1 } })]), 400, 0, /data.bogus: unknown key/);
  await rejected(apply(db, [mutation("update", "items", id(20), { title: "" })]), 400, 0, /title:/);
  ok(await apply(db, [mutation("update", "items", id(20), { data: { pic: "Sam" } })]));
  assert.deepEqual(JSON.parse(stored(sqlite, "items", id(20))?.data as string), { phone: "+628123456789", pic: "Sam" });
});

test("the server owns rev, updated_by and deleted_at", async () => {
  const { db } = await fresh();
  await rejected(apply(db, [task(4, { rev: 9 })]), 400, 0, /rev: set by the server/);
  await rejected(apply(db, [task(4, { updated_by: "a" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [task(4, { updated_by: "import" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [task(4, { deleted_at: CLIENT_STAMP })]), 400, 0, /deleted_at: cannot be set when creating/);
  ok(await apply(db, [task(4)]));
  await rejected(apply(db, [mutation("update", "items", id(4), { rev: 9 })]), 400, 0, /rev: set by the server/);
  await rejected(apply(db, [mutation("update", "items", id(4), { updated_by: "b" })]), 400, 0, /updated_by: set by the server/);
  await rejected(apply(db, [mutation("update", "items", id(4), { deleted_at: CLIENT_STAMP })]), 400, 0, /deleted_at: can only be cleared/);
  await rejected(apply(db, [mutation("update", "items", id(4), { created_at: CLIENT_STAMP })]), 400, 0, /created_at: cannot be changed/);
});

test("created_at, updated_at and deleted_at use the server clock, updated_by is the authenticated side", async () => {
  const { db, sqlite } = await fresh();
  ok(await apply(db, [task(4, { created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z" })], "b"));
  let row = stored(sqlite, "items", id(4));
  assert.equal(row?.created_at, STAMP);
  assert.equal(row?.updated_at, STAMP);
  assert.equal(row?.updated_by, "b");
  assert.equal(row?.deleted_at, null);
  const later = new Date("2026-11-01T10:20:30.999Z");
  ok(await apply(db, [mutation("update", "items", id(4), { title: "Later", updated_at: "2020-01-01T00:00:00Z" })], "a", later));
  row = stored(sqlite, "items", id(4));
  assert.equal(row?.created_at, STAMP);
  assert.equal(row?.updated_at, "2026-11-01T10:20:30Z");
  assert.equal(row?.updated_by, "a");
  ok(await apply(db, [mutation("delete", "items", id(4))], "b", NOW));
  row = stored(sqlite, "items", id(4));
  assert.equal(row?.deleted_at, STAMP);
  assert.equal(row?.updated_by, "b");
});

test("a delete is a tombstone: nothing is removed and nothing cascades", async () => {
  const { db, sqlite } = await fresh(planned(10), payment(30, 10));
  const result = ok(await apply(db, [mutation("delete", "budget_entries", id(10))]));
  assert.equal(stored(sqlite, "budget_entries", id(10))?.deleted_at, STAMP);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.deleted_at, null);
  assert.equal(result.rev, 2);
  assert.equal(count(sqlite, "budget_entries"), 2);
});

test("every kind of item is deleted the same way", async () => {
  const { db, sqlite } = await fresh(task(4), vendor(20));
  ok(await apply(db, [mutation("delete", "items", id(4)), mutation("delete", "items", id(20))]));
  assert.equal(stored(sqlite, "items", id(4))?.deleted_at, STAMP);
  assert.equal(stored(sqlite, "items", id(20))?.deleted_at, STAMP);
});

test("project_id is an unknown column", async () => {
  const { db } = await fresh(task(4));
  await rejected(apply(db, [task(5, { project_id: id(4) })]), 400, 0, /project_id: unknown column/);
  await rejected(apply(db, [mutation("update", "items", id(4), { project_id: id(4) })]), 400, 0, /project_id: unknown column/);
});

test("updates and deletes aimed at a tombstone are successful no-ops", async () => {
  const { db, sqlite } = await fresh(task(4));
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
  const { db, sqlite } = await fresh(task(4));
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
  const { db, sqlite } = await fresh(task(4));
  const rev = currentRev(sqlite);
  ok(await apply(db, [mutation("update", "items", id(4), { deleted_at: null })]));
  assert.equal(currentRev(sqlite), rev);
});

test("an update that changes nothing is a no-op", async () => {
  const { db, sqlite } = await fresh(task(4));
  const before = stored(sqlite, "items", id(4));
  ok(await apply(db, [mutation("update", "items", id(4), {}), mutation("update", "items", id(4), { title: "Task", updated_at: "2026-10-06T06:00:00Z" })]));
  assert.deepEqual(stored(sqlite, "items", id(4)), before);
});

test("a row cannot refer to itself", async () => {
  const { db } = await fresh(planned(10));
  await rejected(apply(db, [payment(30, 30)]), 409, 0, /budget_id: must point at a live budget_entries row/);
  ok(await apply(db, [payment(30, 10)]));
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { budget_id: id(30) })]), 409, 0, /budget_id: must point at a planned row/);
});

test("a reference may not name a tombstone, but unrelated updates of rows whose target was tombstoned later pass", async () => {
  const { db, sqlite } = await fresh(vendor(20), planned(10, { vendor_id: id(20) }), payment(30, 10));
  ok(await apply(db, [mutation("delete", "items", id(20)), mutation("delete", "budget_entries", id(10))]));
  await rejected(apply(db, [payment(31, 10)]), 409, 0, /budget_id: must point at a live budget_entries row/);
  await rejected(apply(db, [planned(11, { vendor_id: id(20) })]), 409, 0, /vendor_id: must point at a live items row/);
  ok(await apply(db, [mutation("update", "budget_entries", id(30), { amount: 500 }), mutation("update", "budget_entries", id(10), { title: "x" })]));
  assert.equal(stored(sqlite, "budget_entries", id(30))?.amount, 500);
});

test("vendor_id must point at a live vendor", async () => {
  const { db } = await fresh(...tree, task(4));
  await rejected(apply(db, [planned(12, { vendor_id: id(4) })]), 409, 0, /vendor_id: must point at a vendor row/);
  await rejected(apply(db, [planned(12, { vendor_id: id(99) })]), 409, 0, /vendor_id: must point at a live items row/);
  ok(await apply(db, [planned(12, { vendor_id: id(20) })]));
  ok(await apply(db, [mutation("update", "budget_entries", id(12), { vendor_id: id(21) })]));
  await rejected(apply(db, [mutation("update", "budget_entries", id(12), { vendor_id: id(4) })]), 409, 0, /vendor_id: must point at a vendor row/);
  ok(await apply(db, [mutation("update", "budget_entries", id(12), { vendor_id: null })]));
});

test("budget_id must point at a live planned row", async () => {
  const { db } = await fresh(...tree);
  ok(await apply(db, [payment(30, 10)]));
  await rejected(apply(db, [payment(31, 30)]), 409, 0, /budget_id: must point at a planned row/);
  await rejected(apply(db, [payment(31, 99)]), 409, 0, /budget_id: must point at a live budget_entries row/);
});

test("moving a payment checks the new budget target", async () => {
  const { db } = await fresh(...tree, payment(30, 10));
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { budget_id: id(99) })]), 409, 0, /budget_id: must point at a live budget_entries row/);
  ok(await apply(db, [mutation("update", "budget_entries", id(30), { budget_id: id(11) })]));
});

test("a payment's currency equals its planned row's currency", async () => {
  const { db, sqlite } = await fresh(planned(10, { currency: "USD" }));
  await rejected(apply(db, [payment(30, 10)]), 409, 0, /currency: must equal the currency of the planned row/);
  ok(await apply(db, [payment(30, 10, { currency: "USD" })]));
  await rejected(apply(db, [mutation("update", "budget_entries", id(30), { currency: "IDR" })]), 409, 0, /currency: must equal/);
  assert.equal(stored(sqlite, "budget_entries", id(30))?.currency, "USD");
});

test("a failing mutation writes nothing, not even the earlier ones", async () => {
  const { db, sqlite } = await fresh();
  const rev = currentRev(sqlite);
  await rejected(apply(db, [task(4), task(5), payment(30, 99)]), 409, 2, /budget_id/);
  assert.equal(count(sqlite, "items"), 0);
  assert.equal(currentRev(sqlite), rev);
});

test("rev is bumped once per request that writes, and every written row carries it", async () => {
  const { db, sqlite } = await fresh();
  const first = ok(await apply(db, [task(4), task(5)]));
  assert.equal(first.rev, 1);
  assert.deepEqual([task(4), task(5)].map((m) => stored(sqlite, "items", m.row_id)?.rev), [1, 1]);
  const second = ok(await apply(db, [mutation("update", "items", id(4), { title: "x" })]));
  assert.equal(second.rev, 2);
  assert.equal(stored(sqlite, "items", id(5))?.rev, 1);
  assert.equal(stored(sqlite, "items", id(4))?.rev, 2);
  assert.equal(currentRev(sqlite), 2);
});

test("a request in which every mutation is a no-op does not bump rev or write", async () => {
  const { db, sqlite, calls } = await fresh(task(4), task(5));
  ok(await apply(db, [mutation("delete", "items", id(4))]));
  const rev = currentRev(sqlite);
  calls.length = 0;
  const result = ok(await apply(db, [task(4), mutation("delete", "items", id(4)), mutation("update", "items", id(4), { title: "x" }), mutation("update", "items", id(5), {})]));
  assert.equal(result.rev, rev);
  assert.equal(currentRev(sqlite), rev);
  assert.equal(calls.flat().some((sql) => /^(UPDATE|INSERT)/.test(sql)), false);
});

test("the response carries the rows touched, read back after the write", async () => {
  const { db } = await fresh(vendor(20, { data: { phone: "+628123456789" } }));
  const result = ok(await apply(db, [task(4), mutation("update", "items", id(20), { data: { pic: "Sam" } }), setting("timezone", "Asia/Jakarta")]));
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
  const { db, sqlite } = await fresh();
  const result = ok(await apply(db, []));
  assert.equal(result.rev, 0);
  assert.deepEqual(result.rows, { items: [], budget_entries: [], settings: [] });
  assert.equal(currentRev(sqlite), 0);
});

test("a request of 20 mutations reads once per table and writes in one batch", async () => {
  const { db, calls } = await fresh(planned(10));
  calls.length = 0;
  const mutations = [...Array.from({ length: 10 }, (_, i) => task(100 + i)), ...Array.from({ length: 10 }, (_, i) => payment(200 + i, 10))];
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
    mutation("create", "budget_entries", id(300 + i), { ...payment(300 + i, 400 + i).patch }),
  );
  await rejected(apply(db, wide), 409, 0, /budget_id/);
  const vendors = Array.from({ length: MAX_MUTATIONS }, (_, i) => planned(300 + i, { vendor_id: id(600 + i) }));
  await rejected(apply(db, vendors), 409, 0, /vendor_id/);
});

test("a database failure is thrown to the router, which answers with a generic 500", async () => {
  const { db } = createDb();
  const failing = { ...db, batch: async () => { throw new Error("SQLITE_BUSY at /secret/path"); } };
  await assert.rejects(apply(failing, [task(1)]), /SQLITE_BUSY/);
});

test("pull returns rows after since, tombstones included, for all three tables", async () => {
  const { db } = await fresh(task(4), planned(10), setting("timezone", "Asia/Jakarta"));
  ok(await apply(db, [mutation("delete", "items", id(4))], "a"));
  const all = (await (await getSync(new URL("https://x.test/api/sync"), db, "b")).json()) as { rev: number; me: string; changes: Record<string, { id?: string; deleted_at: string | null; rev: number }[]> };
  assert.equal(all.rev, 2);
  assert.equal(all.me, "b");
  assert.deepEqual(Object.keys(all.changes).sort(), ["budget_entries", "items", "settings"]);
  assert.equal(all.changes.items.length, 1);
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
  const { db } = await fresh(vendor(20, { data: { phone: "+628123456789" } }));
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
  const { db, sqlite } = await fresh(vendor(20, { data: { phone: "+628123456789" } }));
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
  const { db, sqlite } = await fresh(task(4));
  const edit = mutation("update", "items", id(4), { title: "Once", amount: 5 });
  ok(await apply(db, [edit]));
  const rev = currentRev(sqlite);
  ok(await apply(db, [edit]));
  assert.equal(currentRev(sqlite), rev);
});

test("rows with data null or removed keys round-trip", async () => {
  const { db, sqlite } = await fresh(vendor(20, { data: { phone: "+628123456789" } }));
  ok(await apply(db, [mutation("update", "items", id(20), { data: { phone: null } })]));
  assert.equal(stored(sqlite, "items", id(20))?.data, "{}");
  ok(await apply(db, [mutation("update", "items", id(20), { data: { pic: "Sam" } })]));
  assert.equal(stored(sqlite, "items", id(20))?.data, '{"pic":"Sam"}');
});

test("a later mutation of a request sees the earlier update of the same row", async () => {
  const { db, sqlite } = await fresh(task(4));
  ok(await apply(db, [mutation("update", "items", id(4), { status: "done" }), mutation("update", "items", id(4), { status: "todo" })]));
  assert.equal(stored(sqlite, "items", id(4))?.status, "todo");
});

test("removing a data key the row does not have is a no-op", async () => {
  const { db, sqlite } = await fresh(vendor(20, { data: { pic: "Sam" } }));
  const rev = currentRev(sqlite);
  ok(await apply(db, [mutation("update", "items", id(20), { data: { phone: null } })]));
  assert.equal(currentRev(sqlite), rev);
  assert.equal(stored(sqlite, "items", id(20))?.rev, rev);
});

test("a payment's stored planned row is loaded even when the patch does not name it", async () => {
  const { db, sqlite } = await fresh(vendor(20), planned(10, { vendor_id: id(20) }), payment(30, 10));
  ok(await apply(db, [mutation("update", "budget_entries", id(10), { currency: "USD" })]));
  assert.equal(stored(sqlite, "budget_entries", id(10))?.currency, "USD");
  const mismatch = (await apply(db, [mutation("update", "budget_entries", id(30), { amount: 5, currency: "EUR" })])) as Rejection;
  assert.deepEqual(mismatch.errors, ["currency: must equal the currency of the planned row"]);
});

test("a statement that fails inside the write batch leaves nothing written", async () => {
  const { db, sqlite } = await fresh();
  const before = { rev: currentRev(sqlite), items: count(sqlite, "items") };
  let batches = 0;
  const racing = {
    ...db,
    async batch(statements: Parameters<typeof db.batch>[0]) {
      if (++batches === 2) sqlite.prepare("INSERT INTO items (id, kind, title, rev, created_at, updated_at) VALUES (?, 'task', 'raced', 9, ?, ?)").run(id(5), CLIENT_STAMP, CLIENT_STAMP);
      return db.batch(statements);
    },
  };
  await assert.rejects(apply(racing, [task(4), task(5), task(6)]), /UNIQUE|PRIMARY|constraint/i);
  assert.equal(stored(sqlite, "items", id(4)), undefined);
  assert.equal(stored(sqlite, "items", id(6)), undefined);
  assert.equal(stored(sqlite, "items", id(5))?.title, "raced");
  assert.equal(currentRev(sqlite), before.rev);
  assert.equal(count(sqlite, "items"), before.items + 1);
  ok(await apply(db, [task(4)]));
  assert.equal(currentRev(sqlite), before.rev + 1);
});

const EPOCH = /^[0-9a-f]{32}$/;

test("every success response carries the epoch of the database, and it never changes", async () => {
  const { db, sqlite } = await fresh();
  const epoch = currentEpoch(sqlite);
  assert.match(epoch, EPOCH);
  const pull = async (query = "") => (await (await getSync(new URL(`https://x.test/api/sync${query}`), db, "a")).json()) as { epoch: string };
  assert.equal((await pull()).epoch, epoch);
  const written = ok(await apply(db, [task(4), mutation("delete", "items", id(4))]));
  const noop = ok(await apply(db, [mutation("update", "items", id(4), {})]));
  const empty = ok(await apply(db, []));
  const posted = (await (await post(db, { mutations: [task(5)] })).json()) as { epoch: string };
  assert.deepEqual([written.epoch, noop.epoch, empty.epoch, posted.epoch], [epoch, epoch, epoch, epoch]);
  assert.equal((await pull("?since=1")).epoch, epoch);
  assert.equal((await pull("?since=99")).epoch, epoch);
  assert.equal(currentEpoch(sqlite), epoch);
});

test("no request can set the epoch", async () => {
  const { db, sqlite } = await fresh(task(4), setting("epoch", "x"));
  const epoch = currentEpoch(sqlite);
  const attempts: unknown[][] = [
    [{ ...task(5), patch: { ...task(5).patch, epoch: "deadbeef" } }],
    [mutation("update", "items", id(4), { epoch: "deadbeef" })],
    [{ ...mutation("create", "items", "1", { id: 1, rev: 0, epoch: "deadbeef" }), table: "sync_state" }],
    [{ ...mutation("update", "items", "1", { epoch: "deadbeef" }), table: "sync_state" }],
    [{ ...mutation("delete", "items", "1"), table: "sync_state" }],
    [mutation("update", "settings", "epoch", { value: "deadbeef" })],
    [{ ...task(6), epoch: "deadbeef" }],
  ];
  for (const mutations of attempts) await apply(db, mutations);
  const response = await post(db, { mutations: [], epoch: "deadbeef" });
  assert.equal(response.status, 400);
  const query = (await (await getSync(new URL("https://x.test/api/sync?epoch=deadbeef&since=0"), db, "a")).json()) as { epoch: string };
  assert.equal(query.epoch, epoch);
  assert.equal(currentEpoch(sqlite), epoch);
});

test("the epoch is read in the same batch as the revision, never by a query of its own", async () => {
  const { db, calls } = await fresh(task(4));
  calls.length = 0;
  ok(await apply(db, [task(5)]));
  await getSync(new URL("https://x.test/api/sync"), db, "a");
  const statements = calls.flat();
  assert.equal(statements.filter((sql) => /epoch/.test(sql)).length, 2);
  assert.equal(statements.filter((sql) => /^SELECT rev, epoch FROM sync_state/.test(sql)).length, 2);
  assert.equal(calls.length, 3);
});
