/**
 * generate-fallback-rules.ts
 *
 * 从历史 ConversationReceipt JSON 中提取未覆盖的 (ownerProfile, intent, risk) 组合，
 * 用 Gemini 为每个组合生成回复模板，输出为可审核的 JSON 文件。
 *
 * 用法:
 *   npx tsx scripts/generate-fallback-rules.ts --input receipts.json --output new-rules.json
 *
 * 环境变量:
 *   GOOGLE_AI_API_KEY — Gemini API key
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

// ---- Types ----

interface ConversationReceipt {
  readonly proposal: {
    readonly intentKinds: readonly string[];
    readonly riskKinds: readonly string[];
    readonly recipientReply: string;
  };
  readonly sceneType?: string;
}

interface RuleCombination {
  ownerProfile: string;
  intent: string;
  risk: string;
  flags: string[];
}

interface GeneratedRule extends RuleCombination {
  replyTemplate: string;
  reasoning: string;
  confidence: number;
}

// ---- Existing table signatures (subset for coverage check) ----

const EXISTING_COMBOS: ReadonlySet<string> = new Set([
  // hostile / offensive
  'offensive_reply',
  'hostile',
  // secure_price_adjustment
  'secure_price_adjustment:assertive:hasPriceRef',
  'secure_price_adjustment:assertive:highPriceGap',
  'secure_price_adjustment:assertive',
  'secure_price_adjustment:anxious:hasPriceRef',
  'secure_price_adjustment:anxious',
  'secure_price_adjustment:highPriceGap:hasPriceRef',
  'secure_price_adjustment:highPriceGap',
  'secure_price_adjustment:hasPriceRef',
  'secure_price_adjustment',
  // propose_face_visit
  'propose_face_visit:assertive:hasTimeRef',
  'propose_face_visit:assertive',
  'propose_face_visit:anxious:hasTimeRef',
  'propose_face_visit:anxious',
  'propose_face_visit:lowPatience',
  'propose_face_visit:hasTimeRef',
  'propose_face_visit',
  // discuss_price
  'discuss_price:assertive:hasPriceRef',
  'discuss_price:assertive',
  'discuss_price:highPriceGap:hasPriceRef',
  'discuss_price:highPriceGap',
  'discuss_price:hasPriceRef',
  'discuss_price',
  // present_market_evidence
  'present_market_evidence:noFirstVisit:actionData',
  'present_market_evidence:noFirstVisit',
  'present_market_evidence:lowTrust:actionData',
  'present_market_evidence:lowTrust',
  'present_market_evidence:assertive:hasPriceRef',
  'present_market_evidence:assertive:actionData',
  'present_market_evidence:assertive:actionCustomer',
  'present_market_evidence:assertive:actionVisit',
  'present_market_evidence:assertive',
  'present_market_evidence:isCustomer:actionData',
  'present_market_evidence:isCustomer',
  'present_market_evidence:hasPriceRef',
  'present_market_evidence:actionData',
  'present_market_evidence',
  // follow_customer
  'follow_customer:highIntent:hasName:hasTimeRef',
  'follow_customer:highIntent:hasName',
  'follow_customer:hasName:hasTimeRef',
  'follow_customer:hasName',
  'follow_customer:hasTimeRef',
  'follow_customer',
  // promise_feedback
  'promise_feedback:lowTrust:actionFeedback',
  'promise_feedback:lowTrust',
  'promise_feedback:hasTimeRef',
  'promise_feedback',
  // align_manager
  'align_manager:actionFeedback',
  'align_manager:actionData',
  'align_manager',
  // risk-based
  'overpromise',
  'empty_comfort:highUrgency',
  'empty_comfort:assertive',
  'empty_comfort',
  'ignores_customer',
  'missing_next_step:assertive',
  'missing_next_step',
  // reassure
  'reassure:lowTrust',
  'reassure:anxious',
  'reassure',
]);

// ---- Helpers ----

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '';
  let output = 'new-rules.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) output = argv[++i];
  }
  return { input, output };
}

function extractComboKey(receipt: ConversationReceipt): string {
  const intents = receipt.proposal.intentKinds;
  const risks = receipt.proposal.riskKinds;

  if (risks.includes('offensive_reply') || intents.includes('hostile')) {
    return intents.includes('hostile') ? 'hostile' : 'offensive_reply';
  }

  const primaryIntent = intents.find((i) => i !== 'hostile' && i !== 'overpromise' && i !== 'unclear') || intents[0] || 'reassure';
  const primaryRisk = risks.find((r) => r !== 'none') || '';

  return primaryRisk ? `${primaryIntent}:${primaryRisk}` : primaryIntent;
}

function resolveOwnerProfile(receipt: ConversationReceipt): string {
  const sceneType = receipt.sceneType || 'owner_wechat';
  if (sceneType === 'customer_wechat') return 'customer';
  if (sceneType === 'manager_wechat') return 'manager';
  return 'default';
}

function groupReceiptsByProfile(receipts: ConversationReceipt[]): Map<string, ConversationReceipt[]> {
  const groups = new Map<string, ConversationReceipt[]>();
  for (const receipt of receipts) {
    const profile = resolveOwnerProfile(receipt);
    const list = groups.get(profile) || [];
    list.push(receipt);
    groups.set(profile, list);
  }
  return groups;
}

function buildReferenceExamples(receipts: ConversationReceipt[], limit: number = 5): string {
  return receipts
    .slice(0, limit)
    .map((r) => `- 玩家回复意图: ${r.proposal.intentKinds.join(',')} | 风险: ${r.proposal.riskKinds.join(',')} | NPC回复: "${r.proposal.recipientReply}"`)
    .join('\n');
}

// ---- Main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error('用法: npx tsx scripts/generate-fallback-rules.ts --input <receipts.json> [--output <new-rules.json>]');
    process.exit(1);
  }

  const apiKey = (process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_KEY || '').trim();
  if (!apiKey) {
    console.error('错误: 未设置 GOOGLE_AI_API_KEY 环境变量。');
    process.exit(1);
  }

  // Read receipts
  const inputPath = resolve(args.input);
  let receipts: ConversationReceipt[];
  try {
    const raw = readFileSync(inputPath, 'utf-8');
    const parsed = JSON.parse(raw);
    receipts = Array.isArray(parsed) ? parsed : parsed.receipts || [];
  } catch (error) {
    console.error(`错误: 无法读取 ${inputPath}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`读取 ${receipts.length} 条 receipts。`);

  // Find uncovered combinations
  const uncovered = new Set<string>();
  const comboExamples = new Map<string, ConversationReceipt[]>();

  for (const receipt of receipts) {
    const key = extractComboKey(receipt);
    if (!EXISTING_COMBOS.has(key) && !key.includes('hostile') && !key.includes('offensive_reply')) {
      uncovered.add(key);
      const examples = comboExamples.get(key) || [];
      examples.push(receipt);
      comboExamples.set(key, examples);
    }
  }

  const uncoveredList = [...uncovered].slice(0, 20);
  console.log(`发现 ${uncovered.size} 个未覆盖组合，处理前 ${uncoveredList.length} 个。`);

  if (uncoveredList.length === 0) {
    console.log('所有组合已覆盖，无需生成新规则。');
    writeFileSync(resolve(args.output), JSON.stringify({ rules: [], generatedAt: new Date().toISOString() }, null, 2));
    return;
  }

  // Group receipts by profile for reference
  const profileGroups = groupReceiptsByProfile(receipts);

  // Generate rules with Gemini
  const genai = new GoogleGenAI({ apiKey });

  const prompt = `你是上海二手房经营模拟器的对话规则生成器。
你需要为微信对话模块生成 NPC（业主/经理）的回复模板。

## 背景
玩家是房产经纪人，NPC 是业主或经理。玩家发送消息后，NPC 需要根据情境回复。
回复风格：口语化、有立场、有情绪、像真人发微信。

## 规则
- 回复以 "\${senderName}：" 开头
- 回复中可以使用变量：\${caseRef}（房源引用）、\${priceRef}（价格引用）、\${timeRef}（时间引用）
- 回复要体现业主性格：assertive（强势）要求依据、anxious（焦虑）怕白忙、default（普通）要分析
- 回复长度 20-60 字，像微信聊天

## 需要生成回复的组合
${uncoveredList.map((key, i) => `${i + 1}. ${key}`).join('\n')}

## 同类型业主的历史回复参考
${[...profileGroups.entries()].map(([profile, receipts]) =>
  `### ${profile} 业主\n${buildReferenceExamples(receipts)}`
).join('\n\n')}

## 输出格式
请输出 JSON 数组，每个元素：
{
  "ownerProfile": "assertive|anxious|default|customer|manager",
  "intent": "意图类型",
  "risk": "风险类型或空字符串",
  "flags": ["可选标志"],
  "replyTemplate": "回复模板（用 \${senderName}、\${caseRef} 等变量）",
  "reasoning": "为什么这样回复",
  "confidence": 0.0-1.0
}

只输出 JSON 数组，不要其他文字。`;

  try {
    console.log('调用 Gemini 生成规则...');
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

    const generated: GeneratedRule[] = JSON.parse(jsonMatch[0]);

    // Write output
    const outputPath = resolve(args.output);
    writeFileSync(outputPath, JSON.stringify({
      rules: generated,
      uncoveredCombos: uncoveredList,
      generatedAt: new Date().toISOString(),
      receiptCount: receipts.length,
    }, null, 2));

    console.log(`生成 ${generated.length} 条规则，已写入 ${outputPath}`);
  } catch (error) {
    console.error('错误: Gemini API 调用失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('未捕获错误:', error);
  process.exit(1);
});
