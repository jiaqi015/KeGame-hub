import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface ConfirmBackButtonProps {
  onConfirm: () => void;
  buttonClassName?: string;
  panelAlign?: 'left' | 'right';
  title?: string;
  description?: string;
}

export function ConfirmBackButton({
  onConfirm,
  buttonClassName = 'inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]',
  panelAlign = 'left',
  title = '确认返回？',
  description = '将离开当前功能页，回到功能入口。',
}: ConfirmBackButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={buttonClassName}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>

      {open ? (
        <div
          className={`absolute top-full z-50 mt-2 w-[260px] rounded-[20px] border border-black/8 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl ${
            panelAlign === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            {description}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-black/8 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
            >
              确认返回
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
