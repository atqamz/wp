import { formatMoney } from "./format.ts";

export function Money({ rupiah }: { rupiah: number }) {
  return (
    <span className="amt">
      <span className="cur">Rp</span>&nbsp;{formatMoney(rupiah).replace(/^Rp\s*/, "")}
    </span>
  );
}
