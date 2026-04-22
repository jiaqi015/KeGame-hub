import {callArkModel, streamArkModel, type CompareResult, type CompareStreamOptions} from './ark.js';
import {callDashScopeModel, streamDashScopeModel} from './dashscope.js';
import {callHunyuanModel, streamHunyuanModel} from './hunyuan.js';
import {callIkunModel} from './ikun.js';
import {MODEL_CONFIG_MAP} from './models.js';

export type {CompareResult} from './ark.js';
export type {CompareStreamOptions} from './ark.js';

export async function compareModels(prompt: string, models: string[]): Promise<CompareResult[]> {
  const uniqueModels = [...new Set(models)];

  return Promise.all(
    uniqueModels.map(async (modelId) => {
      const model = MODEL_CONFIG_MAP.get(modelId);

      if (!model || !model.enabled) {
        return {
          modelId,
          result: '该模型当前未启用。',
          status: 'error',
        } satisfies CompareResult;
      }

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

      return {
        modelId,
        result: '未识别的模型渠道。',
        status: 'error',
      } satisfies CompareResult;
    }),
  );
}

export async function streamCompareModel(
  prompt: string,
  modelId: string,
  options: CompareStreamOptions = {},
): Promise<CompareResult> {
  const model = MODEL_CONFIG_MAP.get(modelId);

  if (!model || !model.enabled) {
    return {
      modelId,
      result: '该模型当前未启用。',
      status: 'error',
    } satisfies CompareResult;
  }

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

  return {
    modelId,
    result: '未识别的模型渠道。',
    status: 'error',
  } satisfies CompareResult;
}
