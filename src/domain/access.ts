export const isDenied = (search: string) => new URLSearchParams(search).get("access") === "denied";

export const withoutDenied = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete("access");
  return `${url.pathname}${url.search}${url.hash}`;
};

export const takeDenied = (where: { search: string; href: string }, history: { state: unknown; replaceState(state: unknown, title: string, url: string): void }) => {
  if (!isDenied(where.search)) return false;
  history.replaceState(history.state, "", withoutDenied(where.href));
  return true;
};
