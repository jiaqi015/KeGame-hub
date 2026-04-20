import type {
  ActionBattleTemplate,
  ActionDefinition,
  ActionStrategyDefinition,
  Case,
  GameState,
} from '../models.js';
import { getActiveOpportunities } from '../engine.js';

function buildTemplate(
  template: Omit<ActionBattleTemplate, 'buildBody' | 'getStrategies'> & {
    buildBody: (state: GameState, caseItem: Case, action: ActionDefinition) => string;
    getStrategies: (state: GameState, caseItem: Case, action: ActionDefinition) => ActionStrategyDefinition[];
  },
): ActionBattleTemplate {
  return template;
}

function summarizeOpportunities(state: GameState, caseItem: Case) {
  const opportunities = getActiveOpportunities(state, caseItem.id);
  const predicted = opportunities.filter(opportunity => opportunity.visibility === 'shadow').length;
  const engaged = opportunities.filter(opportunity => opportunity.visibility !== 'shadow').length;
  return { opportunities, predicted, engaged };
}

export const ACTION_TEMPLATES: Record<string, ActionBattleTemplate> = {
  'feedback-visit': buildTemplate({
    id: 'feedback-visit',
    actor: 'owner',
    title: '首次面访',
    summary: '建立第一轮经营共识，让业主明确你在怎么经营这套房。',
    metricFocus: ['trust', 'patience', 'd3', 'windowDays'],
    buildBody: (state, caseItem) => {
      const { predicted, engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.ownerName} 当前状态：${caseItem.ownerMood || '平稳'}。这次面访要把房源现状、客户情况和后续经营路径讲清楚。当前已有 ${engaged} 位接洽中的客户，另有 ${predicted} 位待确认客户。`;
    },
    getStrategies: () => [
      { id: 'rapport-first', title: '先聊目标和顾虑', note: '先建立情绪信任，适合关系还没真正建立的时候。' },
      { id: 'data-first', title: '先给市场和客户信息', note: '更专业，但如果太硬，容易让业主觉得被教育。' },
      { id: 'plan-first', title: '先讲经营计划', note: '突出你接下来会怎么做，适合想要确定感的业主。' },
    ],
  }),
  'feedback-weekly': buildTemplate({
    id: 'feedback-weekly',
    actor: 'owner',
    title: '周度反馈',
    summary: '把本周进展、风险和下一步安排反馈给业主。',
    metricFocus: ['trust', 'patience', 'd3', 'urgency'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 本周累计热度 ${Math.round(caseItem.heat)}，当前好房分 ${Math.round(caseItem.competitiveness)}。你需要决定这次周反馈更强调进展、风险还是执行安排。当前有 ${engaged} 位客户已进入接洽。`;
    },
    getStrategies: () => [
      { id: 'show-progress', title: '突出本周进展', note: '更容易稳住情绪，但会弱化当前风险。' },
      { id: 'show-risk', title: '坦诚讲风险', note: '更专业，但如果关系薄，会让业主压力变大。' },
      { id: 'show-plan', title: '把下周安排讲清楚', note: '更容易换来继续配合和授权。' },
    ],
  }),
  'feedback-diagnosis': buildTemplate({
    id: 'feedback-diagnosis',
    actor: 'owner',
    title: '深度诊断',
    summary: '拿竞争、客户和带看线索做一次更深入的诊断。',
    metricFocus: ['trust', 'd3', 'competitiveness', 'intent'],
    buildBody: (state, caseItem) => {
      const { predicted, engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前价格 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。现在已经卡住了，这次诊断需要讲清楚：问题到底来自价格、讲法，还是客户匹配。当前 ${predicted} 位待确认客户、${engaged} 位接洽客户。`;
    },
    getStrategies: () => [
      { id: 'market-dive', title: '从竞品切入', note: '更像专业顾问视角，适合务实型业主。' },
      { id: 'customer-dive', title: '从客户反馈切入', note: '更容易让业主理解真实市场接受度。' },
      { id: 'decision-dive', title: '从决策窗口切入', note: '强调“现在不改会怎样”，适合窗口变短时。' },
    ],
  }),
  'marketing-story': buildTemplate({
    id: 'marketing-story',
    actor: 'market',
    title: '精修卖点',
    summary: '决定这套房接下来怎么讲，讲给谁听。',
    metricFocus: ['competitiveness', 'heat', 'd2', 'trust'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.title} 当前标签：${(caseItem.tags || []).slice(0, 3).join(' / ') || '暂无明显标签'}。你要决定下一轮营销更强调产品力、价格效率，还是业主确定性感。`;
    },
    getStrategies: () => [
      { id: 'product-angle', title: '强调房子本身的优势', note: '更容易提升好房分，但需要房子本身足够能打。' },
      { id: 'value-angle', title: '强调性价比', note: '更适合价格偏硬或客户犹豫时。' },
      { id: 'certainty-angle', title: '强调交易确定性', note: '适合窗口偏紧、想加快推进速度时。' },
    ],
  }),
  'marketing-xiaohongshu': buildTemplate({
    id: 'marketing-xiaohongshu',
    actor: 'market',
    title: '小红书推广',
    summary: '决定这轮公开内容是要量、要准，还是要口碑。',
    metricFocus: ['heat', 'd1', 'competitiveness'],
    buildBody: (state, caseItem) => {
      const { predicted, engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前热度 ${Math.round(caseItem.heat)}。小红书推广会直接影响公开客户进入速度，但也可能引来更多需要筛选的人。当前待确认客户 ${predicted} 位，接洽客户 ${engaged} 位。`;
    },
    getStrategies: () => [
      { id: 'traffic-push', title: '冲流量', note: '更容易补量，但线索质量更参差。' },
      { id: 'precise-push', title: '做精准种草', note: '量没那么大，但匹配度更高。' },
      { id: 'reputation-push', title: '做口碑内容', note: '更稳，更适合保长期信任和整体感受。' },
    ],
  }),
  'marketing-broker': buildTemplate({
    id: 'marketing-broker',
    actor: 'market',
    title: '经纪人投放',
    summary: '决定这轮经纪人网络是广撒，还是精投。',
    metricFocus: ['heat', 'd1', 'competitiveness'],
    buildBody: (state, caseItem) => {
      const { predicted } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前已有 ${predicted} 位待确认客户。你要决定这轮经纪人投放是补覆盖、补质量，还是找少数核心经纪人深推。`;
    },
    getStrategies: () => [
      { id: 'wide-network', title: '广撒网络', note: '更容易补量，但后续要花时间消化。' },
      { id: 'target-network', title: '定向投放', note: '效率更高，但覆盖面没有那么广。' },
      { id: 'core-network', title: '压给核心经纪人', note: '量最少，但反馈速度通常最快。' },
    ],
  }),
  'marketing-private': buildTemplate({
    id: 'marketing-private',
    actor: 'market',
    title: '私域转介绍',
    summary: '用熟人关系链换更稳定的客户质量。',
    metricFocus: ['trust', 'heat', 'd1'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.title} 当前业主信任 ${Math.round(caseItem.trust)}。私域转介绍更看关系基础和说法是否顺，适合想要更稳、更准客户的时候。`;
    },
    getStrategies: () => [
      { id: 'owner-circle', title: '走业主关系圈', note: '更看业主配合，容易换来确定感。' },
      { id: 'old-client-circle', title: '走老客户圈', note: '更稳，但需要你过去的关系沉淀。' },
      { id: 'vip-circle', title: '走高净值小圈层', note: '量少，但可能带来更强购买力。' },
    ],
  }),
  'marketing-open-day': buildTemplate({
    id: 'marketing-open-day',
    actor: 'market',
    title: '开放日',
    summary: '决定这次开放日是拼热度、拼质量，还是拼转化。',
    metricFocus: ['heat', 'd1', 'trust', 'windowDays'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前热度 ${Math.round(caseItem.heat)}，窗口剩余 ${caseItem.windowDays} 天。开放日成本较高，但如果组织得好，能快速带来一波看房和转化机会。当前已有 ${engaged} 位接洽客户。`;
    },
    getStrategies: () => [
      { id: 'heat-open-day', title: '先冲场面和热度', note: '更容易把关注度拉起来，但客群质量不一定最优。' },
      { id: 'quality-open-day', title: '优先高质量到访', note: '量小一些，但更容易接近真实买家。' },
      { id: 'conversion-open-day', title: '围绕转化来组织', note: '更适合已经有意向客户时集中推进。' },
    ],
  }),
  'marketing-showing': buildTemplate({
    id: 'marketing-showing',
    actor: 'customer',
    title: '安排带看',
    summary: '决定这次带看是走效率、走体验，还是走成交线。',
    metricFocus: ['intent', 'confidence', 'heat', 'd1'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前有 ${engaged} 位接洽客户。带看不仅影响客户是否愿意继续推进，也会反过来影响业主对经营节奏的判断。`;
    },
    getStrategies: () => [
      { id: 'efficiency-showing', title: '效率型带看', note: '更快，但体验会稍弱。' },
      { id: 'experience-showing', title: '体验型带看', note: '更容易建立好感，但成本更高。' },
      { id: 'closing-showing', title: '转化型带看', note: '更像提前预热后续谈判。' },
    ],
  }),
  'pricing-advice': buildTemplate({
    id: 'pricing-advice',
    actor: 'owner',
    title: '定价建议',
    summary: '先帮业主看清价格站位和为什么现在该谈。',
    metricFocus: ['trust', 'd3', 'competitiveness', 'askPrice'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.ownerName} 当前对价格的接受度，决定了后面是继续保价、小调，还是直接走快卖路线。当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。`;
    },
    getStrategies: () => [
      { id: 'compete-view', title: '先讲竞品压力', note: '更理性，但容易让业主觉得你在压价。' },
      { id: 'client-view', title: '先讲客户反馈', note: '更容易让业主接受真实市场反馈。' },
      { id: 'window-view', title: '先讲时间窗口', note: '更适合窗口紧、节奏慢的盘。' },
    ],
  }),
  'pricing-anchor': buildTemplate({
    id: 'pricing-anchor',
    actor: 'owner',
    title: '询问心理价',
    summary: '先摸清业主真实想法，再决定后续怎么谈价。',
    metricFocus: ['trust', 'd3', 'askPrice'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.title} 现在最大的定价不确定性，未必是市场，而可能是业主真实底线还没被你摸清。这一步更像是先打开价格沟通。`;
    },
    getStrategies: () => [
      { id: 'soft-anchor', title: '温和试探', note: '更容易保关系，但不一定能问到底。' },
      { id: 'data-anchor', title: '带数据去问', note: '更专业，也更容易触发防御。' },
      { id: 'bottom-anchor', title: '直接问底线', note: '效率最高，但最考验关系基础。' },
    ],
  }),
  'pricing-adjust': buildTemplate({
    id: 'pricing-adjust',
    actor: 'owner',
    title: '商讨挂牌价调整',
    summary: '真正进入价格调整讨论，在关系、价格和速度之间做选择。',
    metricFocus: ['askPrice', 'trust', 'heat', 'competitiveness'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.title} 当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。你要决定是守价、小调，还是直接换成快卖打法。`;
    },
    getStrategies: () => [
      { id: 'hold-story', title: '守价换讲法', note: '先不动价格，靠表达和包装争取窗口。' },
      { id: 'small-cut', title: '小幅调整', note: '在关系和速度之间找平衡。' },
      { id: 'deep-cut', title: '尽快卖掉', note: '牺牲部分价格，换更高确定性。' },
    ],
  }),
  'negotiation-sincerity': buildTemplate({
    id: 'negotiation-sincerity',
    actor: 'customer',
    title: '建议参与诚意卖',
    summary: '决定是否把交易推进到更明确的诚意阶段。',
    metricFocus: ['intent', 'confidence', 'askPrice', 'trust'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前已有 ${engaged} 位接洽客户。参与诚意卖会提高快成交阶段的推进效率，但也会让价格预期更快摊开。`;
    },
    getStrategies: () => [
      { id: 'strict-sincerity', title: '高门槛诚意卖', note: '更能保价，但可能把部分客户挡在外面。' },
      { id: 'balanced-sincerity', title: '平衡型诚意卖', note: '兼顾成交率和价格空间。' },
      { id: 'fast-sincerity', title: '尽快成交模式', note: '优先换确定性，适合窗口短时。' },
    ],
  }),
  'negotiation-invite': buildTemplate({
    id: 'negotiation-invite',
    actor: 'customer',
    title: '邀请和客户谈判',
    summary: '把高阶段客户真正拉上谈判桌。',
    metricFocus: ['intent', 'confidence', 'askPrice', 'trust'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 现在已经到了快成交阶段。你需要决定这次谈判更偏保价、平衡，还是优先成交。当前接洽客户 ${engaged} 位。`;
    },
    getStrategies: () => [
      { id: 'hold', title: '守价硬谈', note: '价格最好，但谈崩风险也最大。' },
      { id: 'balanced', title: '平衡推进', note: '兼顾价格和成交率。' },
      { id: 'close', title: '成交优先', note: '更容易尽快成交，但成交价会更低。' },
    ],
  }),
};

export function getActionTemplate(action: ActionDefinition) {
  return ACTION_TEMPLATES[action.templateId];
}
