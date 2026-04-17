import { motion } from 'motion/react';
import { LogOut, Sparkles, CheckCircle2, ArrowRight, Layers, UserRound } from 'lucide-react';
import { ActivationWorkspaceId } from '../../types';

interface WorkspaceHubProps {
  onSelect: (id: ActivationWorkspaceId) => void;
  onLogout: () => void;
  allowedWorkspaces: ActivationWorkspaceId[];
}

export function WorkspaceHub({ onSelect, onLogout, allowedWorkspaces }: WorkspaceHubProps) {
  const canAccess = (workspace: ActivationWorkspaceId) => allowedWorkspaces.includes(workspace);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-auto px-6 py-8"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
              {/* Optional header text can go here */}
          </div>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 self-start rounded-full border border-black/10 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F] md:self-auto"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出登录
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {canAccess('sabrina') ? (
            <button
              onClick={() => onSelect('sabrina')}
              className="group flex h-full flex-col rounded-[32px] border border-black/5 bg-white p-7 text-left shadow-[0_18px_50px_rgba(20,20,43,0.06)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(20,20,43,0.1)]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#111111] text-white shadow-[0_18px_40px_rgba(17,17,17,0.18)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
                  多模型PK
                </div>
              </div>
              <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                一次看清多个模型谁更合适
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                输入一句话，就能同时看到多个模型的回答，并自动整理关键差异，帮你少走回头路。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  适合模型选型和效果对比
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  自动提炼回答里的关键差异
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  减少反复切换和人工总结
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-8 text-sm font-semibold text-[#111111]">
                <span>开始模型对比</span>
                <span className="inline-flex items-center gap-1 text-blue-600 transition group-hover:translate-x-1">
                  打开
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </button>
          ) : null}

          {canAccess('open-day') ? (
            <button
              onClick={() => onSelect('open-day')}
              className="group flex h-full flex-col rounded-[32px] border border-black/5 bg-white p-7 text-left shadow-[0_18px_50px_rgba(20,20,43,0.06)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(20,20,43,0.1)]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#1F5F4A] text-white shadow-[0_18px_40px_rgba(31,95,74,0.18)]">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  小区开放日选址
                </div>
              </div>
              <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                更快筛出值得重点做开放日的小区
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                上传楼盘表格后，系统会帮你整理数据并完成测算，快速看出哪些项目更值得优先投入。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  批量处理楼盘数据，不再手工筛表
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  更快看出哪些小区值得优先跟进
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  适合做开放日前的快速判断
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-8 text-sm font-semibold text-[#111111]">
                <span>开始楼盘测算</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 transition group-hover:translate-x-1">
                  打开
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </button>
          ) : null}

          {canAccess('selling-houses') ? (
            <button
              onClick={() => onSelect('selling-houses')}
              className="group flex h-full flex-col rounded-[32px] border border-black/5 bg-white p-7 text-left shadow-[0_18px_50px_rgba(20,20,43,0.06)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(20,20,43,0.1)]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#B45309] text-white shadow-[0_18px_40px_rgba(180,83,9,0.18)]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                  我是王牌资产顾问
                </div>
              </div>
              <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                帮业主决策，成为王牌顾问
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                围绕业主目标做判断，在价格、节奏和沟通之间拿稳分寸。现在支持 6 档难度，先打代表局，再按同难度随机刷一局。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-700" />
                  6 档难度：热身、入门、标准、进阶、高压、极限
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-700" />
                  每档先给一张代表局，先感受这一档的局面味道
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-700" />
                  也能按同难度随机生成新环境，反复练手感
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold text-amber-800">
                {['热身', '入门', '标准', '进阶', '高压', '极限'].map((label) => (
                  <span key={label} className="rounded-full bg-amber-50 px-3 py-1">
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-8 text-sm font-semibold text-[#111111]">
                <span>进入顾问模式</span>
                <span className="inline-flex items-center gap-1 text-amber-700 transition group-hover:translate-x-1">
                  打开
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </button>
          ) : null}
        </div>

        {allowedWorkspaces.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 px-6 py-10 text-center text-sm text-[#6E6E73]">
            当前 key 还没有分配可访问子项目，请联系管理员补充权限。
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
