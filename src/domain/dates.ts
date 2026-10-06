const DAY = 86_400_000;

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

export const addDays = (date: string, days: number) => new Date(utc(date) + days * DAY).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) => (utc(to) - utc(from)) / DAY;

export const daysUntil = (date: string | null, today: string) => (date === null ? null : daysBetween(today, date));

export const todayIn = (now: Date, zone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};
