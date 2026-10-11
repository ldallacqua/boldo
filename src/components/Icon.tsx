import type { ReactNode } from 'react';
import { asset } from '../lib/config';

const PATHS = {
  leaf: (
    <>
      <path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14Z" />
      <path d="M5 19 13.5 10.5" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pill: (
    <>
      <rect x="2.8" y="8" width="18.4" height="8" rx="4" transform="rotate(-45 12 12)" />
      <path d="m9.2 9.2 5.6 5.6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
    </>
  ),
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />,
  logout: <path d="M14 4.5h4.5v15H14M10.5 8 6.5 12l4 4M6.5 12H15" />,
  edit: <path d="m5 19 .8-3.8L16.5 4.5l3 3L8.8 18.2 5 19ZM14.5 6.5l3 3" />,
  scan: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.8M12 16.1v.1" />
    </>
  ),
  chevron: <path d="m9.5 6 6 6-6 6" />,
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** O ícone do app: o Boldinho em um quadrado creme. */
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <img
      className="marca"
      src={asset('icons/icon-192.png')}
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}
