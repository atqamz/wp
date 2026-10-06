import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetOf } from "../src/domain/budget.ts";
import { entry, payment } from "./domain-rows.ts";

test("remaining is planned minus paid; due payments are not subtracted", () => {
  const venue = entry({ title: "Venue", amount: 10_000_000 });
  const budget = budgetOf([
    venue,
    payment(venue, { status: "paid", amount: 3_000_000, done_on: "2026-10-02" }),
    payment(venue, { status: "due", amount: 2_000_000, due_on: "2026-11-01" }),
  ]);
  const [line] = budget.groups[0].lines;
  assert.equal(line.planned, 10_000_000);
  assert.equal(line.paid, 3_000_000);
  assert.equal(line.due, 2_000_000);
  assert.equal(line.remaining, 7_000_000);
  assert.deepEqual(
    { planned: budget.planned, paid: budget.paid, due: budget.due, remaining: budget.remaining },
    { planned: 10_000_000, paid: 3_000_000, due: 2_000_000, remaining: 7_000_000 },
  );
});

test("a planned line without an amount is no estimate, not zero", () => {
  const fee = entry({ title: "Fee", amount: null });
  const zero = entry({ title: "Free hall", amount: 0 });
  const budget = budgetOf([fee, zero, payment(fee, { status: "paid", amount: 500_000 })]);
  const lines = budget.groups[0].lines;
  const byTitle = Object.fromEntries(lines.map((line) => [line.row.title, line]));
  assert.equal(byTitle.Fee.planned, null);
  assert.equal(byTitle.Fee.remaining, null);
  assert.equal(byTitle["Free hall"].planned, 0);
  assert.equal(byTitle["Free hall"].remaining, 0);
  assert.equal(budget.unestimated, 1);
  assert.equal(budget.planned, 0);
  assert.equal(budget.paid, 500_000);
  assert.equal(budget.remaining, 0);
});

test("overpaying a line gives a negative remaining", () => {
  const line = entry({ amount: 100 });
  assert.equal(budgetOf([line, payment(line, { status: "paid", amount: 150 })]).remaining, -50);
});

test("totals per event group, in event order then alphabetical", () => {
  const reception = entry({ group_key: "reception", amount: 5_000_000 });
  const engagement = entry({ group_key: "engagement", amount: 1_000_000 });
  const other = entry({ group_key: "attire", amount: 700_000 });
  const budget = budgetOf([
    reception,
    other,
    engagement,
    payment(engagement, { status: "paid", amount: 400_000 }),
    payment(reception, { status: "paid", amount: 1_000_000 }),
  ]);
  assert.deepEqual(
    budget.groups.map((group) => [group.key, group.planned, group.paid, group.remaining]),
    [
      ["engagement", 1_000_000, 400_000, 600_000],
      ["reception", 5_000_000, 1_000_000, 4_000_000],
      ["attire", 700_000, 0, 700_000],
    ],
  );
  assert.equal(budget.planned, 6_700_000);
  assert.equal(budget.remaining, 5_300_000);
});

test("payments of a line that is not in the input are ignored", () => {
  const gone = entry({ amount: 100 });
  const budget = budgetOf([payment(gone, { status: "paid", amount: 100 })]);
  assert.equal(budget.paid, 0);
  assert.deepEqual(budget.groups, []);
});

test("lines and payments follow the fractional sort", () => {
  const first = entry({ title: "first", sort: 1 });
  const second = entry({ title: "second", sort: 2 });
  const inserted = entry({ title: "between", sort: 1.5 });
  const budget = budgetOf([second, first, inserted]);
  assert.deepEqual(
    budget.groups[0].lines.map((line) => line.row.title),
    ["first", "between", "second"],
  );
});
