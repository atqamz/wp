import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDay, formatMoney } from "../src/ui/format.ts";

test("money is whole rupiah with dot grouping", () => {
  assert.equal(formatMoney(600_000).replace(/\s/g, " "), "Rp 600.000");
  assert.equal(formatMoney(0).replace(/\s/g, " "), "Rp 0");
  assert.equal(formatMoney(58_500_000).replace(/\s/g, " "), "Rp 58.500.000");
});

test("dates read day, month name, year and ignore the machine zone", () => {
  assert.equal(formatDate("2026-10-06"), "6 Oct 2026");
  assert.equal(formatDate("2027-01-01"), "1 Jan 2027");
  assert.match(formatDay("2026-10-06"), /^Tue,? 6 Oct$/);
});
