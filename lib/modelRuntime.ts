import {callArkModel, streamArkModel, type CompareResult, type CompareStreamOptions} from './ark.js';
import {callDashScopeModel, streamDashScopeModel} from './dashscope.js';
import {callDeepSeekModel, streamDeepSeekModel} from './deepseek.js';
import {callHunyuanModel, streamHunyuanModel} from './hunyuan.js';
import {callIkunModel} from './ikun.js';
import {MODEL_CONFIG_MAP, type AIModel} from './models.js';

export type {CompareResult, CompareStreamOptions} from './ark.js';

export function resolveEnabledModel(modelId: string): AIModel | null {
  const model = MODEL_CONFIG_MAP.get(modelId);
  return model?.enabled ? model : null;
}

export async function callConfiguredModel(prompt: string, model: AIModel): Promise<CompareResult> {
  if (model.provider === 'ark') {
    return callArkModel(prompt, model);
  }

  if (model.provider === 'ikun') {
    return callIkunModel(prompt, model);
  }

  if (model.provider === 'hunyuan') {
    return callHunyuanModel(prompt, model);
  }

  if (model.provider === 'dashscope') {
    return callDashScopeModel(prompt, model);
  }

  if (model.provider === 'deepseek') {
    return callDeepSeekModel(prompt, model);
  }

  return {
    modelId: model.id,
    result: '未识别的模型渠道。',
    status: 'error',
  };
}

export async function streamConfiguredModel(
  prompt: string,
  model: AIModel,
  options: CompareStreamOptions = {},
): Promise<CompareResult> {
  if (model.provider === 'ark') {
    return streamArkModel(prompt, model, options);
  }

  if (model.provider === 'ikun') {
    const result = await callIkunModel(prompt, model);
    if (result.status === 'completed' && result.result && options.onDelta) {
      await options.onDelta(result.result, 'output');
    }
    return result;
  }

  if (model.provider === 'hunyuan') {
    return streamHunyuanModel(prompt, model, options);
  }

  if (model.provider === 'dashscope') {
    return streamDashScopeModel(prompt, model, options);
  }

  if (model.provider === 'deepseek') {
    return streamDeepSeekModel(prompt, model, options);
  }

  return {
    modelId: model.id,
    result: '未识别的模型渠道。',
    status: 'error',
  };
}

export async function callModelById(prompt: string, modelId: string): Promise<CompareResult> {
  const model = resolveEnabledModel(modelId);

  if (!model) {
    return {
      modelId,
      result: '该模型当前未启用。',
      status: 'error',
    };
  }

  return callConfiguredModel(prompt, model);
}

export async function streamModelById(
  prompt: string,
  modelId: string,
  options: CompareStreamOptions = {},
): Promise<CompareResult> {
  const model = resolveEnabledModel(modelId);

  if (!model) {
    return {
      modelId,
      result: '该模型当前未启用。',
      status: 'error',
    };
  }

  return streamConfiguredModel(prompt, model, options);
}
