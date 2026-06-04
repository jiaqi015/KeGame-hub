/**
 * generate-conversation-tests.ts
 *
 * 从决策表规则骨架批量生成测试用例，使用 Gemini 为每个骨架生成玩家回复文本和预期结果。
 *
 * 用法:
 *   npx tsx scripts/generate-conversation-tests.ts --output generated-tests.json
 *
 * 环境变量:
 *   GOOGLE_AI_API_KEY — Gemini API key
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

// ---- Types ----

interface TestCaseSkeleton {
  name: string;
  ownerProfile: string;
  intent: string;
  risk: string;
  flags: string[];
  playerDetail: string;
  sceneType: string;
  description: string;
}

interface GeneratedTestCase {
  name: string;
  scene: {
    sceneType: string;
    playerText: string;
    ownerProfileLabel: string;
    trust: number;
    patience: number;
    urgency: number;
    hasCompletedFirstVisit: boolean;
    askPrice: number;
    marketPrice: number;
    priceGapPct: number;
    hasCustomerName?: boolean;
    customerIntent?: number;
    hasPromises?: boolean;
    hasServiceStrategy?: boolean;
  };
  expected: {
    intents: string[];
    risks: string[];
    recipientReplyContains: string[];
    trustDeltaSign: 'positive' | 'negative' | 'neutral';
  };
}

// ---- Rule skeletons ----

const SKELETONS: TestCaseSkeleton[] = [
  // hostile
  { name: 'hostile_customer', ownerProfile: 'default', intent: 'hostile', risk: 'offensive_reply', flags: [], playerDetail: 'any', sceneType: 'customer_wechat', description: '玩家对客户说冒犯的话' },
  { name: 'hostile_manager', ownerProfile: 'default', intent: 'hostile', risk: 'offensive_reply', flags: [], playerDetail: 'any', sceneType: 'manager_wechat', description: '玩家对经理说冒犯的话' },
  { name: 'hostile_owner', ownerProfile: 'default', intent: 'hostile', risk: 'offensive_reply', flags: [], playerDetail: 'any', sceneType: 'owner_wechat', description: '玩家对业主说冒犯的话' },

  // secure_price_adjustment
  { name: 'price_adj_assertive_price', ownerProfile: 'assertive', intent: 'secure_price_adjustment', risk: '', flags: [], playerDetail: 'hasPriceRef', sceneType: 'owner_wechat', description: '强势业主 + 调价请求带具体价格' },
  { name: 'price_adj_anxious', ownerProfile: 'anxious', intent: 'secure_price_adjustment', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '焦虑业主 + 调价请求无具体价格' },
  { name: 'price_adj_high_gap', ownerProfile: 'default', intent: 'secure_price_adjustment', risk: '', flags: ['highPriceGap'], playerDetail: 'hasPriceRef', sceneType: 'owner_wechat', description: '高价差 + 调价请求带价格' },
  { name: 'price_adj_default', ownerProfile: 'default', intent: 'secure_price_adjustment', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '普通业主 + 调价请求' },

  // propose_face_visit
  { name: 'visit_assertive_time', ownerProfile: 'assertive', intent: 'propose_face_visit', risk: '', flags: [], playerDetail: 'hasTimeRef', sceneType: 'owner_wechat', description: '强势业主 + 面访提议带时间' },
  { name: 'visit_anxious', ownerProfile: 'anxious', intent: 'propose_face_visit', risk: '', flags: [], playerDetail: 'noTimeRef', sceneType: 'owner_wechat', description: '焦虑业主 + 面访提议' },
  { name: 'visit_low_patience', ownerProfile: 'default', intent: 'propose_face_visit', risk: '', flags: ['lowPatience'], playerDetail: 'noTimeRef', sceneType: 'owner_wechat', description: '低耐心业主 + 面访提议' },

  // discuss_price
  { name: 'discuss_assertive', ownerProfile: 'assertive', intent: 'discuss_price', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '强势业主讨论价格' },
  { name: 'discuss_high_gap', ownerProfile: 'default', intent: 'discuss_price', risk: '', flags: ['highPriceGap'], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '高价差讨论价格' },

  // present_market_evidence
  { name: 'evidence_no_visit', ownerProfile: 'default', intent: 'present_market_evidence', risk: '', flags: ['noFirstVisit'], playerDetail: 'actionData', sceneType: 'owner_wechat', description: '未面访 + 展示数据' },
  { name: 'evidence_low_trust', ownerProfile: 'default', intent: 'present_market_evidence', risk: '', flags: ['lowTrust'], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '低信任 + 展示证据' },
  { name: 'evidence_customer', ownerProfile: 'default', intent: 'present_market_evidence', risk: '', flags: ['isCustomer'], playerDetail: 'noPriceRef', sceneType: 'customer_wechat', description: '客户场景展示证据' },

  // follow_customer
  { name: 'follow_high_intent_name', ownerProfile: 'default', intent: 'follow_customer', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '高意向客户 + 有客户名' },
  { name: 'follow_no_name', ownerProfile: 'default', intent: 'follow_customer', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '无客户名跟进' },

  // promise_feedback
  { name: 'feedback_low_trust', ownerProfile: 'default', intent: 'promise_feedback', risk: '', flags: ['lowTrust'], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '低信任 + 承诺反馈' },

  // risk-based
  { name: 'overpromise', ownerProfile: 'default', intent: 'reassure', risk: 'overpromise', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '过度承诺' },
  { name: 'empty_comfort_high_urgency', ownerProfile: 'default', intent: 'reassure', risk: 'empty_comfort', flags: ['highUrgency'], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '空洞安慰 + 高紧迫' },
  { name: 'ignores_customer', ownerProfile: 'default', intent: 'reassure', risk: 'ignores_customer', flags: [], playerDetail: 'noPriceRef', sceneType: 'customer_wechat', description: '忽略客户问题' },
  { name: 'missing_step_assertive', ownerProfile: 'assertive', intent: 'reassure', risk: 'missing_next_step', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '强势业主缺少下一步' },

  // reassure
  { name: 'reassure_low_trust', ownerProfile: 'default', intent: 'reassure', risk: '', flags: ['lowTrust'], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '低信任安抚' },
  { name: 'reassure_default', ownerProfile: 'default', intent: 'reassure', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'owner_wechat', description: '普通安抚' },

  // manager
  { name: 'manager_price_adj', ownerProfile: 'manager', intent: 'secure_price_adjustment', risk: '', flags: [], playerDetail: 'noPriceRef', sceneType: 'manager_wechat', description: '经理调价' },
  { name: 'manager_visit', ownerProfile: 'manager', intent: 'propose_face_visit', risk: '', flags: [], playerDetail: 'hasTimeRef', sceneType: 'manager_wechat', description: '经理面访' },
];

// ---- Helpers ----

function parseArgs(argv: string[]): { output: string } {
  let output = 'generated-tests.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--output' && argv[i + 1]) output = argv[++i];
  }
  return { output };
}

// ---- Main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = (process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_KEY || '').trim();
  if (!apiKey) {
    console.error('错误: 未设置 GOOGLE_AI_API_KEY 环境变量。');
    process.exit(1);
  }

  console.log(`准备为 ${SKELETONS.length} 个规则骨架生成测试用例。`);

  const genai = new GoogleGenAI({ apiKey });

  const prompt = `你是上海二手房经营模拟器的测试用例生成器。
你需要为微信对话模块的决策表生成测试场景。

## 背景
玩家是房产经纪人，NPC 是业主或经理。玩家发送消息后，系统会分析意图和风险，生成 NPC 回复。
测试需要验证：给定玩家输入，系统能正确识别意图/风险，且回复包含预期关键词。

## 规则骨架
${SKELETONS.map((s, i) => `${i + 1}. ${s.name}: ${s.description} (sceneType=${s.sceneType}, ownerProfile=${s.ownerProfile}, intent=${s.intent}, risk=${s.risk || 'none'}, flags=[${s.flags.join(',')}], playerDetail=${s.playerDetail})`).join('\n')}

## 输出格式
请输出 JSON 数组，每个元素对应一个骨架：
{
  "name": "骨架名",
  "scene": {
    "sceneType": "owner_wechat|customer_wechat|manager_wechat",
    "playerText": "玩家发送的微信消息（简短、口语化、能触发对应意图）",
    "ownerProfileLabel": "业主标签（如：强势业主、焦虑业主、普通业主）",
    "trust": 30-70,
    "patience": 30-70,
    "urgency": 30-80,
    "hasCompletedFirstVisit": true/false,
    "askPrice": 500-800,
    "marketPrice": 450-750,
    "priceGapPct": 3-25,
    "hasCustomerName": true/false（如果骨架需要客户名）,
    "customerIntent": 40-85（如果骨架需要客户意向）,
    "hasPromises": true/false（如果需要未兑现承诺）,
    "hasServiceStrategy": true/false（如果需要服务策略）
  },
  "expected": {
    "intents": ["预期意图"],
    "risks": ["预期风险或 none"],
    "recipientReplyContains": ["回复应包含的关键词"],
    "trustDeltaSign": "positive|negative|neutral"
  }
}

要求：
- playerText 要自然、简短（5-15字），像真人发微信
- 根据 ownerProfile 设置合理的 trust/patience/urgency（assertive: trust>=50, patience>=50; anxious: urgency>=70; lowTrust: trust<40）
- recipientReplyContains 每个用例 2-3 个关键词，能唯一标识预期回复
- hasCompletedFirstVisit 根据 flags 中的 noFirstVisit 决定
- 只输出 JSON 数组，不要其他文字`;

  try {
    console.log('调用 Gemini 生成测试用例...');
    const response = await genai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('错误: Gemini 未返回有效 JSON。');
      console.error('原始响应:', text.slice(0, 500));
      process.exit(1);
    }

    const generated: GeneratedTestCase[] = JSON.parse(jsonMatch[0]);

    // Write output
    const outputPath = resolve(args.output);
    writeFileSync(outputPath, JSON.stringify({
      tests: generated,
      skeletonCount: SKELETONS.length,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`生成 ${generated.length} 个测试用例，已写入 ${outputPath}`);
  } catch (error) {
    console.error('错误: Gemini API 调用失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('未捕获错误:', error);
  process.exit(1);
});
