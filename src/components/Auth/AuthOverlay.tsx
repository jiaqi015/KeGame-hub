import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
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

  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // 三层物理特性的弹簧，模拟水滴入墨的效果
  const smoothX = useSpring(mouseX, { damping: 20, stiffness: 200 }); // 极速响应
  const smoothY = useSpring(mouseY, { damping: 20, stiffness: 200 });
  
  const midX = useSpring(mouseX, { damping: 30, stiffness: 80 });   // 中速律动
  const midY = useSpring(mouseY, { damping: 30, stiffness: 80 });
  
  const outerX = useSpring(mouseX, { damping: 50, stiffness: 30 }); // 慢速涟漪
  const outerY = useSpring(mouseY, { damping: 50, stiffness: 30 });

  // 映射位移
  const moveX = useTransform(smoothX, [0, 1], [-80, 80]);
  const moveY = useTransform(smoothY, [0, 1], [-80, 80]);
  const midMoveX = useTransform(midX, [0, 1], [-120, 120]);
  const midMoveY = useTransform(midY, [0, 1], [-120, 120]);
  const outerMoveX = useTransform(outerX, [0, 1], [-180, 180]);
  const outerMoveY = useTransform(outerY, [0, 1], [-180, 180]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - left) / width);
    mouseY.set((e.clientY - top) / height);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex-1 overflow-hidden bg-[#020203] px-6 py-10 text-white"
    >
      {/* 极富水纹律动感的互动背景 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#020203]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#0a0a1a_0%,#020203_100%)] opacity-80" />
        
        {/* 背景光晕层 3：慢速长拖尾 */}
        <motion.div
          style={{ x: outerMoveX, y: outerMoveY, translateX: '-50%', translateY: '-50%' }}
          className="absolute left-1/2 top-1/2 h-[110%] w-[110%] rounded-full bg-blue-900/10 blur-[150px]"
        />

        {/* 背景光晕层 2：中速波纹 */}
        <motion.div
          style={{ x: midMoveX, y: midMoveY, translateX: '-50%', translateY: '-50%' }}
          className="absolute left-1/2 top-1/2 h-[80%] w-[80%] rounded-full bg-indigo-600/08 blur-[120px]"
        />

        {/* 背景光晕层 1：跟随最紧的核心高亮 */}
        <motion.div
          style={{ x: moveX, y: moveY, translateX: '-50%', translateY: '-50%' }}
          className="absolute left-1/2 top-1/2 h-[50%] w-[50%] rounded-full bg-blue-400/15 blur-[90px]"
        />

        {/* 线条呼吸层 */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M-100 400 Q 300 200 700 400 T 1500 400"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
            animate={{
              d: [
                "M-100 400 Q 300 200 700 400 T 1500 400",
                "M-100 450 Q 350 250 750 450 T 1500 450",
                "M-100 400 Q 300 200 700 400 T 1500 400"
              ]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>

        {/* 噪点质感 */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
        />
      </div>

      <motion.form
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={onSubmit}
        className="relative mx-auto flex h-full w-full max-w-[520px] items-center"
      >
        <div className="group relative w-full overflow-hidden rounded-[42px] border border-white/[0.08] bg-white/[0.02] p-1 shadow-[0_40px_100px_rgba(0,0,0,0.6)] backdrop-blur-3xl">
          <div className="relative rounded-[38px] border border-white/[0.05] bg-[#0c0c0e]/60 p-8 md:p-11 shadow-inner">
            <div className="mb-10 flex items-start justify-between gap-6">
              <div>
                <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-3">
                  <KeGameHubMark size={40} className="drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
                  <h1 className="bg-gradient-to-br from-white to-white/60 bg-clip-text text-[38px] font-bold tracking-[-0.05em] text-transparent">KeGame</h1>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-4 max-w-sm text-[15px] font-medium leading-relaxed text-zinc-400">
                  第一次登录：必须使用 <span className="text-blue-400/90">@ke.com</span> 邮箱，获取验证码后使用分配的激活 Key 完成开通。
                </motion.p>
              </div>

              <motion.div whileHover={{ scale: 1.05, rotate: 5 }} className="flex h-15 w-15 shrink-0 items-center justify-center rounded-[22px] bg-white text-[#050505] shadow-[0_20px_40px_rgba(255,255,255,0.12)]">
                {authStatus === 'checking' || authStatus === 'submitting' ? <Loader2 className="h-6 w-6 animate-spin" /> : <ShieldCheck className="h-6 w-6" />}
              </motion.div>
            </div>

            <div className="grid gap-5">
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

            <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium tracking-wide text-zinc-500">
              <div className="h-1 w-1 rounded-full bg-zinc-600" />
              {authStatus === 'checking' ? '正在恢复已登录状态' : '登录后会记住当前设备'}
              <div className="h-1 w-1 rounded-full bg-zinc-600" />
            </div>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
