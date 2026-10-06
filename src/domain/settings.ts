import type { SettingRow } from "../../shared/tables.ts";

export const DEFAULT_ZONE = "Asia/Jakarta";

export const settingKeys = {
  ceremonyDate: "ceremony_date",
  timezone: "timezone",
  partnerA: "partner_a_label",
  partnerB: "partner_b_label",
} as const;

export type Settings = {
  ceremonyDate: string | null;
  timezone: string;
  partnerA: string | null;
  partnerB: string | null;
};

export const readSettings = (rows: readonly SettingRow[]): Settings => {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    ceremonyDate: values.get(settingKeys.ceremonyDate) ?? null,
    timezone: values.get(settingKeys.timezone) ?? DEFAULT_ZONE,
    partnerA: values.get(settingKeys.partnerA) ?? null,
    partnerB: values.get(settingKeys.partnerB) ?? null,
  };
};
