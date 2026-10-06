import { tables } from "./tables.ts";
import type { Column, Table, Type, Variant } from "./tables.ts";

type Plain = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY = /^[a-z][a-z0-9_]{0,63}$/;
const CURRENCY = /^[A-Z]{3}$/;
const PHONE = /^\+[1-9]\d{1,14}$/;
const DATE = /^(\d{4})-(\d\d)-(\d\d)$/;
const INSTANT = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(\.\d{1,9})?Z$/;

const show = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : typeof v);

const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

const isDate = (v: string) => {
  const m = DATE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

const isInstant = (v: string) => {
  const m = INSTANT.exec(v);
  return m !== null && isDate(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60 && Number(m[4]) < 60;
};

const isUrl = (v: string) => {
  try {
    const { protocol } = new URL(v);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

const problem = (type: Type, v: unknown): string | null => {
  if (Array.isArray(type)) return type.includes(v as string) ? null : `must be one of ${type.join(", ")}`;
  const ok =
    type === "id" ? typeof v === "string" && UUID.test(v)
    : type === "key" ? typeof v === "string" && KEY.test(v)
    : type === "text" ? typeof v === "string" && v.trim() !== ""
    : type === "int" ? typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    : type === "real" ? typeof v === "number" && Number.isFinite(v)
    : type === "bool" ? typeof v === "boolean"
    : type === "instant" ? typeof v === "string" && isInstant(v)
    : type === "date" ? typeof v === "string" && isDate(v)
    : type === "currency" ? typeof v === "string" && CURRENCY.test(v)
    : type === "phone" ? typeof v === "string" && PHONE.test(v)
    : type === "url" ? typeof v === "string" && isUrl(v)
    : isPlain(v);
  if (ok) return null;
  const expected: Record<string, string> = {
    id: "a lowercase UUID",
    key: "a lowercase key such as ceremony_date",
    text: "a non-empty string",
    int: "a non-negative integer",
    real: "a finite number",
    bool: "true or false",
    instant: "an RFC 3339 UTC instant ending in Z",
    date: "a date as YYYY-MM-DD",
    currency: "a 3-letter uppercase currency code",
    phone: "an E.164 phone number such as +628123456789",
    url: "an http or https URL",
    json: "an object",
  };
  return `must be ${expected[type as string]}`;
};

const lookup = <T>(map: Readonly<Record<string, T>> | undefined, name: unknown): T | undefined =>
  typeof name === "string" && map !== undefined && Object.hasOwn(map, name) ? map[name] : undefined;

const checkData = (variant: Variant, data: unknown, patch: boolean, errors: string[]) => {
  if (!isPlain(data)) {
    errors.push("data: must be an object");
    return;
  }
  for (const [name, value] of Object.entries(data)) {
    const type = lookup(variant.data, name);
    if (type === undefined) errors.push(`data.${name}: unknown key`);
    else if (value === null) {
      if (!patch) errors.push(`data.${name}: must not be null`);
    } else {
      const bad = problem(type, value);
      if (bad) errors.push(`data.${name}: ${bad}`);
    }
  }
};

const checkVariant = (
  table: Table,
  variantName: string,
  variant: Variant,
  input: Plain,
  patch: boolean,
  errors: string[],
) => {
  const known = new Set([...table.common, ...variant.columns]);
  for (const [name, value] of Object.entries(input)) {
    if (Object.hasOwn(table.columns, name) && value !== null && value !== undefined && !known.has(name)) {
      errors.push(`${name}: not used by ${table.by} ${variantName}`);
    }
  }
  if (typeof input.status === "string" && variant.status && !variant.status.includes(input.status)) {
    errors.push(`status: must be one of ${variant.status.join(", ")} for ${table.by} ${variantName}`);
  }
  if (typeof input.who === "string" && variant.who && !variant.who.includes(input.who)) {
    errors.push(`who: must be one of ${variant.who.join(", ")} for ${table.by} ${variantName}`);
  }
  if (patch && input.data === null) errors.push("data: must be an object, set a key to null to remove it");
  if (input.data !== undefined && input.data !== null) checkData(variant, input.data, patch, errors);
  if (variant.doneOnStatus && input.done_on != null && input.status !== undefined && input.status !== variant.doneOnStatus) {
    errors.push(`done_on: only allowed when status is ${variant.doneOnStatus}`);
  }
  for (const name of variant.required) {
    if (input[name] === null || (!patch && input[name] === undefined)) {
      errors.push(`${name}: required for ${table.by} ${variantName}`);
    }
  }
};

const checkColumns = (table: Table, input: Plain, patch: boolean, errors: string[]) => {
  for (const [name, value] of Object.entries(input)) {
    const column: Column | undefined = lookup(table.columns, name);
    if (column === undefined) errors.push(`${name}: unknown column`);
    else if (column.server) errors.push(`${name}: set by the server, never by the client`);
    else if (patch && (name === table.key || name === table.by)) errors.push(`${name}: cannot be changed`);
    else if (value === null) {
      if (column.notNull) errors.push(`${name}: must not be null`);
    } else if (value !== undefined) {
      const bad = problem(column.type, value);
      if (bad) errors.push(`${name}: ${bad}`);
    }
  }
};

export const validateCreate = (tableName: unknown, row: unknown): string[] => {
  const table = lookup<Table>(tables, tableName);
  if (table === undefined) return [`unknown table ${show(tableName)}`];
  if (!isPlain(row)) return ["row: must be an object"];
  const errors: string[] = [];
  checkColumns(table, row, false, errors);
  for (const [name, column] of Object.entries(table.columns)) {
    if (column.notNull && !column.server && column.default === undefined && row[name] === undefined) {
      errors.push(`${name}: required`);
    }
  }
  if (table.by) {
    const variantName = row[table.by];
    const variant = lookup(table.variants, variantName);
    if (variant) checkVariant(table, variantName as string, variant, row, false, errors);
    else if (variantName !== undefined) errors.push(`${table.by}: unknown ${table.by} ${show(variantName)}`);
  }
  return errors;
};

export const validatePatch = (tableName: unknown, variantName: unknown, patch: unknown): string[] => {
  const table = lookup<Table>(tables, tableName);
  if (table === undefined) return [`unknown table ${show(tableName)}`];
  if (!isPlain(patch)) return ["patch: must be an object"];
  const errors: string[] = [];
  checkColumns(table, patch, true, errors);
  if (table.by) {
    const variant = lookup(table.variants, variantName);
    if (variant) checkVariant(table, variantName as string, variant, patch, true, errors);
    else errors.push(`${table.by}: unknown ${table.by} ${show(variantName)}`);
  }
  return errors;
};
