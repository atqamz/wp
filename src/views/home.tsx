import { useHealth } from "../hooks/use-health.ts";
import { text } from "../ui/text.ts";

const label = { pending: text.healthPending, ok: text.healthOk, down: text.healthDown };

export function Home() {
  const health = useHealth();
  return (
    <main>
      <h1>{text.appName}</h1>
      <p>
        {text.health}: <strong data-health={health}>{label[health]}</strong>
      </p>
    </main>
  );
}
