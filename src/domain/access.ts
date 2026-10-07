export const isDenied = (search: string) => new URLSearchParams(search).get("access") === "denied";

export const withoutDenied = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete("access");
  return `${url.pathname}${url.search}${url.hash}`;
};
