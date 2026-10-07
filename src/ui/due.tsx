import { daysBetween } from "../domain/dates.ts";
import { useToday } from "../hooks/use-plan.ts";
import { formatDay } from "./format.ts";
import { Icon } from "./icons.tsx";
import { text } from "./text.ts";

const NEAR_DAYS = 14;

export function Due({ on }: { on: string }) {
  const today = useToday();
  const days = daysBetween(today, on);
  if (days < 0) {
    return (
      <span className="due" data-late>
        <Icon name="late" />
        {text.when.late(-days)}
      </span>
    );
  }
  const near = days === 0 ? text.when.today : days === 1 ? text.when.tomorrow : days <= NEAR_DAYS ? text.when.in(days) : null;
  return <span className="due">{near ? `${formatDay(on, today)} · ${near}` : formatDay(on, today)}</span>;
}
