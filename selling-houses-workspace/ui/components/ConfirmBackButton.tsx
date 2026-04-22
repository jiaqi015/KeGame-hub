import React, { useEffect, useRef, useState } from 'react';
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

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
          <div
            ref={panelRef}
            className="w-full max-w-[360px] rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
          >
            <div className="text-[16px] font-semibold text-slate-900">{title}</div>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">
              {description}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-black/8 px-4 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
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
                  className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${
                    action.tone === 'danger'
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : action.tone === 'secondary'
                        ? 'border border-black/8 bg-white text-slate-700 hover:bg-slate-50'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
