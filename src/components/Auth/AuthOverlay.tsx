import React from 'react';
import { motion } from 'motion/react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { AuthStatus } from '../../app/appReducer';

interface AuthOverlayProps {
  activationInput: string;
  authStatus: AuthStatus;
  authError: string;
  onChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent<HTMLFormElement>) => void;
}

export function AuthOverlay({
  activationInput,
  authStatus,
  authError,
  onChange,
  onSubmit,
}: AuthOverlayProps) {
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
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Sabrina Access
                </div>
                <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-[#111111]">
                  AI Model Sabrina II
                </h1>
                <p className="mt-3 max-w-sm text-[15px] leading-7 text-[#6E6E73]">
                  先完成验证，再进入多模型PK、小区开放日选址和我是王牌资产顾问三个功能。
                </p>
              </div>

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#111111] text-white shadow-[0_18px_40px_rgba(17,17,17,0.18)]">
                {authStatus === 'checking' || authStatus === 'submitting' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                激活密钥
              </label>
              <div className="flex items-center gap-3 rounded-[24px] border border-black/6 bg-[#F5F5F7] px-4 py-4 transition focus-within:border-black/15 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,122,255,0.08)]">
                <KeyRound className="h-4.5 w-4.5 shrink-0 text-[#8E8E93]" />
                <input
                  value={activationInput}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="输入激活密钥"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={authStatus === 'checking' || authStatus === 'submitting'}
                  className="w-full bg-transparent font-mono text-sm tracking-[0.04em] text-[#111111] outline-none placeholder:text-[#AEAEB2] disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={!activationInput.trim() || authStatus === 'checking' || authStatus === 'submitting'}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#111111] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(17,17,17,0.16)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#C7C7CC] disabled:shadow-none"
              >
                {authStatus === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {authStatus === 'checking' ? '正在校验' : authStatus === 'submitting' ? '校验中...' : '进入系统'}
              </button>
            </div>

            {authError && (
              <div className="mt-4 rounded-[22px] border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                {authError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4 text-xs text-[#8E8E93]">
              <span>{authStatus === 'checking' ? '正在验证已保存密钥' : '激活后会记住当前设备'}</span>
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
