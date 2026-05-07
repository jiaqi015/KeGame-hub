import type { GameState, ProductRun, ProductRunMilestone, ProductRunMilestoneKind, ProductType } from './models.js';

type ProductRunTemplateMilestone = {
  id: string;
  title: string;
  summary: string;
  dayOffset: number;
  kind: ProductRunMilestoneKind;
  settlementHint: string;
};

export type ProductRunTransition = {
  runId: string;
  productType: ProductType;
  fromMilestone: string;
  toMilestone: string | null;
  completed: boolean;
};

const PRODUCT_RUN_MILESTONE_TEMPLATES: Record<ProductType, ProductRunTemplateMilestone[]> = {
  'open-day': [
    {
      id: 'owner-signup-invite',
      title: '邀请业主参加开放日报名',
      summary: '先把小区内关键业主邀进开放日，统一目标和排期。',
      dayOffset: 0,
      kind: 'light_scene',
      settlementHint: '业主授权和配合度反馈',
    },
    {
      id: 'audience-invite',
      title: '邀请客户 / 经纪人',
      summary: '围绕目标客群发邀约，把来访结构做厚。',
      dayOffset: 1,
      kind: 'event',
      settlementHint: '邀约覆盖和到访意向反馈',
    },
    {
      id: 'open-day-showing',
      title: '开放日当天带看',
      summary: '集中承接带看与现场反馈，沉淀高质量意向。',
      dayOffset: 2,
      kind: 'event',
      settlementHint: '到访质量和带看结果反馈',
    },
    {
      id: 'owner-monday-feedback',
      title: '周一反馈开放日结果',
      summary: '向业主回传开放日成果与问题，形成下一步共识。',
      dayOffset: 3,
      kind: 'light_scene',
      settlementHint: '业主确认与后续经营反馈',
    },
    {
      id: 'conversion-followup',
      title: '转化期跟进（调价/二带/出价）',
      summary: '把活动热度转成成交推进动作。',
      dayOffset: 4,
      kind: 'event',
      settlementHint: '转化动作与机会推进反馈',
    },
  ],
  'sincere-sale': [
    {
      id: 'owner-signin',
      title: '说服业主进入诚意卖',
      summary: '先谈拢机制边界与推进节奏，拿到进入授权。',
      dayOffset: 0,
      kind: 'heavy_scene',
      settlementHint: '业主是否确认进入诚意卖',
    },
    {
      id: 'set-hidden-price',
      title: '设置隐藏成交价',
      summary: '明确隐藏价与可谈区间，统一谈判口径。',
      dayOffset: 1,
      kind: 'heavy_scene',
      settlementHint: '隐藏价策略和口径确认',
    },
    {
      id: 'bid-followup',
      title: '运行中的报价跟进',
      summary: '持续跟进报价，维持交易热度与确定性。',
      dayOffset: 2,
      kind: 'event',
      settlementHint: '报价推进与客户活跃反馈',
    },
    {
      id: 'settlement-feedback',
      title: '结算反馈',
      summary: '达标成交或结束回落到普通经营，并完成复盘反馈。',
      dayOffset: 3,
      kind: 'light_scene',
      settlementHint: '成交/未成交结果反馈',
    },
  ],
};

function resolveRunScope(productType: ProductType): ProductRun['scope'] {
  return productType === 'open-day' ? 'community' : 'listing';
}

function runDisplayName(productType: ProductType) {
  return productType === 'open-day' ? '开放日' : '诚意卖';
}

function buildRunId(state: GameState, productType: ProductType) {
  const suffix = state.productRuns.length + state.eventStore.length + 1;
  return `product-run-${productType}-${state.day}-${suffix}`;
}

export function getProductRunTemplates(productType: ProductType): ProductRunTemplateMilestone[] {
  return PRODUCT_RUN_MILESTONE_TEMPLATES[productType];
}

export function createProductRun(
  state: GameState,
  productType: ProductType,
  targetIds: string[],
): ProductRun {
  const milestones = buildProductRunMilestones(productType, state.day);
  return {
    id: buildRunId(state, productType),
    productType,
    scope: resolveRunScope(productType),
    status: 'running',
    startDay: state.day,
    targetIds,
    nextMilestone: milestones[0]?.id || 'completed',
    linkedEventIds: [],
    milestones,
  };
}

export function hasActiveProductRunForTargets(
  state: GameState,
  productType: ProductType,
  targetIds: string[],
) {
  const targetSet = new Set(targetIds);
  return state.productRuns.some((run) => (
    run.productType === productType
    && run.status === 'running'
    && run.targetIds.some((id) => targetSet.has(id))
  ));
}

export function buildProductRunMilestones(
  productType: ProductType,
  startDay: number,
): ProductRunMilestone[] {
  return getProductRunTemplates(productType).map((entry) => ({
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    day: startDay + entry.dayOffset,
    kind: entry.kind,
    settlementHint: entry.settlementHint,
  }));
}

export function findCurrentMilestone(run: ProductRun, day: number): ProductRunMilestone | null {
  const milestones = run.milestones || [];
  if (!milestones.length) {
    return null;
  }

  const current = milestones.find((entry) => entry.day >= day);
  return current || null;
}

export function advanceProductRunsForDay(state: GameState): ProductRunTransition[] {
  const transitions: ProductRunTransition[] = [];

  state.productRuns.forEach((run) => {
    if (run.status !== 'running') {
      return;
    }

    const beforeMilestone = run.nextMilestone;
    const currentMilestone = findCurrentMilestone(run, state.day);

    if (!currentMilestone) {
      run.status = 'completed';
      run.endDay = state.day;
      run.nextMilestone = 'completed';
      transitions.push({
        runId: run.id,
        productType: run.productType,
        fromMilestone: beforeMilestone,
        toMilestone: null,
        completed: true,
      });
      return;
    }

    run.nextMilestone = currentMilestone.id;
    if (beforeMilestone !== run.nextMilestone) {
      transitions.push({
        runId: run.id,
        productType: run.productType,
        fromMilestone: beforeMilestone,
        toMilestone: run.nextMilestone,
        completed: false,
      });
    }
  });

  return transitions;
}

export function findMilestoneById(run: ProductRun, milestoneId: string) {
  return (run.milestones || []).find((entry) => entry.id === milestoneId) || null;
}

export function milestoneKindLabel(kind: ProductRunMilestoneKind) {
  if (kind === 'heavy_scene') return '重情景';
  if (kind === 'light_scene') return '轻情景';
  return '普通事件';
}

export function describeRunMilestone(run: ProductRun, milestoneId: string | null) {
  if (!milestoneId) {
    return `${runDisplayName(run.productType)} run 已完成。`;
  }
  const milestone = findMilestoneById(run, milestoneId);
  if (!milestone) {
    return `${runDisplayName(run.productType)} run 进入下一节点。`;
  }
  return `${runDisplayName(run.productType)} run 当前节点：${milestone.title}（${milestoneKindLabel(milestone.kind)}）。`;
}
