const E164 = /^\+[1-9]\d{6,14}$/;

export const normalizePhone = (input: string): string | null => {
  const compact = input.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  const international = compact.startsWith("+")
    ? compact
    : compact.startsWith("00")
      ? `+${compact.slice(2)}`
      : compact.startsWith("0")
        ? `+62${compact.slice(1)}`
        : compact.startsWith("62")
          ? `+${compact}`
          : "";
  const phone = international.replace(/^\+620/, "+62");
  return E164.test(phone) ? phone : null;
};

export const whatsappUrl = (phone: string) => `https://wa.me/${phone.slice(1)}`;
