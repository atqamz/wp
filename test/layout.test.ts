import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const sheets = readdirSync(new URL("../src/", import.meta.url), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css") && entry.name !== "tokens.css")
  .map((entry) => ({ name: entry.name, css: readFileSync(`${entry.parentPath}/${entry.name}`, "utf8") }));

const all = sheets.map((sheet) => sheet.css).join("\n");

test("every width condition is in rem, so a larger root text size moves it with the content", () => {
  const conditions = [...all.matchAll(/@(?:media|container)[^{]*\((?:min|max)-width:\s*([\d.]+)(\w+)\)/g)];
  assert.ok(conditions.length >= 6);
  assert.deepEqual(
    conditions.filter(([, , unit]) => unit !== "rem").map(([match]) => match),
    [],
  );
});

test("amounts may wrap, so a long figure never pushes a screen sideways", () => {
  const rule = /\.amt\s*\{([^}]*)\}/.exec(all)?.[1] ?? "";
  assert.ok(rule.includes("tabular-nums"));
  assert.doesNotMatch(rule, /white-space:\s*nowrap/);
});

test("controls that are not full rows keep a 44 px target", () => {
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.>*[\]="()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(all)?.[1] ?? "";
  assert.match(rule(".seg > *"), /min-height:\s*var\(--target-min\)/);
  assert.match(rule(".ib"), /width:\s*var\(--target-min\)/);
  assert.match(rule(".ib"), /height:\s*var\(--target-min\)/);
  assert.match(rule(".brand"), /min-width:\s*var\(--target-min\)/);
});

test("no class is styled in two stylesheets, so a new rule cannot recolour another screen", () => {
  const owners = new Map<string, Set<string>>();
  for (const { name, css } of sheets) {
    for (const [, selector] of css.matchAll(/(?:^|\n)(\.[a-z][\w-]*)\s*(?:,|\{)/g)) (owners.get(selector) ?? owners.set(selector, new Set()).get(selector)!).add(name);
  }
  assert.deepEqual(
    [...owners].filter(([, files]) => files.size > 1).map(([selector]) => selector),
    [],
  );
});

test("the pane threshold leaves the list at least 28rem beside a 25rem pane", () => {
  const threshold = Number(/PANE_REM = (\d+)/.exec(read("hooks/use-room.ts"))?.[1]);
  const pane = Number(/\.split\[data-wide\]\s*\{[^}]*grid-template-columns:[^;]*?\s(\d+)rem;/.exec(all)?.[1]);
  assert.equal(pane, 25);
  const gutters = 2 * 2.5;
  const gap = 2;
  assert.ok(threshold - gutters - gap - pane >= 28, `${threshold}rem leaves ${threshold - gutters - gap - pane}rem`);
});

test("scrollbars of the detail pane are the default thin ones, hidden on touch by the global rule", () => {
  assert.doesNotMatch(read("ui/ui.css"), /scrollbar-width:\s*none/);
  assert.match(read("style.css"), /@media \(pointer: coarse\)/);
});
