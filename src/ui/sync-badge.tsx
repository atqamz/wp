import { badgeFor } from "../domain/status.ts";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { text } from "./text.ts";

export function SyncBadge() {
  const { link, pending, rejected, storage } = useSnapshot();
  const state = badgeFor({ storage, link, pending, rejected: rejected.length });
  const labels = {
    storage: text.sync.storage,
    login: text.sync.login,
    rejected: text.sync.rejected(rejected.length),
    offline: text.sync.offline(pending),
    pending: text.sync.pending(pending),
    synced: text.sync.synced,
  };
  return (
    <div role="status" className="sync" data-state={state}>
      {state === "login" ? (
        <button type="button" onClick={actions.logIn}>
          {labels.login}
        </button>
      ) : (
        <a href="#/sync">{labels[state]}</a>
      )}
    </div>
  );
}
