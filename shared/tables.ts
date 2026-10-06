export type Sql = "TEXT" | "INTEGER" | "REAL";

export type Type =
  | "id"
  | "key"
  | "text"
  | "int"
  | "real"
  | "bool"
  | "instant"
  | "date"
  | "currency"
  | "phone"
  | "url"
  | "json"
  | readonly string[];

export type Column = {
  sql: Sql;
  type: Type;
  notNull: boolean;
  default?: string | number;
  server?: true;
};

export type Variant = {
  columns: readonly string[];
  required: readonly string[];
  status?: readonly string[];
  who?: readonly string[];
  doneOnStatus?: string;
  data: Readonly<Record<string, Type>>;
};

export type Table = {
  key: string;
  columns: Readonly<Record<string, Column>>;
  common: readonly string[];
  by?: string;
  variants?: Readonly<Record<string, Variant>>;
};

const optional = <const T extends Type>(sql: Sql, type: T) => ({ sql, type, notNull: false as const });
const required = <const T extends Type>(sql: Sql, type: T) => ({ sql, type, notNull: true as const });
const withDefault = <const C extends Column>(column: C, value: string | number) => ({ ...column, default: value });
const server = <const C extends Column>(column: C) => ({ ...column, server: true as const });

const who = ["a", "b", "both"] as const;

const syncColumns = {
  rev: server(required("INTEGER", "int")),
  created_at: required("TEXT", "instant"),
  updated_at: required("TEXT", "instant"),
  updated_by: server(optional("TEXT", ["a", "b", "import"] as const)),
  deleted_at: optional("TEXT", "instant"),
};

const syncNames = Object.keys(syncColumns);

export const tables = {
  settings: {
    key: "key",
    columns: {
      key: required("TEXT", "key"),
      value: required("TEXT", "text"),
      ...syncColumns,
    },
    common: ["key", "value", ...syncNames],
  },
  items: {
    key: "id",
    columns: {
      id: required("TEXT", "id"),
      project_id: optional("TEXT", "id"),
      kind: required("TEXT", "text"),
      parent_id: optional("TEXT", "id"),
      title: required("TEXT", "text"),
      status: optional("TEXT", "text"),
      group_key: optional("TEXT", "text"),
      due_on: optional("TEXT", "date"),
      done_on: optional("TEXT", "date"),
      amount: optional("INTEGER", "int"),
      currency: withDefault(required("TEXT", "currency"), "IDR"),
      qty: optional("INTEGER", "int"),
      who: optional("TEXT", who),
      note: optional("TEXT", "text"),
      data: optional("TEXT", "json"),
      sort: withDefault(required("REAL", "real"), 0),
      ...syncColumns,
    },
    common: ["id", "kind", "title", "currency", "data", "sort", ...syncNames],
    by: "kind",
    variants: {
      project: {
        columns: ["status"],
        required: ["status"],
        status: ["active", "archived"],
        data: {},
      },
      task: {
        columns: ["project_id", "status", "due_on", "done_on", "who", "group_key", "amount", "qty", "note"],
        required: ["project_id", "status"],
        status: ["todo", "done"],
        data: { start_on: "date", decision: "bool", rules: "text" },
      },
      vendor: {
        columns: ["project_id", "status", "group_key", "amount"],
        required: ["project_id", "status"],
        status: ["option", "confirmed", "cancelled"],
        data: { phone: "phone", pic: "text", contract_url: "url", facts: "text" },
      },
      guest: {
        columns: ["project_id", "status", "who", "group_key", "qty"],
        required: ["project_id", "status"],
        status: ["todo", "sent", "confirmed", "declined"],
        who: ["a", "b"],
        data: {
          phone: "phone",
          channel: ["digital", "print", "both"],
          rsvp_qty: "int",
          import_batch: "text",
        },
      },
    },
  },
  budget_entries: {
    key: "id",
    columns: {
      id: required("TEXT", "id"),
      project_id: optional("TEXT", "id"),
      entry_type: required("TEXT", "text"),
      budget_id: optional("TEXT", "id"),
      vendor_id: optional("TEXT", "id"),
      title: required("TEXT", "text"),
      group_key: optional("TEXT", "text"),
      status: optional("TEXT", ["due", "paid"] as const),
      amount: optional("INTEGER", "int"),
      currency: withDefault(required("TEXT", "currency"), "IDR"),
      due_on: optional("TEXT", "date"),
      done_on: optional("TEXT", "date"),
      who: optional("TEXT", who),
      note: optional("TEXT", "text"),
      data: optional("TEXT", "json"),
      sort: withDefault(required("REAL", "real"), 0),
      ...syncColumns,
    },
    common: ["id", "entry_type", "title", "currency", "data", "sort", ...syncNames],
    by: "entry_type",
    variants: {
      planned: {
        columns: ["project_id", "group_key", "amount", "vendor_id"],
        required: ["project_id", "group_key"],
        data: {},
      },
      payment: {
        columns: ["project_id", "budget_id", "status", "amount", "due_on", "done_on", "who"],
        required: ["project_id", "budget_id", "status", "amount"],
        status: ["due", "paid"],
        doneOnStatus: "paid",
        data: { proof_url: "url" },
      },
    },
  },
} as const satisfies Record<string, Table>;

export type TableName = keyof typeof tables;

export const tableNames = Object.keys(tables) as TableName[];

type Columns<T extends TableName> = (typeof tables)[T]["columns"];

type Value<C> = C extends { type: infer V }
  ? V extends readonly (infer E)[]
    ? E
    : V extends "int" | "real"
      ? number
      : V extends "bool"
        ? boolean
        : V extends "json"
          ? Record<string, unknown>
          : string
  : never;

export type Row<T extends TableName> = {
  [C in keyof Columns<T>]: Columns<T>[C] extends { notNull: true } ? Value<Columns<T>[C]> : Value<Columns<T>[C]> | null;
};

export type Patch<T extends TableName> = Partial<Omit<Row<T>, "rev" | "updated_by" | (typeof tables)[T]["key"]>>;

export type ItemRow = Row<"items">;
export type BudgetEntryRow = Row<"budget_entries">;
export type SettingRow = Row<"settings">;

export type Kind = keyof (typeof tables)["items"]["variants"];
export type EntryType = keyof (typeof tables)["budget_entries"]["variants"];
