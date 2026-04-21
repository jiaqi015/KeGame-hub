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
    <div className="relative flex-1 overflow-hidden bg-[#050505] px-6 py-10 text-white">
      {/* 流动感背景元素 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,1)_0%,rgba(5,5,5,1)_100%)]" />
        
        <motion.div
          animate={{
            x: [-20, 20, -20],
            y: [-20, 20, -20],
            scale: [1, 1.1, 1],
            rotate: [0, 10, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -left-[10%] top-[10%] h-[80%] w-[80%] rounded-full bg-blue-500/10 blur-[120px]"
        />
        
        <motion.div
          animate={{
            x: [20, -20, 20],
            y: [20, -20, 20],
            scale: [1.1, 1, 1.1],
            rotate: [0, -10, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -right-[10%] bottom-[10%] h-[80%] w-[80%] rounded-full bg-indigo-500/10 blur-[120px]"
        />

        <motion.div
          animate={{
            opacity: [0.1, 0.2, 0.1],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute left-[20%] top-[30%] h-[40%] w-[40%] rounded-full bg-purple-500/10 blur-[100px]"
        />

        {/* 噪点纹理层 */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
        />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={onSubmit}
        className="relative mx-auto flex h-full w-full max-w-[540px] items-center"
      >
        <div className="w-full rounded-[40px] border border-white/10 bg-white/5 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-3xl">
          <div className="rounded-[32px] border border-white/5 bg-[#111111]/80 p-8 md:p-10 shadow-inner">
            <div className="mb-8 flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <KeGameHubMark size={36} />
                  <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-white">
                    KeGame
                  </h1>
                </div>
                <p className="mt-3 max-w-sm text-[15px] leading-7 text-[#A1A1AA]">
                  第一次登录：必须使用 `@ke.com` 邮箱，先获取验证码，再输入分配给你的激活 key 完成开通。以后登录：只需要验证码登录。
                </p>
                <p className="mt-4 text-[12px] leading-6 text-[#71717A]">
                  已开通多模型 PK、开放日选址、王牌资产顾问等功能。
                </p>
              </div>

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white text-[#111111] shadow-[0_18px_40px_rgba(255,255,255,0.1)]">
                {authStatus === 'checking' || authStatus === 'submitting' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#71717A]">
                企业邮箱
              </label>
              <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 transition focus-within:border-white/20 focus-within:bg-white/10 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.05)]">
                <Mail className="h-4.5 w-4.5 shrink-0 text-[#71717A]" />
                <input
                  value={loginEmail}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="输入 @ke.com 邮箱"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isBusy || authMode !== 'email'}
                  className="w-full bg-transparent text-sm tracking-[0.01em] text-white outline-none placeholder:text-[#52525B] disabled:cursor-not-allowed"
                />
              </div>

              {authMode !== 'email' ? (
                <>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#71717A]">
                    邮件验证码
                  </label>
                  <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 transition focus-within:border-white/20 focus-within:bg-white/10 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.05)]">
                    <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-[#71717A]" />
                    <input
                      value={verificationCode}
                      onChange={(event) => onCodeChange(event.target.value)}
                      placeholder="输入 6 位验证码"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-sm tracking-[0.1em] text-white outline-none placeholder:text-[#52525B] disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              ) : null}

              {shouldShowActivationInput ? (
                <>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#71717A]">
                    首登激活密钥
                  </label>
                  <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 transition focus-within:border-white/20 focus-within:bg-white/10 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.05)]">
                    <KeyRound className="h-4.5 w-4.5 shrink-0 text-[#71717A]" />
                    <input
                      value={activationInput}
                      onChange={(event) => onChange(event.target.value)}
                      placeholder="首次登录请输入激活密钥"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-sm tracking-[0.04em] text-white outline-none placeholder:text-[#52525B] disabled:cursor-not-allowed"
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
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-white px-4 py-4 text-sm font-semibold text-[#111111] shadow-[0_18px_30px_rgba(255,255,255,0.1)] transition hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:bg-[#27272A] disabled:text-[#71717A] disabled:shadow-none"
              >
                {authStatus === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {authStatus === 'checking' ? '正在恢复会话' : authStatus === 'submitting' ? '处理中...' : submitLabel}
              </button>
            </div>

            {authHint && (
              <div className="mt-4 rounded-[22px] border border-blue-900/50 bg-blue-900/20 px-4 py-3 text-sm text-blue-300">
                {authHint}
              </div>
            )}

            {authError && (
              <div className="mt-4 rounded-[22px] border border-red-900/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {authError}
              </div>
            )}

            <div className="mt-6 text-xs text-[#71717A]">
              {authStatus === 'checking' ? '正在恢复已登录状态' : '登录后会记住当前设备'}
            </div>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
