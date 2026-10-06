import { tableNames, tables } from "../../shared/tables.ts";
import type { Persistence, Persisted } from "./persistence.ts";

const wait = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

export const indexedDbPersistence = async (name = "wp"): Promise<Persistence> => {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    for (const table of tableNames) opening.result.createObjectStore(table, { keyPath: tables[table].key });
    opening.result.createObjectStore("outbox", { keyPath: "seq" });
    opening.result.createObjectStore("meta");
  };
  const db = await wait(opening);
  const stores = [...tableNames, "outbox", "meta"];
  return {
    load: async () => {
      const tx = db.transaction(stores, "readonly");
      const reads = [
        ...tableNames.map((table) => tx.objectStore(table).getAll()),
        tx.objectStore("outbox").getAll(),
        tx.objectStore("meta").get("rev"),
        tx.objectStore("meta").get("me"),
      ];
      const [items, budget_entries, settings, outbox, rev, me] = await Promise.all(reads.map(wait));
      return { rows: { items, budget_entries, settings }, outbox, meta: { rev: rev ?? 0, me: me ?? null } } as Persisted;
    },
    write: async ({ rows, outbox, meta }) => {
      const tx = db.transaction(stores, "readwrite");
      for (const table of tableNames) for (const row of rows?.[table] ?? []) tx.objectStore(table).put(row);
      for (const entry of outbox?.put ?? []) tx.objectStore("outbox").put(entry);
      for (const seq of outbox?.drop ?? []) tx.objectStore("outbox").delete(seq);
      for (const [key, value] of Object.entries(meta ?? {})) tx.objectStore("meta").put(value, key);
      await finished(tx);
    },
  };
};
