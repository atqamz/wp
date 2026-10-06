import type { ItemRow } from "../../shared/tables.ts";
import { whatsappUrl } from "../domain/phone.ts";
import { usePartner, useStamp, useToday } from "../hooks/use-plan.ts";
import { actions } from "../hooks/use-store.ts";
import { formatDay, formatMoney } from "./format.ts";
import { optionLabel } from "./labels.ts";
import { firstStatus, views } from "./registry.ts";
import type { View, ViewName } from "./registry.ts";
import { text } from "./text.ts";

export function ItemLine({ name, row }: { name: ViewName; row: ItemRow }) {
  const view: View = views[name];
  const { me, label } = usePartner();
  const today = useToday();
  const stamp = useStamp();
  const done = view.done !== undefined && row.status === view.done;
  const phone = typeof row.data?.phone === "string" ? row.data.phone : null;

  const toggle = () =>
    actions.update("items", row.id, done ? { status: firstStatus(name), done_on: null } : { status: view.done, done_on: stamp() });

  const piece = (field: string) => {
    const value = field.startsWith("data.") ? row.data?.[field.slice(5)] : row[field as keyof ItemRow];
    if (field === "who") return label(row.who);
    if (value === null || value === undefined || value === "") return null;
    if (field === "due_on") return `${text.due} ${formatDay(String(value))}`;
    if (field === "amount") return formatMoney(Number(value));
    if (field === "qty") return text.people(Number(value));
    if (field === "status") return optionLabel(name, field, String(value), label);
    return String(value);
  };
  const late = row.due_on !== null && row.due_on < today && !done;

  return (
    <li className="line" data-done={done || undefined}>
      <div className="line-row">
        {view.done !== undefined && (
          <label className="check">
            <input type="checkbox" checked={done} onChange={toggle} />
            <span className="visually-hidden">{done ? text.reopen(row.title) : text.complete(row.title)}</span>
          </label>
        )}
        <a className="line-main" href={`#/${view.route}/${row.id}`}>
          <span className="title">{row.title}</span>
          <span className="meta">
            {view.summary.map((field) => {
              const shown = piece(field);
              return shown === null ? null : (
                <span key={field} data-late={(field === "due_on" && late) || undefined}>
                  {shown}
                </span>
              );
            })}
          </span>
        </a>
        {view.assignable && row.who === null && me && !done && (
          <button type="button" className="action" onClick={() => actions.update("items", row.id, { who: me })}>
            {text.takeIt}
          </button>
        )}
      </div>
      {phone && (
        <div className="line-links">
          <a href={`tel:${phone}`}>{text.call}</a>
          <a href={whatsappUrl(phone)} rel="noopener noreferrer">
            {text.whatsapp}
          </a>
        </div>
      )}
    </li>
  );
}
