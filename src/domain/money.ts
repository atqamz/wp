export const parseRupiah = (input: string): number | null => {
  const digits = input.trim().replace(/^rp/i, "").replace(/[\s.,]/g, "");
  return /^\d{1,15}$/.test(digits) ? Number(digits) : null;
};
