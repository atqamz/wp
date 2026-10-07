import { test } from "node:test";
import assert from "node:assert/strict";
import { MONTH_MAX, STAGES_MAX, stageProblems } from "../shared/validate.ts";
import { STAGES, addStage, canAddStage, monthStart, moveStage, parseStages, removeStage, routeOf } from "../src/domain/stages.ts";
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

test("the default list passes the contract check", () => {
  assert.deepEqual(stageProblems(STAGES), []);
});

test("a stored list replaces the default and a bad or missing one falls back to it", () => {
  const custom = [{ key: "all", name: "All of it", from: -6, to: 0 }];
  assert.deepEqual(parseStages(JSON.stringify(custom)), custom);
  for (const value of [null, "", "nope", "[]", JSON.stringify([{ key: "a", name: "A", from: 0, to: -1 }])]) assert.equal(parseStages(value), STAGES);
});

test("a custom list drives the route and the day stage is the one holding the ceremony month", () => {
  const route = routeOf(ceremony, "2027-10-15", [item({ group_key: "prep" })], [
    { key: "prep", name: "Prepare", from: -3, to: -2 },
    { key: "wrap", name: "The last stretch", from: -1, to: 0 },
    { key: "after", name: "After", from: 1, to: 2 },
  ]);
  assert.deepEqual(route.map((station) => [station.key, station.state, station.day]), [
    ["prep", "past", false],
    ["wrap", "now", true],
    ["after", "next", false],
  ]);
  assert.equal(route[0].total, 1);
  assert.deepEqual([route[2].start, route[2].end], ["2027-12-01", "2028-01-31"]);
});

test("a list with a gap keeps the gap and the first later stage is next", () => {
  const route = routeOf(ceremony, "2027-05-01", [], [
    { key: "a", name: "A", from: -10, to: -9 },
    { key: "b", name: "B", from: -3, to: -2 },
    { key: "c", name: "C", from: 0, to: 0 },
  ]);
  assert.deepEqual(route.map((station) => station.state), ["past", "next", "later"]);
});

test("adding a stage appends one month after the last and keeps keys and names unique", () => {
  const added = addStage(STAGES);
  assert.deepEqual(added.at(-1), { key: "stage_1", name: "New stage", from: 1, to: 1 });
  assert.deepEqual(stageProblems(added), []);
  const twice = addStage(addStage(STAGES));
  assert.deepEqual(twice.slice(-2).map((stage) => [stage.key, stage.name, stage.from]), [["stage_1", "New stage", 1], ["stage_2", "New stage 2", 2]]);
  assert.deepEqual(stageProblems(twice), []);
  const clash = addStage([{ key: "stage_1", name: "new stage", from: -2, to: -1 }]);
  assert.deepEqual([clash[1].key, clash[1].name], ["stage_2", "New stage 2"]);
});

test("a stage cannot be added past the last month or past the cap", () => {
  const full = Array.from({ length: STAGES_MAX }, (_, i) => ({ key: `s${i}`, name: `S${i}`, from: i - 20, to: i - 20 }));
  const ends = [{ key: "z", name: "Z", from: -2, to: MONTH_MAX }];
  assert.equal(canAddStage(STAGES), true);
  assert.equal(canAddStage(full), false);
  assert.equal(canAddStage(ends), false);
  assert.deepEqual(addStage(full), full);
  assert.deepEqual(addStage(ends), ends);
});

test("removing keeps at least one stage", () => {
  assert.deepEqual(removeStage(STAGES, 0).map((stage) => stage.key), STAGES.slice(1).map((stage) => stage.key));
  const one = [STAGES[0]];
  assert.deepEqual(removeStage(one, 0), one);
});

test("moving a stage swaps its name with the neighbour and leaves the month ranges in place", () => {
  const moved = moveStage(STAGES, 1, -1);
  assert.deepEqual(moved.slice(0, 2).map((stage) => [stage.key, stage.from, stage.to]), [["bookings", -17, -14], ["foundations", -13, -11]]);
  assert.deepEqual(stageProblems(moved), []);
  assert.deepEqual(moveStage(STAGES, 0, -1), [...STAGES]);
  assert.deepEqual(moveStage(STAGES, STAGES.length - 1, 1), [...STAGES]);
  assert.deepEqual(moveStage(moveStage(STAGES, 2, 1), 3, -1), [...STAGES]);
});

test("a month offset gives the first day of that month, across a year end", () => {
  assert.equal(monthStart("2027-11-13", 0), "2027-11-01");
  assert.equal(monthStart("2027-11-13", -17), "2026-06-01");
  assert.equal(monthStart("2027-02-01", -2), "2026-12-01");
  assert.equal(monthStart("2027-11-13", 2), "2028-01-01");
  assert.equal(monthStart("2027-11-13", 12), "2028-11-01");
});
