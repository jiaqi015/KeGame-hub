import React from 'react';

interface AuthOverlayProps {
  loginEmail: string;
  verificationCode: string;
  activationInput: string;
  authMode: 'email' | 'activate' | 'verify';
  authHint: string;
  authStatus: 'locked' | 'submitting' | 'authenticated';
  authError: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
}

export function AuthOverlay({
  loginEmail,
  verificationCode,
  activationInput,
  authMode,
  authHint,
  authStatus,
  authError,
  onEmailChange,
  onCodeChange,
  onChange,
  onSubmit,
}: AuthOverlayProps) {
  const isSubmitting = authStatus === 'submitting';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">KeGame Hub</h1>
            <p className="text-slate-500 text-sm">多模型对比 + 开放日选址 + 资产顾问模拟</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {authMode === 'email' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="请输入您的邮箱"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                  disabled={isSubmitting}
                />
              </div>
            )}

            {authMode === 'verify' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  验证码
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => onCodeChange(e.target.value)}
                  placeholder="请输入验证码"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                  disabled={isSubmitting}
                />
                <p className="mt-2 text-sm text-slate-500">
                  验证码已发送至 <span className="font-medium">{loginEmail}</span>
                </p>
              </div>
            )}

            {authMode === 'activate' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  激活密钥
                </label>
                <input
                  type="text"
                  value={activationInput}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="请输入您的激活密钥"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-mono"
                  disabled={isSubmitting}
                />
                {authHint && (
                  <p className="mt-2 text-sm text-slate-500">{authHint}</p>
                )}
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{authError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  验证中...
                </span>
              ) : (
                authMode === 'email' ? '获取验证码' : '验证'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-center text-xs text-slate-400">
              演示模式：输入任意邮箱即可登录体验
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
