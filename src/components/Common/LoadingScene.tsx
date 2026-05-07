import React from 'react';

interface LoadingSceneProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  steps?: string[];
}

export function LoadingScene({
  title = '正在加载',
  subtitle = '本地进度先恢复，云端与方案库在后台更新，减少首屏阻塞。',
  compact = false,
}: LoadingSceneProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-5">
      <div
        role="status"
        aria-live="polite"
        aria-label={title}
        className={`flex flex-col items-center justify-center gap-4 text-center ${compact ? 'min-h-[220px]' : 'min-h-[420px]'}`}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgba(232,230,222,0.16)] border-t-[var(--seller-ink)]" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--seller-ink)]">{title}</p>
          <p className="max-w-[280px] text-xs leading-5 text-[var(--seller-muted)]">{subtitle}</p>
        </div>
        <span className="sr-only">{title}</span>
      </div>
    </div>
  );
}
