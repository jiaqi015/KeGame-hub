import React from 'react';

interface LoadingSceneProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  steps?: string[];
}

export function LoadingScene({
  title = '正在初始化',
  subtitle = '读取场景、校验状态、准备工作台…',
  compact = false,
  steps = ['读取数据', '同步状态', '装配界面'],
}: LoadingSceneProps) {
  return (
    <div className="selling-houses-shell relative flex h-full w-full items-center justify-center overflow-hidden px-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_28%,rgba(74,227,138,0.10),transparent_24%),radial-gradient(circle_at_74%_68%,rgba(102,209,224,0.06),transparent_24%)]" />

      <div
        role="status"
        aria-live="polite"
        className={`relative w-full ${compact ? 'max-w-[520px]' : 'max-w-[640px]'}`}
      >
        <div className="seller-panel-muted rounded-[24px] p-5 backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[var(--seller-paper)]">
              <div className="absolute inset-0 rounded-[16px] border border-[var(--seller-border)] animate-[ping_1.8s_ease-out_infinite]" />
              <div className="relative h-3 w-3 rounded-full bg-[var(--seller-accent)] shadow-[0_0_0_6px_rgba(74,227,138,0.14)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className={`seller-title ${compact ? 'text-[17px]' : 'text-[20px]'}`}>
                  {title}
                </div>
                <span className="seller-chip">
                  正在准备
                </span>
              </div>
              <div className="seller-body mt-1 text-[12px] leading-5">
                {subtitle}
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <div className="h-2 w-1/2 rounded-full bg-[linear-gradient(90deg,rgba(74,227,138,0.18),rgba(74,227,138,0.82),rgba(102,209,224,0.32))] animate-[loading-slide_1.45s_ease-in-out_infinite]" />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={`${step}-${index}`}
                className="seller-tablet px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    index === 0 ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]' : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-subtle)]'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--seller-ink)]">{step}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[16px] border border-[var(--seller-border)] bg-[rgba(15,23,32,0.86)] px-3 py-2 text-[11px] leading-5 text-[var(--seller-muted)]">
            正在准备当前页面。网络慢时会多等几秒，不需要刷新。
          </div>
        </div>
      </div>
    </div>
  );
}
