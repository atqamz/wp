import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tables, tableNames } from "../shared/tables.ts";
import type { Row, TableName } from "../shared/tables.ts";
import { rowKey } from "../shared/api.ts";
import { validateCreate, validatePatch } from "../shared/validate.ts";

const migration = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

const migrated = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migration);
  return db;
};

type Obj = Record<string, unknown>;

const instant = "2026-10-06T05:00:00Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projectId = uuid(1);
const plannedId = uuid(10);
const stamps = { created_at: instant, updated_at: instant };
const phone = "+628123456789";

const project = { id: projectId, kind: "project", title: "Plan", status: "active", ...stamps };
const task = {
  id: uuid(2),
  kind: "task",
  title: "Book a hall",
  project_id: projectId,
  status: "todo",
  due_on: "2026-12-31",
  done_on: "2026-10-06",
  who: "both",
  group_key: "kua",
  amount: 150000,
  currency: "IDR",
  qty: 2,
  note: "bring ID",
  sort: 1.5,
  data: { start_on: "2026-10-01", decision: true, rules: "after the venue" },
  ...stamps,
};
const vendor = {
  id: uuid(3),
  kind: "vendor",
  title: "Caterer",
  project_id: projectId,
  status: "option",
  group_key: "food",
  amount: 0,
  data: { phone, pic: "Sam", contract_url: "https://example.test/contract", facts: "net 30" },
  ...stamps,
};
const guest = {
  id: uuid(4),
  kind: "guest",
  title: "Guest",
  project_id: projectId,
  status: "todo",
  who: "a",
  group_key: "friends",
  qty: 3,
  data: { phone, channel: "both", rsvp_qty: 0, import_batch: "batch-1" },
  ...stamps,
};
const planned = {
  id: plannedId,
  entry_type: "planned",
  title: "Hall",
  project_id: projectId,
  group_key: "reception",
  amount: 5000000,
  ...stamps,
};
const payment = {
  id: uuid(11),
  entry_type: "payment",
  title: "Down payment",
  project_id: projectId,
  budget_id: plannedId,
  status: "due",
  amount: 1000000,
  due_on: "2026-11-01",
  who: "b",
  data: { proof_url: "https://example.test/proof" },
  ...stamps,
};
const setting = { key: "ceremony_date", value: "2027-06-01", ...stamps };

const items = { project, task, vendor, guest };

const sqlRow = (row: Obj) => ({
  rev: 1,
  ...row,
  ...(row.data === undefined ? {} : { data: JSON.stringify(row.data) }),
});

const insert = (db: DatabaseSync, table: string, row: Obj) => {
  const stored = sqlRow(row);
  const cols = Object.keys(stored);
  db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
    ...(Object.values(stored) as (string | number | null)[]),
  );
};

const seeded = () => {
  const db = migrated();
  insert(db, "items", project);
  insert(db, "budget_entries", planned);
  return db;
};

const rejects = (table: string, row: Obj, pattern: RegExp) => {
  const errors = validateCreate(table, row);
  assert.ok(
    errors.some((e) => pattern.test(e)),
    `expected ${pattern} in ${JSON.stringify(errors)}`,
  );
};

const patchRejects = (table: string, variant: unknown, patch: Obj, pattern: RegExp) => {
  const errors = validatePatch(table, variant, patch);
  assert.ok(
    errors.some((e) => pattern.test(e)),
    `expected ${pattern} in ${JSON.stringify(errors)}`,
  );
};

test("registry columns match the migration", () => {
  const db = migrated();
  for (const name of tableNames) {
    const info = db.prepare(`PRAGMA table_info(${name})`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];
    const actual = info.map((c) => ({
      name: c.name,
      sql: c.type,
      notNull: c.notnull === 1 || c.pk === 1,
      default: c.dflt_value === null ? undefined : c.dflt_value.replace(/^'(.*)'$/, "$1"),
    }));
    const spec = Object.entries(tables[name].columns).map(([column, c]) => ({
      name: column,
      sql: c.sql,
      notNull: c.notNull,
      default: "default" in c ? String(c.default) : undefined,
    }));
    assert.deepEqual(spec, actual, name);
    assert.deepEqual(
      info.filter((c) => c.pk === 1).map((c) => c.name),
      [tables[name].key],
      `${name} key`,
    );
  }
});

test("registry is internally consistent", () => {
  for (const name of tableNames) {
    const table: import("../shared/tables.ts").Table = tables[name];
    const columns = Object.keys(table.columns);
    assert.ok(table.common.every((c) => columns.includes(c)), `${name} common`);
    assert.ok(columns.includes(table.key));
    if (table.by) assert.ok(table.common.includes(table.by));
    for (const [variantName, v] of Object.entries(table.variants ?? {})) {
      const label = `${name}.${variantName}`;
      assert.ok(v.columns.every((c) => columns.includes(c) && !table.common.includes(c)), `${label} columns`);
      assert.ok(v.required.every((c) => v.columns.includes(c)), `${label} required`);
      if (v.status) assert.ok(v.columns.includes("status"), `${label} status`);
      if (v.who) assert.ok(v.columns.includes("who"), `${label} who`);
      if (v.doneOnStatus) assert.ok(v.status?.includes(v.doneOnStatus), `${label} doneOnStatus`);
    }
  }
  assert.deepEqual(Object.keys(tables.items.variants), ["project", "task", "vendor", "guest"]);
  assert.deepEqual(Object.keys(tables.budget_entries.variants), ["planned", "payment"]);
});

test("derived row types accept a full row", () => {
  const row: Row<"settings"> = { key: "k", value: "v", rev: 1, ...stamps, updated_by: null, deleted_at: null };
  const table: TableName = "settings";
  assert.equal(rowKey(table, row), "k");
});

test("accepts a valid row of every kind and entry type", () => {
  for (const [kind, row] of Object.entries(items)) assert.deepEqual(validateCreate("items", row), [], kind);
  assert.deepEqual(validateCreate("budget_entries", planned), []);
  assert.deepEqual(validateCreate("budget_entries", payment), []);
  assert.deepEqual(validateCreate("settings", setting), []);
});

test("minimal rows are accepted", () => {
  assert.deepEqual(validateCreate("items", { id: uuid(20), kind: "project", title: "t", status: "archived", ...stamps }), []);
  assert.deepEqual(
    validateCreate("items", { id: uuid(20), kind: "task", title: "t", project_id: projectId, status: "done", ...stamps }),
    [],
  );
});

test("a planned row needs no amount, a payment does", () => {
  const { amount: _planned, ...noAmount } = planned;
  assert.deepEqual(validateCreate("budget_entries", noAmount), []);
  assert.deepEqual(validateCreate("budget_entries", { ...planned, amount: null }), []);
  assert.deepEqual(validateCreate("budget_entries", { ...planned, amount: 0 }), []);
  const { amount: _payment, ...paymentNoAmount } = payment;
  rejects("budget_entries", paymentNoAmount, /amount: required/);
  rejects("budget_entries", { ...payment, amount: null }, /amount: required/);
});

test("rejects unknown tables, kinds, entry types and columns", () => {
  assert.match(validateCreate("users", task)[0], /unknown table/);
  assert.match(validatePatch("users", "task", {})[0], /unknown table/);
  assert.match(validateCreate("sync_state", { id: 1, rev: 0 })[0], /unknown table/);
  assert.match(validateCreate("constructor", task)[0], /unknown table/);
  assert.match(validateCreate("toString", task)[0], /unknown table/);
  rejects("items", { ...task, kind: "rundown" }, /kind: unknown kind/);
  rejects("items", { ...task, kind: "constructor" }, /kind: unknown kind/);
  rejects("items", { ...task, kind: 5 }, /kind: must be/);
  rejects("budget_entries", { ...payment, entry_type: "refund" }, /entry_type: unknown entry_type/);
  rejects("items", { ...task, colour: "red" }, /colour: unknown column/);
  rejects("items", JSON.parse('{"__proto__": 1}'), /__proto__: unknown column/);
  rejects("settings", { ...setting, id: uuid(1) }, /id: unknown column/);
});

test("requires the columns the table and the kind need", () => {
  for (const column of ["id", "kind", "title", "created_at", "updated_at"]) {
    const { [column]: _removed, ...row } = task as Obj;
    rejects("items", row, new RegExp(`${column}: required`));
  }
  for (const [kind, row] of [
    ["task", task],
    ["vendor", vendor],
    ["guest", guest],
  ] as const) {
    for (const column of ["project_id", "status"]) {
      const { [column]: _removed, ...rest } = row as Obj;
      rejects("items", rest, new RegExp(`${column}: required for kind ${kind}`));
      rejects("items", { ...row, [column]: null }, new RegExp(`${column}: required for kind ${kind}`));
    }
  }
  const { status: _status, ...project2 } = project;
  rejects("items", project2, /status: required for kind project/);
  const { group_key: _group, ...planned2 } = planned;
  rejects("budget_entries", planned2, /group_key: required for entry_type planned/);
  for (const column of ["project_id", "budget_id", "status"]) {
    const { [column]: _removed, ...rest } = payment as Obj;
    rejects("budget_entries", rest, new RegExp(`${column}: required for entry_type payment`));
  }
  for (const title of ["", "   ", null, 5]) rejects("items", { ...task, title }, /title/);
  for (const column of ["key", "value"]) {
    const { [column]: _removed, ...rest } = setting as Obj;
    rejects("settings", rest, new RegExp(`${column}: required`));
  }
});

test("ids are lowercase UUIDs", () => {
  for (const id of ["abc", "", "0190A1B2-C3D4-7E5F-8A6B-7C8D9E0F1A2B", "00000000-0000-0000-8000-000000000001", 5, null])
    rejects("items", { ...task, id }, /id:/);
  rejects("items", { ...task, project_id: "abc" }, /project_id: must be a lowercase UUID/);
  assert.deepEqual(validateCreate("items", { ...task, id: "0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b" }), []);
});

test("instants are RFC 3339 UTC with Z", () => {
  for (const ok of ["2026-10-06T05:00:00Z", "2026-10-06T05:00:00.123Z", "2024-02-29T23:59:59Z"])
    assert.deepEqual(validateCreate("items", { ...task, created_at: ok }), [], ok);
  for (const bad of [
    "2026-10-06",
    "2026-10-06T05:00:00",
    "2026-10-06T05:00:00+07:00",
    "2026-10-06T05:00:00z",
    "2026-10-06 05:00:00Z",
    "2026-02-30T05:00:00Z",
    "2026-10-06T24:00:00Z",
    "2026-10-06T05:60:00Z",
    "2026-10-06T05:00:60Z",
    "2026-10-06T05:00Z",
    5,
    null,
  ])
    rejects("items", { ...task, created_at: bad }, /created_at/);
  rejects("items", { ...task, deleted_at: "2026-10-06" }, /deleted_at: must be an RFC 3339/);
  assert.deepEqual(validateCreate("items", { ...task, deleted_at: instant }), []);
});

test("dates are YYYY-MM-DD", () => {
  for (const bad of ["06-10-2026", "2026/10/06", "2026-13-01", "2026-02-30", "2026-10-06T00:00:00Z", 20261006])
    rejects("items", { ...task, due_on: bad }, /due_on: must be a date/);
  rejects("items", { ...task, done_on: "2026-2-3" }, /done_on/);
  assert.deepEqual(validateCreate("items", { ...task, due_on: "2028-02-29", done_on: null }), []);
});

test("money is a whole non-negative integer with a currency code", () => {
  for (const bad of [-1, 1.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true])
    rejects("items", { ...task, amount: bad }, /amount: must be a non-negative integer/);
  rejects("items", { ...task, qty: -1 }, /qty/);
  rejects("items", { ...task, qty: 1.5 }, /qty/);
  rejects("budget_entries", { ...payment, amount: -5 }, /amount/);
  rejects("budget_entries", { ...planned, amount: 2.5 }, /amount/);
  for (const ok of [0, 1, Number.MAX_SAFE_INTEGER]) assert.deepEqual(validateCreate("items", { ...task, amount: ok }), []);
  for (const bad of ["RP", "idr", "IDRR", "", 3, null]) rejects("items", { ...task, currency: bad }, /currency/);
  const { currency: _currency, ...noCurrency } = task;
  assert.deepEqual(validateCreate("items", noCurrency), []);
  assert.deepEqual(validateCreate("items", { ...task, currency: "USD" }), []);
  rejects("budget_entries", { ...planned, currency: "rp" }, /currency/);
});

test("phone numbers in data are E.164", () => {
  for (const ok of ["+628123456789", "+14155550100", "+442071838750"])
    assert.deepEqual(validateCreate("items", { ...vendor, data: { phone: ok } }), [], ok);
  for (const bad of ["08123456789", "628123456789", "+0123456789", "+62 812 3456 789", "+62-812-3456", "+6281234567890123", "+", "", 628123456789])
    rejects("items", { ...vendor, data: { phone: bad } }, /data.phone/);
  rejects("items", { ...guest, data: { phone: "0812" } }, /data.phone/);
});

test("who is a, b or both, and a guest side is a or b", () => {
  for (const who of ["a", "b", "both"]) assert.deepEqual(validateCreate("items", { ...task, who }), [], who);
  for (const who of ["c", "A", "", 1]) rejects("items", { ...task, who }, /who: must be one of a, b, both/);
  assert.deepEqual(validateCreate("items", { ...guest, who: "b" }), []);
  rejects("items", { ...guest, who: "both" }, /who: must be one of a, b for kind guest/);
  rejects("budget_entries", { ...payment, who: "c" }, /who/);
});

test("status is checked per kind and per entry type", () => {
  const good = {
    project: ["active", "archived"],
    task: ["todo", "done"],
    vendor: ["option", "confirmed", "cancelled"],
    guest: ["todo", "sent", "confirmed", "declined"],
  } as const;
  for (const [kind, statuses] of Object.entries(good)) {
    for (const status of statuses)
      assert.deepEqual(validateCreate("items", { ...items[kind as keyof typeof items], status }), [], `${kind} ${status}`);
    const foreign = Object.values(good).flat().find((s) => !(statuses as readonly string[]).includes(s))!;
    rejects("items", { ...items[kind as keyof typeof items], status: foreign }, /status: must be one of/);
    rejects("items", { ...items[kind as keyof typeof items], status: "bogus" }, /status: must be one of/);
  }
  assert.deepEqual(validateCreate("budget_entries", { ...payment, status: "paid", done_on: "2026-11-02" }), []);
  rejects("budget_entries", { ...payment, status: "late" }, /status/);
});

test("columns a kind does not use must be empty", () => {
  rejects("items", { ...project, amount: 1 }, /amount: not used by kind project/);
  rejects("items", { ...project, project_id: projectId }, /project_id: not used by kind project/);
  rejects("items", { ...vendor, qty: 1 }, /qty: not used by kind vendor/);
  rejects("items", { ...vendor, who: "a" }, /who: not used by kind vendor/);
  rejects("items", { ...guest, amount: 1 }, /amount: not used by kind guest/);
  rejects("items", { ...task, parent_id: uuid(2) }, /parent_id: not used by kind task/);
  rejects("budget_entries", { ...planned, status: "due" }, /status: not used by entry_type planned/);
  rejects("budget_entries", { ...planned, due_on: "2026-11-01" }, /due_on: not used/);
  rejects("budget_entries", { ...planned, done_on: "2026-11-01" }, /done_on: not used/);
  rejects("budget_entries", { ...planned, budget_id: plannedId }, /budget_id: not used/);
  rejects("budget_entries", { ...payment, vendor_id: uuid(3) }, /vendor_id: not used by entry_type payment/);
  assert.deepEqual(validateCreate("items", { ...project, amount: null, project_id: null }), []);
  assert.deepEqual(validateCreate("budget_entries", { ...planned, vendor_id: uuid(3) }), []);
});

test("a payment date needs a paid payment", () => {
  rejects("budget_entries", { ...payment, status: "due", done_on: "2026-11-02" }, /done_on: only allowed when status is paid/);
  assert.deepEqual(validateCreate("budget_entries", { ...payment, status: "paid", done_on: "2026-11-02" }), []);
  assert.deepEqual(validateCreate("budget_entries", { ...payment, status: "paid" }), []);
});

test("data holds only the keys the kind allows", () => {
  assert.deepEqual(validateCreate("items", { ...project, data: null }), []);
  rejects("items", { ...project, data: { phone } }, /data.phone: unknown key/);
  rejects("items", { ...task, data: { phone } }, /data.phone: unknown key/);
  rejects("items", { ...vendor, data: { channel: "print" } }, /data.channel: unknown key/);
  rejects("items", { ...guest, data: { pic: "x" } }, /data.pic: unknown key/);
  rejects("budget_entries", { ...planned, data: { proof_url: "https://example.test" } }, /data.proof_url: unknown key/);
  rejects("items", { ...task, data: { start_on: "2026-13-01" } }, /data.start_on/);
  rejects("items", { ...task, data: { decision: "yes" } }, /data.decision: must be true or false/);
  rejects("items", { ...guest, data: { channel: "sms" } }, /data.channel: must be one of digital, print, both/);
  rejects("items", { ...guest, data: { rsvp_qty: -1 } }, /data.rsvp_qty/);
  rejects("items", { ...vendor, data: { pic: null } }, /data.pic: must not be null/);
  for (const bad of ["javascript:alert(1)", "ftp://example.test/x", "not a url", "data:text/html,x", ""])
    rejects("items", { ...vendor, data: { contract_url: bad } }, /data.contract_url: must be an http or https URL/);
  rejects("budget_entries", { ...payment, data: { proof_url: "javascript:alert(1)" } }, /data.proof_url/);
  for (const bad of [[], "{}", 5, true]) rejects("items", { ...task, data: bad }, /data: must be an object/);
});

test("the client never sets rev or updated_by", () => {
  rejects("items", { ...task, updated_by: "a" }, /updated_by: set by the server/);
  rejects("items", { ...task, updated_by: "someone@example.test" }, /updated_by/);
  rejects("items", { ...task, rev: 1 }, /rev: set by the server/);
  rejects("budget_entries", { ...payment, updated_by: "import" }, /updated_by: set by the server/);
  rejects("settings", { ...setting, updated_by: "b" }, /updated_by: set by the server/);
  rejects("settings", { ...setting, rev: 3 }, /rev: set by the server/);
});

test("settings are keyed by a lowercase key", () => {
  for (const key of ["Ceremony", "has space", "", "1abc", 5, "a".repeat(65)]) rejects("settings", { ...setting, key }, /key/);
  rejects("settings", { ...setting, value: "" }, /value/);
  rejects("settings", { ...setting, value: 5 }, /value/);
  assert.deepEqual(validateCreate("settings", { ...setting, deleted_at: instant }), []);
});

test("sort is a finite number", () => {
  assert.deepEqual(validateCreate("items", { ...task, sort: -2.25 }), []);
  for (const bad of ["1", NaN, Infinity, null]) rejects("items", { ...task, sort: bad }, /sort/);
});

test("never throws on bad input and returns errors", () => {
  const junk = [undefined, null, 0, 1, "x", "", true, [], {}, () => 1, Symbol("s"), 10n, JSON.parse('{"__proto__":{"x":1}}')];
  for (const table of junk)
    for (const row of junk) {
      assert.ok(Array.isArray(validateCreate(table, row)));
      assert.ok(Array.isArray(validatePatch(table, row, row)));
    }
  for (const table of ["items", "budget_entries", "settings"])
    for (const row of junk) {
      assert.ok(validateCreate(table, row).length > 0, `${table} ${String(row)}`);
      assert.ok(Array.isArray(validatePatch(table, "task", row)));
    }
  assert.ok(validateCreate("items", {}).length > 0);
  assert.ok(validateCreate("items", [task]).length > 0);
});

test("reports every error, not just the first", () => {
  const errors = validateCreate("items", { ...task, amount: -1, who: "c", due_on: "x", colour: 1 });
  assert.equal(errors.length, 4);
});

test("patch accepts field-level changes", () => {
  assert.deepEqual(validatePatch("items", "task", { status: "done" }), []);
  assert.deepEqual(validatePatch("items", "task", { status: "done", done_on: "2026-10-06", amount: 0 }), []);
  assert.deepEqual(validatePatch("items", "task", { amount: null, due_on: null, who: null, note: null }), []);
  assert.deepEqual(validatePatch("items", "task", { deleted_at: instant, updated_at: instant }), []);
  assert.deepEqual(validatePatch("items", "task", { deleted_at: null }), []);
  assert.deepEqual(validatePatch("items", "vendor", { data: { phone, pic: null } }), []);
  assert.deepEqual(validatePatch("items", "guest", { who: "b", qty: 4 }), []);
  assert.deepEqual(validatePatch("items", "task", {}), []);
  assert.deepEqual(validatePatch("budget_entries", "payment", { status: "paid", done_on: "2026-11-02" }), []);
  assert.deepEqual(validatePatch("budget_entries", "planned", { amount: null, vendor_id: null }), []);
  assert.deepEqual(validatePatch("settings", "", { value: "2027-07-01" }), []);
});

test("patch rejects what create rejects, field by field", () => {
  patchRejects("items", "task", { amount: -1 }, /amount/);
  patchRejects("items", "task", { due_on: "x" }, /due_on/);
  patchRejects("items", "task", { who: "c" }, /who/);
  patchRejects("items", "guest", { who: "both" }, /who: must be one of a, b for kind guest/);
  patchRejects("items", "task", { status: "confirmed" }, /status: must be one of todo, done/);
  patchRejects("items", "task", { colour: "red" }, /colour: unknown column/);
  patchRejects("items", "task", { updated_by: "a" }, /updated_by: set by the server/);
  patchRejects("items", "task", { rev: 9 }, /rev: set by the server/);
  patchRejects("items", "project", { amount: 1 }, /amount: not used by kind project/);
  patchRejects("items", "vendor", { data: { channel: "print" } }, /data.channel: unknown key/);
  patchRejects("items", "vendor", { data: { phone: "0812" } }, /data.phone/);
  patchRejects("items", "task", { data: null }, /data: must be an object/);
  patchRejects("items", "task", { data: [] }, /data: must be an object/);
  patchRejects("budget_entries", "planned", { status: "due" }, /status: not used by entry_type planned/);
  patchRejects("budget_entries", "payment", { vendor_id: uuid(3) }, /vendor_id: not used/);
  patchRejects("budget_entries", "payment", { status: "due", done_on: "2026-11-02" }, /done_on: only allowed when status is paid/);
  patchRejects("settings", "", { value: "" }, /value/);
});

test("patch cannot clear required fields or change identity", () => {
  patchRejects("items", "task", { title: null }, /title: must not be null/);
  patchRejects("items", "task", { status: null }, /status: required for kind task/);
  patchRejects("items", "task", { project_id: null }, /project_id: required for kind task/);
  patchRejects("items", "task", { created_at: null }, /created_at: must not be null/);
  patchRejects("items", "task", { currency: null }, /currency: must not be null/);
  patchRejects("items", "task", { id: uuid(9) }, /id: cannot be changed/);
  patchRejects("items", "task", { kind: "vendor" }, /kind: cannot be changed/);
  patchRejects("budget_entries", "payment", { entry_type: "planned" }, /entry_type: cannot be changed/);
  patchRejects("budget_entries", "payment", { amount: null }, /amount: required for entry_type payment/);
  patchRejects("budget_entries", "planned", { group_key: null }, /group_key: required for entry_type planned/);
  patchRejects("settings", "", { key: "other" }, /key: cannot be changed/);
  patchRejects("items", "rundown", { status: "done" }, /kind: unknown kind/);
  patchRejects("items", undefined, { status: "done" }, /kind: unknown kind/);
});

const validRows: [string, Obj][] = [];
for (const [kind, v] of Object.entries(tables.items.variants)) {
  const row = items[kind as keyof typeof items] as Obj;
  for (const status of v.status) validRows.push([`${kind} ${status}`, { ...row, status }]);
  if (v.columns.includes("who" as never)) {
    for (const who of ("who" in v ? v.who : tables.items.columns.who.type)) validRows.push([`${kind} who ${who}`, { ...row, who }]);
  }
}
for (const status of tables.budget_entries.variants.payment.status)
  validRows.push([`payment ${status}`, { ...payment, status, ...(status === "paid" ? { done_on: "2026-11-02" } : {}) }]);
for (const who of tables.budget_entries.columns.who.type) validRows.push([`payment who ${who}`, { ...payment, who }]);

test("every row the validator accepts passes the SQL constraints", () => {
  let n = 1000;
  for (const [label, row] of validRows) {
    const table = "entry_type" in row ? "budget_entries" : "items";
    assert.deepEqual(validateCreate(table, row), [], label);
    insert(seeded(), table, { ...row, id: uuid(n++) });
  }
  const db = seeded();
  insert(db, "items", task);
  insert(db, "items", vendor);
  insert(db, "items", guest);
  insert(db, "budget_entries", payment);
  insert(db, "budget_entries", { ...planned, id: uuid(12), amount: null });
  insert(db, "budget_entries", { ...payment, id: uuid(13), status: "paid", done_on: "2026-11-02", data: undefined });
  insert(migrated(), "settings", setting);
  insert(db, "items", { ...task, id: uuid(30), currency: "USD" });
  insert(db, "budget_entries", { ...planned, id: uuid(31), vendor_id: vendor.id });
});

const sqlAlsoRejects: [string, string, Obj][] = [
  ["created_at without time", "items", { ...task, created_at: "2026-10-06" }],
  ["updated_at without Z", "items", { ...task, updated_at: "2026-10-06T05:00:00" }],
  ["deleted_at without time", "items", { ...task, deleted_at: "2026-10-06" }],
  ["bad due_on", "items", { ...task, due_on: "06-10-2026" }],
  ["bad done_on", "items", { ...task, done_on: "2026/10/06" }],
  ["bad who", "items", { ...task, who: "c" }],
  ["negative amount", "items", { ...task, amount: -1 }],
  ["negative qty", "items", { ...task, qty: -1 }],
  ["bad currency", "items", { ...task, currency: "RP" }],
  ["updated_by from the client", "items", { ...task, updated_by: "someone@example.test" }],
  ["setting updated_by from the client", "settings", { ...setting, updated_by: "someone@example.test" }],
  ["planned without group_key", "budget_entries", { ...planned, id: uuid(20), group_key: null }],
  ["planned with budget_id", "budget_entries", { ...planned, id: uuid(20), budget_id: plannedId }],
  ["planned with status", "budget_entries", { ...planned, id: uuid(20), status: "due" }],
  ["planned with due_on", "budget_entries", { ...planned, id: uuid(20), due_on: "2026-11-01" }],
  ["planned with done_on", "budget_entries", { ...planned, id: uuid(20), done_on: "2026-11-01" }],
  ["planned with negative amount", "budget_entries", { ...planned, id: uuid(20), amount: -1 }],
  ["payment without budget_id", "budget_entries", { ...payment, budget_id: null }],
  ["payment with vendor_id", "budget_entries", { ...payment, vendor_id: vendor.id }],
  ["payment without status", "budget_entries", { ...payment, status: null }],
  ["payment with an unknown status", "budget_entries", { ...payment, status: "late" }],
  ["payment without amount", "budget_entries", { ...payment, amount: null }],
  ["payment with negative amount", "budget_entries", { ...payment, amount: -1 }],
  ["due payment with done_on", "budget_entries", { ...payment, done_on: "2026-11-02" }],
  ["unknown entry_type", "budget_entries", { ...payment, entry_type: "refund" }],
  ["bad payment who", "budget_entries", { ...payment, who: "c" }],
];

for (const [label, table, row] of sqlAlsoRejects) {
  test(`validator and SQL both reject ${label}`, () => {
    assert.ok(validateCreate(table, row).length > 0, "validator");
    const db = seeded();
    insert(db, "items", vendor);
    assert.throws(() => insert(db, table, row), /CHECK constraint failed/);
  });
}
