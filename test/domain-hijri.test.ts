import { test } from "node:test";
import assert from "node:assert/strict";
import { HIJRI_OFFSETS, hijriOf } from "../src/domain/hijri.ts";
import { readSettings } from "../src/domain/settings.ts";
import { STAGES } from "../src/domain/stages.ts";

test("the Umm al-Qura date is written with English month names and no era", () => {
  assert.equal(hijriOf("2026-10-06"), "25 Rabiʻ II 1448");
  assert.equal(hijriOf("2027-11-13"), "14 Jumada II 1449");
  assert.equal(hijriOf("2027-02-08"), "1 Ramadan 1448");
});

test("the adjustment moves the Hijri date by whole days across a month end", () => {
  assert.deepEqual(HIJRI_OFFSETS, [-1, 0, 1]);
  assert.equal(hijriOf("2027-02-08", -1), "30 Shaʻban 1448");
  assert.equal(hijriOf("2027-02-08", 0), "1 Ramadan 1448");
  assert.equal(hijriOf("2027-02-08", 1), "2 Ramadan 1448");
});

test("the Gregorian day is never shifted by the phone zone", () => {
  assert.equal(hijriOf("2026-12-31"), hijriOf("2026-12-31", 0));
  assert.equal(hijriOf("2026-12-31", 1), hijriOf("2027-01-01"));
  assert.equal(hijriOf("2028-02-29", -1), hijriOf("2028-02-28"));
});

const row = (key: string, value: string) => ({ key, value, rev: 1, created_at: "", updated_at: "", updated_by: null, deleted_at: null });

test("settings read the stage list and the adjustment, and fall back when they are missing or broken", () => {
  assert.deepEqual([readSettings([]).stages, readSettings([]).hijriOffset], [STAGES, 0]);
  const custom = JSON.stringify([{ key: "all", name: "All", from: -3, to: 0 }]);
  const read = readSettings([row("stages", custom), row("hijri_offset_days", "-1")]);
  assert.deepEqual([read.stages, read.hijriOffset], [[{ key: "all", name: "All", from: -3, to: 0 }], -1]);
  const broken = readSettings([row("stages", "[{"), row("hijri_offset_days", "x")]);
  assert.deepEqual([broken.stages, broken.hijriOffset], [STAGES, 0]);
});

import { hijriChoices } from "../src/domain/hijri.ts";
import { text } from "../src/ui/text.ts";

test("the control offers a day earlier, as calculated and a day later, and the stored value when it is outside them", () => {
  assert.deepEqual(hijriChoices(0), [-1, 0, 1]);
  assert.deepEqual(hijriChoices(-1), [-1, 0, 1]);
  assert.deepEqual(hijriChoices(1), [-1, 0, 1]);
  assert.deepEqual(hijriChoices(2), [-1, 0, 1, 2]);
  assert.deepEqual(hijriChoices(-2), [-2, -1, 0, 1]);
});

test("every value the contract allows has a label, and a stored two shifts the date by two days", () => {
  for (const offset of [-2, -1, 0, 1, 2]) assert.match(text.settings.hijriOffset[String(offset) as keyof typeof text.settings.hijriOffset], /\S/);
  assert.equal(hijriOf("2027-02-08", 2), "3 Ramadan 1448");
  assert.equal(hijriOf("2027-02-08", -2), "29 Shaʻban 1448");
  const read = readSettings([{ key: "hijri_offset_days", value: "2", rev: 1, created_at: "", updated_at: "", updated_by: null, deleted_at: null }]);
  assert.equal(read.hijriOffset, 2);
  assert.ok(hijriChoices(read.hijriOffset).includes(read.hijriOffset));
});
