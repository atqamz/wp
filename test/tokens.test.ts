import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");

const [lightPart, darkPart] = css.split("@media (prefers-color-scheme: dark)");

const read = (part: string) =>
  Object.fromEntries(
    [...part.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)].map(([, name, l, c, h]) => [
      name,
      [+l / 100, +c, +h],
    ]),
  );

const themes = { light: read(lightPart), dark: { ...read(lightPart), ...read(darkPart) } };

const luminance = ([l, c, h]: number[]) => {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const [x, y, z] = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const linear = [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ];
  const [r, g, bl] = linear.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};

const ratio = (theme: Record<string, number[]>, fg: string, bg: string) => {
  const [hi, lo] = [luminance(theme[fg]), luminance(theme[bg])].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

const sources = readdirSync(new URL("../src/", import.meta.url), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css") && entry.name !== "tokens.css")
  .map((entry) => readFileSync(`${entry.parentPath}/${entry.name}`, "utf8"))
  .join("\n");

const referenced = new Set([...sources.matchAll(/var\(--([a-z0-9-]+)/g)].map(([, name]) => name));

const text = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-2"],
  ["ink-2", "bg"],
  ["ink-2", "surface"],
  ["ink-2", "surface-2"],
  ["on-hero", "hero"],
  ["on-hero-2", "hero"],
  ["on-accent", "accent"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["on-signal", "signal"],
  ["signal", "hero"],
  ["late", "bg"],
  ["late", "surface"],
  ["late", "late-bg"],
  ["on-tint", "tint-a"],
  ["on-tint", "tint-b"],
];

const graphics = [
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "surface-2"],
  ["on-hero", "hero"],
  ["ink-2", "bg"],
  ["ink-2", "surface"],
  ["route", "bg"],
  ["route", "surface"],
  ["route", "surface-2"],
];

for (const [name, theme] of Object.entries(themes)) {
  test(`${name}: every text pair reaches 4.5:1`, () => {
    for (const [fg, bg] of text) assert.ok(ratio(theme, fg, bg) >= 4.5, `${fg} on ${bg} is ${ratio(theme, fg, bg).toFixed(2)}`);
  });

  test(`${name}: every graphic and focus pair reaches 3:1`, () => {
    for (const [fg, bg] of graphics) assert.ok(ratio(theme, fg, bg) >= 3, `${fg} on ${bg} is ${ratio(theme, fg, bg).toFixed(2)}`);
  });
}

test("both themes define the same tokens", () => {
  assert.deepEqual(Object.keys(themes.dark).sort(), Object.keys(themes.light).sort());
  assert.ok(Object.keys(themes.light).length >= 20);
});

test("every colour token is used by some rule, and every token in a contrast pair is", () => {
  const pairs = new Set([...text, ...graphics].flat());
  assert.deepEqual(
    [...pairs].filter((name) => !referenced.has(name)),
    [],
  );
  assert.deepEqual(
    Object.keys(themes.light).filter((name) => !referenced.has(name)),
    [],
  );
});

test("every colour token a rule uses has a contrast pair, except the decorative line", () => {
  const pairs = new Set([...text, ...graphics].flat());
  assert.deepEqual(
    Object.keys(themes.light).filter((name) => name !== "line" && referenced.has(name) && !pairs.has(name)),
    [],
  );
});

test("only decorative or disabled rules use opacity, so a text pair never hides behind it", () => {
  const rules = [...sources.matchAll(/([^{}]+)\{[^{}]*\bopacity:\s*[\d.]+/g)].map(([, selector]) => selector.replace(/\s+/g, " ").trim());
  assert.deepEqual(rules, ['.sync[data-state="pending"] a::before, .sync[data-state="offline"] a::before', "button:disabled"]);
});
