const paths = {
  home: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
  money: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17.5 14.2c2.6.3 4 2.2 4 5.3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  late: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v5M12 16h.01" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.2-1.5 1.2-2-1.5L6 20.5z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  call: <path d="M7 3.5h2.6l1.4 4-2 1.6a11.5 11.5 0 0 0 5.9 5.9l1.6-2 4 1.4V17a2.5 2.5 0 0 1-2.5 2.5C10.6 19.5 4.5 13.4 4.5 6A2.5 2.5 0 0 1 7 3.5z" />,
  chat: (
    <>
      <path d="M4.2 19.8 5.3 16A8.2 8.2 0 1 1 8.4 19z" />
      <path d="M9.3 8.6c.2 2.9 2.6 5.5 5.6 5.9l1-1.4-1.9-1-.9.8a5 5 0 0 1-2.2-2.2l.8-.9-1-1.9z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
