import { useMemo } from "react";
import { daysUntil } from "../domain/dates.ts";
import { thisWeek } from "../domain/week.ts";
import type { WeekEntry } from "../domain/week.ts";
import { useSettings, useToday } from "../hooks/use-plan.ts";
import { useTable } from "../hooks/use-store.ts";
import { ItemLine } from "../ui/item-line.tsx";
import { PaymentLine } from "../ui/payment-line.tsx";
import { QuickAdd } from "../ui/quick-add.tsx";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

function Entries({ id, heading, entries }: { id: string; heading: string; entries: WeekEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>
        {heading} <span className="count">{entries.length}</span>
      </h2>
      <ul className="lines">
        {entries.map((entry) =>
          entry.type === "task" ? (
            <ItemLine key={entry.row.id} name="task" row={entry.row} />
          ) : (
            <PaymentLine key={entry.row.id} payment={entry.row} />
          ),
        )}
      </ul>
    </section>
  );
}

export function Home() {
  const items = useTable("items");
  const entries = useTable("budget_entries");
  const { ceremonyDate } = useSettings();
  const today = useToday();
  const week = useMemo(() => thisWeek(items, entries, today), [items, entries, today]);
  const days = daysUntil(ceremonyDate, today);
  const empty = week.overdue.length + week.soon.length + week.undated.length === 0;

  return (
    <>
      <Title>{text.nav.week}</Title>
      {days === null ? (
        <a className="countdown" href="#/settings">
          {text.countdown.unset}
        </a>
      ) : (
        <p className="countdown">{text.countdown.days(days)}</p>
      )}
      <QuickAdd name="task" />
      {empty && <p className="empty">{text.week.empty}</p>}
      <Entries id="week-overdue" heading={text.week.overdue} entries={week.overdue} />
      <Entries id="week-soon" heading={text.week.soon} entries={week.soon} />
      {week.undated.length > 0 && (
        <section aria-labelledby="week-undated">
          <h2 id="week-undated">
            {text.week.undated} <span className="count">{week.undated.length}</span>
          </h2>
          <ul className="lines">
            {week.undated.map((row) => (
              <ItemLine key={row.id} name="task" row={row} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
