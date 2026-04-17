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
      className="flex-1 overflow-auto px-6 py-12 bg-[#FBFBFD]"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8E8E93]">
              <Sparkles className="h-3 w-3" />
              Sabrina AI Ecosystem
            </div>
            <p className="max-w-xl text-[22px] font-semibold leading-[1.4] tracking-tight text-[#1D1D1F]">
              把不同场景里的复杂决策，<br />拆解为可实时感知的下一步。
            </p>
          </div>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 self-start rounded-full border border-black/10 bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition-all hover:border-black/20 hover:bg-[#F5F5F7] hover:text-[#1D1D1F] active:scale-95 md:self-auto"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {canAccess('sabrina') ? (
            <button
              onClick={() => onSelect('sabrina')}
              className="group flex h-full flex-col rounded-[32px] border border-black/5 bg-white p-8 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,0,0,0.08)]"
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
                快速判断哪个模型更适合这件事
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                把同一个问题交给多个模型，同时查看回答和差异总结，少靠感觉猜选型。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  一次输入，同时获得多模型结果
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  自动提炼关键差异和取舍
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  适合选模型、比方案、做快速判断
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
                更快选出值得投入开放日的小区
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                上传楼盘表格后，用统一口径完成测算排序，帮你把资源放到更可能出结果的项目上。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  批量清洗楼盘数据，减少手工筛表
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  用参数包和公式统一判断口径
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  适合开放日前排优先级和做复盘
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
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#8B5A2B] text-white shadow-[0_18px_34px_rgba(139,90,43,0.16)]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="rounded-full bg-[#F6EFE7] px-3 py-1 text-[11px] font-semibold text-[#8B5A2B]">
                  我是王牌资产顾问
                </div>
              </div>
              <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                帮业主决策，成为王牌顾问
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                围绕业主目标做判断，在价格、节奏和沟通之间拿稳分寸，把每一次建议都做得更专业。
              </p>
              <div className="mt-6 space-y-3 text-sm text-[#424245]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#8B5A2B]" />
                  快速看清每套房现在该怎么推
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#8B5A2B]" />
                  练习定价沟通、开放日和议价取舍
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#8B5A2B]" />
                  在窗口压力和业主预期之间做稳判断
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold text-[#8B5A2B]">
                {['定价', '带看', '开放日', '议价'].map((label) => (
                  <span key={label} className="rounded-full bg-[#F6EFE7] px-3 py-1">
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-8 text-sm font-semibold text-[#111111]">
                <span>进入顾问训练</span>
                <span className="inline-flex items-center gap-1 text-[#8B5A2B] transition group-hover:translate-x-1">
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
