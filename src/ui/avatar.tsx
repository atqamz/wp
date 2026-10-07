import type { Side } from "../../shared/api.ts";
import { usePartner } from "../hooks/use-plan.ts";

const initials = (name: string) => {
  const [first = "", second = ""] = Array.from(name.trim());
  return `${first.toUpperCase()}${second.toLowerCase()}`;
};

export function Avatar({ side }: { side: Side | null }) {
  const { label } = usePartner();
  return (
    <span className="av" data-side={side ?? "none"} aria-hidden="true">
      {side === null ? null : initials(label(side))}
    </span>
  );
}

export function Pair() {
  return (
    <span className="avs">
      <Avatar side="a" />
      <Avatar side="b" />
    </span>
  );
}

export function Who({ side }: { side: string | null }) {
  const { label } = usePartner();
  return (
    <span className="who">
      {side === "both" ? <Pair /> : <Avatar side={side === "a" || side === "b" ? side : null} />}
      {label(side)}
    </span>
  );
}
