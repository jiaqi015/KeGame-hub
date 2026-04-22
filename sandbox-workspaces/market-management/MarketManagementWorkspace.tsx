import React from 'react';
import { ArrowLeft } from 'lucide-react';

export function MarketManagementWorkspace({
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
    <div className="flex-1 overflow-hidden px-6 py-3 bg-gradient-to-br from-sky-50 to-blue-50">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
          <button
            onClick={onReturnToHub}
            className="flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回 Hub
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)] p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#0F4C81] flex items-center justify-center shadow-[0_18px_40px_rgba(15,76,129,0.18)]">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">商圈经营</h1>
                <p className="text-sm text-slate-500">从整片商圈做经营</p>
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 mb-8">
              <p className="text-sky-800 font-medium">🚧 此功能正在开发中</p>
              <p className="text-sky-600 text-sm mt-2">
                当前为占位页面，用于叙事与玩法方向对齐。后续会接入与「王牌资产顾问」同一世界观的主循环。
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 rounded-xl bg-white border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">未来玩法预测</h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 shrink-0" />
                    <span>周目标与资源位主循环</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 shrink-0" />
                    <span>组织与跨店协同一屏化</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 shrink-0" />
                    <span>总部 / 政策沙盒</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 rounded-xl bg-white border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">预设讨论提示</h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <p className="p-3 rounded-lg bg-slate-50">如果你要经营一个商圈，这周最先动的是：资源位、人员协同，还是重点盘清单？</p>
                  <p className="p-3 rounded-lg bg-slate-50">同一板块突然多三套强竞价房源，你优先改获客的打法，还是优先收缩重点盘？</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
