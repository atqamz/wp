import { useState } from "react";
import type { FormEvent } from "react";
import { parseField } from "../domain/field.ts";
import { bySort } from "../domain/order.ts";
import { useProject } from "../hooks/use-plan.ts";
import { actions, useTable } from "../hooks/use-store.ts";
import { ItemForm } from "../ui/item-form.tsx";
import { PaymentLine } from "../ui/payment-line.tsx";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";
import { Gone } from "./generic-item.tsx";

export function BudgetLine({ id }: { id: string }) {
  const entries = useTable("budget_entries");
  const project = useProject();
  const [errors, setErrors] = useState<string[]>([]);
  const line = entries.find((entry) => entry.id === id && entry.entry_type === "planned");
  if (!line) return <Gone name="planned" id={id} back="#/budget" />;
  const payments = entries.filter((entry) => entry.entry_type === "payment" && entry.budget_id === id).sort(bySort);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = parseField("int", String(data.get("amount") ?? ""));
    if (!amount.ok || amount.value === null || !project) return setErrors([text.invalid.int]);
    const result = await actions.create("budget_entries", {
      entry_type: "payment",
      title: String(data.get("title") ?? "").trim() || line.title,
      budget_id: line.id,
      project_id: project.id,
      status: "due",
      amount: amount.value as number,
      currency: line.currency,
      due_on: String(data.get("due_on") ?? "") || null,
      sort: payments.length,
    });
    if (result.ok) {
      form.reset();
      setErrors([]);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <>
      <Title>{line.title}</Title>
      <ItemForm key={line.id} name="planned" row={line} />
      <section aria-labelledby="payments">
        <h2 id="payments">{text.budget.payments}</h2>
        {payments.length === 0 ? (
          <p className="empty">{text.empty.payments}</p>
        ) : (
          <ul className="lines">
            {payments.map((payment) => (
              <PaymentLine key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
        <form className="form" onSubmit={add}>
          <h3>{text.budget.addPayment}</h3>
          <div className="field">
            <label htmlFor="payment-title">{text.budget.paymentLabel}</label>
            <input id="payment-title" name="title" maxLength={500} autoComplete="off" placeholder={line.title} />
          </div>
          <div className="field">
            <label htmlFor="payment-amount">{text.budget.amountLabel}</label>
            <input id="payment-amount" name="amount" required inputMode="numeric" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="payment-due">{text.field.common.due_on}</label>
            <input id="payment-due" name="due_on" type="date" />
          </div>
          {errors.length > 0 && (
            <p className="error" role="alert">
              {errors.join(" ")}
            </p>
          )}
          <div className="form-actions">
            <button type="submit">{text.add}</button>
          </div>
        </form>
      </section>
      <p className="trail">
        <a href="#/budget">{text.back}</a>
      </p>
    </>
  );
}
