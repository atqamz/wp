import { test } from "node:test";
import assert from "node:assert/strict";
import { STORED, draftFor, isPhone, parseDraft } from "../src/domain/draft.ts";
import type { Context, Kind } from "../src/domain/draft.ts";

const KINDS: readonly Kind[] = ["task", "planned", "payment", "guest", "vendor"];

const context: Context = {
  today: "2026-10-07",
  me: "a",
  nicknames: { a: "Rani", b: "Dimas" },
  lines: [{ id: "line-venue", title: "Venue", vendor: null }],
};

const stores = (kind: Kind) => STORED[kind].includes("phone");

const NUMBERS: [string, string][] = [
  ["6281234567890", "+6281234567890"],
  ["+6281234567890", "+6281234567890"],
  ["62812345678", "+62812345678"],
  ["+15551234567", "+15551234567"],
  ["+62812 3456 7890", "+6281234567890"],
  ["+62 812 3456 7890", "+6281234567890"],
  ["+62-812-3456-7890", "+6281234567890"],
  ["+62 812-3456-7890", "+6281234567890"],
  ["62 812 3456 7890", "+6281234567890"],
  ["+44 20 7946 0958", "+442079460958"],
  ["081234567890", "+6281234567890"],
  ["0812 3456 7890", "+6281234567890"],
  ["0812-3456-7890", "+6281234567890"],
  ["0878 0000 1032", "+6287800001032"],
  ["021 5551234", "+62215551234"],
  ["021-5551234", "+62215551234"],
  ["021 555 1234", "+62215551234"],
  ["021-555-1234", "+62215551234"],
  ["021 555-1234", "+62215551234"],
  ["(021) 5551234", "+62215551234"],
  ["(021) 555 1234", "+62215551234"],
  ["(021) 555-1234", "+62215551234"],
  ["(021)5551234", "+62215551234"],
  ["0274 123456", "+62274123456"],
  ["0274-123456", "+62274123456"],
  ["(0274) 123456", "+62274123456"],
  ["0361 123 456", "+62361123456"],
  ["0215551234", "+62215551234"],
];

const SENTENCES = ["Call Aunt", "Venue hall", "Call venue", "Florist"];

test("every phone form is a phone through draftFor on every kind: read and removed where the kind stores it, kept exactly as typed where it does not, and never an amount", () => {
  for (const [typed, e164] of NUMBERS) {
    assert.equal(isPhone(typed), true, typed);
    for (const lead of SENTENCES) {
      for (const text of [`${lead} ${typed}`, `${typed} ${lead}`, `${lead} ${typed}.`, `${lead}, ${typed}`]) {
        for (const kind of KINDS) {
          const { draft } = draftFor(text, context, new Set(), kind);
          assert.equal(draft.amount, null, `${kind}: ${text}`);
          if (stores(kind)) {
            assert.equal(draft.phone, e164, `${kind}: ${text}`);
            assert.equal(draft.title.replace(/[.,]$/, ""), lead, `${kind}: ${text}`);
          } else {
            assert.equal(draft.phone, null, `${kind}: ${text}`);
            assert.ok(draft.title.includes(typed), `${kind} keeps ${typed} exactly: ${draft.title}`);
            assert.equal(draft.title.replace(/[.,]$/, "").split(typed).join("").replace(/[\s,]+/g, " ").trim(), lead, `${kind}: ${text}`);
          }
        }
      }
    }
  }
});

test("the examples of the review, on every kind", () => {
  const cases: [string, string, string][] = [
    ["Call Aunt 6281234567890", "6281234567890", "+6281234567890"],
    ["Call Aunt +6281234567890", "+6281234567890", "+6281234567890"],
    ["Call Aunt 62812345678", "62812345678", "+62812345678"],
    ["Call Aunt +15551234567", "+15551234567", "+15551234567"],
    ["Venue hall 021 5551234", "021 5551234", "+62215551234"],
    ["Call venue (021) 5551234", "(021) 5551234", "+62215551234"],
    ["Call venue 0274 123456", "0274 123456", "+62274123456"],
    ["Call Aunt +62812 3456 7890", "+62812 3456 7890", "+6281234567890"],
    ["Call venue 021-5551234", "021-5551234", "+62215551234"],
    ["Call venue 021 555 1234", "021 555 1234", "+62215551234"],
  ];
  for (const [text, typed, phone] of cases) {
    for (const kind of KINDS) {
      const { draft } = draftFor(text, context, new Set(), kind);
      assert.equal(draft.amount, null, `${kind}: ${text}`);
      assert.equal(draft.phone, stores(kind) ? phone : null, `${kind}: ${text}`);
      assert.equal(draft.title, stores(kind) ? text.replace(` ${typed}`, "") : text, `${kind}: ${text}`);
    }
  }
});

test("the phone is read in the same way whichever tab is chosen, so a date does not change what the number is", () => {
  const text = "Florist 12 oct 2027 6281234567890";
  const vendor = draftFor(text, context, new Set(), "vendor").draft;
  assert.deepEqual([vendor.phone, vendor.amount, vendor.due, vendor.title], ["+6281234567890", null, null, "Florist 12 oct 2027"]);
  const task = draftFor(text, context, new Set(), "task").draft;
  assert.deepEqual([task.phone, task.amount, task.due, task.title], [null, null, "2027-10-12", "Florist 6281234567890"]);
  const guest = draftFor(text, context, new Set(), "guest").draft;
  assert.deepEqual([guest.phone, guest.amount, guest.due], ["+6281234567890", null, null]);
});

test("a figure after a phone is still an amount, and an amount with a word or a currency mark is read even when it looks like a phone", () => {
  const read = (text: string, kind: Kind = "task") => draftFor(text, context, new Set(), kind).draft;
  assert.equal(read("Call Aunt 6281234567890 5 jt").amount, 5_000_000);
  assert.equal(read("Call Aunt 6281234567890 5 jt").title, "Call Aunt 6281234567890");
  assert.equal(read("Florist 021 5551234 12 jt", "vendor").amount, 12_000_000);
  assert.equal(read("Florist 021 5551234 12 jt", "vendor").phone, "+62215551234");
  assert.deepEqual([read("Florist 0812 3456 7890 25000", "vendor").amount, read("Florist 0812 3456 7890 25000", "vendor").title], [null, "Florist 25000"]);
  assert.equal(read("Pay Rp 6281234567890").amount, 6_281_234_567_890);
  assert.equal(read("Pay Rp 0812 3456 7890").phone, null);
  assert.equal(read("Pay 6281234567890 rb").amount, null);
});

test("plain amounts are still read: a word, a currency mark or grouped thousands", () => {
  const cases: [string, number][] = [
    ["Rp 1.500.000", 1_500_000],
    ["Rp1500000", 1_500_000],
    ["2,5 jt", 2_500_000],
    ["500rb", 500_000],
    ["500k", 500_000],
    ["5 juta", 5_000_000],
    ["250 ribu", 250_000],
    ["12.345.678.901", 12_345_678_901],
    ["Rp 12345678901", 12_345_678_901],
    ["Rp 6281234567890", 6_281_234_567_890],
    ["1,500,000", 1_500_000],
  ];
  for (const [typed, value] of cases) {
    for (const kind of ["task", "planned", "payment", "vendor"] as const) assert.equal(draftFor(`Thing ${typed}`, context, new Set(), kind).draft.amount, value, `${kind}: ${typed}`);
  }
});

test("a bare run of digits is never an amount, whatever its length, and stays in the name when it is not a phone", () => {
  for (const typed of ["50000", "1500000", "625000000", "1234567890", "12345678901", "999999999999999", "6281234567", "2500000000", "0812345678901234"]) {
    for (const kind of KINDS) {
      const { draft } = draftFor(`Order ${typed} ready`, context, new Set(), kind);
      assert.equal(draft.amount, null, `${kind}: ${typed}`);
      assert.equal(draft.phone, null, `${kind}: ${typed}`);
      assert.equal(draft.title, `Order ${typed} ready`, `${kind}: ${typed}`);
    }
  }
});

test("dates, plain figures and short groups are not phones", () => {
  for (const typed of ["2027-10-12", "05-10-2026", "12 10 2026", "08 30", "0812 345", "021 123", "62 10 2026", "+1 2", "0 1 2 3 4 5 6 7 8 9", "12.500.000", "1500000", "5551234"]) assert.equal(isPhone(typed), false, typed);
  for (const typed of ["021 5551234 12", "0812 3456 7890 250", "0812 3456 7890 25000", "(021) 5551234 7"]) assert.equal(isPhone(typed), false, typed);
});

test("the phone put back by its chip stays protected from the amount rules", () => {
  const text = "Florist 0812 3456 7890 5 jt";
  const { draft } = draftFor(text, context, new Set(["phone"]), "vendor");
  assert.deepEqual([draft.phone, draft.amount, draft.title], [null, 5_000_000, "Florist 0812 3456 7890"]);
  const bare = draftFor("Florist 6281234567890", context, new Set(["phone"]), "vendor").draft;
  assert.deepEqual([bare.phone, bare.amount, bare.title], [null, null, "Florist 6281234567890"]);
});

test("the currency mark makes the next run an amount instead of a phone, and only that run", () => {
  for (const text of ["Rp 6281234567890", "rp. 6281234567890", "Pay Rp 6281234567890"]) {
    const read = parseDraft(text, context);
    assert.deepEqual([read.phone, read.amount], [null, 6_281_234_567_890], text);
  }
  const both = parseDraft("Rp 5 jt 021 5551234", context);
  assert.deepEqual([both.amount, both.phone], [5_000_000, "+62215551234"]);
  const spaced = parseDraft("Rp 5551234 021 5551234", context);
  assert.deepEqual([spaced.amount, spaced.phone], [5_551_234, "+62215551234"]);
});

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const chars = (text: string) => [...text.replace(/\s+/g, "")].sort().join("");

test("property: with a fixed seed no kind makes an amount from a phone's digits, and title plus the read pieces always give back what was typed", () => {
  const random = mulberry32(20261008);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const words = ["venue", "hall", "florist", "cake", "aunt", "call", "book", "tent", "chairs", "caterer"];
  const amounts: [string, number][] = [["5 jt", 5_000_000], ["500rb", 500_000], ["2,5jt", 2_500_000], ["Rp 1.500.000", 1_500_000], ["250 ribu", 250_000], ["Rp 6281234567890", 6_281_234_567_890]];
  const dates = ["tomorrow", "12 Oct", "friday", "12/10"];
  const owners = ["me", "Dimas"];
  let withPhone = 0;
  for (let run = 0; run < 600; run++) {
    const phone = random() < 0.7 ? pick(NUMBERS) : null;
    const amount = random() < 0.5 ? pick(amounts) : null;
    const date = random() < 0.4 ? pick(dates) : null;
    const owner = random() < 0.3 ? pick(owners) : null;
    const pieces = [phone?.[0], amount?.[0], date, owner, ...Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(words))].filter((piece): piece is string => piece !== undefined && piece !== null);
    for (let at = pieces.length - 1; at > 0; at--) {
      const other = Math.floor(random() * (at + 1));
      [pieces[at], pieces[other]] = [pieces[other], pieces[at]];
    }
    const text = pieces.join(" ");
    if (phone) withPhone++;
    for (const kind of [...KINDS, null] as const) {
      const { draft, kind: chosen } = draftFor(text, context, new Set(), kind);
      const where = `${kind ?? "inferred"} (${chosen}): ${text}`;
      if (amount === null) assert.equal(draft.amount, null, `no amount from digits: ${where}`);
      else if (draft.amount !== null) assert.equal(draft.amount, amount[1], `the amount typed is the amount read: ${where}`);
      if (draft.phone !== null) assert.equal(draft.phone, phone?.[1], where);
      const read = [
        draft.phone !== null ? phone![0] : "",
        draft.amount !== null ? amount![0] : "",
        draft.due !== null ? date! : "",
        draft.who !== null ? owner! : "",
      ];
      assert.equal(chars([draft.title, ...read].join(" ")), chars(text), `nothing typed is lost: ${where} -> ${JSON.stringify(draft)}`);
    }
  }
  assert.ok(withPhone > 300);
});
