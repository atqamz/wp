import { useBusy } from "../hooks/use-busy.ts";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { text } from "../ui/text.ts";

export function Connect() {
  const { link } = useSnapshot();
  const { busy, once } = useBusy();
  const expired = link === "expired";
  return (
    <main className="recovery">
      <h1>{expired ? text.sync.login : text.connect.title}</h1>
      <p role="status">{expired ? text.sync.expiredBody : text.connect.body}</p>
      <div className="form-actions">
        {expired ? (
          <button type="button" onClick={actions.logIn}>
            {text.sync.login}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => once(() => actions.sync())}>
            {text.connect.retry}
          </button>
        )}
      </div>
    </main>
  );
}
