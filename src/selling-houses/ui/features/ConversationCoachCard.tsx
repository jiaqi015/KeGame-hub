import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import type { CoachFeedback } from '../../application/conversationCoach.js';

export const ConversationCoachCard: React.FC<{ feedback: CoachFeedback }> = ({ feedback }) => {
  const [expanded, setExpanded] = useState(false);

  if (!feedback.overall && feedback.insights.length === 0 && !feedback.nextStepAdvice) {
    return null;
  }

  return (
    <div className="mt-2 rounded-[12px] border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Lightbulb size={12} className="shrink-0 text-amber-300" />
        <span className="text-[10px] font-semibold text-amber-200">回复复盘</span>
      </div>

      <p className="mt-1.5 text-[11px] leading-5 text-[var(--seller-muted)]">
        {feedback.overall}
      </p>

      {feedback.nextStepAdvice && (
        <div className="mt-2 rounded-[8px] border border-sky-500/18 bg-sky-500/8 px-2.5 py-1.5">
          <p className="text-[10px] leading-4 text-sky-200">{feedback.nextStepAdvice}</p>
        </div>
      )}

      {feedback.insights.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-[var(--seller-subtle)] transition hover:text-[var(--seller-muted)]"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? '收起建议' : `查看 ${feedback.insights.length} 条建议`}
          </button>
          {expanded && (
            <ul className="mt-1.5 space-y-1">
              {feedback.insights.map((insight, index) => (
                <li
                  key={index}
                  className="rounded-[8px] bg-amber-500/8 px-2 py-1 text-[10px] leading-4 text-amber-100/80"
                >
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
