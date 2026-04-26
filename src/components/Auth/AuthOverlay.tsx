import React, { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { AuthMode, AuthStatus } from '../../app/appReducer';
import { KeGameHubMark } from '../Brand/KeGameHubMark';

const PARTICLES = Array.from({ length: 45 }).map((_, i) => {
  const xOffset1 = Math.random() * 120 - 60;
  const xOffset2 = Math.random() * 120 - 60;
  return {
    id: i,
    size: Math.random() * 3 + 1,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    duration: Math.random() * 15 + 15,
    delay: Math.random() * -20, // Negative delay to start immediately at different points
    xOffset1,
    xOffset2,
  };
});

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

  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rawX = useMotionValue(-1000);
  const rawY = useMotionValue(-1000);

  // 以容器短边为基准的像素幅值，大位移才跟手；内层 1:1 不Spring，中/外略滞后
  const ampMain = 280;
  const ampMid = 200;
  const ampOuter = 150;

  const followX = useTransform(mouseX, (x) => (x - 0.5) * 2 * ampMain);
  const followY = useTransform(mouseY, (y) => (y - 0.5) * 2 * ampMain);

  const midX = useSpring(mouseX, { mass: 0.15, stiffness: 400, damping: 32, restDelta: 0.001 });
  const midY = useSpring(mouseY, { mass: 0.15, stiffness: 400, damping: 32, restDelta: 0.001 });
  const outerX = useSpring(mouseX, { mass: 0.35, stiffness: 120, damping: 28, restDelta: 0.001 });
  const outerY = useSpring(mouseY, { mass: 0.35, stiffness: 120, damping: 28, restDelta: 0.001 });

  // 精确跟手的多层次华丽光晕
  const exactX = useSpring(rawX, { mass: 0.1, stiffness: 800, damping: 35 });
  const exactY = useSpring(rawY, { mass: 0.1, stiffness: 800, damping: 35 });
  const slowX = useSpring(rawX, { mass: 0.6, stiffness: 100, damping: 25 });
  const slowY = useSpring(rawY, { mass: 0.6, stiffness: 100, damping: 25 });

  const midMoveX = useTransform(midX, (x) => (x - 0.5) * 2 * ampMid);
  const midMoveY = useTransform(midY, (y) => (y - 0.5) * 2 * ampMid);
  const outerMoveX = useTransform(outerX, (x) => (x - 0.5) * 2 * ampOuter);
  const outerMoveY = useTransform(outerY, (y) => (y - 0.5) * 2 * ampOuter);

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const el = containerRef.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    mouseX.set((e.clientX - left) / width);
    mouseY.set((e.clientY - top) / height);
    rawX.set(e.clientX - left);
    rawY.set(e.clientY - top);
  };

  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

  useLayoutEffect(() => {
    const el = formRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [authStatus, authMode]);

  const addBackgroundRipple = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const x = clientX - left;
      const y = clientY - top;
      rippleIdRef.current += 1;
      const id = rippleIdRef.current;
      setRipples((prev) => [...prev, { id, x, y }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 900);
      // 点击处同步一帧「闪一下」跟手光，和外围涟漪呼应
      mouseX.set(x / width);
      mouseY.set(y / height);
      rawX.set(x);
      rawY.set(y);
    },
    [mouseX, mouseY, rawX, rawY],
  );

  const handlePointerDownCapture: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('form')) return;
    addBackgroundRipple(e.clientX, e.clientY);
  };

  return (
    <div 
      ref={containerRef}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        mouseX.set(0.5);
        mouseY.set(0.5);
      }}
      className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black px-4 py-8 text-white sm:px-6 sm:py-10"
    >
      {/* 极富水纹律动感的互动背景；光晕用外层做居中，避免与 motion 的 x/y 合并 transform 冲突 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,#111111_0%,#000000_55%)]" />
        
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            style={{ x: outerMoveX, y: outerMoveY, willChange: 'transform' }}
            className="h-[min(100vw,44rem)] w-[min(100vw,44rem)] rounded-full bg-zinc-600/15 blur-[150px]"
          />
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            style={{ x: midMoveX, y: midMoveY, willChange: 'transform' }}
            className="h-[min(88vw,38rem)] w-[min(88vw,38rem)] rounded-full bg-white/10 blur-[120px]"
          />
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            style={{ x: followX, y: followY, willChange: 'transform' }}
            className="h-[min(75vw,28rem)] w-[min(75vw,28rem)] rounded-full bg-white/[0.12] blur-[80px]"
          />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            style={{ x: followX, y: followY, willChange: 'transform' }}
            className="h-40 w-40 max-h-[30vmin] max-w-[30vmin] rounded-full bg-white/30 blur-[50px] mix-blend-screen"
          />
        </div>

        {/* 新增：高亮且细腻的鼠标直随光晕 */}
        <motion.div
          className="absolute left-0 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_60%)] mix-blend-screen blur-[40px]"
          style={{ x: slowX, y: slowY, willChange: 'transform' }}
        />
        <motion.div
          className="absolute left-0 top-0 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0)_50%)] mix-blend-screen blur-[20px]"
          style={{ x: exactX, y: exactY, willChange: 'transform' }}
        />
        <motion.div
          className="absolute left-0 top-0 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_40%)] mix-blend-screen blur-[8px]"
          style={{ x: exactX, y: exactY, willChange: 'transform' }}
        />

        <svg className="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M-100 400 Q 300 200 700 400 T 1500 400"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
          />
          <path
            d="M-100 500 Q 400 300 900 500 T 1800 500"
            fill="none"
            stroke="white"
            strokeWidth="0.3"
          />
          <path
            d="M-200 200 Q 200 400 600 200 T 1400 200"
            fill="none"
            stroke="white"
            strokeWidth="0.2"
          />
        </svg>

        {/* 漂浮的星尘粒子 */}
        <div className="absolute inset-0 overflow-hidden mix-blend-screen pointer-events-none opacity-80">
          {PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
              style={{
                width: p.size,
                height: p.size,
                left: p.left,
                top: p.top,
              }}
              animate={{
                y: [0, -150, -300],
                x: [0, p.xOffset1, p.xOffset2],
                opacity: [0, 1, 0],
                scale: [0, 1.2, 0],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: 'linear',
              }}
            />
          ))}
        </div>

        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
        />
      </div>

      {/* 点击暗色外围（非表单区）时：水波外扩，并同步一帧光斑位置 */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {ripples.map((r) => (
          <div
            key={r.id}
            className="pointer-events-none absolute"
            style={{ left: r.x, top: r.y, width: 0, height: 0 }}
          >
            <motion.div
              className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 bg-white/10"
              initial={{ scale: 0, opacity: 0.7 }}
              animate={{ scale: 16, opacity: 0 }}
              transition={{ duration: 0.72, ease: [0.2, 0.85, 0.2, 1] }}
            />
            <motion.div
              className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20"
              initial={{ scale: 0, opacity: 0.45 }}
              animate={{ scale: 10, opacity: 0 }}
              transition={{ duration: 0.88, ease: 'easeOut', delay: 0.05 }}
            />
          </div>
        ))}
      </div>

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="relative z-20 mx-auto box-border flex w-full max-w-[520px] flex-col items-stretch overflow-y-auto overflow-x-hidden [overflow-anchor:none] py-2 [scrollbar-gutter:stable] sm:py-4"
      >
        <div className="group w-full rounded-2xl border border-white/[0.1] bg-zinc-950/80 p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] px-8 py-8 md:px-10 md:py-10">
            <div className="mb-12 flex items-center justify-start gap-6 px-1">
              <div className="relative shrink-0">
                <KeGameHubMark size={64} className="relative z-10" unframed />
                <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full" />
              </div>
              <h1 className="text-[48px] font-[900] italic leading-none tracking-[-0.05em] text-white select-none translate-y-[2px]">
                KeGame Hub
              </h1>
            </div>
            <p className="mt-4 max-w-md text-left text-[14px] font-medium leading-relaxed text-zinc-500">
              第一次登录：使用 <span className="text-zinc-200">@ke.com</span> 邮箱，验证码 + 首登激活 Key 开通。之后仅需验证码即可登录。
            </p>

            <div className="mt-8 grid gap-5">
              <div className="space-y-2.5">
                <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">企业邮箱</label>
                <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06]">
                  <Mail className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                  <input
                    value={loginEmail}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="请输入 @ke.com 邮箱"
                    disabled={isBusy || authMode !== 'email'}
                    className="w-full bg-transparent text-[15px] font-medium tracking-[0.01em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {authMode !== 'email' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-2.5 overflow-hidden">
                  <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">邮件验证码</label>
                  <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06]">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                    <input
                      value={verificationCode}
                      onChange={(event) => onCodeChange(event.target.value)}
                      placeholder="6 位数字验证码"
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-[16px] font-medium tracking-[0.2em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                    />
                  </div>
                </motion.div>
              )}

              {shouldShowActivationInput && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-2.5 overflow-hidden">
                  <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">首登激活密钥</label>
                  <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06]">
                    <KeyRound className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                    <input
                      value={activationInput}
                      onChange={(event) => onChange(event.target.value)}
                      placeholder="首次登录请输入激活密钥"
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-[15px] font-medium tracking-[0.05em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                    />
                  </div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01, backgroundColor: '#fdfdfd' }}
                whileTap={{ scale: 0.98 }}
                disabled={isBusy || (authMode === 'email' && !loginEmail.trim()) || (authMode !== 'email' && !verificationCode.trim()) || (shouldShowActivationInput && !activationInput.trim())}
                className="mt-4 inline-flex w-full items-center justify-center gap-3 rounded-[26px] bg-white px-5 py-5 text-[15px] font-bold text-[#050505] shadow-[0_25px_50px_-12px_rgba(255,255,255,0.15)] transition-all disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {authStatus === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                <span className="tracking-wide">{authStatus === 'checking' ? '正在恢复会话' : authStatus === 'submitting' ? '处理中...' : submitLabel}</span>
              </motion.button>
            </div>

            {authHint ? (
              <div className="mt-5 rounded-[24px] border border-blue-500/25 bg-blue-500/10 px-5 py-4 text-[13px] font-medium leading-relaxed text-blue-200/95">
                {authHint}
              </div>
            ) : null}

            {authError ? (
              <div className="mt-5 rounded-[24px] border border-red-500/25 bg-red-500/10 px-5 py-4 text-[13px] font-medium leading-relaxed text-red-200/95">
                {authError}
              </div>
            ) : null}

            <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium tracking-wide text-zinc-500">
              <div className="h-1 w-1 rounded-full bg-zinc-600" />
              {authStatus === 'checking' ? '正在恢复已登录状态' : '登录后会记住当前设备'}
              <div className="h-1 w-1 rounded-full bg-zinc-600" />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
