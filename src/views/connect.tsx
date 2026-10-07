import { useBusy } from "../hooks/use-busy.ts";
import { actions } from "../hooks/use-store.ts";
import { text } from "../ui/text.ts";

export function Connect() {
  const { busy, once } = useBusy();
  return (
    <main className="recovery">
      <h1>{text.connect.title}</h1>
      <p role="status">{text.connect.body}</p>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={() => once(() => actions.sync())}>
          {text.connect.retry}
        </button>
      </div>
    </main>
  );
}
