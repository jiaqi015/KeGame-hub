import {MODEL_CONFIG_MAP} from './models.js';
import {
  callConfiguredModel,
  streamConfiguredModel,
  type CompareResult,
  type CompareStreamOptions,
} from './modelRuntime.js';

export type {CompareResult, CompareStreamOptions} from './modelRuntime.js';

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

      return callConfiguredModel(prompt, model);
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

  return streamConfiguredModel(prompt, model, options);
}
