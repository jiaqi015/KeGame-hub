import React from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';

interface ComparisonWorkspaceProps {
  state: {
    prompt: string;
    availableModels: Array<{ id: string; name: string; enabled: boolean }>;
    selectedModels: string[];
    isComparing: boolean;
    results: Record<string, unknown>;
    activeTab: string;
    previewData: { title: string; subtitle: string; content: string } | null;
    currentUserNickname?: string;
    currentUserEmail?: string;
    sessionExpiresAt?: string;
  };
  onSetPrompt: (value: string) => void;
  onToggleModel: (id: string) => void;
  onSetActiveTab: (tab: string) => void;
  onResetSelectedModels: () => void;
  onStartComparison: () => void;
  onReset: () => void;
  onReturnToHub: () => void;
  onLogout: () => void;
  sessionExpiresAt?: string;
  onPreview?: (title: string, subtitle: string, content: string) => void;
}

export function ComparisonWorkspace({
  state,
  onSetPrompt,
  onToggleModel,
  onSetActiveTab,
  onResetSelectedModels,
  onStartComparison,
  onReset,
  onReturnToHub,
  onLogout,
  currentUserNickname,
  currentUserEmail,
}: ComparisonWorkspaceProps & {
  currentUserNickname?: string;
  currentUserEmail?: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onReturnToHub}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">返回 Hub</span>
          </button>

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
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">退出</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">多模型对比</h1>
              <p className="text-sm text-slate-500">同时对比多个大模型的回答结果</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                输入提示词
              </label>
              <textarea
                value={state.prompt}
                onChange={(e) => onSetPrompt(e.target.value)}
                placeholder="请输入您想询问的问题..."
                className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-700">
                  选择模型
                </label>
                <button
                  onClick={onResetSelectedModels}
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  重置选择
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {state.availableModels.map((model) => {
                  const isSelected = state.selectedModels.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      onClick={() => model.enabled && onToggleModel(model.id)}
                      disabled={!model.enabled}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : model.enabled
                          ? 'border-slate-200 hover:border-slate-300 bg-white'
                          : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="font-medium text-slate-900">{model.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {model.enabled ? '已启用' : '暂不可用'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={onStartComparison}
              disabled={!state.prompt.trim() || state.selectedModels.length === 0 || state.isComparing}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isComparing ? '生成中...' : `开始对比（已选 ${state.selectedModels.length} 个模型）`}
            </button>
          </div>
        </div>

        {Object.keys(state.results).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">对比结果</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(state.results).map(([modelId, result]) => (
                <div key={modelId} className="p-6 rounded-xl bg-slate-50 border border-slate-100">
                  <h3 className="font-semibold text-slate-900 mb-3">{modelId}</h3>
                  <pre className="text-sm text-slate-600 whitespace-pre-wrap font-mono">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
