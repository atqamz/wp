import { toInstant } from "../../shared/api.ts";
import type { Side } from "../../shared/api.ts";
import { tables } from "../../shared/tables.ts";
import type { Patch, Row, TableName } from "../../shared/tables.ts";
import { validateChange, validateMutation } from "../../shared/validate.ts";
import type { Api } from "./api.ts";
import { absorb, changedFields, live, newer, overlay, takeBatch, toMaps, wire } from "./outbox.ts";
import type { Pending, Persistence, Rows, Write } from "./persistence.ts";

export type Link = "online" | "offline" | "expired";

export type Snapshot = {
  ready: boolean;
  me: Side | null;
  rows: Rows;
  pending: number;
  rejected: Pending[];
  link: Link;
  storage: "ok" | "failed";
};

export type Written = { ok: true; id: string } | { ok: false; errors: string[]; storage?: true };

export type Draft<T extends TableName> = Partial<
  Omit<Row<T>, "id" | "rev" | "updated_by" | "deleted_at" | "created_at" | "updated_at">
>;

type Dict = Record<string, unknown>;

const notFound: Written = { ok: false, errors: ["row: not found"] };

const unsaved: Written = { ok: false, errors: [], storage: true };

class StorageFailure extends Error {}

export const createStore = ({ persistence, api }: { persistence: Persistence; api: Api }) => {
  let base = toMaps({ items: [], budget_entries: [], settings: [] });
  let view = base;
  let outbox: Pending[] = [];
  let rev = 0;
  let me: Side | null = null;
  let link: Link = "online";
  let storage: Snapshot["storage"] = "ok";
  let loaded = false;
  let attempted = false;
  let nextSeq = 1;
  let running: Promise<void> | null = null;
  let again = false;
  let snapshot: Snapshot = { ready: false, me, rows: live(base), pending: 0, rejected: [], link, storage };
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
      storage,
    };
    for (const listener of listeners) listener();
  };

  const failed = (kind: "offline" | "expired") => {
    link = kind;
    emit();
  };

  const persist = async (write: Write) => {
    try {
      await persistence.write(write);
    } catch {
      storage = "failed";
      emit();
      throw new StorageFailure();
    }
    if (storage === "failed") {
      storage = "ok";
      emit();
    }
  };

  const cycle = async () => {
    for (;;) {
      const queue = outbox.filter((entry) => !entry.rejected);
      if (queue.length === 0) break;
      const batch = takeBatch(queue);
      const res = await api.push(batch.map(wire));
      if (res.kind === "ok") {
        const rows = newer(base, res.body.rows);
        await persist({ rows, outbox: { drop: batch.map((entry) => entry.seq) } });
        absorb(base, rows);
        outbox = outbox.filter((entry) => !batch.includes(entry));
        link = "online";
        emit();
      } else if (res.kind === "rejected") {
        const { index } = res.rejection;
        const named = typeof index === "number" && Number.isInteger(index) && index >= 0 && index < batch.length;
        const parked = (named ? [batch[index]] : batch).map((entry) => ({ ...entry, rejected: res.rejection.errors.map(String) }));
        await persist({ outbox: { put: parked } });
        outbox = outbox.map((entry) => parked.find((candidate) => candidate.seq === entry.seq) ?? entry);
        link = "online";
        emit();
      } else {
        return failed(res.kind);
      }
    }
    const res = await api.pull(rev);
    if (res.kind !== "ok") return failed(res.kind);
    const rows = newer(base, res.body.changes);
    const next = Math.max(rev, res.body.rev);
    await persist({ rows, meta: { rev: next, me: res.body.me } });
    absorb(base, rows);
    rev = next;
    me = res.body.me;
    link = "online";
    emit();
  };

  const sync = (): Promise<void> => {
    if (!loaded) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await cycle().catch((error) => (error instanceof StorageFailure ? undefined : failed("offline")));
        } while (again);
      } finally {
        running = null;
      }
    })();
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
    const seq = Math.max(nextSeq, Date.now() * 1000 + Math.floor(Math.random() * 1000));
    nextSeq = seq + 1;
    const entry = { ...mutation, seq };
    outbox = [...outbox, entry];
    emit();
    try {
      await persist({ outbox: { put: [entry] } });
    } catch {
      outbox = outbox.filter((queued) => queued !== entry);
      emit();
      return unsaved;
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

  const discard = async (seq: number): Promise<Written> => {
    try {
      await persist({ outbox: { drop: [seq] } });
    } catch {
      return unsaved;
    }
    outbox = outbox.filter((entry) => entry.seq !== seq);
    emit();
    return { ok: true, id: String(seq) };
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
