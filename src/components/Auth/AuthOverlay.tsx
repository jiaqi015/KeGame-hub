import React from 'react';
import { motion } from 'motion/react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { AuthMode, AuthStatus } from '../../app/appReducer';
import { KeGameHubMark } from '../Brand/KeGameHubMark';

interface AuthOverlayProps {
  loginEmail: string;
  verificationCode: string;
  activationInput: string;
  authMode: AuthMode;
  authHint: string;
  authStatus: AuthStatus;
  authError: string;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent<HTMLFormElement>) => void;
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
  const isBusy = authStatus === 'checking' || authStatus === 'submitting';
  const shouldShowActivationInput = authMode === 'activate' || authError.includes('激活密钥');
  const submitLabel = authMode === 'email'
    ? '获取验证码'
    : authMode === 'verify'
      ? '验证并登录'
      : '完成首登';

  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,#F4F7FF_0%,#F8F8FA_42%,#F3F3F5_100%)] px-6 py-10">
      <div className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-[130%] rounded-full bg-[#DCE7FF] blur-3xl opacity-70" />
      <div className="pointer-events-none absolute right-1/2 bottom-10 h-72 w-72 translate-x-[135%] rounded-full bg-white blur-3xl opacity-80" />
      <motion.form
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={onSubmit}
        className="relative mx-auto flex h-full w-full max-w-[540px] items-center"
      >
        <div className="w-full rounded-[40px] border border-white/70 bg-white/80 p-3 shadow-[0_30px_90px_rgba(20,20,43,0.12)] backdrop-blur-2xl">
          <div className="rounded-[32px] border border-black/5 bg-white/80 p-8 md:p-10">
            <div className="mb-8 flex items-start justify-between gap-6">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#F5F5F7] px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-[#6E6E73] uppercase">
                  <KeGameHubMark size={16} />
                  KeGame Access
                </div>
                <div className="flex items-center gap-3">
                  <KeGameHubMark size={36} />
                  <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-[#111111]">
                    KeGame Hub
                  </h1>
                </div>
                <p className="mt-3 max-w-sm text-[15px] leading-7 text-[#6E6E73]">
                  使用 `@ke.com` 邮箱免密登录。首次登录时再补一次激活 key，完成注册和权限授权。
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-[#5C5C60]">
                  {['多模型PK', '开放日选址', '王牌资产顾问', '经营好商圈', '理性业主'].map((label) => (
                    <span key={label} className="rounded-full border border-black/5 bg-[#F5F5F7] px-3 py-1">
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#111111] text-white shadow-[0_18px_40px_rgba(17,17,17,0.18)]">
                {authStatus === 'checking' || authStatus === 'submitting' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                企业邮箱
              </label>
              <div className="flex items-center gap-3 rounded-[24px] border border-black/6 bg-[#F5F5F7] px-4 py-4 transition focus-within:border-black/15 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,122,255,0.08)]">
                <Mail className="h-4.5 w-4.5 shrink-0 text-[#8E8E93]" />
                <input
                  value={loginEmail}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="输入 @ke.com 邮箱"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isBusy || authMode !== 'email'}
                  className="w-full bg-transparent text-sm tracking-[0.01em] text-[#111111] outline-none placeholder:text-[#AEAEB2] disabled:cursor-not-allowed"
                />
              </div>

              {authMode !== 'email' ? (
                <>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                    邮件验证码
                  </label>
                  <div className="flex items-center gap-3 rounded-[24px] border border-black/6 bg-[#F5F5F7] px-4 py-4 transition focus-within:border-black/15 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,122,255,0.08)]">
                    <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-[#8E8E93]" />
                    <input
                      value={verificationCode}
                      onChange={(event) => onCodeChange(event.target.value)}
                      placeholder="输入 6 位验证码"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-sm tracking-[0.1em] text-[#111111] outline-none placeholder:text-[#AEAEB2] disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              ) : null}

              {shouldShowActivationInput ? (
                <>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                    首登激活密钥
                  </label>
                  <div className="flex items-center gap-3 rounded-[24px] border border-black/6 bg-[#F5F5F7] px-4 py-4 transition focus-within:border-black/15 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,122,255,0.08)]">
                    <KeyRound className="h-4.5 w-4.5 shrink-0 text-[#8E8E93]" />
                    <input
                      value={activationInput}
                      onChange={(event) => onChange(event.target.value)}
                      placeholder="首次登录请输入激活密钥"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-sm tracking-[0.04em] text-[#111111] outline-none placeholder:text-[#AEAEB2] disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              ) : null}

              <button
                type="submit"
                disabled={
                  isBusy
                  || (authMode === 'email' && !loginEmail.trim())
                  || (authMode !== 'email' && !verificationCode.trim())
                  || (shouldShowActivationInput && !activationInput.trim())
                }
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#111111] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(17,17,17,0.16)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#C7C7CC] disabled:shadow-none"
              >
                {authStatus === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {authStatus === 'checking' ? '正在恢复会话' : authStatus === 'submitting' ? '处理中...' : submitLabel}
              </button>
            </div>

            {authHint && (
              <div className="mt-4 rounded-[22px] border border-blue-100 bg-blue-50/90 px-4 py-3 text-sm text-blue-700">
                {authHint}
              </div>
            )}

            {authError && (
              <div className="mt-4 rounded-[22px] border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                {authError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4 text-xs text-[#8E8E93]">
              <span>{authStatus === 'checking' ? '正在恢复已登录状态' : '登录后会记住当前设备'}</span>
              <span className="rounded-full bg-[#F5F5F7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6E6E73]">
                Private Access
              </span>
            </div>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
