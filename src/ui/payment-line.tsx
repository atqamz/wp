import { useState } from "react";
import type { BudgetEntryRow } from "../../shared/tables.ts";
import { isOverdue } from "../domain/dates.ts";
import { usePartner, useStamp, useToday } from "../hooks/use-plan.ts";
import { actions } from "../hooks/use-store.ts";
import { failureOf } from "./failure.ts";
import { formatDate, formatDay, formatMoney } from "./format.ts";
import { text } from "./text.ts";

export function PaymentLine({ payment }: { payment: BudgetEntryRow }) {
  const today = useToday();
  const stamp = useStamp();
  const { label } = usePartner();
  const [failure, setFailure] = useState<string[]>([]);
  const paid = payment.status === "paid";
  const late = !paid && isOverdue(payment.due_on, today);
  const when = paid
    ? payment.done_on
      ? `${text.paidOn} ${formatDate(payment.done_on)}`
      : text.option.status.paid
    : payment.due_on
      ? `${late ? text.week.overdue : text.due} ${formatDay(payment.due_on)}`
      : text.noDueDate;

  const toggle = async () => {
    const result = await actions.update(
      "budget_entries",
      payment.id,
      paid ? { status: "due", done_on: null } : { status: "paid", done_on: stamp() },
    );
    setFailure(failureOf(result));
  };

  return (
    <li className="line" data-done={paid || undefined}>
      <div className="line-row">
        <a className="line-main" href={`#/payments/${payment.id}`}>
          <span className="title">{payment.title}</span>
          <span className="meta">
            <span>{payment.amount === null ? text.notSet : formatMoney(payment.amount)}</span>
            <span data-late={late || undefined}>{when}</span>
            {payment.who && <span>{label(payment.who)}</span>}
          </span>
        </a>
        <button type="button" className="action" onClick={toggle}>
          {paid ? text.markUnpaid : text.markPaid}
        </button>
      </div>
      {failure.length > 0 && (
        <p className="error" role="alert">
          {failure.join(" ")}
        </p>
      )}
    </li>
  );
}
