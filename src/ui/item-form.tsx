import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BudgetEntryRow, ItemRow } from "../../shared/tables.ts";
import { EVENT_ORDER } from "../domain/budget.ts";
import { parseField } from "../domain/field.ts";
import { useBusy } from "../hooks/use-busy.ts";
import { usePartner, useStamp } from "../hooks/use-plan.ts";
import { actions, useTable } from "../hooks/use-store.ts";
import { failureOf } from "./failure.ts";
import { Field } from "./field.tsx";
import type { Control } from "./field.tsx";
import { fieldLabel, optionLabel } from "./labels.ts";
import { fieldOptions, fieldType, isRequired, views } from "./registry.ts";
import type { View, ViewName } from "./registry.ts";
import { text } from "./text.ts";

type Row = ItemRow | BudgetEntryRow;

type Value = string | number | boolean | null;

const valueOf = (row: Row, field: string) =>
  (field.startsWith("data.") ? (row.data?.[field.slice(5)] ?? null) : (row[field as keyof Row] ?? null)) as Value;

export const backHref = (name: ViewName, row: Row) =>
  name === "payment" ? `#/budget/${(row as BudgetEntryRow).budget_id}` : `#/${views[name].route}`;

export function ItemForm({ name, row }: { name: ViewName; row: Row }) {
  const view: View = views[name];
  const [initial] = useState(row);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string[]>([]);
  const { busy, once } = useBusy();
  const { label } = usePartner();
  const stamp = useStamp();
  const siblings = useTable(view.table);

  const controls = useMemo(() => {
    const used = new Set(
      (siblings as Row[])
        .filter((other) => ("kind" in other ? other.kind : other.entry_type) === view.variant)
        .flatMap((other) => (other.group_key ? [other.group_key] : [])),
    );
    const title: Control = { name: "title", label: text.field.common.title, type: "text", required: true, value: row.title };
    const rest = view.fields.map((field): Control => {
      const options = fieldOptions(name, field);
      const grouped = field === "group_key";
      const events = grouped && name === "planned" ? [...new Set([...EVENT_ORDER, ...used])] : null;
      return {
        name: field,
        label: fieldLabel(name, field),
        type: fieldType(name, field),
        value: valueOf(row, field),
        required: isRequired(name, field),
        blank: field === "who" ? text.unassigned : text.notSet,
        hint: field === "amount" ? text.amountHint : undefined,
        options: (events ?? options)?.map((value) => ({
          value,
          label: events ? (text.event[value as keyof typeof text.event] ?? value) : optionLabel(name, field, value, label),
        })),
        suggestions: grouped && !events ? [...used] : undefined,
      };
    });
    return [title, ...rest];
  }, [row, siblings, name, view, label]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return once(() => store(form));
  };

  const store = async (form: FormData) => {
    const change: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};
    const invalid: Record<string, string> = {};
    for (const control of controls) {
      const raw = control.type === "bool" ? form.get(control.name) !== null : String(form.get(control.name) ?? "");
      const parsed = parseField(control.type, raw);
      if (!parsed.ok) {
        invalid[control.name] = text.invalid[control.type as "phone" | "int"];
        continue;
      }
      if (parsed.value === valueOf(initial, control.name)) continue;
      if (control.name.startsWith("data.")) data[control.name.slice(5)] = parsed.value;
      else change[control.name] = parsed.value;
    }
    setErrors(invalid);
    setFailure([]);
    if (Object.keys(invalid).length > 0) return;
    if (view.done !== undefined && "status" in change) change.done_on = change.status === view.done ? stamp() : null;
    if (Object.keys(data).length > 0) change.data = data;
    const result = await actions.update(view.table, row.id, change as never);
    if (result.ok) location.hash = backHref(name, row).slice(1);
    else setFailure(failureOf(result));
  };

  const remove = () =>
    once(async () => {
      const result = await actions.remove(view.table, row.id);
      setFailure(failureOf(result));
    });

  return (
    <form className="form" onSubmit={save}>
      {controls.map((control) => (
        <Field key={control.name} control={control} error={errors[control.name]} />
      ))}
      {failure.length > 0 && (
        <p className="error" role="alert">
          {failure.join(" ")}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {text.save}
        </button>
        <a className="button secondary" href={backHref(name, row)}>
          {text.cancel}
        </a>
        <button type="button" className="danger" disabled={busy} onClick={remove}>
          {text.delete}
        </button>
      </div>
    </form>
  );
}
