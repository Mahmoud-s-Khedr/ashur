import React from 'react';

type P = React.SVGProps<SVGSVGElement> & { size?: number | string };
const base = (size?: number | string): React.SVGProps<SVGSVGElement> => ({
  width: size ?? '1em',
  height: size ?? '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': true,
  focusable: false,
});

export const Trophy = ({ size, ...p }: P) => (
  <svg {...base(size)} viewBox="0 0 64 64" {...p}>
    <defs>
      <linearGradient id="tg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#fff2a8" />
        <stop offset=".45" stopColor="#ffc65a" />
        <stop offset="1" stopColor="#d98a1c" />
      </linearGradient>
    </defs>
    <path
      d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16V8Z"
      fill="url(#tg)"
      stroke="#9a5e0a"
      strokeWidth="1.5"
    />
    <path
      d="M18 12H9c0 10 4 15 11 16M46 12h9c0 10-4 15-11 16"
      stroke="url(#tg)"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path d="M28 38h8v8h-8z" fill="url(#tg)" stroke="#9a5e0a" strokeWidth="1.5" />
    <path d="M20 46h24l3 10H17l3-10Z" fill="url(#tg)" stroke="#9a5e0a" strokeWidth="1.5" />
    <path
      d="M24 12v10c0 5 2 9 6 11"
      stroke="#fff8d0"
      strokeWidth="2.5"
      strokeLinecap="round"
      opacity=".7"
    />
    <path
      d="M32 14l2 4.5 5 .6-3.7 3.3 1 4.9-4.3-2.5-4.3 2.5 1-4.9L25 19.100l5-.6 2-4.5Z"
      fill="#fff8d0"
      opacity=".85"
    />
  </svg>
);

export const Crown = ({ size, ...p }: P) => (
  <svg {...base(size)} viewBox="0 0 64 48" {...p}>
    <path
      d="M6 40 3 12l16 14L32 6l13 20L61 12l-3 28H6Z"
      fill="#ffc65a"
      stroke="#9a5e0a"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="3" cy="11" r="3" fill="#fff2a8" />
    <circle cx="32" cy="5" r="3.4" fill="#fff2a8" />
    <circle cx="61" cy="11" r="3" fill="#fff2a8" />
    <rect x="6" y="40" width="52" height="6" rx="2" fill="#d98a1c" />
  </svg>
);

export const Flame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path
      d="M12 2c1 4 5 5.500 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-4-1-6 1-9.500Z"
      fill="#ff8a3c"
      stroke="#ffd36a"
      strokeWidth="1"
    />
    <path
      d="M12 21a2.500 2.500 0 0 0 2.500-2.500c0-1.500-1.500-2-2.500-4-1 2-2.500 2.500-2.500 4A2.500 2.500 0 0 0 12 21Z"
      fill="#ffe48a"
    />
  </svg>
);

export const Bolt = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path
      d="M13.500 2 5 13.500h6L10 22l9-12.500h-6.500L13.500 2Z"
      fill="#ffd54a"
      stroke="#c98d00"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path
      d="m4.500 12.500 5 5L19.500 7"
      stroke="currentColor"
      strokeWidth="3.200"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Cross = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path
      d="m6 6 12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth="3.200"
      strokeLinecap="round"
    />
  </svg>
);

export const Pause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1.200" fill="currentColor" />
    <rect x="14" y="4" width="4" height="16" rx="1.200" fill="currentColor" />
  </svg>
);

export const Joker = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect
      x="4"
      y="2.500"
      width="16"
      height="19"
      rx="3"
      fill="#2a1450"
      stroke="#c58bff"
      strokeWidth="1.500"
    />
    <path
      d="m12 6.500 1.600 3.300 3.600.5-2.600 2.500.6 3.600-3.200-1.700-3.200 1.700.6-3.600-2.600-2.500 3.600-.5L12 6.500Z"
      fill="#ffd54a"
    />
  </svg>
);

export const Clock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 8.500V13l3 2M9 2.500h6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="10.500" width="14" height="10" rx="2.500" fill="currentColor" />
    <path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const ArrowUp = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m12 5 7 9H5l7-9Z" fill="currentColor" />
  </svg>
);
export const ArrowDown = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m12 19-7-9h14l-7 9Z" fill="currentColor" />
  </svg>
);

export const Spark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path
      d="M12 2c.8 5.500 3.500 8.200 10 10-6.500 1.800-9.200 4.500-10 10-.8-5.500-3.500-8.200-10-10 6.500-1.800 9.200-4.500 10-10Z"
      fill="currentColor"
    />
  </svg>
);

export const Card = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2.500" stroke="currentColor" strokeWidth="2" />
    <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
