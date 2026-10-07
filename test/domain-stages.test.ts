import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGES, routeOf } from "../src/domain/stages.ts";
import { item } from "./domain-rows.ts";

const ceremony = "2027-11-13";

const stateOf = (today: string, tasks = [item({})]) => routeOf(ceremony, today, tasks).map((station) => `${station.key}:${station.state}`);

test("the default list is ordered, gap free and ends on the ceremony month", () => {
  for (const [index, stage] of STAGES.entries()) {
    assert.ok(stage.from <= stage.to, stage.key);
    if (index > 0) assert.equal(stage.from, STAGES[index - 1].to + 1, stage.key);
  }
  assert.deepEqual([STAGES.at(-1)!.from, STAGES.at(-1)!.to], [0, 0]);
});

test("month offsets count from the ceremony month and cover whole months", () => {
  const route = routeOf(ceremony, "2026-10-07", []);
  const range = (key: string) => route.filter((station) => station.key === key).map((station) => [station.start, station.end])[0];
  assert.deepEqual(range("foundations"), ["2026-06-01", "2026-09-30"]);
  assert.deepEqual(range("bookings"), ["2026-10-01", "2026-12-31"]);
  assert.deepEqual(range("lamaran"), ["2027-01-01", "2027-01-31"]);
  assert.deepEqual(range("details"), ["2027-02-01", "2027-07-31"]);
  assert.deepEqual(range("akad"), ["2027-11-01", "2027-11-30"]);
});

test("a leap February ends on the 29th", () => {
  const route = routeOf("2028-05-20", "2027-01-01", [], [{ key: "x", name: "X", from: -3, to: -3 }]);
  assert.deepEqual([route[0].start, route[0].end], ["2028-02-01", "2028-02-29"]);
});

test("the stage whose month range holds today is now, earlier ones are past, the first later one is next", () => {
  assert.deepEqual(stateOf("2026-10-07"), [
    "foundations:past",
    "bookings:now",
    "lamaran:next",
    "details:later",
    "kua:later",
    "invitations:later",
    "akad:later",
  ]);
});

test("the first and last day of a range are inside it", () => {
  assert.equal(stateOf("2026-10-01")[1], "bookings:now");
  assert.equal(stateOf("2026-12-31")[1], "bookings:now");
  assert.equal(stateOf("2027-01-01")[2], "lamaran:now");
  assert.equal(stateOf("2026-09-30")[0], "foundations:now");
});

test("before the first stage nothing is now and the first stage is next", () => {
  assert.deepEqual(stateOf("2025-01-01").slice(0, 3), ["foundations:next", "bookings:later", "lamaran:later"]);
});

test("after the ceremony month every stage is past", () => {
  assert.ok(stateOf("2027-12-01").every((state) => state.endsWith(":past")));
});

test("stages without tasks are kept", () => {
  const route = routeOf(ceremony, "2026-10-07", []);
  assert.equal(route.length, STAGES.length);
  assert.ok(route.every((station) => station.total === 0 && station.done === 0));
});

test("tasks count under a stage by key or by name, any case, and only tasks", () => {
  const route = routeOf(ceremony, "2026-10-07", [
    item({ group_key: "bookings" }),
    item({ group_key: "  Big Bookings ", status: "done" }),
    item({ group_key: "kua", status: "done" }),
    item({ group_key: "elsewhere" }),
    item({ group_key: null }),
    item({ group_key: "bookings", kind: "vendor", status: "option" }),
  ]);
  const by = (key: string) => route.filter((station) => station.key === key).map((station) => [station.total, station.done])[0];
  assert.deepEqual(by("bookings"), [2, 1]);
  assert.deepEqual(by("kua"), [1, 1]);
  assert.deepEqual(by("foundations"), [0, 0]);
});
