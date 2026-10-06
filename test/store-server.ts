import { MAX_BODY_BYTES, MAX_MUTATIONS, applyPatch, toInstant } from "../shared/api.ts";
import type { Changes, Mutation, Side } from "../shared/api.ts";
import { tableNames, tables } from "../shared/tables.ts";
import type { Column, TableName } from "../shared/tables.ts";
import { validateChange, validateMutation } from "../shared/validate.ts";
import type { Fetch } from "../src/store/api.ts";

type Dict = Record<string, unknown>;
type State = Record<TableName, Map<string, Dict>>;

export type Session = "ok" | "redirect" | "html" | "unauthorized";

export type Seen = { method: string; mutations: number; bytes: number; since?: number };

const references = [
  ["project_id", "items", "kind", "project"],
  ["vendor_id", "items", "kind", "vendor"],
  ["budget_id", "budget_entries", "entry_type", "planned"],
] as const;

const json = (status: number, body: unknown) => Response.json(body, { status });

const refuse = (status: number, errors: string[], index?: number) =>
  json(status, index === undefined ? { status, errors } : { status, errors, index });

const copy = (state: State): State =>
  Object.fromEntries(tableNames.map((table) => [table, new Map(state[table])])) as State;

const blank = (table: TableName, patch: Dict): Dict =>
  Object.fromEntries(
    Object.entries(tables[table].columns as Record<string, Column>).map(([name, column]) => [
      name,
      patch[name] ?? column.default ?? null,
    ]),
  );

export const createServer = () => {
  let rev = 0;
  let state: State = Object.fromEntries(tableNames.map((table) => [table, new Map()])) as State;
  const seen: Seen[] = [];
  const control = { down: false, session: "ok" as Session, fail: [] as number[] };

  const pointers = (draft: State, table: TableName, row: Dict, columns: readonly string[]) => {
    const errors: string[] = [];
    if (table === "settings") return errors;
    for (const [column, targetTable, kindColumn, kind] of references) {
      if (!columns.includes(column) || row[column] == null) continue;
      const target = draft[targetTable].get(row[column] as string);
      if (!target || target.deleted_at !== null || target[kindColumn] !== kind) {
        errors.push(`${column}: must point at a live ${kind}`);
      } else if (column !== "project_id" && target.project_id !== row.project_id) {
        errors.push(`${column}: must belong to the same project`);
      } else if (column === "budget_id" && target.currency !== row.currency) {
        errors.push("currency: must equal the planned row's currency");
      }
    }
    return errors;
  };

  const apply = (draft: State, mutation: Mutation, side: Side, at: string, next: number, touched: Map<string, Dict>) => {
    const { table, row_id: id, patch } = mutation;
    const row = draft[table].get(id);
    const write = (value: Dict) => {
      const stored = { ...value, rev: next, updated_by: side, updated_at: at };
      draft[table].set(id, stored);
      touched.set(`${table}/${id}`, stored);
    };
    if (mutation.op === "create") {
      if (row && table === "settings") write(applyPatch(row, { value: patch.value }));
      else if (!row) {
        const created = { ...blank(table, patch), ...patch, deleted_at: null };
        const errors = pointers(draft, table, created, Object.keys(patch));
        if (errors.length > 0) return errors;
        write(created);
      }
      return [];
    }
    if (!row) return ["row_id: no such row"];
    if (mutation.op === "delete") {
      if (table === "items" && row.kind === "project") return ["row_id: a project is archived, never deleted"];
      if (row.deleted_at === null) write({ ...row, deleted_at: at });
      return [];
    }
    const undo = Object.keys(patch).filter((key) => key !== "updated_at").join() === "deleted_at" && patch.deleted_at === null;
    if (row.deleted_at !== null && !undo) return [];
    const errors = validateChange(table, row, patch);
    if (errors.length > 0) return errors;
    const merged = applyPatch(row, patch);
    const pointing = pointers(draft, table, merged, Object.keys(patch));
    if (pointing.length > 0) return pointing;
    write(merged);
    return [];
  };

  const changesSince = (since: number, only?: Map<string, Dict>): Changes => {
    const out = Object.fromEntries(tableNames.map((table) => [table, [] as Dict[]]));
    for (const table of tableNames) {
      for (const [id, row] of state[table]) {
        const wanted = only ? only.has(`${table}/${id}`) : (row.rev as number) > since;
        if (wanted) out[table].push(structuredClone(row));
      }
    }
    return out as unknown as Changes;
  };

  const post = (side: Side, text: string) => {
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_BODY_BYTES) return refuse(413, ["body: too large"]);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return refuse(400, ["body: must be JSON"]);
    }
    const dict = body as Dict;
    if (typeof body !== "object" || body === null || Object.keys(dict).join() !== "mutations" || !Array.isArray(dict.mutations)) {
      return refuse(400, ["body: must be an object with only a mutations array"]);
    }
    const mutations = dict.mutations as Mutation[];
    seen.push({ method: "POST", mutations: mutations.length, bytes });
    if (mutations.length > MAX_MUTATIONS) return refuse(400, [`mutations: at most ${MAX_MUTATIONS}`]);
    for (const [index, mutation] of mutations.entries()) {
      const errors = validateMutation(mutation);
      if (errors.length > 0) return refuse(400, errors, index);
    }
    const draft = copy(state);
    const touched = new Map<string, Dict>();
    const at = toInstant(new Date());
    for (const [index, mutation] of mutations.entries()) {
      const errors = apply(draft, mutation, side, at, rev + 1, touched);
      if (errors.length > 0) return refuse(422, errors, index);
    }
    if (touched.size > 0) {
      rev += 1;
      state = draft;
    }
    return json(200, { rev, rows: changesSince(0, touched) });
  };

  const get = (side: Side, url: URL) => {
    const since = url.searchParams.get("since") ?? "0";
    if (!/^\d+$/.test(since)) return refuse(400, ["since: must be a non-negative integer"]);
    seen.push({ method: "GET", mutations: 0, bytes: 0, since: Number(since) });
    return json(200, { rev, me: side, changes: changesSince(Number(since)) });
  };

  const as =
    (side: Side): Fetch =>
    async (input, init) => {
      if (control.down) throw new TypeError("fetch failed");
      const url = new URL(input, "https://wp.example.test");
      if (control.session === "redirect") return new Response(null, { status: 302, headers: { location: "https://team.example.test/login" } });
      if (control.session === "html") return new Response("<!doctype html><title>Sign in</title>", { headers: { "content-type": "text/html" } });
      if (control.session === "unauthorized") return json(401, { error: "unauthorized" });
      const failure = control.fail.shift();
      if (failure !== undefined) return new Response("upstream error", { status: failure });
      if (url.pathname !== "/api/sync") return json(404, { error: "not_found" });
      return init.method === "POST" ? post(side, String(init.body)) : get(side, url);
    };

  return {
    as,
    control,
    seen,
    row: (table: TableName, id: string) => state[table].get(id),
    get rev() {
      return rev;
    },
  };
};

export type Server = ReturnType<typeof createServer>;
