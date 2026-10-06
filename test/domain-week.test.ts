import { test } from "node:test";
import assert from "node:assert/strict";
import { thisWeek } from "../src/domain/week.ts";
import { entry, item, payment } from "./domain-rows.ts";

const today = "2026-10-06";
const titles = (list: { row: { title: string } }[]) => list.map((e) => e.row.title);

test("tasks split into overdue, next 7 days and no date", () => {
  const week = thisWeek(
    [
      item({ title: "late", due_on: "2026-10-05" }),
      item({ title: "today", due_on: "2026-10-06" }),
      item({ title: "edge", due_on: "2026-10-13" }),
      item({ title: "later", due_on: "2026-10-14" }),
      item({ title: "someday" }),
    ],
    [],
    today,
  );
  assert.deepEqual(titles(week.overdue), ["late"]);
  assert.deepEqual(titles(week.soon), ["today", "edge"]);
  assert.deepEqual(titles(week.undated.map((row) => ({ row }))), ["someday"]);
});

test("done tasks and other kinds never show", () => {
  const week = thisWeek(
    [
      item({ title: "done", due_on: "2026-10-05", status: "done" }),
      item({ title: "vendor", kind: "vendor", status: "option", due_on: "2026-10-05" }),
      item({ title: "undated done", status: "done" }),
    ],
    [],
    today,
  );
  assert.deepEqual([week.overdue, week.soon, week.undated], [[], [], []]);
});

test("due payments join the lists, paid ones and payments without a date do not", () => {
  const line = entry({ title: "Venue", amount: 100 });
  const week = thisWeek(
    [item({ title: "task", due_on: "2026-10-08" })],
    [
      line,
      payment(line, { title: "late payment", due_on: "2026-10-01" }),
      payment(line, { title: "soon payment", due_on: "2026-10-07" }),
      payment(line, { title: "far payment", due_on: "2026-12-01" }),
      payment(line, { title: "paid", due_on: "2026-10-07", status: "paid" }),
      payment(line, { title: "no date" }),
    ],
    today,
  );
  assert.deepEqual(titles(week.overdue), ["late payment"]);
  assert.deepEqual(titles(week.soon), ["soon payment", "task"]);
  assert.equal(week.soon[0].type, "payment");
  assert.equal(week.soon[1].type, "task");
});

test("a payment whose planned line is missing is hidden", () => {
  const gone = entry({});
  assert.deepEqual(thisWeek([], [payment(gone, { due_on: "2026-10-07" })], today).soon, []);
});

test("entries sort by due date, then by sort", () => {
  const week = thisWeek(
    [
      item({ title: "b", due_on: "2026-10-07", sort: 2 }),
      item({ title: "a", due_on: "2026-10-07", sort: 1 }),
      item({ title: "first", due_on: "2026-10-06" }),
    ],
    [],
    today,
  );
  assert.deepEqual(titles(week.soon), ["first", "a", "b"]);
});

test("the window follows the given day, month ends included", () => {
  const week = thisWeek([item({ title: "x", due_on: "2027-01-03" })], [], "2026-12-27");
  assert.deepEqual(titles(week.soon), ["x"]);
});
