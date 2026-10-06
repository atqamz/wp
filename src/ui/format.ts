const locale = new Intl.DateTimeFormat("en-ID").resolvedOptions().locale === "en-ID" ? "en-ID" : "en-GB";

const money = new Intl.NumberFormat("en-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const grouped = new Intl.NumberFormat("id-ID");

const full = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const short = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const at = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatMoney = (rupiah: number) =>
  locale === "en-ID" ? money.format(rupiah) : `Rp ${grouped.format(rupiah)}`;

export const formatDate = (date: string) => full.format(at(date));

export const formatDay = (date: string) => short.format(at(date));
