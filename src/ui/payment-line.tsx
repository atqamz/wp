import type { BudgetEntryRow } from "../../shared/tables.ts";
import { usePartner, useToday } from "../hooks/use-plan.ts";
import { actions } from "../hooks/use-store.ts";
import { formatDate, formatDay, formatMoney } from "./format.ts";
import { text } from "./text.ts";

export function PaymentLine({ payment }: { payment: BudgetEntryRow }) {
  const today = useToday();
  const { label } = usePartner();
  const paid = payment.status === "paid";
  const late = !paid && payment.due_on !== null && payment.due_on < today;
  const when = paid
    ? payment.done_on
      ? `${text.paidOn} ${formatDate(payment.done_on)}`
      : text.option.status.paid
    : payment.due_on
      ? `${text.due} ${formatDay(payment.due_on)}`
      : text.noDueDate;

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
        <button
          type="button"
          className="action"
          onClick={() =>
            actions.update("budget_entries", payment.id, paid ? { status: "due", done_on: null } : { status: "paid", done_on: today })
          }
        >
          {paid ? text.markUnpaid : text.markPaid}
        </button>
      </div>
    </li>
  );
}
