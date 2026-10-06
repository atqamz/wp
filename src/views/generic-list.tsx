import { useMemo } from "react";
import { headcount } from "../domain/guests.ts";
import { bySort } from "../domain/order.ts";
import { usePartner } from "../hooks/use-plan.ts";
import { useTable } from "../hooks/use-store.ts";
import { ItemLine } from "../ui/item-line.tsx";
import { QuickAdd } from "../ui/quick-add.tsx";
import { statusRank, views } from "../ui/registry.ts";
import type { ListName, ViewName } from "../ui/registry.ts";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

export function GenericList({ name }: { name: ListName }) {
  const items = useTable("items");
  const { label } = usePartner();
  const rows = useMemo(
    () =>
      items
        .filter((item) => item.kind === name)
        .sort((a, b) => statusRank(name as ViewName, a.status) - statusRank(name as ViewName, b.status) || bySort(a, b)),
    [items, name],
  );
  const count = useMemo(() => (name === "guest" ? headcount(rows) : null), [rows, name]);

  return (
    <>
      <Title>{text.nav[views[name].route]}</Title>
      {count && (
        <dl className="totals">
          {(["a", "b"] as const).map((side) => (
            <div key={side}>
              <dt>{label(side)}</dt>
              <dd>{text.people(count[side].people)}</dd>
            </div>
          ))}
          {count.none.guests > 0 && (
            <div>
              <dt>{text.unassigned}</dt>
              <dd>{text.people(count.none.people)}</dd>
            </div>
          )}
        </dl>
      )}
      <QuickAdd name={name} />
      {rows.length === 0 ? (
        <p className="empty">{text.empty[name]}</p>
      ) : (
        <ul className="lines">
          {rows.map((row) => (
            <ItemLine key={row.id} name={name} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}
