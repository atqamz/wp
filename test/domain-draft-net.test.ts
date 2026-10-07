import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { blank, draftFor, fallbacks, lossless } from "../src/domain/draft.ts";
import type { Context, Kind } from "../src/domain/draft.ts";

const KINDS: readonly Kind[] = ["task", "planned", "payment", "guest", "vendor"];

const context: Context = { today: "2026-10-07", me: "a", nicknames: { a: "Rani", b: "Dimas" }, lines: [] };

const leaky: typeof blank = (state, start, end) => blank(state, start, end, state.gone);

const greedy: typeof blank = (state, start, end, mark) => blank(state, start, Math.min(end + 2, state.rest.length), mark);

const PLAIN = { kind: "task", amount: null, due: null, who: null, line: null, phone: null };

const trips = (run: () => void) => {
  const before = fallbacks.count;
  run();
  return fallbacks.count - before;
};

test("a span function that marks a hidden phone as read loses the digits, and the exit check hands back the typed text with no chips", () => {
  const text = "Top up for 0812 3456 7890 50k";
  for (const kind of ["task", "planned", "payment"] as const) {
    let result: ReturnType<typeof draftFor> | undefined;
    assert.equal(trips(() => (result = draftFor(text, context, new Set(), kind, leaky))), 1, kind);
    assert.deepEqual(result, { kind, draft: { ...PLAIN, title: text } }, kind);
  }
  const inferred = draftFor(text, context, new Set(), null, leaky);
  assert.deepEqual(inferred, { kind: "task", draft: { ...PLAIN, title: text } });
});

test("a span function that takes two characters too many is caught as well, and the plain draft keeps the picked kind", () => {
  const text = "Pay 50k ab";
  assert.equal(draftFor(text, context, new Set(), "task").draft.title, "Pay ab");
  let result: ReturnType<typeof draftFor> | undefined;
  assert.equal(trips(() => (result = draftFor(text, context, new Set(), "vendor", greedy))), 1);
  assert.deepEqual(result, { kind: "vendor", draft: { ...PLAIN, title: text } });
});

test("the plain draft is the whole input without its outer spaces, and nothing else is read", () => {
  const { draft } = draftFor("  Top up for 0812 3456 7890 50k tomorrow me  ", context, new Set(), "task", leaky);
  assert.deepEqual(draft, { ...PLAIN, title: "Top up for 0812 3456 7890 50k tomorrow me" });
});

test("a sound span function never trips the exit check, for the same texts on every kind", () => {
  const texts = ["Top up for 0812 3456 7890 50k", "Pay 50k ab", "  Call on 0812 3456 7890 friday  ", "Mbak 0812 3456 7890 Rani", "💍 é 5 jt", ""];
  for (const text of texts) for (const kind of [...KINDS, null] as const) assert.equal(trips(() => draftFor(text, context, new Set(), kind)), 0, `${kind}: ${text}`);
});

test("a broken span function is caught on the texts of the review and on a fuzz of lead words, which is how a parser bug shows up in the fuzz", () => {
  const leads = ["for", "on", "by", "next", "this", "due", "pay", "call", "at"];
  const tails = ["50k", "5 jt", "friday", "12 oct"];
  let caught = 0;
  for (const lead of leads) for (const tail of tails) for (const kind of ["task", "payment"] as const) caught += trips(() => draftFor(`${lead} 0812 3456 7890 ${tail}`, context, new Set(), kind, leaky));
  assert.equal(caught, leads.length * tails.length * 2);
});

test("the exit check counts every letter and digit once, in order, with read pieces in any order and spacing ignored", () => {
  const cases: [string, string, string[], boolean][] = [
    ["Top up 50k", "Top up", ["50k"], true],
    ["a 5k b", "a b", ["5k"], true],
    ["Pay,  50k  now!", "Pay now!", ["50k"], true],
    ["x 5 jt tomorrow y", "x y", ["tomorrow", "5 jt"], true],
    ["💍 é 5", "é", ["5"], true],
    ["𝐚 b", "𝐚 b", [], true],
    ["", "", [], true],
    ["()", "", [], true],
    ["Top up for 0812 50k", "Top up", ["for 50k"], false],
    ["a", "ab", [], false],
    ["a b", "a", [], false],
    ["5 5", "5", [], false],
    ["5", "5", ["5"], false],
    ["ab cd", "cd ab", [], false],
    ["ab cd", "dc", ["ab"], false],
    ["a1", "1a", [], false],
  ];
  for (const [input, title, read, expected] of cases) assert.equal(lossless(input, title, read), expected, JSON.stringify([input, title, read]));
});

test("a nickname that starts with an astral letter and crosses a hidden phone is skipped and the search ends", () => {
  const draft = new URL("../src/domain/draft.ts", import.meta.url).href;
  const script = `
    import { draftFor } from ${JSON.stringify(draft)};
    const context = { today: "2026-10-07", me: "a", nicknames: { a: "𝐑ani Sari", b: null }, lines: [] };
    const task = draftFor("𝐑ani 0812 3456 7890 Sari 50k", context, new Set(), "task").draft;
    const guest = draftFor("𝐑ani 0812 3456 7890 Sari", context, new Set(), "guest").draft;
    console.log(JSON.stringify([task.who, task.amount, task.title, guest.who, guest.phone]));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 0, `${run.error?.message ?? ""} ${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), [null, 50_000, "𝐑ani 0812 3456 7890 Sari", "a", "+6281234567890"]);
});
