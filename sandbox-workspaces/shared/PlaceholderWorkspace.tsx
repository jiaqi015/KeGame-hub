
import React from 'react';

type PlaceholderFuturePlay = { title: string; body: string };

export type PlaceholderWorkspaceProps = {
  badge: string;
  title: string;
  subtitle: string;
  heroImageSrc: string;
  heroImageAlt: string;
  heroTagline: string;
  heroSubline: string;
  advisorBlock: { title: string; paragraphs: string[] };
  futurePlays: { sectionTitle: string; items: PlaceholderFuturePlay[] };
  prompts: string[];
  nextSteps: string[];
  tone?: 'sky' | 'rose';
};

export function PlaceholderWorkspace({
  badge,
  title,
  subtitle,
  heroImageSrc,
  heroImageAlt,
  heroTagline,
  heroSubline,
  advisorBlock,
  futurePlays,
  prompts,
  nextSteps,
  tone = 'sky',
}: PlaceholderWorkspaceProps) {
  const accentClassName = tone === 'rose'
    ? 'bg-[#B9385D] text-white shadow-[0_18px_34px_rgba(185,56,93,0.18)]'
    : 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]';
  const badgeClassName = tone === 'rose'
    ? 'bg-rose-50 text-rose-700'
    : 'bg-sky-50 text-sky-700';
  const sectionClassName = tone === 'rose'
    ? 'border-rose-200/80 bg-gradient-to-b from-rose-50/90 to-rose-50/40'
    : 'border-sky-200/80 bg-gradient-to-b from-sky-50/90 to-sky-50/40';
  const pageBg = tone === 'rose'
    ? 'bg-[radial-gradient(circle_at_15%_10%,rgba(244,63,94,0.1),transparent_40%),radial-gradient(circle_at_90%_0%,rgba(185,56,93,0.08),transparent_45%),linear-gradient(180deg,#fffafb,#ffffff)]'
    : 'bg-[radial-gradient(circle_at_12%_8%,rgba(14,165,233,0.1),transparent_42%),radial-gradient(circle_at_88%_5%,rgba(15,76,129,0.08),transparent_45%),linear-gradient(180deg,#f8fcff,#ffffff)]';
  const futureCard = tone === 'rose'
    ? 'border-rose-100/90 bg-rose-50/40'
    : 'border-sky-100/90 bg-sky-50/40';
  const heroFrame = tone === 'rose'
    ? 'border-rose-100/80 bg-gradient-to-b from-rose-50/80 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
    : 'border-sky-100/80 bg-gradient-to-b from-sky-50/80 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]';

  return (
    <div className={`flex h-full items-start justify-center overflow-y-auto ${pageBg} px-4 py-10 sm:px-8`}>
      <div className="w-full max-w-5xl rounded-[36px] border border-black/5 bg-white/95 p-6 shadow-[0_24px_70px_rgba(20,20,43,0.08)] sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClassName}`}>
              {badge}
            </div>
            <div className="mt-4 flex items-start gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] ${accentClassName}`}>
                <span className="text-sm font-bold tracking-tight">AI</span>
              </div>
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-[#111111] sm:text-[30px]">{title}</h2>
                <p className="mt-2 text-[15px] leading-7 text-[#6E6E73]">{subtitle}</p>
              </div>
            </div>

            <div className={`mt-7 overflow-hidden rounded-[28px] border ${heroFrame} p-3 sm:p-4`}>
              <img
                src={heroImageSrc}
                alt={heroImageAlt}
                className="h-44 w-full rounded-[20px] object-cover object-center sm:h-52"
              />
              <p className="mt-4 text-center text-[16px] font-semibold text-[#111111] sm:text-left">{heroTagline}</p>
              <p className="mt-1 text-center text-[13px] leading-6 text-[#6E6E73] sm:text-left">{heroSubline}</p>
            </div>
          </div>

          <div className={`w-full max-w-md shrink-0 rounded-[24px] border px-5 py-5 ${sectionClassName}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500/90">{advisorBlock.title}</div>
            <div className="mt-3 space-y-2.5 text-[14px] leading-6 text-slate-700">
              {advisorBlock.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="mt-5 border-t border-black/5 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500/90">当前状态</div>
              <p className="mt-1.5 text-sm font-medium text-slate-800">已放开入口，可先体验叙事与方向对齐</p>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {futurePlays.sectionTitle}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {futurePlays.items.map((item) => (
              <div
                key={item.title}
                className={`flex flex-col rounded-[22px] border p-4 ${futureCard} shadow-[0_8px_30px_rgba(15,23,42,0.04)]`}
              >
                <div className="text-[15px] font-semibold text-[#111111]">{item.title}</div>
                <p className="mt-2 flex-1 text-[13px] leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-black/[0.05] bg-[#FCFCFD] p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">预设讨论提示</div>
            <div className="mt-4 space-y-3">
              {prompts.map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 text-[14px] leading-6 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-black/[0.05] bg-white p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">下一步</div>
            <div className="mt-4 space-y-3">
              {nextSteps.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-[20px] border border-black/[0.05] bg-slate-50/80 px-4 py-4">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${badgeClassName}`}>
                    {index + 1}
                  </div>
                  <div className="text-[14px] leading-6 text-slate-700">{item}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
