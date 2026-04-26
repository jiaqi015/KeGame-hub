import type {
  DisambiguationRequest,
  DisambiguationResult,
  OpenDayNameDisambiguator,
} from '../domain/openDayDisambiguation.types.js';
import { compareModels } from '../../../lib/compare.js';
import { MODEL_CONFIG_MAP } from '../../../lib/models.js';

function buildDisambiguationPrompt(request: DisambiguationRequest): string {
  const { inputName, inputArea, candidates } = request;

  const contextLines: string[] = [];
  contextLines.push(`用户上传的数据中，小区名称是："${inputName}"`);
  if (inputArea) {
    contextLines.push(`所在区域是："${inputArea}"`);
  }
  contextLines.push('');
  contextLines.push(`从下面 ${candidates.length} 个候选标准小区中，选出最匹配的一个：`);
  contextLines.push('');

  candidates.forEach((candidate, index) => {
    const parts = [`${index + 1}. ${candidate.name}`];
    if (candidate.area) parts.push(`(${candidate.area}`);
    if (candidate.plate) {
      if (candidate.area) parts.push(` - ${candidate.plate})`);
      else parts.push(`(${candidate.plate})`);
    } else if (candidate.area) {
      parts.push(`)`);
    }
    contextLines.push(parts.join(''));
  });

  contextLines.push('');
  contextLines.push(`请直接返回你选的序号（只返回数字，不要加任何其他内容）。如果实在无法判断，返回 0。`);

  return contextLines.join('\n');
}

export class AIOpenDayNameDisambiguator implements OpenDayNameDisambiguator {
  constructor(
    private readonly modelId = 'doubao-seed-2-0-lite-260215',
  ) {}

  async disambiguate(request: DisambiguationRequest): Promise<DisambiguationResult> {
    const { inputName, inputArea, candidates } = request;

    if (candidates.length === 0) {
      return {
        matched: null,
        candidates: [],
        ambiguous: false,
      };
    }

    if (candidates.length === 1) {
      return {
        matched: candidates[0],
        candidates: candidates,
        ambiguous: false,
      };
    }

    const topCandidates = candidates.slice(0, 10);
    const bestScore = topCandidates[0].confidence;
    const secondScore = topCandidates.length >= 2 ? topCandidates[1].confidence : 0;

    if (bestScore - secondScore > 0.25) {
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: false,
      };
    }

    const model = MODEL_CONFIG_MAP.get(this.modelId);
    if (!model?.enabled) {
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: topCandidates.length > 1,
      };
    }

    const prompt = buildDisambiguationPrompt({
      inputName,
      inputArea,
      candidates: topCandidates,
    });

    let result;
    try {
      [result] = await compareModels(prompt, [model.id]);
    } catch (error) {
      console.warn('[open-day] AI name disambiguation exception fallback', {
        modelId: model.id,
        provider: model.provider,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: true,
        reasoning: 'AI调用异常，已使用规则候选兜底。',
      };
    }

    if (!result) {
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: true,
        reasoning: 'AI没有返回可用结果，已使用规则候选兜底。',
      };
    }

    if (result.status !== 'completed') {
      console.warn('[open-day] AI name disambiguation fallback', {
        modelId: model.id,
        provider: model.provider,
        status: result.status,
      });
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: true,
        reasoning: `AI调用失败: ${result.result}`,
      };
    }

    const text = result.result.trim();
    const match = text.match(/\d+/);
    if (!match) {
      return {
        matched: topCandidates[0],
        candidates: topCandidates,
        ambiguous: true,
        reasoning: `AI返回无法解析: ${text}`,
      };
    }

    let selectedIndex = parseInt(match[0], 10) - 1;
    if (selectedIndex < 0 || selectedIndex >= topCandidates.length) {
      selectedIndex = 0;
    }

    return {
      matched: topCandidates[selectedIndex],
      candidates: topCandidates,
      ambiguous: bestScore - secondScore <= 0.25 && selectedIndex !== 0,
      reasoning: `AI选择了第 ${selectedIndex + 1} 个候选: ${topCandidates[selectedIndex]?.name}`,
    };
  }
}
