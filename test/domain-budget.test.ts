import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetOf } from "../src/domain/budget.ts";
import { entry, payment } from "./domain-rows.ts";

const figures = (totals: ReturnType<typeof budgetOf>) => ({
  planned: totals.planned,
  paid: totals.paid,
  paidUnestimated: totals.paidUnestimated,
  remaining: totals.remaining,
  over: totals.over,
  unestimated: totals.unestimated,
});

test("remaining is planned minus paid; payments still due are not subtracted", () => {
  const venue = entry({ title: "Venue", amount: 10_000_000 });
  const budget = budgetOf([
    venue,
    payment(venue, { status: "paid", amount: 3_000_000, done_on: "2026-10-02" }),
    payment(venue, { status: "due", amount: 2_000_000, due_on: "2026-11-01" }),
  ]);
  const [line] = budget.groups[0].lines;
  assert.deepEqual([line.planned, line.paid, line.remaining, line.over], [10_000_000, 3_000_000, 7_000_000, 0]);
  assert.deepEqual(figures(budget), {
    planned: 10_000_000,
    paid: 3_000_000,
    paidUnestimated: 0,
    remaining: 7_000_000,
    over: 0,
    unestimated: 0,
  });
});

test("a planned line without an amount is no estimate, not zero", () => {
  const fee = entry({ title: "Fee", amount: null });
  const zero = entry({ title: "Free hall", amount: 0 });
  const budget = budgetOf([fee, zero]);
  const byTitle = Object.fromEntries(budget.groups[0].lines.map((line) => [line.row.title, line]));
  assert.equal(byTitle.Fee.planned, null);
  assert.equal(byTitle.Fee.remaining, null);
  assert.equal(byTitle["Free hall"].planned, 0);
  assert.equal(byTitle["Free hall"].remaining, 0);
  assert.equal(budget.unestimated, 1);
});

test("paid on an unestimated line is its own number and never touches the estimated totals", () => {
  const venue = entry({ title: "Venue", amount: 25_000_000 });
  const catering = entry({ title: "Catering", amount: null });
  const budget = budgetOf([venue, catering, payment(catering, { status: "paid", amount: 12_000_000 })]);
  assert.deepEqual(figures(budget), {
    planned: 25_000_000,
    paid: 0,
    paidUnestimated: 12_000_000,
    remaining: 25_000_000,
    over: 0,
    unestimated: 1,
  });
  const [group] = budget.groups;
  assert.deepEqual([group.planned, group.paid, group.paidUnestimated, group.remaining], [25_000_000, 0, 12_000_000, 25_000_000]);
});

test("totals add up: paid and remaining of estimated lines never exceed planned plus over", () => {
  const a = entry({ amount: 10_000_000 });
  const b = entry({ amount: 4_000_000 });
  const c = entry({ amount: null });
  const budget = budgetOf([
    a,
    b,
    c,
    payment(a, { status: "paid", amount: 6_000_000 }),
    payment(b, { status: "paid", amount: 4_000_000 }),
    payment(c, { status: "paid", amount: 1_000_000 }),
  ]);
  assert.deepEqual(figures(budget), {
    planned: 14_000_000,
    paid: 10_000_000,
    paidUnestimated: 1_000_000,
    remaining: 4_000_000,
    over: 0,
    unestimated: 1,
  });
  assert.equal(budget.paid + budget.remaining, budget.planned + budget.over);
});

test("an overpaid line has remaining 0 and its own over, and never makes the total negative", () => {
  const a = entry({ amount: 100 });
  const b = entry({ amount: 1000 });
  const budget = budgetOf([a, b, payment(a, { status: "paid", amount: 150 }), payment(b, { status: "paid", amount: 100 })]);
  const lines = Object.fromEntries(budget.groups[0].lines.map((line) => [line.planned, line]));
  assert.deepEqual([lines[100].remaining, lines[100].over], [0, 50]);
  assert.deepEqual([lines[1000].remaining, lines[1000].over], [900, 0]);
  assert.deepEqual([budget.remaining, budget.over, budget.paid], [900, 50, 250]);
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
  assert.equal(budget.paid + budget.paidUnestimated, 0);
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
