import { useEffect, useState } from "react";
import { actions, useTable } from "../hooks/use-store.ts";
import { failureOf } from "../ui/failure.ts";
import { ItemForm, backHref } from "../ui/item-form.tsx";
import { views } from "../ui/registry.ts";
import type { ViewName } from "../ui/registry.ts";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

export function Gone({ name, id, back }: { name: ViewName; id: string; back: string }) {
  const [failure, setFailure] = useState<string[]>([]);
  useEffect(() => document.querySelector<HTMLElement>("h1")?.focus(), []);
  const undo = async () => setFailure(failureOf(await actions.update(views[name].table, id, { deleted_at: null } as never)));
  return (
    <>
      <Title>{text.gone}</Title>
      {failure.length > 0 && (
        <p className="error" role="alert">
          {failure.join(" ")}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={undo}>
          {text.undo}
        </button>
        <a className="button secondary" href={back}>
          {text.back}
        </a>
      </div>
    </>
  );
}

export function GenericItem({ name, id }: { name: ViewName; id: string }) {
  const view = views[name];
  const rows = useTable(view.table);
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return <Gone name={name} id={id} back={`#/${view.route === "payments" ? "budget" : view.route}`} />;
  return (
    <>
      <Title>{row.title}</Title>
      <ItemForm key={row.id} name={name} row={row} />
      <p className="trail">
        <a href={backHref(name, row)}>{text.back}</a>
      </p>
    </>
  );
}
