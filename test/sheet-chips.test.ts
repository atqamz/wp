import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { text } from "../src/ui/text.ts";

const sheet = readFileSync(new URL("../src/ui/add-sheet.tsx", import.meta.url), "utf8");

test("a chip is named by its field and its value, and the name contains what is shown", () => {
  assert.equal(text.sheet.chipName("Due date", "Fri, 9 Oct"), "Due date: Fri, 9 Oct");
  assert.equal(text.sheet.chipName(text.sheet.group.task, "Big bookings"), "Phase: Big bookings");
  for (const value of ["Rp 2.500.000", "No amount", "Fri, 9 Oct", "Choose a line"]) assert.ok(text.sheet.chipName("Field", value).includes(value));
  assert.match(sheet, /aria-label=\{text\.sheet\.chipName\(chip\.field, chip\.label\)\}/);
});

test("every kind of chip has a field name, owner included", () => {
  for (const key of ["amount", "due", "line", "phone", "qty", "owner"] as const) assert.match(text.sheet.detail[key], /\S/);
  for (const key of ["task", "planned", "vendor", "guest"] as const) assert.match(text.sheet.group[key], /\S/);
});
