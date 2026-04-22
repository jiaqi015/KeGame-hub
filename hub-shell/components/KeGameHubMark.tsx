import React from 'react';

interface KeGameHubMarkProps {
  className?: string;
  size?: number;
}

export function KeGameHubMark({ className, size = 28 }: KeGameHubMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="6" y="6" width="52" height="52" rx="18" fill="url(#kegame-hub-bg)" />
      <rect x="6.5" y="6.5" width="51" height="51" rx="17.5" stroke="rgba(17,17,17,0.08)" />
      <path
        d="M20 18H27V28.5L38.5 18H48L35.2 29.4L49 46H39.8L30.1 34L27 36.8V46H20V18Z"
        fill="#111111"
      />
      <circle cx="46.5" cy="18.5" r="4.5" fill="#10B981" />
      <path
        d="M42.5 22.5L37 27"
        stroke="#10B981"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="kegame-hub-bg" x1="12" y1="10" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7F8FB" />
          <stop offset="0.55" stopColor="#EEF2FF" />
          <stop offset="1" stopColor="#EAFBF2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
