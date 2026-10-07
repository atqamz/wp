import { zoneSupported } from "../domain/dates.ts";
import { DEFAULT_ZONE } from "../domain/settings.ts";

const locale = new Intl.DateTimeFormat("en-ID").resolvedOptions().locale === "en-ID" ? "en-ID" : "en-GB";

const money = new Intl.NumberFormat("en-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const grouped = new Intl.NumberFormat("id-ID");

const full = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const short = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const shortYear = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const long = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const months = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });

const at = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatMoney = (rupiah: number) =>
  locale === "en-ID" ? money.format(rupiah) : `Rp ${grouped.format(rupiah)}`;

export const formatDate = (date: string) => full.format(at(date));

export const formatDay = (date: string, today?: string) =>
  (today === undefined || date.slice(0, 4) === today.slice(0, 4) ? short : shortYear).format(at(date));

export const formatLong = (date: string) => long.format(at(date));

export const formatMonths = (start: string, end: string) => months.formatRange(at(start), at(end));

export const formatStamp = (instant: string, zone: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zoneSupported(zone) ? zone : DEFAULT_ZONE,
  }).format(new Date(instant));
