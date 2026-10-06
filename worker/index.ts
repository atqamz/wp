import { createAuthenticator } from "./auth.ts";
import type { AuthEnv } from "./auth.ts";
import { exportData } from "./export.ts";
import { getSync, json, postSync } from "./sync.ts";
import type { Db } from "./sync.ts";

export type Bindings = AuthEnv & { DB: Db };

const notAllowed = (allow: string) => json({ error: "method_not_allowed" }, 405, { allow });

export const createWorker = (authenticate = createAuthenticator()) => ({
  async fetch(request: Request, env: Bindings): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
      const who = await authenticate(request, env);
      if (who === null) return json({ error: "unauthorized" }, 401);
      const { method } = request;
      switch (url.pathname) {
        case "/api/health":
          return method === "GET" ? json({ ok: true }) : notAllowed("GET");
        case "/api/login":
          return method === "GET" ? new Response(null, { status: 302, headers: { location: "/", "cache-control": "no-store" } }) : notAllowed("GET");
        case "/api/export":
          return method === "GET" ? await exportData(url, env.DB) : notAllowed("GET");
        case "/api/sync":
          if (method === "GET") return await getSync(url, env.DB, who);
          return method === "POST" ? await postSync(request, env.DB, who) : notAllowed("GET, POST");
        default:
          return json({ error: "not_found" }, 404);
      }
    } catch (error) {
      console.error("unhandled", error instanceof Error ? error.name : typeof error);
      return json({ error: "internal" }, 500);
    }
  },
});

export default createWorker();
