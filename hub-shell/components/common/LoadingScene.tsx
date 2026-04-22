
import React from 'react';

// ==========================================
// 临时过渡版本：hub-shell 通用 LoadingScene
//
// 后续收口方向：
// 1. Seller 项目使用自己的 ui/components/LoadingScene（seller 专属样式）
// 2. Hub shell 最终只需要一个极简的骨架屏或 spinner
// 3. 各 workspace 按需实现自己的加载场景
//
// 当前用途：App.tsx 和 workspace lazy load fallback
// ==========================================

interface LoadingSceneProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function LoadingScene({
  title = '正在初始化',
  subtitle = '先打开本地工作台，再在后台检查云端进度。',
  compact = false,
}: LoadingSceneProps) {
  return (
    <div className="flex min-h-[300px] w-full items-center justify-center p-6">
      <div className={`w-full ${compact ? 'max-w-md' : 'max-w-lg'}`}>
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.08)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className={`text-lg font-semibold text-slate-900 ${compact ? '' : ''}`}>
                {title}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {subtitle}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
