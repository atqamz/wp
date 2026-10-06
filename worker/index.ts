export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
};
