import { test } from "node:test";
import assert from "node:assert/strict";
import { LATELY_COUNT, lately } from "../src/domain/lately.ts";
import { entry, item, payment } from "./domain-rows.ts";

const edited = { created_at: "2026-10-01T00:00:00Z" };

test("newest change first, at most the limit", () => {
  const rows = [1, 2, 3, 4].map((hour) => item({ title: `t${hour}`, updated_by: "a", updated_at: `2026-10-05T0${hour}:00:00Z` }));
  assert.deepEqual(
    lately(rows, [], 2).map((activity) => activity.title),
    ["t4", "t3"],
  );
});

test("items and budget entries mix on one timeline", () => {
  const line = entry({ title: "Venue", updated_by: "b", updated_at: "2026-10-05T01:00:00Z" });
  const rows = [item({ title: "task", updated_by: "a", updated_at: "2026-10-05T02:00:00Z" })];
  assert.deepEqual(
    lately(rows, [line]).map((activity) => [activity.title, activity.by]),
    [
      ["task", "a"],
      ["Venue", "b"],
    ],
  );
});

test("changes made by an import or by nobody are left out", () => {
  const rows = [item({ updated_by: "import" }), item({ updated_by: null }), item({ title: "kept", updated_by: "b" })];
  assert.deepEqual(
    lately(rows, []).map((activity) => activity.title),
    ["kept"],
  );
});

test("the verb follows what the row looks like now", () => {
  const line = entry({});
  const verbs = lately(
    [
      item({ title: "ticked", status: "done", updated_by: "a", updated_at: "2026-10-05T05:00:00Z", ...edited }),
      item({ title: "added", updated_by: "a", updated_at: "2026-10-05T04:00:00Z", created_at: "2026-10-05T04:00:00Z" }),
      item({ title: "changed", updated_by: "a", updated_at: "2026-10-05T03:00:00Z", ...edited }),
      item({ title: "vendor done", kind: "vendor", status: "confirmed", updated_by: "a", updated_at: "2026-10-05T02:00:00Z", ...edited }),
    ],
    [payment(line, { title: "paid", status: "paid", updated_by: "b", updated_at: "2026-10-05T06:00:00Z", ...edited })],
  );
  assert.deepEqual(
    verbs.map((activity) => [activity.title, activity.verb]),
    [
      ["paid", "paid"],
      ["ticked", "ticked"],
      ["added", "added"],
      ["changed", "changed"],
      ["vendor done", "changed"],
    ],
  );
});

test("the default length is LATELY_COUNT", () => {
  const rows = Array.from({ length: LATELY_COUNT + 2 }, (_, index) => item({ updated_by: "a", updated_at: `2026-10-05T0${index}:00:00Z` }));
  assert.equal(lately(rows, []).length, LATELY_COUNT);
  assert.equal(LATELY_COUNT, 5);
});

test("changes at the same instant sort by id, whatever the input order", () => {
  const at = { updated_by: "a" as const, updated_at: "2026-10-05T00:00:00Z" };
  const first = item({ title: "first", id: "00000000-0000-4000-8000-000000000001", ...at });
  const second = item({ title: "second", id: "00000000-0000-4000-8000-000000000002", ...at });
  const line = entry({ title: "third", id: "00000000-0000-4000-8000-000000000003", ...at });
  for (const rows of [
    [first, second],
    [second, first],
  ]) {
    assert.deepEqual(
      lately(rows, [line]).map((activity) => activity.title),
      ["first", "second", "third"],
    );
  }
});

test("added means unsynced, or never changed since the server stored it", () => {
  const created = "2026-10-05T10:00:00Z";
  const verb = (fields: Parameters<typeof item>[0]) => lately([item({ updated_by: "a", created_at: created, ...fields })], [])[0].verb;
  assert.equal(verb({ updated_at: created }), "added");
  assert.equal(verb({ updated_at: "2026-10-05T10:00:01Z" }), "changed");
  assert.equal(verb({ updated_at: "2026-10-06T10:00:00Z" }), "changed");
  assert.equal(verb({ updated_at: "2026-10-06T10:00:00Z", rev: 0 }), "added");
});
