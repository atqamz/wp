import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heroColor, tintThemeColor } from "../src/ui/theme-color.ts";
import { hex } from "./oklch.ts";

const tokens = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");
const [light, dark] = tokens.split("@media (prefers-color-scheme: dark)");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const token = (part: string, name: string) => {
  const [, l, c, h] = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(part) ?? [];
  return [+l / 100, +c, +h];
};

const meta = (scheme: string) => new RegExp(`name="theme-color" content="(#[0-9a-f]{6})" media="\\(prefers-color-scheme: ${scheme}\\)"`).exec(html)?.[1];

test("the sign-in surface colours are the hero token in both themes", () => {
  assert.deepEqual(heroColor, { light: hex(token(light, "hero")), dark: hex(token(dark, "hero")) });
});

test("the document theme colours are the page background token in both themes", () => {
  assert.equal(meta("light"), hex(token(light, "bg")));
  assert.equal(meta("dark"), hex(token(dark, "bg")));
});

test("tinting sets each theme colour by its media query and the undo restores the originals", () => {
  const metas = [
    { media: "(prefers-color-scheme: light)", content: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", content: "#080d1d" },
  ];
  const restore = tintThemeColor(metas);
  assert.deepEqual(metas.map((meta) => meta.content), [heroColor.light, heroColor.dark]);
  restore();
  assert.deepEqual(metas.map((meta) => meta.content), ["#f5f7fb", "#080d1d"]);
});
