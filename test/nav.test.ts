import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrent, navItems } from "../src/ui/nav.ts";
import { text } from "../src/ui/text.ts";

test("the phone tab bar holds Home, Money and People and no Settings", () => {
  assert.deepEqual(
    navItems("tabs").map((item) => item.section),
    ["", "money", "people"],
  );
});

test("the sidebar holds the same destinations and ends on Settings", () => {
  assert.deepEqual(
    navItems("rail").map((item) => item.section),
    ["", "money", "people", "settings"],
  );
  assert.equal(navItems("rail").at(-1)?.label, text.nav.settings);
});

test("every item is labelled and has an icon", () => {
  for (const item of navItems("rail")) assert.ok(item.label.trim() !== "" && item.icon !== undefined, item.section);
});

const current = (section: string) => navItems("rail").filter((item) => isCurrent(item, section)).map((item) => item.section);

test("every route, old and new, highlights exactly one destination", () => {
  const expected = {
    "": "",
    tasks: "",
    money: "money",
    budget: "money",
    payments: "money",
    people: "people",
    guests: "people",
    vendors: "people",
    settings: "settings",
  };
  for (const [section, destination] of Object.entries(expected)) assert.deepEqual(current(section), [destination], `#/${section}`);
});

test("routes that belong to no destination highlight nothing", () => {
  assert.deepEqual(current("sync"), []);
  assert.deepEqual(current("nowhere"), []);
});
