import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { EVENT_ORDER, budgetOf } from "../domain/budget.ts";
import type { Totals } from "../domain/budget.ts";
import { parseField } from "../domain/field.ts";
import { sortBefore } from "../domain/order.ts";
import { useBusy } from "../hooks/use-busy.ts";
import { useProject } from "../hooks/use-plan.ts";
import { actions, useTable } from "../hooks/use-store.ts";
import { failureOf } from "../ui/failure.ts";
import { formatMoney } from "../ui/format.ts";
import { PaymentLine } from "../ui/payment-line.tsx";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

function Summary({ totals, lines }: { totals: Totals; lines: number }) {
  const estimated = lines - totals.unestimated;
  return (
    <div className="summary">
      <dl className="totals">
        <div>
          <dt>{text.budget.planned}</dt>
          <dd>{estimated === 0 ? text.notSet : formatMoney(totals.planned)}</dd>
        </div>
        <div>
          <dt>{text.budget.paid}</dt>
          <dd>{formatMoney(totals.paid)}</dd>
        </div>
        <div>
          <dt>{text.budget.remaining}</dt>
          <dd>{estimated === 0 ? text.notSet : formatMoney(totals.remaining)}</dd>
        </div>
        {totals.over > 0 && (
          <div>
            <dt>{text.budget.over}</dt>
            <dd>{formatMoney(totals.over)}</dd>
          </div>
        )}
        {totals.paidUnestimated > 0 && (
          <div>
            <dt>{text.budget.paidNoEstimate}</dt>
            <dd>{formatMoney(totals.paidUnestimated)}</dd>
          </div>
        )}
      </dl>
      {totals.planned > 0 && <progress max={totals.planned} value={Math.min(totals.paid, totals.planned)} aria-label={text.budget.progress} />}
      {totals.unestimated > 0 && <p className="hint">{text.budget.unestimated(totals.unestimated)}</p>}
    </div>
  );
}

export function Budget() {
  const entries = useTable("budget_entries");
  const project = useProject();
  const budget = useMemo(() => budgetOf(entries), [entries]);
  const [errors, setErrors] = useState<string[]>([]);
  const { busy, once } = useBusy();
  const lines = budget.groups.reduce((total, group) => total + group.lines.length, 0);

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const amount = parseField("int", String(data.get("amount") ?? ""));
    if (title === "" || !project) return;
    if (!amount.ok) return setErrors([text.invalid.int]);
    return once(async () => {
      const result = await actions.create("budget_entries", {
        entry_type: "planned",
        title,
        group_key: String(data.get("group_key")),
        project_id: project.id,
        amount: amount.value as number | null,
        sort: sortBefore(entries.filter((entry) => entry.entry_type === "planned")),
      });
      if (result.ok) form.reset();
      setErrors(failureOf(result));
    });
  };

  return (
    <>
      <Title>{text.nav.budget}</Title>
      <Summary totals={budget} lines={lines} />
      <form className="quick-add budget-add" onSubmit={add}>
        <label className="visually-hidden" htmlFor="budget-title">
          {text.budget.addLabel}
        </label>
        <input id="budget-title" name="title" required maxLength={500} autoComplete="off" placeholder={text.budget.addPlaceholder} />
        <select name="group_key" aria-label={text.budget.event} defaultValue={EVENT_ORDER[2]}>
          {EVENT_ORDER.map((key) => (
            <option key={key} value={key}>
              {text.event[key as keyof typeof text.event]}
            </option>
          ))}
        </select>
        <input name="amount" inputMode="numeric" autoComplete="off" aria-label={text.budget.amountLabel} placeholder={text.budget.amountPlaceholder} />
        <button type="submit" disabled={busy}>
          {text.add}
        </button>
        {errors.length > 0 && (
          <p className="error" role="alert">
            {errors.join(" ")}
          </p>
        )}
      </form>
      {lines === 0 && <p className="empty">{text.empty.budget}</p>}
      {budget.groups.map((group, index) => (
        <section key={group.key} aria-labelledby={`group-${index}`}>
          <h2 id={`group-${index}`}>{text.event[group.key as keyof typeof text.event] ?? group.key}</h2>
          <Summary totals={group} lines={group.lines.length} />
          <ul className="lines">
            {group.lines.map((line) => (
              <li key={line.row.id} className="line">
                <div className="line-row">
                  <a className="line-main" href={`#/budget/${line.row.id}`}>
                    <span className="title">{line.row.title}</span>
                    <span className="meta">
                      <span>{line.planned === null ? text.notSet : formatMoney(line.planned)}</span>
                      <span>{text.budget.paidAmount(formatMoney(line.paid))}</span>
                      {line.remaining !== null && (
                        <span>{line.over > 0 ? text.budget.overBy(formatMoney(line.over)) : text.budget.left(formatMoney(line.remaining))}</span>
                      )}
                    </span>
                  </a>
                </div>
                {line.payments.length > 0 && (
                  <ul className="lines nested">
                    {line.payments.map((payment) => (
                      <PaymentLine key={payment.id} payment={payment} />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
