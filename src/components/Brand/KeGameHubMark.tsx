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
    <img
      src="/kegame-logo.fg.png?v=1"
      alt=""
      className="h-full w-full object-contain select-none"
      draggable={false}
      width={size}
      height={size}
    />
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
