import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import type { GameState, TodayArrangementSlot } from '../../domain/models.js';
import type { ArrangementItemProjection, ArrangementProjection } from '../../application/projections/operatingProjection.js';
import {
  AI_ARRANGEMENT_THINKING_STEPS,
  type AiArrangementProposal,
  resolveAiArrangementAdoptableItems,
} from './aiArrangement.js';
import { fetchAiArrangementProposal } from './aiArrangementClient.js';

type AiArrangementPanelStatus = 'idle' | 'thinking' | 'ready' | 'applying' | 'applied' | 'failed';

interface AiArrangementPanelProps {
  arrangement: ArrangementProjection;
  state: GameState;
  day: number;
  activeSlot: TodayArrangementSlot;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onAdoptedSlot?: (slot: TodayArrangementSlot) => void;
}

function panelSlotLabel(slot: TodayArrangementSlot) {
  return slot === 'pm' ? '下午' : '上午';
}

export function AiArrangementPanel({
  arrangement,
  state,
  day,
  activeSlot,
  onAddToToday,
  onAdoptedSlot,
}: AiArrangementPanelProps) {
  const [status, setStatus] = useState<AiArrangementPanelStatus>('idle');
  const [proposal, setProposal] = useState<AiArrangementProposal | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [errorText, setErrorText] = useState('');
  const runIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  useEffect(() => {
    setStatus('idle');
    setProposal(null);
    setAppliedCount(0);
    setErrorText('');
    runIdRef.current += 1;
  }, [day]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startThinking = () => {
    clearTimer();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setStatus('thinking');
    setProposal(null);
    setAppliedCount(0);
    setErrorText('');

    fetchAiArrangementProposal(state, arrangement, activeSlot).then(result => {
      if (runIdRef.current !== runId) return;
      setProposal(result.proposal);
      setStatus('ready');
    }).catch(() => {
      if (runIdRef.current !== runId) return;
      setStatus('failed');
      setErrorText('AI 安排生成失败');
    });
  };

  const cancel = () => {
    clearTimer();
    runIdRef.current += 1;
    setStatus('idle');
    setProposal(null);
    setAppliedCount(0);
    setErrorText('');
  };

  const adopt = () => {
    if (!proposal) return;
    setStatus('applying');
    const adoptableItems = resolveAiArrangementAdoptableItems(proposal, arrangement);
    let count = 0;
    let firstAdoptedSlot: TodayArrangementSlot | null = null;
    for (const entry of adoptableItems) {
      if (onAddToToday(entry.item, entry.slot)) {
        count += 1;
        firstAdoptedSlot = firstAdoptedSlot || entry.slot;
      }
    }
    if (count > 0) {
      if (firstAdoptedSlot) {
        onAdoptedSlot?.(firstAdoptedSlot);
      }
      cancel();
      return;
    }
    setAppliedCount(0);
    setErrorText('这组建议已经不能直接排入今天。');
    setStatus('failed');
  };

  const buttonLabel = status === 'idle' ? 'AI 安排' : status === 'thinking' ? '推演中' : status === 'applied' ? '已安排' : '今日建议';
  const isOpen = status !== 'idle';

  const trigger = (
    <button
      type="button"
      onClick={status === 'idle' ? startThinking : undefined}
      disabled={status !== 'idle'}
      className={`inline-flex h-10 min-w-[104px] items-center justify-center gap-2 rounded-[12px] px-4 text-[12px] font-semibold ${
        status === 'idle'
          ? 'seller-ai-arrange-trigger'
          : 'border border-[color:var(--seller-accent)]/35 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      } disabled:cursor-default`}
    >
      {status === 'thinking' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {buttonLabel}
    </button>
  );

  if (status === 'idle') {
    return (
      <div className="relative flex justify-start lg:justify-end">
        {trigger}
      </div>
    );
  }

  return (
    <div className="relative flex justify-start lg:justify-end">
      {trigger}
      {isOpen ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(332px,calc(100vw-48px))] rounded-[12px] border border-[var(--seller-border-strong)] bg-[color-mix(in_srgb,var(--seller-paper)_94%,black_6%)] px-3 py-3 shadow-[var(--seller-shadow-lg)]"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--seller-accent)]/30 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]">
                {status === 'thinking' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-[var(--seller-ink)]">
                  {status === 'thinking' ? '正在推演' : status === 'applied' ? '已加入今日安排' : '今日建议'}
                </div>
                {proposal ? (
                  <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--seller-subtle)]">
                    {proposal.evidenceLabels.slice(0, 2).join(' · ')}
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={cancel}
              className="seller-button-ghost inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              aria-label="关闭 AI 安排"
            >
              <X size={13} />
            </button>
          </div>

          {status === 'thinking' ? (
            <div className="mt-3 space-y-2">
              {AI_ARRANGEMENT_THINKING_STEPS.map((step, index) => (
                <div key={step} className="flex items-center gap-2 text-[11px] text-[var(--seller-muted)]">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--seller-border)] text-[9px] text-[var(--seller-subtle)]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                  <span className="ml-auto h-1.5 w-12 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                    <span className="block h-full w-2/3 animate-pulse rounded-full bg-[var(--seller-accent)]/60" />
                  </span>
                </div>
              ))}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={cancel}
                  className="seller-button-secondary rounded-[10px] px-3 py-1.5 text-[11px] font-semibold"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {proposal && (status === 'ready' || status === 'applying' || status === 'applied') ? (
            <div className="mt-3">
              <div className="text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{proposal.headline}</div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{proposal.summary}</p>

              {proposal.drafts.length > 0 ? (
                <div className="mt-3 divide-y divide-[var(--seller-border)] rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)]">
                  {proposal.drafts.map((draft) => (
                    <div key={draft.itemId} className="px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="seller-chip seller-chip-accent text-[10px]">{panelSlotLabel(draft.slot)}</span>
                        <span className="min-w-0 truncate text-[11px] font-semibold text-[var(--seller-ink)]">{draft.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-[var(--seller-subtle)]">{draft.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="seller-empty mt-3 px-3 py-3 text-center text-[11px]">
                  现在没有适合新增的动作。
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                {status === 'applied' ? (
                  <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-[color:var(--seller-accent)]/35 bg-[var(--seller-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--seller-accent)]">
                    <Check size={13} />
                    已安排 {appliedCount} 件
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={cancel}
                      className="seller-button-secondary rounded-[10px] px-3 py-1.5 text-[11px] font-semibold"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={adopt}
                      disabled={status === 'applying' || proposal.drafts.length === 0}
                      className="seller-button-primary inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                    >
                      {status === 'applying' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      采纳
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {status === 'failed' ? (
            <div className="mt-3 rounded-[10px] border border-[color:var(--seller-risk)]/30 bg-[var(--seller-risk-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--seller-risk)]">
              {errorText}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
