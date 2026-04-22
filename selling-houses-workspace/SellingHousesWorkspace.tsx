import React, { useState } from 'react';
import { ArrowLeft, Home, Target, Calendar, TrendingUp, Users, MessageSquare } from 'lucide-react';

export function SellingHousesWorkspace({
  activationKey,
  currentUserAccountId,
  currentUserNickname,
  currentUserEmail,
  onReturnToHub,
  onLogout,
}: {
  activationKey: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  onReturnToHub: () => void;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const tabs = [
    { id: 'overview', label: '总览', icon: Home },
    { id: 'inventory', label: '房源', icon: Target },
    { id: 'schedule', label: '日程', icon: Calendar },
    { id: 'market', label: '市场', icon: TrendingUp },
    { id: 'clients', label: '客户', icon: Users },
    { id: 'messages', label: '消息', icon: MessageSquare },
  ];

  return (
    <div className="flex-1 overflow-hidden px-6 py-3 bg-gradient-to-br from-amber-50 to-orange-50">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={onReturnToHub}
              className="flex items-center gap-2 text-sm font-medium text-[#8B5A2B] hover:text-[#72461f] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回 Hub
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#8B5A2B] flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#8B5A2B]">王牌资产顾问</p>
                <p className="text-xs text-[#B8860B]">房源组合经营模拟器</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {(currentUserNickname || currentUserEmail) && (
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {currentUserNickname || currentUserEmail?.split('@')[0]}
                </p>
                <p className="text-xs text-slate-500">{currentUserEmail}</p>
              </div>
            )}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
            >
              退出账号
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)] flex">
          <div className="w-64 border-r border-slate-100 p-4 flex flex-col gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-[#8B5A2B] text-white shadow-lg shadow-[#8B5A2B]/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{tab.label}</span>
                </button>
              );
            })}
            
            <div className="mt-auto pt-4 border-t border-slate-100">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm font-medium text-amber-800 mb-2">💡 今日提示</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  重点关注 3 套核心房源的开放日节奏，避免在同一周内密集安排导致资源分散。
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">房源总览</h1>
                  <p className="text-sm text-slate-500 mt-1">管理您的房源组合和销售进度</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                    经营中
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">
                    第 3 周
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { label: '在管房源', value: '7', change: '+2', color: 'amber' },
                  { label: '本周带看', value: '12', change: '+5', color: 'emerald' },
                  { label: '意向客户', value: '15', change: '+3', color: 'blue' },
                  { label: '预计成交', value: '2', change: '持平', color: 'purple' },
                ].map((stat, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <p className="text-sm text-slate-500 mb-2">{stat.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                    <p className="text-xs text-emerald-600 font-medium">{stat.change} 本周</p>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
                <p className="text-amber-800 font-medium">🚧 此功能正在开发中</p>
                <p className="text-amber-700 text-sm mt-2">
                  当前为基础框架，完整的房源经营模拟功能将在后续版本中陆续推出。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="font-semibold text-slate-900 mb-4">核心功能</h3>
                  <ul className="space-y-3 text-sm text-slate-600">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5A2B] mt-2 shrink-0" />
                      <span>快速看清每套房现在该怎么推</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5A2B] mt-2 shrink-0" />
                      <span>定价沟通、开放日和议价都要做取舍</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5A2B] mt-2 shrink-0" />
                      <span>在业主预期和推进节奏之间把局面控住</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="font-semibold text-slate-900 mb-4">即将推出</h3>
                  <ul className="space-y-3 text-sm text-slate-600">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                      <span>房源评分体系</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                      <span>业主沟通剧本库</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                      <span>周计划与复盘工具</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
