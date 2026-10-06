import { useEffect, useState } from "react";

export type Health = "pending" | "ok" | "down";

export function useHealth(): Health {
  const [health, setHealth] = useState<Health>("pending");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((body: { ok?: boolean }) => setHealth(body.ok ? "ok" : "down"))
      .catch(() => setHealth("down"));
  }, []);
  return health;
}
