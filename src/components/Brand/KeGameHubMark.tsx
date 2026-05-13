import React from 'react';

interface KeGameHubMarkProps {
  className?: string;
  size?: number;
  /** 深色/连续背景上只用图，不套外沿黑方角（避免和卡片黑底糊在一起） */
  unframed?: boolean;
}

/**
 * 贝壳 + 手柄 组合标识（透明底，资源：/public/kegame-logo.fg.png）
 */
export function KeGameHubMark({ className, size = 28, unframed = false }: KeGameHubMarkProps) {
  const img = (
    <span className="relative block h-full w-full">
      <FallbackKeGameMark />
      <img
        src="/kegame-logo.fg.png?v=4"
        alt=""
        className="absolute inset-0 h-full w-full object-contain select-none"
        draggable={false}
        width={size}
        height={size}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </span>
  );

  if (unframed) {
    return (
      <span
        className={`inline-block shrink-0 ${className ?? ''}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {img}
      </span>
    );
  }

  const pad = Math.max(1, Math.floor(size * 0.12));
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0a0a0a] ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        padding: pad,
      }}
      aria-hidden
    >
      {img}
    </span>
  );
}

function FallbackKeGameMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full text-white" fill="none" aria-hidden="true">
      <path
        d="M32 10C21 10 12 18.9 12 29.8c0 10.3 7.8 18.8 17.8 19.7l-3.5 4.3h11.4l-3.5-4.3C44.2 48.6 52 40.1 52 29.8 52 18.9 43 10 32 10Z"
        fill="currentColor"
      />
      <path d="M21.2 28.2h8.2v8.2h5.2v-8.2h8.2V23h-8.2v-8.2h-5.2V23h-8.2v5.2Z" fill="#050505" />
      <circle cx="41.5" cy="35.5" r="2.6" fill="#050505" />
      <circle cx="47.2" cy="31.5" r="2.6" fill="#050505" />
      <circle cx="47.2" cy="39.6" r="2.6" fill="#050505" />
    </svg>
  );
}
