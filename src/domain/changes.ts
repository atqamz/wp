const technical = new Set([
  "id",
  "key",
  "kind",
  "entry_type",
  "budget_id",
  "vendor_id",
  "parent_id",
  "currency",
  "sort",
  "created_at",
  "updated_at",
]);

export const changedValues = (patch: Record<string, unknown>): [string, unknown][] =>
  Object.entries(patch)
    .flatMap(([field, value]): [string, unknown][] =>
      field === "data" && typeof value === "object" && value !== null
        ? Object.entries(value).map(([key, inner]): [string, unknown] => [`data.${key}`, inner])
        : [[field, value]],
    )
    .filter(([field]) => !technical.has(field));
