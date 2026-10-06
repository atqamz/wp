import { tableNames, tables } from "../../shared/tables.ts";
import { assemble } from "./persistence.ts";
import type { Persistence } from "./persistence.ts";

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

export const indexedDbPersistence = (name = "wp"): Persistence => {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= (() => {
      const opening = indexedDB.open(name, 1);
      opening.onupgradeneeded = () => {
        for (const table of tableNames) opening.result.createObjectStore(table, { keyPath: tables[table].key });
        opening.result.createObjectStore("outbox", { keyPath: "seq" });
        opening.result.createObjectStore("meta");
      };
      return wait(opening);
    })());
  const stores = [...tableNames, "outbox", "meta"];
  return {
    load: async () => {
      const tx = (await open()).transaction(stores, "readonly");
      const reads = [
        ...tableNames.map((table) => tx.objectStore(table).getAll()),
        tx.objectStore("outbox").getAll(),
        tx.objectStore("meta").get("rev"),
        tx.objectStore("meta").get("me"),
        tx.objectStore("meta").get("epoch"),
        tx.objectStore("meta").get("generation"),
      ];
      return assemble(await Promise.all(reads.map(wait)));
    },
    reset: async (expected, next) => {
      const tx = (await open()).transaction(stores, "readwrite");
      const current = tx.objectStore("meta").get("generation");
      let generation: string | null = null;
      current.onsuccess = () => {
        if ((current.result ?? null) !== expected) return;
        generation = crypto.randomUUID();
        for (const name of stores) tx.objectStore(name).clear();
        for (const [key, value] of Object.entries({ ...next, generation })) tx.objectStore("meta").put(value, key);
      };
      await finished(tx);
      return generation;
    },
    write: async ({ rows, outbox, meta }) => {
      const tx = (await open()).transaction(stores, "readwrite");
      for (const table of tableNames) for (const row of rows?.[table] ?? []) tx.objectStore(table).put(row);
      for (const entry of outbox?.put ?? []) tx.objectStore("outbox").put(entry);
      for (const seq of outbox?.drop ?? []) tx.objectStore("outbox").delete(seq);
      for (const [key, value] of Object.entries(meta ?? {})) tx.objectStore("meta").put(value, key);
      await finished(tx);
    },
  };
};
