import type {
  ActionBattleTemplate,
  ActionDefinition,
  Case,
  GameState,
} from '../models.js';
import { getActiveOpportunities } from '../engine.js';

export type ScenarioMode = 'heavy' | 'light';

export type StrategyOption = {
  id: string;
  title: string;
  note: string;
};

export type CharacterFeedback = {
  actor: 'owner' | 'customer' | 'market';
  mood: 'positive' | 'neutral' | 'negative';
  message: string;
  metricChanges: Array<{ label: string; change: number }>;
  revealedInfo?: Record<string, unknown>;
};

export type Settlement = {
  outcome: 'strong-progress' | 'progress' | 'stall' | 'regress';
  title: string;
  summary: string;
  details: string[];
  stateDeltas: Array<{ field: string; value: number; label: string }>;
  nextActionHint: string;
};

export type ScenarioResult = {
  settlement: Settlement;
  choices: Array<{ round: number; main: string; assist: string }>;
  feedbacks: CharacterFeedback[];
  templateId: string;
};

export type RoundDefinition = {
  roundIndex: number;
  title: string;
  description: string;
  mainStrategies: StrategyOption[];
  assistStrategies: StrategyOption[];
  getFeedback: (
    mainChoice: string,
    assistChoice: string,
    state: GameState,
    caseItem: Case,
  ) => CharacterFeedback;
};

export type ScenarioActionTemplate = ActionBattleTemplate & {
  scenarioMode: ScenarioMode;
  scenarioTitle: string;
  goal: string;
  getContextBullets: (state: GameState, caseItem: Case) => string[];
  rounds?: RoundDefinition[];
  strategies?: { main: StrategyOption[]; assist: StrategyOption[] };
  getFeedback?: (
    mainChoice: string,
    assistChoice: string,
    state: GameState,
    caseItem: Case,
  ) => CharacterFeedback;
  resolveOutcome: (
    choices: Array<{ round: number; main: string; assist: string }>,
    feedbacks: CharacterFeedback[],
    state: GameState,
    caseItem: Case,
  ) => Settlement;
};

function buildTemplate(
  template: Omit<ActionBattleTemplate, 'buildBody' | 'getStrategies'> & {
    buildBody: (state: GameState, caseItem: Case, action: ActionDefinition) => string;
    getStrategies: (state: GameState, caseItem: Case, action: ActionDefinition) => StrategyOption[];
  },
): ActionBattleTemplate {
  return template;
}

function buildScenarioTemplate(template: ScenarioActionTemplate): ScenarioActionTemplate {
  return template;
}

function summarizeOpportunities(state: GameState, caseItem: Case) {
  const opportunities = getActiveOpportunities(state, caseItem.id);
  const predicted = opportunities.filter((opportunity) => opportunity.visibility === 'shadow').length;
  const engaged = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow').length;
  return { opportunities, predicted, engaged };
}

export const SCENARIO_ACTION_TEMPLATES: Record<string, ScenarioActionTemplate> = {
  'first-visit': buildScenarioTemplate({
    id: 'first-visit',
    actor: 'owner',
    title: '首次面访',
    scenarioTitle: '首次面访',
    scenarioMode: 'light',
    goal: '把业主顾虑、节奏和合作基础摸清',
    metricFocus: ['trust', 'patience', 'd3', 'windowDays'],
    getContextBullets: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return [
        `当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万`,
        `当前已有 ${engaged} 位接洽客户`,
        `当前还可推进 ${caseItem.windowDays} 天`,
      ];
    },
    rounds: [
      {
        roundIndex: 1,
        title: '第一次怎么开场',
        description: '业主对卖房这件事心里有很多顾虑，第一句话的风格决定了后续的对话基调。',
        mainStrategies: [
          { id: 'rapport-first', title: '先聊目标和顾虑', note: '先建立情绪信任，适合关系还没真正建立的时候。' },
          { id: 'data-first', title: '先讲市场和客户信息', note: '更专业，但如果太硬，容易让业主觉得被教育。' },
          { id: 'plan-first', title: '先讲经营计划', note: '突出你接下来会怎么做，适合想要确定感的业主。' },
        ],
        assistStrategies: [
          { id: 'listen-more', title: '多听少说', note: '先让业主把话说完，更容易建立信任。' },
          { id: 'show-professional', title: '先建立专业感', note: '用数据和案例说话，适合务实型业主。' },
          { id: 'show-actions', title: '先讲可执行动作', note: '突出接下来的具体安排，给业主确定感。' },
          { id: 'build-rapport', title: '先拉近关系', note: '从共同话题切入，适合关系导向的业主。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          const trustBonus = mainChoice === 'rapport-first' ? 3 : mainChoice === 'plan-first' ? 2 : 1;
          const assistBonus = assistChoice === 'listen-more' ? 2 : assistChoice === 'build-rapport' ? 2 : 1;
          const random = Math.random() * 2 - 1;
          const trustChange = Math.round(trustBonus + assistBonus + random);

          const messages = {
            'rapport-first': [
              '"嗯，你说得对，这些确实是我关心的。"',
              '"你能理解我的顾虑就好。"',
              '"看来你确实在认真思考这件事。"',
            ],
            'data-first': [
              '"数据我看懂了，你继续说。"',
              '"这个市场情况我也有所耳闻。"',
              '"行，那你觉得我们接下来该怎么干？"',
            ],
            'plan-first': [
              '"这个计划听起来还可以。"',
              '"只要能推进，我愿意配合。"',
              '"那就按你说的先试试看。"',
            ],
          };

          const messageList = messages[mainChoice as keyof typeof messages] || messages['data-first'];
          const message = messageList[Math.floor(Math.random() * messageList.length)];
          const mood = trustChange >= 3 ? 'positive' : trustChange >= 2 ? 'neutral' : 'negative';

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: trustChange },
              { label: '耐心', change: Math.round(0.5 + Math.random()) },
            ],
          };
        },
      },
      {
        roundIndex: 2,
        title: '确认下一步',
        description: '第一次面访的结尾，要确认业主的接受度和接下来的节奏。',
        mainStrategies: [
          { id: 'confirm-agreement', title: '确认共识点', note: '把聊到的共识点总结出来，锁定基础。' },
          { id: 'confirm-next-steps', title: '明确下周安排', note: '把接下来要做的动作讲清楚，推进节奏。' },
          { id: 'confirm-commitment', title: '确认业主配合度', note: '探一下业主愿意做哪些配合。' },
        ],
        assistStrategies: [
          { id: 'set-low-expectation', title: '先降预期', note: '先说明不会太快，避免后续失望。' },
          { id: 'share-success-case', title: '讲个成功案例', note: '用案例给信心，适合业主还犹豫的时候。' },
          { id: 'set-first-milestone', title: '设第一个里程碑', note: '比如"一周内出第一个带看反馈"。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          const trustBonus = mainChoice === 'confirm-agreement' ? 2 : mainChoice === 'confirm-next-steps' ? 1 : 1;
          const assistBonus = assistChoice === 'set-first-milestone' ? 1 : 0;
          const trustChange = trustBonus + assistBonus;

          const messages = {
            'confirm-agreement': '"你总结的很清楚，我也没什么其他顾虑了。"',
            'confirm-next-steps': '"行，下周就按这个安排来。"',
            'confirm-commitment': '"该配合的我会配合，前提是你确实在推进。"',
          };

          const message = messages[mainChoice as keyof typeof messages] || messages['confirm-next-steps'];
          const mood = trustChange >= 2 ? 'positive' : 'neutral';

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: trustChange },
              { label: '耐心', change: mood === 'positive' ? 1 : 0 },
            ],
          };
        },
      },
    ],
    resolveOutcome: (choices, feedbacks, state, caseItem) => {
      const totalTrustDelta = feedbacks.reduce((sum, f) => {
        const trustChange = f.metricChanges.find((m) => m.label === '信任')?.change || 0;
        return sum + trustChange;
      }, 0);

      const choiceSummary = choices.map((c) => c.main).join(' + ');

      if (totalTrustDelta >= 4) {
        return {
          outcome: 'strong-progress',
          title: '初次印象很好',
          summary: '业主对你的第一印象不错，愿意继续配合。',
          details: [
            `你选择了「${choiceSummary}」的开场方式`,
            '业主明显放下了防备，愿意继续沟通',
            '信任关系初步建立',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
            { field: 'patience', value: 1, label: '耐心' },
          ],
          nextActionHint: '接下来可以继续推进周度反馈或营销动作。',
        };
      }
      if (totalTrustDelta >= 2) {
        return {
          outcome: 'progress',
          title: '初次印象尚可',
          summary: '业主还在观察你，但至少没有抵触。',
          details: [
            `你选择了「${choiceSummary}」的开场方式`,
            '业主态度偏保守，但愿意继续看看',
            '需要后续动作继续巩固关系',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
          ],
          nextActionHint: '下周周度反馈是巩固关系的好机会。',
        };
      }
      return {
        outcome: 'stall',
        title: '业主还在试探',
        summary: '第一次见面没完全打开，业主还在观望。',
        details: [
          `你选择了「${choiceSummary}」的开场方式`,
          '业主还有保留，没完全信任你的判断',
          '需要用更多事实和行动来建立专业形象',
        ],
        stateDeltas: [
          { field: 'trust', value: totalTrustDelta, label: '信任' },
        ],
          nextActionHint: '下次沟通多带市场和客户数据。',
      };
    },
    buildBody: (state, caseItem, action) => {
      const { predicted, engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.ownerName} 当前状态：${caseItem.ownerMood || '平稳'}。这次面访要把房源现状、客户情况和后续经营路径讲清楚。当前已有 ${engaged} 位接洽中的客户，另有 ${predicted} 位待确认客户。`;
    },
    getStrategies: () => [
      { id: 'rapport-first', title: '先聊目标和顾虑', note: '先建立情绪信任，适合关系还没真正建立的时候。' },
      { id: 'data-first', title: '先给市场和客户信息', note: '更专业，但如果太硬，容易让业主觉得被教育。' },
      { id: 'plan-first', title: '先讲经营计划', note: '突出你接下来会怎么做，适合想要确定感的业主。' },
    ],
    summary: '建立第一轮经营共识，让业主明确你在怎么经营这套房。',
  }),
  'weekly-feedback': buildScenarioTemplate({
    id: 'weekly-feedback',
    actor: 'owner',
    title: '周度反馈',
    scenarioTitle: '周度反馈',
    scenarioMode: 'light',
    goal: '把这一周的进展、风险和下一步讲清',
    metricFocus: ['trust', 'patience', 'd3', 'urgency'],
    getContextBullets: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return [
        `本周累计热度 ${Math.round(caseItem.heat)}`,
        `当前好房分 ${Math.round(caseItem.competitiveness)}`,
        `当前有 ${engaged} 位客户已进入接洽`,
      ];
    },
    rounds: [
      {
        roundIndex: 1,
        title: '这周怎么汇报',
        description: '周度反馈的开场很重要，怎么讲决定了业主这周的配合度。',
        mainStrategies: [
          { id: 'show-progress', title: '突出本周进展', note: '更容易稳住情绪，但会弱化当前风险。' },
          { id: 'show-risk', title: '坦诚讲风险', note: '更专业，但如果关系薄，会让业主压力变大。' },
          { id: 'show-plan', title: '把下周安排讲清楚', note: '更容易换来继续配合和授权。' },
        ],
        assistStrategies: [
          { id: 'use-client-feedback', title: '用客户反馈说话', note: '拿具体带看和跟进案例，更有说服力。' },
          { id: 'use-compare', title: '用同类房说话', note: '拿市场上的同类房源做对比。' },
          { id: 'use-rhythm', title: '用行动节奏说话', note: '突出你已经做了什么、接下来要做什么。' },
          { id: 'calm-first', title: '先稳情绪', note: '业主情绪波动时，先安抚再讲事实。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let trustBonus = 0;
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';

          if (mainChoice === 'show-progress') {
            if (caseItem.heat > 50) {
              message = '"听起来这周还不错，继续保持。"';
              trustBonus = 3;
              mood = 'positive';
            } else {
              message = '"进展是有一点，但感觉还不够快。"';
              trustBonus = 1;
              mood = 'neutral';
            }
          } else if (mainChoice === 'show-risk') {
            if (caseItem.trust > 50) {
              message = '"风险你说得很清楚，我理解。那你打算怎么办？"';
              trustBonus = 2;
              mood = 'neutral';
            } else {
              message = '"这么多问题？那你之前怎么不说！"';
              trustBonus = -2;
              mood = 'negative';
            }
          } else {
            message = '"行，那就按你说的下周安排来。"';
            trustBonus = 2;
            mood = 'neutral';
          }

          if (assistChoice === 'calm-first') {
            trustBonus += 1;
            mood = 'neutral';
          }

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: trustBonus },
              { label: '耐心', change: Math.round(Math.random()) },
            ],
          };
        },
      },
      {
        roundIndex: 2,
        title: '确认下周节奏',
        description: '讲完这周的情况后，要和业主对齐下周的目标和配合方式。',
        mainStrategies: [
          { id: 'agree-next-goal', title: '对齐下周目标', note: '比如"下周要出 2 个带看"，给明确预期。' },
          { id: 'lock-owner-action', title: '锁定业主要做的事', note: '比如配合拍照/视频/调价准备。' },
          { id: 'manage-expectation', title: '管理预期', note: '明确说明什么能控制、什么控制不了。' },
        ],
        assistStrategies: [
          { id: 'show-benchmark', title: '拿其他房源做标杆', note: '用真实案例说明节奏和方式。' },
          { id: 'reassure-effort', title: '重申你会持续投入', note: '让业主放心你不会放弃。' },
          { id: 'link-to-result', title: '把配合和结果挂钩', note: '说明业主配合度会直接影响卖房速度。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let trustBonus = 0;
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';

          if (mainChoice === 'agree-next-goal') {
            message = '"行，那就按这个目标来，下周看结果。"';
            trustBonus = 1;
            mood = 'neutral';
          } else if (mainChoice === 'lock-owner-action') {
            message = '"该我配合的我会配合，你提前说就行。"';
            trustBonus = 2;
            mood = 'positive';
          } else {
            message = '"我理解，卖房也不是一天两天的事。"';
            trustBonus = 1;
            mood = 'neutral';
          }

          if (assistChoice === 'reassure-effort') {
            trustBonus += 1;
            mood = 'positive';
          }

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: trustBonus },
              { label: '耐心', change: mood === 'positive' ? 1 : 0 },
            ],
          };
        },
      },
    ],
    resolveOutcome: (choices, feedbacks, state, caseItem) => {
      const totalTrustDelta = feedbacks.reduce((sum, f) => {
        const trustChange = f.metricChanges.find((m) => m.label === '信任')?.change || 0;
        return sum + trustChange;
      }, 0);

      const choiceSummary = choices.map((c) => c.main).join(' + ');

      if (totalTrustDelta >= 3) {
        return {
          outcome: 'strong-progress',
          title: '业主更放心了',
          summary: '这周的汇报让业主对你更有信心。',
          details: [
            `你选择了「${choiceSummary}」的汇报方式`,
            '业主明显更愿意配合后续动作',
            '关系进一步稳固',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
          ],
          nextActionHint: '可以继续推进深度诊断或价格沟通。',
        };
      }
      if (totalTrustDelta >= 1) {
        return {
          outcome: 'progress',
          title: '业主接受但还不踏实',
          summary: '汇报完成，但业主还需要更多证据。',
          details: [
            `你选择了「${choiceSummary}」的汇报方式`,
            '业主接受了现状，但还在观察后续执行',
            '需要用实际行动继续证明',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
          ],
          nextActionHint: '接下来要有具体客户或带看进展来支撑。',
        };
      }
      return {
        outcome: 'regress',
        title: '业主对风险更敏感了',
        summary: '这次汇报没有打消业主的顾虑。',
        details: [
          `你选择了「${choiceSummary}」的汇报方式`,
          '业主对当前局面有疑虑',
          '需要更快拿出进展来稳住局面',
        ],
        stateDeltas: [
          { field: 'trust', value: totalTrustDelta, label: '信任' },
        ],
        nextActionHint: '尽快安排带看或营销动作来提升热度。',
      };
    },
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 本周累计热度 ${Math.round(caseItem.heat)}，当前好房分 ${Math.round(caseItem.competitiveness)}。你需要决定这次周反馈更强调进展、风险还是执行安排。当前有 ${engaged} 位客户已进入接洽。`;
    },
    getStrategies: () => [
      { id: 'show-progress', title: '突出本周进展', note: '更容易稳住情绪，但会弱化当前风险。' },
      { id: 'show-risk', title: '坦诚讲风险', note: '更专业，但如果关系薄，会让业主压力变大。' },
      { id: 'show-plan', title: '把下周安排讲清楚', note: '更容易换来继续配合和授权。' },
    ],
    summary: '把本周进展、风险和下一步安排反馈给业主。',
  }),
  'adjust-listing-price': buildScenarioTemplate({
    id: 'adjust-listing-price',
    actor: 'owner',
    title: '挂牌价调整沟通',
    scenarioTitle: '挂牌价调整沟通',
    scenarioMode: 'heavy',
    goal: '判断怎么和业主谈要不要动价格、怎么动价格',
    metricFocus: ['askPrice', 'trust', 'heat', 'competitiveness'],
    getContextBullets: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return [
        `当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万`,
        `当前带看热度 ${Math.round(caseItem.heat)}，好房分 ${Math.round(caseItem.competitiveness)}`,
        `业主信任度 ${Math.round(caseItem.trust)}`,
        `当前接洽客户 ${engaged} 位`,
      ];
    },
    rounds: [
      {
        roundIndex: 1,
        title: '怎么开这个口',
        description: '业主对价格很敏感，第一句话的方式会影响整个对话的走向。',
        mainStrategies: [
          { id: 'market-reality', title: '先讲市场现实', note: '用数据说话，更客观，但容易触发业主防御。' },
          { id: 'customer-feedback', title: '先讲客户反馈', note: '用具体客户案例，更容易让业主接受现实。' },
          { id: 'time-window', title: '先讲拖延后果', note: '强调机会成本，适合推进吃紧时。' },
          { id: 'empathy-first', title: '先共情，再切价格', note: '先理解业主的感受，关系基础好时更有效。' },
        ],
        assistStrategies: [
          { id: 'use-competitor-deals', title: '拿同类房成交数据', note: '用已成交的案例做对比。' },
          { id: 'use-competitor-listing', title: '拿同类房在售数据', note: '用当前竞品做对比。' },
          { id: 'use-showing-stats', title: '拿带看反馈说话', note: '用具体带看和反馈数据支撑。' },
          { id: 'soften-risk', title: '先讲风险，不直接逼价格', note: '降低业主防御心理。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';
          let trustChange = 0;

          if (mainChoice === 'empathy-first') {
            message = '"你说得对，这些确实是我担心的。继续说。"';
            mood = 'positive';
            trustChange = 2;
          } else if (mainChoice === 'customer-feedback') {
            if (assistChoice === 'use-showing-stats') {
              message = '"客户的反馈我听到了，那你觉得该怎么办？"';
              mood = 'neutral';
              trustChange = 1;
            } else {
              message = '"客户是这么说的？那其他客户呢？"';
              mood = 'neutral';
              trustChange = 0;
            }
          } else if (mainChoice === 'market-reality') {
            if (caseItem.trust > 50) {
              message = '"市场情况我也看到了，确实不太理想。"';
              mood = 'neutral';
              trustChange = 1;
            } else {
              message = '"市场是市场，但我的房子不一样！"';
              mood = 'negative';
              trustChange = -1;
            }
          } else {
            message = '"我知道不能再拖，但也不能急着降价吧？"';
            mood = 'neutral';
            trustChange = 0;
          }

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: trustChange },
              { label: '耐心', change: mood === 'negative' ? -1 : 0 },
            ],
          };
        },
      },
      {
        roundIndex: 2,
        title: '继续推进还是换打法',
        description: '根据第一轮的反应，继续往下推。业主已经给出了信号。',
        mainStrategies: [
          { id: 'press-facts', title: '继续压事实', note: '用更多数据支撑，适合业主还在犹豫时。' },
          { id: 'pivot-to-risk', title: '转讲风险', note: '从"降多少"转到"不降会怎样"。' },
          { id: 'slow-down', title: '放缓节奏', note: '今天先不定，给业主时间消化。' },
          { id: 'small-step-proposal', title: '提出试探性小步调整', note: '先给一个小幅度，观察反应。' },
        ],
        assistStrategies: [
          { id: 'use-more-examples', title: '用更多成交案例压', note: '案例越多，说服力越强。' },
          { id: 'use-window-pressure', title: '用拖延后果压', note: '强调机会成本递增。' },
          { id: 'stabilize-relationship', title: '稳关系', note: '先保信任，再谈价格。' },
          { id: 'leave-room', title: '留余地', note: '不把话说死，给下次机会。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';
          let priceFlexibilityChange = 0;

          if (mainChoice === 'small-step-proposal') {
            if (caseItem.trust > 45) {
              message = '"小幅度调整可以考虑，但不能降太多。"';
              mood = 'neutral';
              priceFlexibilityChange = 5;
            } else {
              message = '"这么快就让我降价？是不是我的房子有问题？"';
              mood = 'negative';
              priceFlexibilityChange = -3;
            }
          } else if (mainChoice === 'slow-down') {
            message = '"行，那我们再观察一周看看。"';
            mood = 'neutral';
            priceFlexibilityChange = 2;
          } else if (mainChoice === 'pivot-to-risk') {
            if (caseItem.windowDays < 21) {
              message = '"你说得对，时间确实不等人。"';
              mood = 'neutral';
              priceFlexibilityChange = 3;
            } else {
              message = '"时间还有，但也不能这么急吧？"';
              mood = 'neutral';
              priceFlexibilityChange = 0;
            }
          } else {
            message = '"我明白了，让我再想想。"';
            mood = 'neutral';
            priceFlexibilityChange = 1;
          }

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '价格灵活度', change: priceFlexibilityChange },
              { label: '信任', change: assistChoice === 'stabilize-relationship' ? 1 : 0 },
            ],
          };
        },
      },
      {
        roundIndex: 3,
        title: '收口定局',
        description: '最后一轮，决定今天谈到什么程度。不要逼太紧，保住下次沟通的机会。',
        mainStrategies: [
          { id: 'confirm-adjustment', title: '直接确认调价', note: '适合业主已经明显松口时。' },
          { id: 'confirm-small-adjustment', title: '确认小幅微调', note: '小幅度先动起来，给市场信号。' },
          { id: 'defer-with-checkpoint', title: '暂缓，但设观察点', note: '今天先不定，但约定下次复盘时间。' },
          { id: 'retreat-to-fight-another-day', title: '暂退一步保信任', note: '今天不谈了，保住关系最重要。' },
        ],
        assistStrategies: [
          { id: 'lock-next-review', title: '锁下一次复盘点', note: '明确一周后再看数据。' },
          { id: 'lock-adjustment-range', title: '锁调价幅度', note: '先定一个可调范围。' },
          { id: 'lock-next-actions', title: '锁后续经营动作', note: '用动作承诺换价格空间。' },
          { id: 'lock-rhythm', title: '锁沟通节奏', note: '约定每周固定时间汇报。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';

          if (mainChoice === 'confirm-adjustment' || mainChoice === 'confirm-small-adjustment') {
            if (caseItem.trust > 50) {
              message = '"行吧，就按你说的办。但别降太多，我心里有数。"';
              mood = 'positive';
            } else {
              message = '"这么快就让我降？是不是客户那边有什么情况没告诉我？"';
              mood = 'negative';
            }
          } else if (mainChoice === 'defer-with-checkpoint') {
            message = '"也行，那我们下周再看数据再说。"';
            mood = 'neutral';
          } else {
            message = '"好，今天先不谈这个了。辛苦你了。"';
            mood = 'neutral';
          }

          return {
            actor: 'owner',
            mood,
            message,
            metricChanges: [
              { label: '信任', change: mood === 'negative' ? -2 : 1 },
              { label: '价格灵活度', change: mood === 'positive' ? 5 : 0 },
            ],
          };
        },
      },
    ],
    resolveOutcome: (choices, feedbacks, state, caseItem) => {
      const totalTrustDelta = feedbacks.reduce((sum, f) => {
        const trustChange = f.metricChanges.find((m) => m.label === '信任')?.change || 0;
        return sum + trustChange;
      }, 0);

      const priceFlexDelta = feedbacks.reduce((sum, f) => {
        const pfChange = f.metricChanges.find((m) => m.label === '价格灵活度')?.change || 0;
        return sum + pfChange;
      }, 0);

      const choiceSummary = choices.map((c) => `第${c.round}轮: ${c.main}`).join(' → ');
      const finalChoice = choices[choices.length - 1]?.main;

      if (priceFlexDelta >= 8 && (finalChoice === 'confirm-adjustment' || finalChoice === 'confirm-small-adjustment')) {
        return {
          outcome: 'strong-progress',
          title: '调价确认',
          summary: '业主同意调整挂牌价，沟通成功。',
          details: [
            `沟通路径：${choiceSummary}`,
            '业主明确同意价格调整',
            '信任关系保持良好',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
            { field: 'askPrice', value: -Math.round(caseItem.askPrice * 0.02), label: '挂牌价' },
          ],
          nextActionHint: '尽快更新挂牌价，同步给所有合作经纪人。',
        };
      }
      if (priceFlexDelta >= 4) {
        return {
          outcome: 'progress',
          title: '口头松口但未确认',
          summary: '业主态度有所松动，但还没最终确认调价。',
          details: [
            `沟通路径：${choiceSummary}`,
            '业主对价格调整的抵触降低',
            '但还需要更多时间或证据',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
          ],
          nextActionHint: '下次沟通带上更多带看和客户反馈，继续小步推进。',
        };
      }
      if (totalTrustDelta >= 0) {
        return {
          outcome: 'stall',
          title: '暂时不动',
          summary: '今天没有谈成调价，但至少保住了关系。',
          details: [
            `沟通路径：${choiceSummary}`,
            '业主对价格调整仍有顾虑',
            '但信任关系没有受损',
          ],
          stateDeltas: [
            { field: 'trust', value: totalTrustDelta, label: '信任' },
          ],
          nextActionHint: '先放一放，用实际带看和客户数据慢慢磨。',
        };
      }
      return {
        outcome: 'regress',
        title: '信任下降',
        summary: '这次沟通操之过急，业主产生了抵触情绪。',
        details: [
          `沟通路径：${choiceSummary}`,
          '业主对价格话题产生防御心态',
          '需要先修复关系再谈价格',
        ],
        stateDeltas: [
          { field: 'trust', value: totalTrustDelta, label: '信任' },
        ],
        nextActionHint: '近期不要再提价格，先通过周反馈和带看重建信任。',
      };
    },
    buildBody: (state, caseItem, action) => {
      return `${caseItem.title} 当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。你要决定是守价、小调，还是直接换成快卖打法。`;
    },
    getStrategies: () => [
      { id: 'hold-story', title: '守价换讲法', note: '先不动价格，靠表达和包装争取继续推进。' },
      { id: 'small-cut', title: '小幅调整', note: '在关系和速度之间找平衡。' },
      { id: 'deep-cut', title: '尽快卖掉', note: '牺牲部分价格，换更高确定性。' },
    ],
    summary: '真正进入价格调整讨论，在关系、价格和速度之间做选择。',
  }),
  'invite-customer-negotiation': buildScenarioTemplate({
    id: 'invite-customer-negotiation',
    actor: 'customer',
    title: '客户谈判推进',
    scenarioTitle: '客户谈判推进',
    scenarioMode: 'heavy',
    goal: '这次要决定怎么把客户往前推一步',
    metricFocus: ['intent', 'confidence', 'askPrice', 'trust'],
    getContextBullets: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return [
        `当前接洽客户 ${engaged} 位`,
        `客户意向度约 ${Math.round(caseItem.heat * 0.8)}%`,
        `这套房挂牌价 ${caseItem.askPrice} 万`,
        `当前还可推进 ${caseItem.windowDays} 天`,
      ];
    },
    rounds: [
      {
        roundIndex: 1,
        title: '怎么起手',
        description: '客户对这套房有兴趣，但还在和其他房子比较。第一句话的切入方式很关键。',
        mainStrategies: [
          { id: 'talk-price-first', title: '先谈价格', note: '直接切入核心，但容易被客户反杀。' },
          { id: 'talk-value-first', title: '先谈这套房的独特价值', note: '强调不可替代性，适合有明显亮点时。' },
          { id: 'talk-time-window', title: '先谈拖延后果', note: '强调机会不等人，适合推进吃紧时。' },
          { id: 'explore-concerns', title: '先探顾虑，不急着推进', note: '先了解客户的真实担忧，再对症下药。' },
        ],
        assistStrategies: [
          { id: 'use-comparables', title: '拿同类房做比较', note: '用竞品做参照，凸显这套房的优势。' },
          { id: 'use-showing-feedback', title: '拿最近带看反馈做证据', note: '用市场热度给客户施压。' },
          { id: 'apply-pressure', title: '强推进', note: '制造紧迫感，适合意向已经很高时。' },
          { id: 'stabilize-emotion', title: '先稳情绪', note: '客户犹豫时，先建立安全感。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';
          let intentChange = 0;

          if (mainChoice === 'explore-concerns') {
            message = '"其实这套房我还是挺喜欢的，就是价格有点高，而且位置也想再看看。"';
            mood = 'positive';
            intentChange = 5;
          } else if (mainChoice === 'talk-value-first') {
            message = '"价值我承认，但价格也得匹配价值才行啊。"';
            mood = 'neutral';
            intentChange = 2;
          } else if (mainChoice === 'talk-price-first') {
            if (assistChoice === 'use-comparables') {
              message = '"价格我知道，你们这套房比同小区那套贵了10万。"';
              mood = 'neutral';
              intentChange = 0;
            } else {
              message = '"价格？这个价我肯定不会买的。"';
              mood = 'negative';
              intentChange = -3;
            }
          } else {
            message = '"我知道不能一直拖，但买房也不能太急吧？"';
            mood = 'neutral';
            intentChange = 1;
          }

          return {
            actor: 'customer',
            mood,
            message,
            metricChanges: [
              { label: '意向度', change: intentChange },
              { label: '成交把握', change: mood === 'positive' ? 3 : 0 },
            ],
          };
        },
      },
      {
        roundIndex: 2,
        title: '顺着打还是换打法',
        description: '第一轮你已经摸到了客户的底牌。现在要根据客户的反应继续推进。',
        mainStrategies: [
          { id: 'keep-price-pressure', title: '继续压价格', note: '客户对价格敏感，就继续在价格上做文章。' },
          { id: 'pivot-to-long-term-value', title: '转讲长期居住价值', note: '从"买贵不贵"转到"住得值不值"。' },
          { id: 'pivot-to-market-window', title: '转讲市场节奏', note: '从"这个价"转到"再拖会怎样"。' },
          { id: 'lock-next-step', title: '先锁定下一步动作', note: '先不谈钱，先让客户做出具体行动承诺。' },
        ],
        assistStrategies: [
          { id: 'bring-more-evidence', title: '再拿证据压', note: '用更多成交和带看数据支撑。' },
          { id: 'slow-down-pace', title: '放缓节奏', note: '客户有压力时，先松一松。' },
          { id: 'hard-close', title: '强收口', note: '今天就要一个结果。' },
          { id: 'empathize-and-align', title: '共情安抚', note: '先理解客户，再找共识。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';
          let confidenceChange = 0;

          if (mainChoice === 'lock-next-step') {
            message = '"行，那我周末再带家人过来复看一次。"';
            mood = 'positive';
            confidenceChange = 5;
          } else if (mainChoice === 'pivot-to-long-term-value') {
            message = '"你说得对，住得舒服确实很重要。但价格还是得再谈谈。"';
            mood = 'neutral';
            confidenceChange = 2;
          } else if (mainChoice === 'keep-price-pressure' && assistChoice === 'hard-close') {
            message = '"你别逼我，我再考虑考虑。"';
            mood = 'negative';
            confidenceChange = -3;
          } else {
            message = '"我明白你的意思，让我再想想。"';
            mood = 'neutral';
            confidenceChange = 1;
          }

          return {
            actor: 'customer',
            mood,
            message,
            metricChanges: [
              { label: '成交把握', change: confidenceChange },
            ],
          };
        },
      },
      {
        roundIndex: 3,
        title: '收口',
        description: '最后一轮，把客户推到一个具体的节点上。能推进就推进，推不动也要保留下次沟通的机会。',
        mainStrategies: [
          { id: 'schedule-negotiation', title: '约下一步谈判', note: '直接锁定正式谈判时间。' },
          { id: 'schedule-second-showing', title: '约复看/带看', note: '用带看锁定客户注意力。' },
          { id: 'push-for-offer', title: '推进议价', note: '直接进入价格谈判。' },
          { id: 'retreat-preserve-relationship', title: '暂退一步保关系', note: '今天先不定，给客户空间，但锁定下次联系时间。' },
        ],
        assistStrategies: [
          { id: 'lock-exact-time', title: '锁具体时间', note: '精确到哪一天几点。' },
          { id: 'lock-price-range', title: '锁价格范围', note: '先给一个可谈范围。' },
          { id: 'lock-next-touchpoint', title: '锁下一次沟通节点', note: '约定明天/后天再联系。' },
          { id: 'preserve-space', title: '保留空间不强压', note: '不把话说死，给客户退路。' },
        ],
        getFeedback: (mainChoice, assistChoice, state, caseItem) => {
          let message = '';
          let mood: 'positive' | 'neutral' | 'negative' = 'neutral';

          if (mainChoice === 'schedule-second-showing') {
            message = '"行，周末我再带我爱人过来看看。"';
            mood = 'positive';
          } else if (mainChoice === 'schedule-negotiation') {
            message = '"下周吧，下周我安排时间和家里人一起过来谈谈。"';
            mood = 'neutral';
          } else if (mainChoice === 'push-for-offer') {
            message = '"议价？现在还早了点吧。我再看看别的房子。"';
            mood = 'negative';
          } else {
            message = '"行，那你明天再联系我吧。我再想想。"';
            mood = 'neutral';
          }

          return {
            actor: 'customer',
            mood,
            message,
            metricChanges: [
              { label: '意向度', change: mood === 'positive' ? 5 : mood === 'negative' ? -5 : 2 },
            ],
          };
        },
      },
    ],
    resolveOutcome: (choices, feedbacks, state, caseItem) => {
      const finalMood = feedbacks[feedbacks.length - 1]?.mood || 'neutral';
      const choiceSummary = choices.map((c) => `第${c.round}轮: ${c.main}`).join(' → ');
      const finalChoice = choices[choices.length - 1]?.main;

      if (finalMood === 'positive' && (finalChoice === 'schedule-second-showing' || finalChoice === 'schedule-negotiation')) {
        return {
          outcome: 'strong-progress',
          title: '明显推进',
          summary: '客户已经同意下一步具体动作，推进成功。',
          details: [
            `沟通路径：${choiceSummary}`,
            '客户明确同意后续具体安排',
            '意向度明显提升',
          ],
          stateDeltas: [
            { field: 'intent', value: 10, label: '客户意向' },
            { field: 'confidence', value: 8, label: '成交把握' },
          ],
          nextActionHint: '按约定时间跟进，提前准备好谈判材料。',
        };
      }
      if (finalMood !== 'negative') {
        return {
          outcome: 'progress',
          title: '小幅推进',
          summary: '客户态度有所软化，但还没做出明确承诺。',
          details: [
            `沟通路径：${choiceSummary}`,
            '客户对这套房仍有兴趣',
            '但还需要更多时间考虑',
          ],
          stateDeltas: [
            { field: 'intent', value: 3, label: '客户意向' },
            { field: 'confidence', value: 2, label: '成交把握' },
          ],
          nextActionHint: '过两天再跟进一次，别逼太紧。',
        };
      }
      return {
        outcome: 'stall',
        title: '原地踏步',
        summary: '这次沟通没有实质性进展，但至少保住了客户关系。',
        details: [
          `沟通路径：${choiceSummary}`,
          '客户还在犹豫比较',
          '但没有完全流失',
        ],
        stateDeltas: [],
        nextActionHint: '先放一放，等有新的带看或客户反馈时再联系。',
      };
    },
    buildBody: (state, caseItem, action) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 现在已经到了快成交阶段。你需要决定这次谈判更偏保价、平衡，还是优先成交。当前接洽客户 ${engaged} 位。`;
    },
    getStrategies: () => [
      { id: 'hold', title: '守价硬谈', note: '价格最好，但谈崩风险也最大。' },
      { id: 'balanced', title: '平衡推进', note: '兼顾价格和成交率。' },
      { id: 'close', title: '成交优先', note: '更容易尽快成交，但成交价会更低。' },
    ],
    summary: '把高阶段客户真正拉上谈判桌。',
  }),
};

export const ACTION_TEMPLATES: Record<string, ActionBattleTemplate> = {
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
      { id: 'decision-dive', title: '从拖延后果切入', note: '强调"现在不改会怎样"，适合推进吃紧时。' },
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
      { id: 'value-angle', title: '强调性价比', note: '适合价格偏硬或客户犹豫时。' },
      { id: 'certainty-angle', title: '强调交易确定性', note: '适合推进吃紧、想加快推进速度时。' },
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
      { id: 'reputation-push', title: '做口碑内容', note: '更稳，适合保长期信任和整体感受。' },
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
      return `${caseItem.title} 当前热度 ${Math.round(caseItem.heat)}，还可推进 ${caseItem.windowDays} 天。开放日成本较高，但如果组织得好，能快速带来一波看房和转化机会。当前已有 ${engaged} 位接洽客户。`;
    },
    getStrategies: () => [
      { id: 'heat-open-day', title: '先冲场面和热度', note: '更容易把关注度拉起来，但客群质量不一定最优。' },
      { id: 'quality-open-day', title: '优先高质量到访', note: '量小一些，但更容易接近真实买家。' },
      { id: 'conversion-open-day', title: '围绕转化来组织', note: '适合已经有意向客户时集中推进。' },
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
    title: '价格沟通',
    summary: '先帮业主看清价格站位和为什么现在该谈。',
    metricFocus: ['trust', 'd3', 'competitiveness', 'askPrice'],
    buildBody: (_state, caseItem) => {
      return `${caseItem.ownerName} 当前对价格的接受度，决定了后面是继续保价、小调，还是直接走快卖路线。当前挂牌价 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。`;
    },
    getStrategies: () => [
      { id: 'compete-view', title: '先讲同类房压力', note: '更理性，但容易让业主觉得你在压价。' },
      { id: 'client-view', title: '先讲客户反馈', note: '更容易让业主接受真实市场反馈。' },
      { id: 'window-view', title: '先讲拖延后果', note: '适合推进吃紧、节奏慢的盘。' },
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
  'negotiation-sincerity': buildTemplate({
    id: 'negotiation-sincerity',
    actor: 'customer',
    title: '推进诚意卖',
    summary: '决定是否把交易推进到更明确的诚意阶段。',
    metricFocus: ['intent', 'confidence', 'askPrice', 'trust'],
    buildBody: (state, caseItem) => {
      const { engaged } = summarizeOpportunities(state, caseItem);
      return `${caseItem.title} 当前已有 ${engaged} 位接洽客户。参与诚意卖会提高快成交阶段的推进效率，但也会让价格预期更快摊开。`;
    },
    getStrategies: () => [
      { id: 'strict-sincerity', title: '高门槛诚意卖', note: '更能保价，但可能把部分客户挡在外面。' },
      { id: 'balanced-sincerity', title: '平衡型诚意卖', note: '兼顾成交率和价格空间。' },
      { id: 'fast-sincerity', title: '尽快成交模式', note: '优先换确定性，适合推进吃紧时。' },
    ],
  }),
};

export function getActionTemplate(action: ActionDefinition) {
  const scenario = SCENARIO_ACTION_TEMPLATES[action.id];
  if (scenario) return scenario;
  return ACTION_TEMPLATES[action.templateId];
}

export function isScenarioAction(actionId: string): boolean {
  const template = getScenarioTemplate(actionId);
  return !!template;
}

export function getScenarioMode(actionId: string): 'light' | 'heavy' | undefined {
  const template = getScenarioTemplate(actionId);
  return template?.scenarioMode;
}

export function getScenarioTemplate(actionId: string): ScenarioActionTemplate | undefined {
  return SCENARIO_ACTION_TEMPLATES[actionId];
}

export function applyScenarioSettlement(
  caseItem: Case,
  settlement: Settlement,
): { updatedCase: Partial<Case>; appliedDeltas: Array<{ field: string; oldValue: number; newValue: number; label: string }> } {
  const appliedDeltas: Array<{ field: string; oldValue: number; newValue: number; label: string }> = [];
  const updatedCase: Partial<Case> = {};

  const fieldMappings: Record<string, keyof Case> = {
    trust: 'trust',
    patience: 'patience',
    urgency: 'urgency',
    heat: 'heat',
    competitiveness: 'competitiveness',
    windowDays: 'windowDays',
  };

  for (const delta of settlement.stateDeltas) {
    const caseField = fieldMappings[delta.field];
    if (caseField && typeof caseItem[caseField] === 'number') {
      const oldValue = caseItem[caseField] as number;
      const rawNewValue = oldValue + delta.value;
      const newValue = Math.max(0, Math.min(100, rawNewValue));

      (updatedCase as Record<string, number>)[caseField] = newValue;
      appliedDeltas.push({
        field: delta.field,
        oldValue: Math.round(oldValue),
        newValue: Math.round(newValue),
        label: delta.label,
      });
    }
  }

  return { updatedCase, appliedDeltas };
}
