import React from 'react';

interface LoadingSceneProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  steps?: string[];
}

export function LoadingScene({
  title = '正在加载',
  compact = false,
}: LoadingSceneProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-5">
      <div
        role="status"
        aria-live="polite"
        aria-label={title}
        className={`flex items-center justify-center ${compact ? 'min-h-[220px]' : 'min-h-[420px]'}`}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgba(232,230,222,0.16)] border-t-[var(--seller-ink)]" />
        <span className="sr-only">{title}</span>
      </div>
    </div>
  );
}
