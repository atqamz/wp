import { actions, useSnapshot } from "../hooks/use-store.ts";
import { text } from "./text.ts";

export function SyncBadge() {
  const { link, pending, rejected } = useSnapshot();
  const state =
    link === "expired"
      ? "login"
      : rejected.length > 0
        ? "rejected"
        : link === "offline"
          ? "offline"
          : pending > 0
            ? "pending"
            : "synced";
  const label =
    state === "login"
      ? text.sync.login
      : state === "rejected"
        ? text.sync.rejected(rejected.length)
        : state === "offline"
          ? text.sync.offline(pending)
          : state === "pending"
            ? text.sync.pending(pending)
            : text.sync.synced;
  return (
    <div role="status" className="sync" data-state={state}>
      {state === "login" ? (
        <button type="button" onClick={actions.logIn}>
          {label}
        </button>
      ) : (
        <a href="#/sync">{label}</a>
      )}
    </div>
  );
}
