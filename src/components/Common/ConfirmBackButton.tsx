import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

type ConfirmBackAction = {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'danger' | 'secondary';
};

interface ConfirmBackButtonProps {
  onConfirm?: () => void;
  actions?: ConfirmBackAction[];
  buttonClassName?: string;
  buttonLabel?: string;
  title?: string;
  description?: string;
}

export function ConfirmBackButton({
  onConfirm,
  actions,
  buttonClassName = 'inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]',
  buttonLabel = '返回',
  title = '确认返回？',
  description = '将离开当前功能页，回到功能入口。',
}: ConfirmBackButtonProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resolvedActions = actions && actions.length > 0
    ? actions
    : onConfirm
      ? [{ label: '确认返回', onClick: onConfirm, tone: 'primary' as const }]
      : [];
  const overlay = open && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(3,7,12,0.68)] p-6 backdrop-blur-md">
      <div
        ref={panelRef}
        className="w-full max-w-[460px] rounded-[24px] border border-[var(--seller-border-strong)] bg-[var(--seller-paper)] p-5 shadow-[var(--seller-shadow-lg)]"
      >
        <div className="text-[16px] font-semibold text-[var(--seller-ink)]">{title}</div>
        <p className="mt-2 text-[13px] leading-6 text-[var(--seller-muted)]">
          {description}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="whitespace-nowrap rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[12px] font-semibold text-[var(--seller-muted)] transition hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[var(--seller-ink)]"
          >
            取消
          </button>
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-semibold transition ${
                action.tone === 'danger'
                  ? 'border border-[color-mix(in_srgb,var(--seller-risk)_42%,var(--seller-border)_58%)] bg-[var(--seller-risk-soft)] text-[var(--seller-risk)] hover:bg-[rgba(240,107,107,0.18)]'
                  : action.tone === 'secondary'
                    ? 'border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-ink)] hover:bg-[rgba(255,255,255,0.08)]'
                    : 'border border-[color-mix(in_srgb,var(--seller-accent)_50%,var(--seller-border)_50%)] bg-[var(--seller-accent)] text-[var(--seller-bg)] hover:bg-[color-mix(in_srgb,var(--seller-accent)_88%,white_12%)]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={buttonClassName}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {buttonLabel}
      </button>

      {overlay}
    </>
  );
}
