import type { Side } from "../../shared/api.ts";
import { addDays } from "./dates.ts";
import { parseRupiah } from "./money.ts";
import { sideName } from "./names.ts";
import { normalizePhone } from "./phone.ts";

export type Kind = "task" | "planned" | "payment" | "guest" | "vendor";

export type Field = "amount" | "due" | "who" | "phone" | "line";

export type Line = { id: string; title: string; vendor: string | null };

export type Context = {
  today: string;
  me: Side | null;
  nicknames: { a: string | null; b: string | null };
  lines: readonly Line[];
};

export type Draft = {
  title: string;
  kind: "task" | "payment";
  amount: number | null;
  due: string | null;
  who: Side | "both" | null;
  line: string | null;
  phone: string | null;
};

type State = { rest: string };

const START = "(?<![\\p{L}\\p{N}_\\u2212-])";
const AMOUNT_START = "(?<![\\p{L}\\p{N}_.,\\u2212-])";
const END = "(?![\\p{L}\\p{N}_])";
const MAX_AMOUNT = 999_999_999_999_999;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY = "(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)";
const DATE_LEAD = "(?:(?:by|on|due|before|until)\\s+)?";
const AMOUNT_LEAD = "(?:(?:for|at)\\s+)?";
const MEASURE_AHEAD = "(?!\\s*(?:kg|g|gr|gram|l|ml|cm|mm|m|km|pcs|pax|people|portions|persons|tiers|x|%)(?![\\p{L}\\p{N}_]))";
const UNIT_AHEAD = "(?!\\s*(?:jt|juta|rb|ribu|k)(?![\\p{L}\\p{N}_]))";
const UNITS: Record<string, number> = { k: 1_000, rb: 1_000, ribu: 1_000, jt: 1_000_000, juta: 1_000_000 };

const OPAQUE = /:\/\/|@|^www\./i;

const opaque = (text: string, at: number) => OPAQUE.test((/\S*$/.exec(text.slice(0, at))?.[0] ?? "") + (/^\S*/.exec(text.slice(at))?.[0] ?? ""));

const take = <T>(state: State, pattern: RegExp, read: (match: RegExpExecArray) => T | null): T | null => {
  for (const match of state.rest.matchAll(pattern)) {
    if (opaque(state.rest, match.index)) continue;
    const value = read(match);
    if (value === null) continue;
    state.rest = `${state.rest.slice(0, match.index)} ${state.rest.slice(match.index + match[0].length)}`;
    return value;
  }
  return null;
};

const iso = (year: number, month: number, day: number) => {
  const at = new Date(Date.UTC(year, month - 1, day));
  const valid = at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
  return valid ? at.toISOString().slice(0, 10) : null;
};

const upcoming = (today: string, month: number, day: number) => {
  const year = Number(today.slice(0, 4));
  for (let ahead = 0; ahead <= 8; ahead++) {
    const date = iso(year + ahead, month, day);
    if (date !== null && date >= today) return date;
  }
  return null;
};

const weekday = (today: string, word: string, next: boolean) => {
  const target = WEEKDAYS.indexOf(word.slice(0, 3).toLowerCase());
  const now = new Date(`${today}T00:00:00Z`).getUTCDay();
  const ahead = (target - now + 7) % 7 || 7;
  return addDays(today, next ? ahead + 7 : ahead);
};

const dateOf = (state: State, today: string): string | null => {
  const pattern = (body: string) => new RegExp(`${START}${DATE_LEAD}${body}${END}`, "giu");
  const year = (text: string | undefined) => (text === undefined ? null : text.length === 2 ? 2000 + Number(text) : Number(text));
  const named = (day: string, month: string, text: string | undefined) => {
    const [d, m, y] = [Number(day), MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1, year(text)];
    return y === null ? upcoming(today, m, d) : iso(y, m, d);
  };
  return (
    take(state, pattern("(\\d{4})-(\\d{2})-(\\d{2})"), (m) => iso(Number(m[1]), Number(m[2]), Number(m[3]))) ??
    take(state, pattern(`(\\d{1,2})(?:st|nd|rd|th)?\\s*${MONTH}(?:,?\\s+(\\d{4}))?`), (m) => named(m[1], m[2], m[3])) ??
    take(state, pattern(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`), (m) => named(m[2], m[1], m[3])) ??
    take(state, pattern(`(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${MEASURE_AHEAD}`), (m) => {
      const y = year(m[3]);
      return y === null ? upcoming(today, Number(m[2]), Number(m[1])) : iso(y, Number(m[2]), Number(m[1]));
    }) ??
    take(state, pattern("today"), () => today) ??
    take(state, pattern("tomorrow"), () => addDays(today, 1)) ??
    take(state, pattern(`(?:(next|this)\\s+)?${WEEKDAY}`), (m) => weekday(today, m[2], m[1]?.toLowerCase() === "next"))
  );
};

const unitAmount = (whole: string, fraction: string, unit: string) => {
  const multiplier = UNITS[unit.toLowerCase()];
  const value = Number(whole) * multiplier + Math.round(Number(`0.${fraction || "0"}`) * multiplier);
  return value <= MAX_AMOUNT ? value : null;
};

const amountOf = (state: State): number | null => {
  const rupiah = "(?:rp\\.?\\s*)?";
  return (
    take(state, new RegExp(`${AMOUNT_START}${AMOUNT_LEAD}${rupiah}(\\d{1,12})(?:[.,](\\d{1,3}))?\\s*(jt|juta|rb|ribu|k)${END}`, "giu"), (m) => unitAmount(m[1], m[2] ?? "", m[3])) ??
    take(state, new RegExp(`${AMOUNT_START}${AMOUNT_LEAD}rp\\.?\\s*(\\d+(?:[.,]\\d+)*)(?![\\d.,])${UNIT_AHEAD}`, "giu"), (m) => parseRupiah(m[1])) ??
    take(state, new RegExp(`(?<![\\p{L}\\p{N}_./,-])${AMOUNT_LEAD}(?!0)(\\d{1,3}(?:[.,]\\d{3})+|\\d{5,15})(?![\\p{L}\\p{N}_/-]|[.,]\\d)${UNIT_AHEAD}`, "giu"), (m) => {
      const value = parseRupiah(m[1]);
      return value !== null && String(value).length >= 5 ? value : null;
    })
  );
};

export const parseAmount = (input: string): number | null => {
  const text = input.trim();
  const plain = parseRupiah(text);
  if (plain !== null) return plain;
  const state: State = { rest: text };
  const read = amountOf(state);
  return state.rest.trim() === "" ? read : null;
};

const PHONE = /(?<![\p{L}\p{N}_+./,-])(\+?\d{9,15}|((?:\+\d{1,3}|62)[ -])?(\d{2,5}(?:([ -])\d{3,5}(?:\4\d{3,5}){0,3})?))/gu;

const AMOUNT_WORD = /^\s*(?:jt|juta|rb|ribu|k)(?![\p{L}\p{N}_])/iu;

const PHONE_END = /^(?:[\p{L}\p{N}_/]|[.,]\d)/u;

const phoneDigits = (text: string) => {
  const digits = text.replace(/\D/g, "").length;
  return text.startsWith("+") ? digits >= 9 && digits <= 15 : text.startsWith("62") ? digits >= 11 && digits <= 14 : text.startsWith("0") && digits >= 9 && digits <= 13;
};

const phoneOf = (state: State): string | null => {
  for (const match of state.rest.matchAll(PHONE)) {
    if (opaque(state.rest, match.index)) continue;
    const head = match[2] ?? "";
    const separator = match[4];
    const groups = separator === undefined ? [match[3] ?? match[1]] : match[3].split(separator);
    const text = (count: number) => head + groups.slice(0, count).join(separator);
    const after = (count: number) => state.rest.slice(match.index + text(count).length);
    for (let count = groups.length; count >= 1; count--) {
      const phone = phoneDigits(text(count)) ? normalizePhone(text(count)) : null;
      const clean = !PHONE_END.test(after(count)) && Array.from({ length: count - 1 }, (_, at) => after(at + 2)).every((rest) => !AMOUNT_WORD.test(rest));
      if (phone === null || !clean) continue;
      state.rest = `${state.rest.slice(0, match.index)} ${after(count)}`;
      return phone;
    }
  }
  return null;
};

const escaped = (phrase: string) => phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

const phrase = (name: string) => new RegExp(`${START}${escaped(name)}${END}`, "iu");

const NO_FALLBACK = { you: "", them: "", both: "both", nobody: "" };

const vocabulary = ({ me, nicknames }: Context): [string, Side | "both"][] => {
  const other = me === "a" ? "b" : "a";
  const pronouns: [string, Side][] = me === null ? [] : [["me", me], ["mine", me], ["them", other], ["theirs", other]];
  const names = (["a", "b", "both"] as const).map((who): [string, Side | "both"] => [sideName(who, me, nicknames, NO_FALLBACK), who]);
  return [...names, ...pronouns].filter(([word]) => word.trim() !== "").sort((a, b) => b[0].length - a[0].length);
};

const ownerOf = (state: State, context: Context): Draft["who"] => {
  const found = new Set<Side | "both">();
  for (const [word, who] of vocabulary(context)) {
    const pattern = new RegExp(`${START}${escaped(word)}(?:['\u2019]s)?${END}`, "giu");
    while (take(state, pattern, () => who) !== null) found.add(who);
  }
  return found.has("both") || (found.has("a") && found.has("b")) ? "both" : found.has("a") ? "a" : found.has("b") ? "b" : null;
};

const MIN_NAME = 3;

const lineOf = (input: string, lines: readonly Line[]): string | null => {
  const hits = lines.flatMap((line) =>
    [line.title, line.vendor].flatMap((name) => (name !== null && name.trim().length >= MIN_NAME && phrase(name).test(input) ? [{ id: line.id, size: name.trim().length }] : [])),
  );
  return hits.sort((a, b) => b.size - a.size)[0]?.id ?? null;
};

const STORED: Record<Kind, readonly Field[]> = {
  task: ["amount", "due", "who"],
  planned: ["amount"],
  payment: ["amount", "due", "who"],
  guest: ["phone", "who"],
  vendor: ["amount", "phone"],
};

const READ_IN_TEXT: readonly Field[] = ["amount", "due", "who", "phone"];

export const draftFor = (input: string, context: Context, ignore: ReadonlySet<Field>, pick: Kind | null): { draft: Draft; kind: Kind } => {
  const first = parseDraft(input, context, ignore);
  const kind = pick ?? first.kind;
  const blocked = READ_IN_TEXT.filter((field) => !STORED[kind].includes(field) && !ignore.has(field));
  const second = blocked.length === 0 ? first : parseDraft(input, context, new Set([...ignore, ...blocked]));
  const both = kind === "guest" && second.who === "both";
  return { kind, draft: both ? parseDraft(input, context, new Set([...ignore, ...blocked, "who"])) : second };
};

export const parseDraft = (input: string, context: Context, ignore: ReadonlySet<Field> = new Set()): Draft => {
  const state: State = { rest: input };
  const phone = ignore.has("phone") ? null : phoneOf(state);
  const due = ignore.has("due") ? null : dateOf(state, context.today);
  const amount = ignore.has("amount") ? null : amountOf(state);
  const who = ignore.has("who") ? null : ownerOf(state, context);
  const line = ignore.has("line") ? null : lineOf(input, context.lines);
  const tidy = state.rest
    .replace(/[([{]\s*[)\]}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[\u2013\u2014-]+ )+|(?: [\u2013\u2014-]+)+$/g, "")
    .replace(/\s+([.,;:!?)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/[,;:]+\s*([.!?])/g, "$1")
    .replace(/^[\s,;:]+|[\s,;:]+$/g, "");
  const title = /[\p{L}\p{N}]/u.test(tidy) ? tidy : "";
  return { title, kind: amount !== null && line !== null ? "payment" : "task", amount, due, who, line, phone };
};
