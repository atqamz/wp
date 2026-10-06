const FORMS = [/^(\d+)(?:[.,]0{1,2})?$/, /^(\d{1,3}(?:\.\d{3})+)(?:,0{1,2})?$/, /^(\d{1,3}(?:,\d{3})+)(?:\.0{1,2})?$/];

export const parseRupiah = (input: string): number | null => {
  const text = input.trim().replace(/^rp\s*/i, "");
  for (const form of FORMS) {
    const match = form.exec(text);
    if (match) {
      const digits = match[1].replace(/\D/g, "");
      return digits.length <= 15 ? Number(digits) : null;
    }
  }
  return null;
};
