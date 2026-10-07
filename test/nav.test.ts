import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrent, navEntries, navItems } from "../src/ui/nav.ts";
import { screenOf, screens } from "../src/ui/routes.ts";
import type { Screen } from "../src/ui/routes.ts";
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

test("every route, old and new, opens one screen and highlights exactly one destination", () => {
  const expected: Record<string, [Screen, string]> = {
    "": ["home", ""],
    tasks: ["tasks", ""],
    money: ["money", "money"],
    budget: ["money", "money"],
    payments: ["payments", "money"],
    people: ["people", "people"],
    guests: ["people", "people"],
    vendors: ["people", "people"],
    settings: ["settings", "settings"],
  };
  for (const [section, [screen, destination]] of Object.entries(expected)) {
    assert.equal(screenOf(section), screen, `#/${section}`);
    assert.deepEqual(current(section), [destination], `#/${section}`);
  }
});

test("every destination links to a route that opens one of its own screens", () => {
  for (const item of navItems("rail")) assert.ok(item.screens.includes(screenOf(item.section)!), item.section);
});

test("every screen but Sync belongs to one destination, so the bar and the page switch cannot drift apart", () => {
  const owners = (screen: Screen) => navItems("rail").filter((item) => item.screens.includes(screen)).length;
  for (const screen of new Set(Object.values(screens))) assert.equal(owners(screen), screen === "sync" ? 0 : 1, screen);
});

test("Sync and routes that do not exist highlight nothing and open nothing", () => {
  assert.deepEqual(current("sync"), []);
  for (const section of ["nowhere", "constructor", "__proto__", "toString", "Money", "money/x"]) {
    assert.equal(screenOf(section), null, section);
    assert.deepEqual(current(section), [], section);
  }
});

const order = (kind: "tabs" | "rail") => navEntries(kind).map((entry) => (entry === "add" ? "add" : entry.section));

test("the Add button sits in the middle of the phone tab bar and first in the sidebar, in tab order", () => {
  assert.deepEqual(order("tabs"), ["", "money", "add", "people"]);
  assert.deepEqual(order("rail"), ["add", "", "money", "people", "settings"]);
});

test("Add is a button that is reachable on every main screen, and no destination is lost", () => {
  for (const kind of ["tabs", "rail"] as const) {
    assert.equal(navEntries(kind).filter((entry) => entry === "add").length, 1);
    assert.deepEqual(navEntries(kind).filter((entry) => entry !== "add"), navItems(kind));
  }
});
