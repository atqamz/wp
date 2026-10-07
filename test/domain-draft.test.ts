import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIn } from "../src/domain/dates.ts";
import { parseAmount, parseDraft } from "../src/domain/draft.ts";
import type { Context, Field } from "../src/domain/draft.ts";

const WEDNESDAY = "2026-10-07";

const context = (overrides: Partial<Context> = {}): Context => ({
  today: WEDNESDAY,
  me: "a",
  nicknames: { a: "Rani", b: "Dimas" },
  lines: [],
  ...overrides,
});

const amountOf = (text: string, ctx = context()) => parseDraft(text, ctx).amount;
const dueOf = (text: string, today = WEDNESDAY) => parseDraft(text, context({ today })).due;
const whoOf = (text: string, ctx = context()) => parseDraft(text, ctx).who;

const lines = [
  { id: "line-venue", title: "Venue", vendor: null },
  { id: "line-makeup", title: "Makeup", vendor: "Rias Laras" },
  { id: "line-photo", title: "Photography package", vendor: "Studio Terang" },
];

test("amounts: a number with jt, juta, rb, ribu or k uses the separator as a decimal point", () => {
  const cases: [string, number][] = [
    ["Photographer deposit 2,5 jt", 2_500_000],
    ["Photographer deposit 2.5jt", 2_500_000],
    ["deposit 2,5jt", 2_500_000],
    ["500rb", 500_000],
    ["500 rb", 500_000],
    ["500k", 500_000],
    ["250 ribu", 250_000],
    ["1 juta", 1_000_000],
    ["0,75 jt", 750_000],
    ["12 jt", 12_000_000],
    ["1,234 jt", 1_234_000],
    ["1.5k", 1_500],
    ["Rp 2,5 jt", 2_500_000],
    ["Rp500rb", 500_000],
  ];
  for (const [text, value] of cases) assert.equal(amountOf(text), value, text);
});

test("amounts: Rp and grouped digits are read as whole rupiah", () => {
  const cases: [string, number][] = [
    ["Rp 1.500.000", 1_500_000],
    ["Rp1.500.000", 1_500_000],
    ["Rp 1,500,000", 1_500_000],
    ["Rp 1.500.000,00", 1_500_000],
    ["rp. 750.000", 750_000],
    ["Rp 500", 500],
    ["1.500.000", 1_500_000],
    ["10.000", 10_000],
    ["1500000", 1_500_000],
    ["50000", 50_000],
    ["Pay 12345678901 now", 12_345_678_901],
    ["Pay 999999999999999 now", 999_999_999_999_999],
  ];
  for (const [text, value] of cases) assert.equal(amountOf(text), value, text);
});

test("amounts: a bare number under five digits is left alone, and so is a figure too large for a rupiah column", () => {
  for (const text of ["Book 3 vendors", "Plan for 2027", "Table 2500", "1.500", "Pay 1234567890123456", "Pay 99999999999999 jt"]) {
    assert.equal(amountOf(text), null, text);
  }
});

test("amounts: only the first amount is read and a lead word such as for goes with it", () => {
  const first = parseDraft("Deposit for 2,5 jt and 3 jt later", context());
  assert.equal(first.amount, 2_500_000);
  assert.equal(first.title, "Deposit and 3 jt later");
});

test("amounts: an amount is cut out of the title and the rest is kept", () => {
  const read = parseDraft("Book photographer deposit 2,5 jt", context());
  assert.deepEqual([read.title, read.amount], ["Book photographer deposit", 2_500_000]);
});

test("dates: today, tomorrow and the weekday names count from today in the given zone", () => {
  const cases: [string, string][] = [
    ["today", "2026-10-07"],
    ["tomorrow", "2026-10-08"],
    ["friday", "2026-10-09"],
    ["Fri", "2026-10-09"],
    ["this friday", "2026-10-09"],
    ["next friday", "2026-10-16"],
    ["monday", "2026-10-12"],
    ["Mon", "2026-10-12"],
    ["tue", "2026-10-13"],
    ["tues", "2026-10-13"],
    ["thursday", "2026-10-08"],
    ["saturday", "2026-10-10"],
    ["sunday", "2026-10-11"],
    ["wednesday", "2026-10-14"],
  ];
  for (const [text, date] of cases) assert.equal(dueOf(text), date, text);
});

test("dates: a weekday named on that weekday means the next one, because today has its own word", () => {
  assert.equal(dueOf("wednesday"), "2026-10-14");
  assert.equal(dueOf("next wednesday"), "2026-10-21");
  assert.equal(dueOf("today"), "2026-10-07");
});

test("dates: a day and a month use the next such day, counting today", () => {
  const cases: [string, string][] = [
    ["12 Oct", "2026-10-12"],
    ["12 october", "2026-10-12"],
    ["12oct", "2026-10-12"],
    ["12th Oct", "2026-10-12"],
    ["Oct 12", "2026-10-12"],
    ["October 12th", "2026-10-12"],
    ["7 Oct", "2026-10-07"],
    ["5 Oct", "2027-10-05"],
    ["1 Jan", "2027-01-01"],
    ["31 Dec", "2026-12-31"],
    ["3 Sept", "2027-09-03"],
    ["12 Oct 2027", "2027-10-12"],
    ["12 October, 2028", "2028-10-12"],
    ["Oct 12, 2027", "2027-10-12"],
  ];
  for (const [text, date] of cases) assert.equal(dueOf(text), date, text);
});

test("dates: day then month with a slash, and an ISO date", () => {
  const cases: [string, string][] = [
    ["12/10", "2026-10-12"],
    ["5/10", "2027-10-05"],
    ["1/1", "2027-01-01"],
    ["12/10/2027", "2027-10-12"],
    ["12/10/27", "2027-10-12"],
    ["2027-10-12", "2027-10-12"],
    ["2026-02-30x", ""],
  ];
  for (const [text, date] of cases) assert.equal(dueOf(text) ?? "", date, text);
});

test("dates: something that is not a calendar day stays in the title", () => {
  for (const text of ["31 Feb", "30 Feb 2028", "13/13", "10/25", "0/10", "32 Oct", "2027-13-01", "May"]) {
    const read = parseDraft(text, context());
    assert.equal(read.due, null, text);
    assert.equal(read.title, text, text);
  }
});

test("dates: month and year ends use whole-day arithmetic", () => {
  assert.equal(dueOf("tomorrow", "2026-12-31"), "2027-01-01");
  assert.equal(dueOf("tomorrow", "2026-01-31"), "2026-02-01");
  assert.equal(dueOf("tomorrow", "2028-02-28"), "2028-02-29");
  assert.equal(dueOf("tomorrow", "2027-02-28"), "2027-03-01");
  assert.equal(dueOf("friday", "2026-12-31"), "2027-01-01");
  assert.equal(dueOf("friday", "2026-01-30"), "2026-02-06");
  assert.equal(dueOf("next friday", "2026-12-28"), "2027-01-08");
  assert.equal(dueOf("1 Jan", "2026-12-31"), "2027-01-01");
  assert.equal(dueOf("31 Dec", "2027-01-01"), "2027-12-31");
});

test("dates: the 29th of February is the next leap day", () => {
  assert.equal(dueOf("29 Feb", "2026-10-07"), "2028-02-29");
  assert.equal(dueOf("29 Feb", "2028-02-29"), "2028-02-29");
  assert.equal(dueOf("29 Feb", "2028-03-01"), "2032-02-29");
  assert.equal(dueOf("29/2", "2027-03-01"), "2028-02-29");
});

test("dates: today is the day in the saved zone, not in the zone of the machine", () => {
  const now = new Date("2026-12-31T20:00:00Z");
  const jakarta = todayIn(now, "Asia/Jakarta");
  const losAngeles = todayIn(now, "America/Los_Angeles");
  assert.deepEqual([jakarta, losAngeles], ["2027-01-01", "2026-12-31"]);
  assert.equal(dueOf("today", jakarta), "2027-01-01");
  assert.equal(dueOf("today", losAngeles), "2026-12-31");
  assert.equal(dueOf("tomorrow", jakarta), "2027-01-02");
  assert.equal(dueOf("tomorrow", losAngeles), "2027-01-01");
  assert.equal(dueOf("friday", jakarta), "2027-01-08");
  assert.equal(dueOf("friday", losAngeles), "2027-01-01");
});

test("dates: a lead word goes with the date and only the first date is read", () => {
  const cases: [string, string, string][] = [
    ["Send invites by Friday", "Send invites", "2026-10-09"],
    ["Pay the hall on 12 Oct", "Pay the hall", "2026-10-12"],
    ["Visit venue due tomorrow", "Visit venue", "2026-10-08"],
    ["Call before 12/10", "Call", "2026-10-12"],
    ["Finish until today", "Finish", "2026-10-07"],
  ];
  for (const [text, title, date] of cases) {
    const read = parseDraft(text, context());
    assert.deepEqual([read.title, read.due], [title, date], text);
  }
  const two = parseDraft("Call tomorrow or friday", context());
  assert.deepEqual([two.due, two.title], ["2026-10-08", "Call or friday"]);
});

test("dates: a date inside a link is not read, but a date next to one is", () => {
  for (const text of ["See https://example.test/2026/10/12 now", "www.example.test/5/10"]) assert.equal(parseDraft(text, context()).due, null, text);
  assert.equal(parseDraft("See https://example.test/2026/10/12 on friday", context()).due, "2026-10-09");
  const mail = parseDraft("mail rani@example.test 12/10", context());
  assert.deepEqual([mail.title, mail.due], ["mail rani@example.test", "2026-10-12"]);
  assert.equal(parseDraft("Link https://example.test/pay?amount=1500000 now", context()).amount, null);
});

test("owner: me and mine mean the signed-in side and them and theirs the other", () => {
  assert.equal(whoOf("Call the caterer me"), "a");
  assert.equal(whoOf("mine: book the hall"), "a");
  assert.equal(whoOf("Ask them about the hall"), "b");
  assert.equal(whoOf("theirs"), "b");
  assert.equal(whoOf("Call the caterer", context({ me: "b" })), null);
  assert.equal(whoOf("Call the caterer me", context({ me: "b" })), "b");
  assert.equal(whoOf("Call the caterer them", context({ me: "b" })), "a");
});

test("owner: nicknames from settings are read as whole words, with a possessive", () => {
  assert.equal(whoOf("Dimas call the venue"), "b");
  assert.equal(whoOf("Rani's dress fitting"), "a");
  assert.equal(whoOf("Rani’s dress fitting"), "a");
  assert.equal(whoOf("both book the hall"), "both");
  assert.equal(whoOf("Rani and Dimas visit the hall"), "both");
  assert.equal(parseDraft("Dimas call the venue", context()).title, "call the venue");
  for (const text of ["Dimasa call the venue", "A meeting with the hall", "Ranida", "mean"]) assert.equal(whoOf(text), null, text);
});

test("owner: without a known side the pronouns stay in the title, and nicknames still count", () => {
  const unknown = context({ me: null });
  assert.equal(whoOf("Call me later", unknown), null);
  assert.equal(parseDraft("Call me later", unknown).title, "Call me later");
  assert.equal(whoOf("Dimas call", unknown), "b");
  assert.equal(whoOf("Call me", context({ nicknames: { a: null, b: null } })), "a");
});

test("owner: a nickname with spaces, emoji or punctuation is matched literally", () => {
  const odd = context({ nicknames: { a: "Mbak Rani 💍", b: "A.B+(x)" } });
  assert.equal(whoOf("Mbak   Rani 💍 fitting", odd), "a");
  assert.equal(whoOf("A.B+(x) fitting", odd), "b");
  assert.equal(whoOf("AXB fitting", odd), null);
  const long = context({ nicknames: { a: "n".repeat(35), b: null } });
  assert.equal(whoOf(`${"n".repeat(35)} pays`, long), "a");
  assert.equal(whoOf(`${"n".repeat(36)} pays`, long), null);
});

test("kind: an amount with a budget line or a vendor of that name is a payment on that line", () => {
  const ctx = context({ lines });
  const byLine = parseDraft("Venue deposit 5 jt", ctx);
  assert.deepEqual([byLine.kind, byLine.line, byLine.amount, byLine.title], ["payment", "line-venue", 5_000_000, "Venue deposit"]);
  const byVendor = parseDraft("Rias Laras deposit 2,5 jt Friday", ctx);
  assert.deepEqual([byVendor.kind, byVendor.line, byVendor.amount, byVendor.due, byVendor.title], ["payment", "line-makeup", 2_500_000, "2026-10-09", "Rias Laras deposit"]);
  assert.equal(parseDraft("studio terang 500rb", ctx).line, "line-photo");
});

test("kind: without an amount or without a matching line the draft is a task, and an amount stays on it", () => {
  const ctx = context({ lines });
  assert.equal(parseDraft("Venue walkthrough", ctx).kind, "task");
  assert.equal(parseDraft("Venue walkthrough", ctx).line, "line-venue");
  const none = parseDraft("Book photographer deposit 2,5 jt Friday", ctx);
  assert.deepEqual([none.kind, none.line, none.amount, none.due, none.title], ["task", null, 2_500_000, "2026-10-09", "Book photographer deposit"]);
  assert.equal(parseDraft("Book photographer deposit 2,5 jt Friday", context()).kind, "task");
});

test("kind: the longest matching name wins and a name under three characters never matches", () => {
  const ctx = context({
    lines: [
      { id: "short", title: "Hall", vendor: null },
      { id: "long", title: "Hall decoration", vendor: null },
      { id: "tiny", title: "Mc", vendor: null },
    ],
  });
  assert.equal(parseDraft("Hall decoration 2 jt", ctx).line, "long");
  assert.equal(parseDraft("Hall rent 2 jt", ctx).line, "short");
  assert.equal(parseDraft("Mc fee 2 jt", ctx).line, null);
  assert.equal(parseDraft("Hallway 2 jt", ctx).line, null);
});

test("kind: a name with regular expression characters is matched literally", () => {
  const ctx = context({ lines: [{ id: "odd", title: "Cake (3 tiers) + extras", vendor: null }] });
  assert.equal(parseDraft("cake (3 tiers) + extras 1 jt", ctx).kind, "payment");
  assert.equal(parseDraft("cake 3 tiers extras 1 jt", ctx).kind, "task");
});

test("phone: a number with the usual separators is read and kept out of the amount", () => {
  const cases: [string, string][] = [
    ["Rias Laras 0878 0000 1032", "+6287800001032"],
    ["Rias Laras 0878-0000-1032", "+6287800001032"],
    ["Rias Laras +62 878-0000-1032", "+6287800001032"],
    ["Rias Laras 087800001032", "+6287800001032"],
    ["Rias Laras 6287800001032", "+6287800001032"],
  ];
  for (const [text, phone] of cases) {
    const read = parseDraft(text, context());
    assert.deepEqual([read.title, read.phone, read.amount], ["Rias Laras", phone, null], text);
  }
  const both = parseDraft("Rias Laras 0878 0000 1032 2,5 jt", context());
  assert.deepEqual([both.phone, both.amount, both.title], ["+6287800001032", 2_500_000, "Rias Laras"]);
});

test("phone: dates and short numbers are not phones", () => {
  for (const text of ["Call 12 10 2026", "Table 05-10-2026", "Ref 1234567", "Order 12345678 ready"]) assert.equal(parseDraft(text, context()).phone, null, text);
});

test("override: ignoring a field gives its words back to the title", () => {
  const text = "Pay deposit for Rani 2,5 jt Friday";
  const full = parseDraft(text, context());
  assert.deepEqual([full.title, full.amount, full.due, full.who], ["Pay deposit for", 2_500_000, "2026-10-09", "a"]);
  const cases: [Field, string][] = [
    ["amount", "Pay deposit for 2,5 jt"],
    ["due", "Pay deposit for Friday"],
    ["who", "Pay deposit for Rani"],
  ];
  for (const [field, title] of cases) assert.equal(parseDraft(text, context(), new Set([field])).title, title, field);
  const none = parseDraft(text, context(), new Set<Field>(["amount", "due", "who"]));
  assert.deepEqual([none.title, none.amount, none.due, none.who], [text, null, null, null]);
});

test("override: ignoring the line turns a payment back into a task", () => {
  const ctx = context({ lines });
  assert.equal(parseDraft("Venue deposit 5 jt", ctx).kind, "payment");
  const ignored = parseDraft("Venue deposit 5 jt", ctx, new Set<Field>(["line"]));
  assert.deepEqual([ignored.kind, ignored.line, ignored.amount], ["task", null, 5_000_000]);
});

test("nothing typed is lost: a sentence with no figure, date or owner comes back unchanged", () => {
  const plain = [
    "Ask Mbak for a trial date",
    "A".repeat(98),
    "https://example.test/a/very/long/path?with=query&and=more#fragment",
    "Rings 💍 and flowers 🌸",
    "حفل الزفاف القاعة",
    "Plan 2027 and 4 tables of 8",
    "Mix of éè and ü",
  ];
  for (const text of plain) {
    const read = parseDraft(text, context());
    assert.deepEqual([read.title, read.amount, read.due, read.who, read.phone, read.line], [text, null, null, null, null, null], text);
  }
});

test("nothing typed is lost: what leaves the title is a field that was read, and the rest keeps its order", () => {
  const inputs = [
    "Book photographer deposit 2,5 jt Friday",
    "Dimas call the venue by 12 Oct",
    "pay Rp 1.500.000 tomorrow me",
    "Rias Laras 0878 0000 1032",
    "Ask them about 12/10 and 500rb",
  ];
  for (const text of inputs) {
    const read = parseDraft(text, context());
    const fields = [read.amount, read.due, read.who, read.phone].filter((value) => value !== null);
    const kept = read.title.split(/\s+/).filter(Boolean);
    const words = text.split(/\s+/);
    assert.ok(fields.length > 0 && kept.length < words.length, text);
    let at = 0;
    for (const word of kept) {
      at = words.indexOf(word, at);
      assert.ok(at >= 0, `${word} in ${text}`);
      at += 1;
    }
  }
});

test("an input with only a figure leaves an empty title that the form must ask for", () => {
  assert.deepEqual([parseDraft("Friday", context()).title, parseDraft("2,5 jt", context()).title, parseDraft("   ", context()).title], ["", "", ""]);
});

test("the title is trimmed, collapsed and stripped of dangling punctuation", () => {
  assert.equal(parseDraft("  Book   the   hall ,  friday ", context()).title, "Book the hall");
  assert.equal(parseDraft("Hall: 5 jt", context()).title, "Hall");
  assert.equal(parseDraft("Hall – tomorrow", context()).title, "Hall");
});

test("the parser is deterministic and does not touch its input", () => {
  const ctx = context({ lines });
  const text = "Rias Laras deposit 2,5 jt Friday me";
  assert.deepEqual(parseDraft(text, ctx), parseDraft(text, ctx));
  assert.deepEqual(ctx, context({ lines }));
});

test("long and odd input is read in a bounded time", () => {
  const inputs = ["1".repeat(20_000), "1 ".repeat(10_000), "1.".repeat(10_000), "0-".repeat(10_000), `${"a".repeat(20_000)} 2,5 jt`, "rp ".repeat(10_000), "12/".repeat(10_000), " ".repeat(20_000)];
  const started = performance.now();
  for (const text of inputs) parseDraft(text, context({ lines }));
  assert.ok(performance.now() - started < 1500, `${performance.now() - started}`);
});

test("the amount editor takes any whole amount, plain digits of any length, and the unit forms", () => {
  const cases: [string, number | null][] = [
    ["2500", 2_500],
    ["2.500", 2_500],
    ["Rp 2.500.000", 2_500_000],
    ["2,5 jt", 2_500_000],
    ["  500rb ", 500_000],
    ["0", 0],
    ["", null],
    ["abc", null],
    ["2,5 jt extra", null],
    ["12 Oct", null],
    ["-5", null],
  ];
  for (const [text, value] of cases) assert.equal(parseAmount(text), value, text);
});

test("phone: a number never swallows the token that follows it, whether a figure, a day or an amount", () => {
  const cases: [string, Partial<Record<"title" | "phone" | "amount" | "due" | "who", string | number | null>>][] = [
    ["Rias Laras 0878 0000 1032 12 jt", { title: "Rias Laras", phone: "+6287800001032", amount: 12_000_000 }],
    ["Dimas 0878 0000 1032 12/10", { phone: "+6287800001032", due: "2026-10-12", who: "b", title: "" }],
    ["Florist 0812 3456 7890 12 oct", { title: "Florist", phone: "+6281234567890", due: "2026-10-12" }],
    ["Florist 0812 3456 7890 25000", { title: "Florist", phone: "+6281234567890", amount: 25_000 }],
    ["Florist 0812 3456 7890 250", { title: "Florist 250", phone: "+6281234567890", amount: null }],
    ["Florist 0812 3456 7890 2,5 jt", { title: "Florist", phone: "+6281234567890", amount: 2_500_000 }],
    ["Florist 0812 3456 7890 500rb", { title: "Florist", phone: "+6281234567890", amount: 500_000 }],
    ["Florist 0812-3456-7890 friday", { title: "Florist", phone: "+6281234567890", due: "2026-10-09" }],
  ];
  for (const [text, expected] of cases) {
    const read = parseDraft(text, context());
    for (const [field, value] of Object.entries(expected)) assert.equal(read[field as keyof typeof read], value, `${text}: ${field}`);
  }
});

test("phone: a plain amount that starts with 62 is an amount, and so is any figure of nine digits that is not a phone", () => {
  for (const text of ["Pay 625000000", "Rp 625000000", "Pay Rp 625.000.000"]) {
    const read = parseDraft(text, context());
    assert.deepEqual([read.phone, read.amount], [null, 625_000_000], text);
  }
  assert.deepEqual([parseDraft("Pay 62500000000", context()).phone, parseDraft("Pay 62500000000", context()).amount], ["+62500000000", null]);
  assert.equal(parseDraft("Pay 725000000", context()).amount, 725_000_000);
});

test("phone: the length is 9 to 13 digits for a local number, 11 to 14 for a bare 62 and 9 to 15 after a plus", () => {
  const phone = (text: string) => parseDraft(text, context()).phone;
  const local = (digits: number) => `0${"8".repeat(digits - 1)}`;
  assert.deepEqual([8, 9, 13, 14].map((n) => phone(`X ${local(n)}`)), [null, `+62${"8".repeat(8)}`, `+62${"8".repeat(12)}`, null]);
  assert.deepEqual([10, 11, 14, 15].map((n) => phone(`X 62${"8".repeat(n - 2)}`) !== null), [false, true, true, false]);
  assert.deepEqual([8, 9, 15, 16].map((n) => phone(`X +${"1".repeat(n)}`) !== null), [false, true, true, false]);
});

test("phone: groups must use one separator, and a country code may stand before them", () => {
  const phone = (text: string) => parseDraft(text, context()).phone;
  assert.equal(phone("X 0878 0000 1032"), "+6287800001032");
  assert.equal(phone("X 0878-0000-1032"), "+6287800001032");
  assert.equal(phone("X +62 878 0000 1032"), "+6287800001032");
  assert.equal(phone("X +62 878-0000-1032"), "+6287800001032");
  assert.equal(phone("X 62 878 0000 1032"), "+6287800001032");
  assert.equal(phone("X 0878 0000-1032"), null);
  assert.equal(parseDraft("X 0878 0000-1032", context()).title, "X 0878 0000-1032");
});

test("phone: a group that is followed by an amount word is an amount, not part of the number", () => {
  const read = parseDraft("Cake 0812 345 500 rb", context());
  assert.deepEqual([read.phone, read.amount, read.title], [null, 500_000, "Cake 0812 345"]);
  assert.equal(parseDraft("Cake 0812 3456 7890 500 rb", context()).amount, 500_000);
});

test("phone: a figure that starts with a zero is never an amount", () => {
  const read = parseDraft("Order 0812345678901234 ready", context());
  assert.deepEqual([read.phone, read.amount, read.title], [null, null, "Order 0812345678901234 ready"]);
});
