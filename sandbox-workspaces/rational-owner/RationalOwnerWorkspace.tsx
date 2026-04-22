import React from 'react';
import { ArrowLeft } from 'lucide-react';

export function RationalOwnerWorkspace({
  onReturnToHub,
}: {
  activationKey?: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  onReturnToHub: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className="flex-1 overflow-hidden px-6 py-3 bg-gradient-to-br from-rose-50 to-pink-50">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
          <button
            onClick={onReturnToHub}
            className="flex items-center gap-2 text-sm font-medium text-rose-700 hover:text-rose-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回 Hub
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)] p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#B9385D] flex items-center justify-center shadow-[0_18px_40px_rgba(185,56,93,0.18)]">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">理性业主</h1>
                <p className="text-sm text-slate-500">在情绪里做最理性的主</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 mb-8">
              <p className="text-rose-800 font-medium">🚧 此功能正在开发中</p>
              <p className="text-rose-600 text-sm mt-2">
                当前为占位页面，用于叙事与玩法方向对齐。后续会接入与「王牌资产顾问」同一世界观的主循环。
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 rounded-xl bg-white border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">未来玩法预测</h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
                    <span>双视角同世界</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
                    <span>「后悔值」而不仅是成交价</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
                    <span>全成本与推进剧本</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 rounded-xl bg-white border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">预设讨论提示</h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <p className="p-3 rounded-lg bg-slate-50">两位顾问说法不同：你更看重快速成交的确定性，还是更在意最后落袋的价格？</p>
                  <p className="p-3 rounded-lg bg-slate-50">市场转冷时，你会先调价、先换推进动作，还是再观察几天？</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
