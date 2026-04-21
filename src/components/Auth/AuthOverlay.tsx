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

  // 配置三组不同律动感的弹簧，模拟水纹的层次
  // 1. 核心层：响应最快
  const springCore = { damping: 30, stiffness: 120 };
  const smoothX = useSpring(mouseX, springCore);
  const smoothY = useSpring(mouseY, springCore);

  // 2. 中层波纹：略有滞后
  const springMid = { damping: 40, stiffness: 80 };
  const midX = useSpring(mouseX, springMid);
  const midY = useSpring(mouseY, springMid);

  // 3. 外层涟漪：最柔和、滞后感最强
  const springOuter = { damping: 50, stiffness: 40 };
  const outerX = useSpring(mouseX, springOuter);
  const outerY = useSpring(mouseY, springOuter);

  // 将坐标映射为偏移百分比
  const spotlightX = useTransform(smoothX, [0, 1], ['-15%', '15%']);
  const spotlightY = useTransform(smoothY, [0, 1], ['-15%', '15%']);

  const rippleMidX = useTransform(midX, [0, 1], ['-20%', '20%']);
  const rippleMidY = useTransform(midY, [0, 1], ['-20%', '20%']);

  const rippleOuterX = useTransform(outerX, [0, 1], ['-25%', '25%']);
  const rippleOuterY = useTransform(outerY, [0, 1], ['-25%', '25%']);

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
        {/* 底层深邃背景 */}
        <div className="absolute inset-0 bg-[#020203]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#0a0a1a_0%,#020203_100%)]" />
        
        {/* 三层互动水纹 (Ripple Layers) */}
        {/* 外层：大面积、最模糊、最慢 */}
        <motion.div
          style={{
            left: rippleOuterX,
            top: rippleOuterY,
            background: 'radial-gradient(circle at center, rgba(79, 70, 229, 0.08) 0%, transparent 60%)',
          }}
          className="absolute inset-[-40%] z-0"
        />

        {/* 中层：中等亮度、中等速度 */}
        <motion.div
          style={{
            left: rippleMidX,
            top: rippleMidY,
            background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.1) 0%, transparent 55%)',
          }}
          className="absolute inset-[-30%] z-0"
        />

        {/* 核心层：最亮、最快，形成视觉中心 */}
        <motion.div
          style={{
            left: spotlightX,
            top: spotlightY,
            background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.05) 0%, transparent 50%)',
          }}
          className="absolute inset-[-20%] z-0"
        />

        {/* 动态流动的光晕群 */}
        <motion.div
          animate={{
            x: [-80, 80, -80],
            y: [-30, 120, -30],
            scale: [1, 1.2, 1],
            rotate: [0, 45, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -left-[10%] -top-[5%] h-[80%] w-[80%] rounded-full bg-blue-600/10 blur-[120px]"
        />
        
        <motion.div
          animate={{
            x: [80, -80, 80],
            y: [30, -120, 30],
            scale: [1.1, 0.9, 1.1],
            rotate: [0, -60, 0],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -right-[10%] -bottom-[5%] h-[85%] w-[85%] rounded-full bg-indigo-600/08 blur-[140px]"
        />

        <motion.div
          animate={{
            opacity: [0.1, 0.25, 0.1],
            scale: [1, 1.4, 1],
            x: [-50, 50, -50],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute left-[10%] top-[20%] h-[60%] w-[60%] rounded-full bg-purple-600/10 blur-[120px]"
        />

        <motion.div
          animate={{
            opacity: [0, 0.15, 0],
            scale: [0.8, 1.2, 0.8],
            y: [100, -100, 100],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 5
          }}
          className="absolute right-[20%] top-[10%] h-[50%] w-[50%] rounded-full bg-cyan-500/10 blur-[100px]"
        />

        {/* 呼吸感的线条/波动层 */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <filter id="blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <motion.path
            d="M-100 300 Q 200 100 500 300 T 1100 300"
            fill="none"
            stroke="white"
            strokeWidth="1"
            filter="url(#blur)"
            animate={{
              d: [
                "M-100 300 Q 200 100 500 300 T 1100 300",
                "M-100 350 Q 250 150 550 350 T 1100 350",
                "M-100 300 Q 200 100 500 300 T 1100 300"
              ]
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.path
            d="M-100 450 Q 300 250 600 450 T 1300 450"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.5"
            animate={{
              d: [
                "M-100 450 Q 300 250 600 450 T 1300 450",
                "M-100 400 Q 250 200 550 400 T 1300 400",
                "M-100 450 Q 300 250 600 450 T 1300 450"
              ]
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />
        </svg>

        {/* 噪点纹理增强质感 */}
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
        />

        {/* 顶部微弱的高光扫射 */}
        <motion.div 
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute top-0 h-[2px] w-[30%] bg-gradient-to-r from-transparent via-blue-400/20 to-transparent blur-[2px]"
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
          {/* 卡片内部的流动光晕 */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[80px] transition-opacity duration-500 group-hover:opacity-100 opacity-50" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-[80px] transition-opacity duration-500 group-hover:opacity-100 opacity-50" />
          
          <div className="relative rounded-[38px] border border-white/[0.05] bg-[#0c0c0e]/60 p-8 md:p-11 shadow-inner">
            <div className="mb-10 flex items-start justify-between gap-6">
              <div>
                <motion.div 
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-3"
                >
                  <KeGameHubMark size={40} className="drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
                  <h1 className="bg-gradient-to-br from-white to-white/60 bg-clip-text text-[38px] font-bold tracking-[-0.05em] text-transparent">
                    KeGame
                  </h1>
                </motion.div>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-4 max-w-sm text-[15px] font-medium leading-relaxed text-zinc-400"
                >
                  第一次登录：必须使用 <span className="text-blue-400/90">@ke.com</span> 邮箱，获取验证码后使用分配的激活 Key 完成开通。
                </motion.p>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-3 text-[12px] font-medium tracking-wide text-zinc-500"
                >
                  已集成多模型 PK、选址决策、王牌顾问等核心能力。
                </motion.p>
              </div>

              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                className="flex h-15 w-15 shrink-0 items-center justify-center rounded-[22px] bg-white text-[#050505] shadow-[0_20px_40px_rgba(255,255,255,0.12)]"
              >
                {authStatus === 'checking' || authStatus === 'submitting' ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <ShieldCheck className="h-6 w-6" />
                )}
              </motion.div>
            </div>

            <div className="grid gap-5">
              <div className="space-y-2.5">
                <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
                  企业邮箱
                </label>
                <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <Mail className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                  <input
                    value={loginEmail}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="请输入 @ke.com 邮箱"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isBusy || authMode !== 'email'}
                    className="w-full bg-transparent text-[15px] font-medium tracking-[0.01em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {authMode !== 'email' ? (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-2.5 overflow-hidden"
                >
                  <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
                    邮件验证码
                  </label>
                  <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                    <input
                      value={verificationCode}
                      onChange={(event) => onCodeChange(event.target.value)}
                      placeholder="6 位数字验证码"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-[16px] font-medium tracking-[0.2em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                    />
                  </div>
                </motion.div>
              ) : null}

              {shouldShowActivationInput ? (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-2.5 overflow-hidden"
                >
                  <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
                    首登激活密钥
                  </label>
                  <div className="group/input flex items-center gap-4 rounded-[26px] border border-white/[0.06] bg-white/[0.03] px-5 py-4.5 transition-all duration-300 focus-within:border-white/20 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                    <KeyRound className="h-5 w-5 shrink-0 text-zinc-500 transition-colors group-focus-within/input:text-white" />
                    <input
                      value={activationInput}
                      onChange={(event) => onChange(event.target.value)}
                      placeholder="首次登录请输入激活密钥"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isBusy}
                      className="w-full bg-transparent font-mono text-[15px] font-medium tracking-[0.05em] text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                    />
                  </div>
                </motion.div>
              ) : null}

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01, backgroundColor: '#fdfdfd' }}
                whileTap={{ scale: 0.98 }}
                disabled={
                  isBusy
                  || (authMode === 'email' && !loginEmail.trim())
                  || (authMode !== 'email' && !verificationCode.trim())
                  || (shouldShowActivationInput && !activationInput.trim())
                }
                className="mt-4 inline-flex w-full items-center justify-center gap-3 rounded-[26px] bg-white px-5 py-5 text-[15px] font-bold text-[#050505] shadow-[0_25px_50px_-12px_rgba(255,255,255,0.15)] transition-all disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
              >
                {authStatus === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                <span className="tracking-wide">
                  {authStatus === 'checking' ? '正在恢复会话' : authStatus === 'submitting' ? '处理中...' : submitLabel}
                </span>
              </motion.button>
            </div>

            {authHint && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-[24px] border border-blue-500/20 bg-blue-500/5 px-5 py-4 text-[13px] font-medium leading-relaxed text-blue-300/90"
              >
                {authHint}
              </motion.div>
            )}

            {authError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-[24px] border border-red-500/20 bg-red-500/5 px-5 py-4 text-[13px] font-medium leading-relaxed text-red-300/90"
              >
                {authError}
              </motion.div>
            )}

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
