import React, { useState } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';

interface OpenDayWorkspaceProps {
  activationKey: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  onReturnToHub: () => void;
  onLogout: () => void;
}

export function OpenDayWorkspace({
  activationKey,
  currentUserNickname,
  currentUserEmail,
  onReturnToHub,
  onLogout,
}: OpenDayWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <div className="flex-1 overflow-hidden px-6 py-3 bg-gradient-to-br from-emerald-50 to-teal-50">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={onReturnToHub}
              className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回 Hub
            </button>
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

        <div className="min-h-0 flex-1 overflow-hidden rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)] p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#1F5F4A] flex items-center justify-center shadow-[0_18px_40px_rgba(31,95,74,0.18)]">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">开放日选址</h1>
              <p className="text-sm text-slate-500">上传楼盘表格，完成测算和排序</p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            <div
              onClick={() => document.getElementById('file-upload')?.click()}
              className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-lg font-medium text-slate-700 mb-2">
                点击上传楼盘表格
              </p>
              <p className="text-sm text-slate-500">
                支持 .xlsx, .csv 格式
              </p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />

            {selectedFile && (
              <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-sm font-medium text-emerald-800">
                  已选择：{selectedFile.name}
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}

            <div className="mt-8 p-6 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-4">功能说明</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <span>批量清洗楼盘数据，减少手工筛表</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <span>用参数包和公式统一判断口径</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <span>适合开放日前排优先级和复盘</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
