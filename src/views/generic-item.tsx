import { actions, useTable } from "../hooks/use-store.ts";
import { ItemForm, backHref } from "../ui/item-form.tsx";
import { views } from "../ui/registry.ts";
import type { ViewName } from "../ui/registry.ts";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

export function Gone({ name, id, back }: { name: ViewName; id: string; back: string }) {
  return (
    <>
      <Title>{text.gone}</Title>
      <div className="form-actions">
        <button type="button" onClick={() => actions.update(views[name].table, id, { deleted_at: null } as never)}>
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
