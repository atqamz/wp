import type { ErrorBody } from "../shared/api.ts";
import { createAuthenticator } from "./auth.ts";
import type { AuthEnv } from "./auth.ts";
import { exportData } from "./export.ts";
import { getSync, json, postSync } from "./sync.ts";
import type { Db } from "./sync.ts";

export type Bindings = AuthEnv & { DB: Db };

const JSON_TYPE = /^application\/json\s*(;|$)/i;

const fail = (error: string, status: number, headers: Record<string, string> = {}) =>
  json({ error } satisfies ErrorBody, status, headers);

const notAllowed = (allow: string) => fail("method_not_allowed", 405, { allow });

const refuseUnsafe = (request: Request, origin: string) => {
  if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) return fail("unsupported_media_type", 415);
  const sameOrigin = [null, origin].includes(request.headers.get("origin"));
  const sameSite = [null, "same-origin", "none"].includes(request.headers.get("sec-fetch-site"));
  return sameOrigin && sameSite ? null : fail("forbidden", 403);
};

export const createWorker = (authenticate = createAuthenticator()) => ({
  async fetch(request: Request, env: Bindings): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) return fail("not_found", 404);
      const who = await authenticate(request, env);
      if (who === null) return fail("unauthorized", 401);
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
          if (method !== "POST") return notAllowed("GET, POST");
          return refuseUnsafe(request, url.origin) ?? (await postSync(request, env.DB, who));
        default:
          return fail("not_found", 404);
      }
    } catch (error) {
      console.error("unhandled", error instanceof Error ? error.name : typeof error);
      return fail("internal", 500);
    }
  },
});

export default createWorker();
