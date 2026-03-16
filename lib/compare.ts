import {callArkModel, type CompareResult} from './ark.js';
import {callIkunModel} from './ikun.js';
import {MODEL_CONFIG_MAP} from './models.js';

export type {CompareResult} from './ark.js';

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

      return {
        modelId,
        result: '未识别的模型渠道。',
        status: 'error',
      } satisfies CompareResult;
    }),
  );
}
