import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES, THEME_KEY, applyTheme, readTheme, saveTheme } from "../src/ui/theme.ts";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const metas = () => [
  { media: "(prefers-color-scheme: light)", content: "#f5f7fb", dataset: {} as Record<string, string> },
  { media: "(prefers-color-scheme: dark)", content: "#080d1d", dataset: {} as Record<string, string> },
];

const install = (store: Map<string, string> | "blocked") => {
  const dataset: Record<string, string> = {};
  const tags = metas();
  Object.assign(globalThis, {
    document: { documentElement: { dataset }, querySelectorAll: () => tags },
    localStorage:
      store === "blocked"
        ? new Proxy({}, { get: () => () => { throw new DOMException("blocked", "SecurityError"); } })
        : { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) },
  });
  return { dataset, tags };
};

test("the choices are the system, light and dark, and system is what is read when nothing is stored", () => {
  assert.deepEqual([...THEMES], ["system", "light", "dark"]);
  install(new Map());
  assert.equal(readTheme(), "system");
});

test("a stored light or dark choice is read back and anything else means the system", () => {
  const store = new Map<string, string>();
  install(store);
  for (const value of ["light", "dark"]) {
    store.set(THEME_KEY, value);
    assert.equal(readTheme(), value);
  }
  for (const value of ["", "Dark", "system", "auto", "1"]) {
    store.set(THEME_KEY, value);
    assert.equal(readTheme(), "system", value);
  }
});

test("saving light or dark keeps one key and sets the attribute, and system removes both", () => {
  const store = new Map<string, string>();
  const { dataset } = install(store);
  saveTheme("dark");
  assert.deepEqual([...store], [[THEME_KEY, "dark"]]);
  assert.equal(dataset.theme, "dark");
  saveTheme("light");
  assert.deepEqual([...store], [[THEME_KEY, "light"]]);
  assert.equal(dataset.theme, "light");
  saveTheme("system");
  assert.equal(store.size, 0);
  assert.equal("theme" in dataset, false);
});

test("blocked storage still switches the theme for this visit", () => {
  const { dataset } = install("blocked");
  assert.equal(readTheme(), "system");
  saveTheme("dark");
  assert.equal(dataset.theme, "dark");
});

test("the browser colour follows the chosen theme and goes back to each query's own colour", () => {
  const { tags } = install(new Map());
  applyTheme("dark");
  assert.deepEqual(tags.map((tag) => tag.content), ["#080d1d", "#080d1d"]);
  applyTheme("light");
  assert.deepEqual(tags.map((tag) => tag.content), ["#f5f7fb", "#f5f7fb"]);
  applyTheme("system");
  assert.deepEqual(tags.map((tag) => tag.content), ["#f5f7fb", "#080d1d"]);
  assert.deepEqual(tags.map((tag) => tag.media), ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]);
});

test("the page sets the chosen theme before the first paint, with the same key and values as the app", () => {
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  const script = /<script>([^<]*)<\/script>/.exec(head)?.[1] ?? "";
  assert.ok(script.includes(`"${THEME_KEY}"`));
  assert.ok(script.includes('"light"') && script.includes('"dark"'));
  assert.ok(head.indexOf("<script>") < head.indexOf('type="module"') || !head.includes('type="module"'));
  assert.ok(html.indexOf("<script>") < html.indexOf('<script type="module"'));
  const store = new Map([[THEME_KEY, "dark"]]);
  const { dataset } = install(store);
  new Function(script)();
  assert.equal(dataset.theme, "dark");
  store.set(THEME_KEY, "nonsense");
  const again = install(store);
  new Function(script)();
  assert.equal("theme" in again.dataset, false);
});

test("the inline script survives blocked storage", () => {
  const script = /<script>([^<]*)<\/script>/.exec(html)?.[1] ?? "";
  const { dataset } = install("blocked");
  assert.doesNotThrow(() => new Function(script)());
  assert.equal("theme" in dataset, false);
});
