import { test } from "node:test";
import assert from "node:assert/strict";
import { navItems } from "../src/ui/nav.ts";
import { text } from "../src/ui/text.ts";

test("the phone tab bar holds the five main routes and no Settings", () => {
  assert.deepEqual(
    navItems("tabs").map((item) => item.section),
    ["", "tasks", "budget", "vendors", "guests"],
  );
});

test("the sidebar holds the same routes and ends on Settings", () => {
  assert.deepEqual(
    navItems("rail").map((item) => item.section),
    ["", "tasks", "budget", "vendors", "guests", "settings"],
  );
  assert.equal(navItems("rail").at(-1)?.label, text.nav.settings);
});

test("every item is labelled and has an icon", () => {
  for (const item of navItems("rail")) assert.ok(item.label.trim() !== "" && item.icon !== undefined, item.section);
});
