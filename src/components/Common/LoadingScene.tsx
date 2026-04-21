import React from 'react';

interface LoadingSceneProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  steps?: string[];
}

export function LoadingScene({
  title = '正在初始化',
  subtitle = '先打开本地工作台，再在后台检查云端进度。',
  compact = false,
  steps = ['读取本地进度', '装配页面骨架', '后台检查云端更新'],
}: LoadingSceneProps) {
  return (
    <div className="selling-houses-shell relative flex h-full w-full items-center justify-center overflow-hidden px-5">
      <div
        role="status"
        aria-live="polite"
        className={`relative w-full ${compact ? 'max-w-[520px]' : 'max-w-[640px]'}`}
      >
        <div className="seller-panel-muted rounded-[20px] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--seller-accent)] shadow-[0_0_0_4px_rgba(74,227,138,0.08)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className={`seller-title ${compact ? 'text-[17px]' : 'text-[20px]'}`}>
                  {title}
                </div>
                <span className="seller-chip">
                  本地优先
                </span>
              </div>
              <div className="seller-body mt-1 text-[12px] leading-5">
                {subtitle}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={`${step}-${index}`}
                className="seller-tablet px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    index < 2 ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]' : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-subtle)]'
                  }`}>
                    {index < 2 ? '✓' : index + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--seller-ink)]">{step}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[16px] border border-[var(--seller-border)] bg-[rgba(15,23,32,0.86)] px-3 py-2 text-[11px] leading-5 text-[var(--seller-muted)]">
            减少首屏阻塞：先打开本地进度；云端更新和续局检查会在后台完成，不需要盯着加载页等。
          </div>
        </div>
      </div>
    </div>
  );
}
