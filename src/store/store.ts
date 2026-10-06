import { toInstant } from "../../shared/api.ts";
import type { Side } from "../../shared/api.ts";
import { tables } from "../../shared/tables.ts";
import type { Patch, Row, TableName } from "../../shared/tables.ts";
import { validateChange, validateMutation } from "../../shared/validate.ts";
import type { Api } from "./api.ts";
import { changedFields, live, merge, overlay, takeBatch, toMaps, wire } from "./outbox.ts";
import type { Pending, Persistence, Rows } from "./persistence.ts";

export type Link = "online" | "offline" | "expired";

export type Snapshot = {
  ready: boolean;
  me: Side | null;
  rows: Rows;
  pending: number;
  rejected: Pending[];
  link: Link;
};

export type Written = { ok: true; id: string } | { ok: false; errors: string[] };

export type Draft<T extends TableName> = Partial<
  Omit<Row<T>, "id" | "rev" | "updated_by" | "deleted_at" | "created_at" | "updated_at">
>;

type Dict = Record<string, unknown>;

const notFound: Written = { ok: false, errors: ["row: not found"] };

export const createStore = ({ persistence, api }: { persistence: Persistence; api: Api }) => {
  let base = toMaps({ items: [], budget_entries: [], settings: [] });
  let view = base;
  let outbox: Pending[] = [];
  let rev = 0;
  let me: Side | null = null;
  let link: Link = "online";
  let loaded = false;
  let attempted = false;
  let nextSeq = 1;
  let running: Promise<void> | null = null;
  let again = false;
  let snapshot: Snapshot = { ready: false, me, rows: live(base), pending: 0, rejected: [], link };
  const listeners = new Set<() => void>();

  const emit = () => {
    const sendable = outbox.filter((entry) => !entry.rejected);
    view = overlay(base, sendable);
    snapshot = {
      ready: loaded && (me !== null || attempted),
      me,
      rows: live(view),
      pending: sendable.length,
      rejected: outbox.filter((entry) => entry.rejected),
      link,
    };
    for (const listener of listeners) listener();
  };

  const failed = (kind: "offline" | "expired") => {
    link = kind;
    emit();
  };

  const cycle = async () => {
    for (;;) {
      const queue = outbox.filter((entry) => !entry.rejected);
      if (queue.length === 0) break;
      const batch = takeBatch(queue);
      const res = await api.push(batch.map(wire));
      if (res.kind === "ok") {
        const rows = merge(base, res.body.rows);
        outbox = outbox.filter((entry) => !batch.includes(entry));
        link = "online";
        await persistence.write({ rows, outbox: { drop: batch.map((entry) => entry.seq) } });
        emit();
      } else if (res.kind === "rejected") {
        const index = res.rejection.index ?? 0;
        const culprit = batch[Number.isInteger(index) && index >= 0 && index < batch.length ? index : 0];
        const parked = { ...culprit, rejected: res.rejection.errors.map(String) };
        outbox = outbox.map((entry) => (entry === culprit ? parked : entry));
        link = "online";
        await persistence.write({ outbox: { put: [parked] } });
        emit();
      } else {
        return failed(res.kind);
      }
    }
    const res = await api.pull(rev);
    if (res.kind !== "ok") return failed(res.kind);
    const rows = merge(base, res.body.changes);
    rev = Math.max(rev, res.body.rev);
    me = res.body.me;
    link = "online";
    await persistence.write({ rows, meta: { rev, me } });
    emit();
  };

  const sync = (): Promise<void> => {
    if (!loaded) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await cycle();
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const open = async () => {
    const saved = await persistence.load();
    base = toMaps(saved.rows);
    outbox = saved.outbox.sort((a, b) => a.seq - b.seq);
    nextSeq = outbox.reduce((top, entry) => Math.max(top, entry.seq), 0) + 1;
    rev = saved.meta.rev;
    me = saved.meta.me;
    loaded = true;
    emit();
    await sync().finally(() => {
      attempted = true;
      emit();
    });
  };

  const enqueue = async (mutation: Omit<Pending, "seq">): Promise<Written> => {
    const errors = validateMutation(wire(mutation));
    if (errors.length > 0) return { ok: false, errors };
    const entry = { ...mutation, seq: nextSeq++ };
    outbox = [...outbox, entry];
    emit();
    try {
      await persistence.write({ outbox: { put: [entry] } });
    } catch (error) {
      outbox = outbox.filter((queued) => queued !== entry);
      emit();
      throw error;
    }
    if (link !== "expired") void sync();
    return { ok: true, id: mutation.row_id };
  };

  const create = async <T extends TableName>(table: T, draft: Draft<T>): Promise<Written> => {
    const at = toInstant(new Date());
    const rowId = table === "settings" ? String((draft as Dict).key) : crypto.randomUUID();
    const fields = Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined));
    const patch = { ...fields, [tables[table].key]: rowId, created_at: at, updated_at: at };
    return enqueue({ id: crypto.randomUUID(), table, op: "create", row_id: rowId, patch, at });
  };

  const update = async <T extends TableName>(table: T, rowId: string, change: Patch<T>): Promise<Written> => {
    const row = view[table].get(rowId);
    if (!row) return notFound;
    const at = toInstant(new Date());
    const fields = changedFields(row, change as Dict);
    if (Object.keys(fields).length === 0) return { ok: true, id: rowId };
    const patch = { ...fields, updated_at: at };
    const errors = validateChange(table, row, patch);
    if (errors.length > 0) return { ok: false, errors };
    return enqueue({ id: crypto.randomUUID(), table, op: "update", row_id: rowId, patch, at });
  };

  const remove = async (table: TableName, rowId: string): Promise<Written> => {
    const row = view[table].get(rowId);
    if (!row) return notFound;
    if (row.deleted_at !== null) return { ok: true, id: rowId };
    return enqueue({ id: crypto.randomUUID(), table, op: "delete", row_id: rowId, patch: {}, at: toInstant(new Date()) });
  };

  const setSetting = (key: string, value: string) =>
    view.settings.has(key) ? update("settings", key, { value }) : create("settings", { key, value });

  const discard = async (seq: number) => {
    outbox = outbox.filter((entry) => entry.seq !== seq);
    await persistence.write({ outbox: { drop: [seq] } });
    emit();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    open,
    sync,
    create,
    update,
    remove,
    setSetting,
    discard,
  };
};

export type Store = ReturnType<typeof createStore>;
