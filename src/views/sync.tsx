import { actions, useSnapshot } from "../hooks/use-store.ts";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

export function Sync() {
  const { link, pending, rejected } = useSnapshot();
  return (
    <>
      <Title>{text.sync.title}</Title>
      <p role="status">
        {link === "expired" ? text.sync.expiredBody : link === "offline" ? text.sync.offlineBody : text.sync.onlineBody}
      </p>
      <p>{text.sync.waiting(pending)}</p>
      <div className="form-actions">
        {link === "expired" && (
          <button type="button" onClick={actions.logIn}>
            {text.sync.login}
          </button>
        )}
        <button type="button" className={link === "expired" ? "secondary" : undefined} onClick={() => actions.sync()}>
          {text.sync.now}
        </button>
      </div>
      {rejected.length > 0 && (
        <section aria-labelledby="rejected">
          <h2 id="rejected">{text.sync.attention}</h2>
          <p className="hint">{text.sync.attentionBody}</p>
          <ul className="lines">
            {rejected.map((entry) => (
              <li key={entry.seq} className="line">
                <div className="line-row">
                  <div className="line-main">
                    <span className="title">
                      {text.sync.op[entry.op]} {text.sync.table[entry.table]}
                      {typeof entry.patch.title === "string" ? `: ${entry.patch.title}` : ""}
                    </span>
                    <span className="meta">
                      {entry.rejected?.map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </span>
                  </div>
                  <button type="button" className="action" onClick={() => actions.discard(entry.seq)}>
                    {text.sync.discard}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
