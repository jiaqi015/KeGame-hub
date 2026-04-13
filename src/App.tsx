import React, { useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, LogOut, Sparkles } from 'lucide-react';

import { OpenDayWorkspace } from './open-day/OpenDayWorkspace';
import { appReducer, initialState } from './app/appReducer';
import { useAppSession } from './hooks/useAppSession';
import { 
  verifyActivationKey, 
  readCompareStream, 
  shouldUsePromptThinkingFallback, 
  wrapPromptForVisibleThinking,
  buildDifferenceSummaryPrompt,
  DIFFERENCE_SUMMARY_MODEL_ID
} from './services/apiService';
import { ComparisonResult } from './types';

// UI Components
import { AuthOverlay } from './components/Auth/AuthOverlay';
import { WorkspaceHub } from './components/Hub/WorkspaceHub';
import { ComparisonWorkspace } from './components/Comparison/ComparisonWorkspace';
import { PreviewModal } from './components/Common/PreviewModal';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { authorizedFetch, lockApplication } = useAppSession(state, dispatch);
  
  const {
    prompt,
    activationInput,
    authorizedKey,
    authStatus,
    authError,
    activeWorkspace,
    availableModels,
    selectedModels,
    isComparing,
    results,
    previewData,
  } = state;

  const compareRunRef = useRef(0);
  const activeControllersRef = useRef<AbortController[]>([]);
  const summaryControllerRef = useRef<AbortController | null>(null);

  const abortActiveComparisons = () => {
    activeControllersRef.current.forEach((controller) => controller.abort());
    activeControllersRef.current = [];
  };

  const abortDifferenceSummary = () => {
    summaryControllerRef.current?.abort();
    summaryControllerRef.current = null;
  };

  const submitActivationKey = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const candidateKey = activationInput.trim();
    if (!candidateKey) {
      dispatch({ type: 'SET_AUTH_STATUS', status: 'locked', error: '请输入激活密钥。' });
      return;
    }
    dispatch({ type: 'SET_AUTH_STATUS', status: 'submitting' });
    try {
      const verifiedKey = await verifyActivationKey(candidateKey);
      dispatch({ type: 'COMPLETE_ACTIVATION', key: verifiedKey });
    } catch (error) {
      dispatch({ 
        type: 'SET_AUTH_STATUS', 
        status: 'locked', 
        error: error instanceof Error ? error.message : '激活失败。' 
      });
    }
  };

  const startComparison = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;

    abortActiveComparisons();
    abortDifferenceSummary();
    compareRunRef.current += 1;
    const runId = compareRunRef.current;
    const modelIds = [...selectedModels];

    dispatch({ type: 'START_COMPARISON', modelIds });

    const controllers = modelIds.map(() => new AbortController());
    activeControllersRef.current = controllers;

    const settledResults: Record<string, ComparisonResult> = {};
    modelIds.forEach(id => {
      settledResults[id] = { modelId: id, result: '', reasoning: '', status: 'thinking' };
    });

    await Promise.allSettled(
      modelIds.map(async (modelId, index) => {
        const controller = controllers[index];
        const model = availableModels.find((item) => item.id === modelId);
        const requestPrompt = shouldUsePromptThinkingFallback(model)
          ? wrapPromptForVisibleThinking(prompt)
          : prompt;

        try {
          const response = await authorizedFetch('/api/compare-stream', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: requestPrompt, modelId }),
            signal: controller.signal,
          });

          const normalizedResult = await readCompareStream(response, modelId, (delta, channel) => {
            if (controller.signal.aborted || compareRunRef.current !== runId) return;

            const nextPartialResult: ComparisonResult = {
              modelId,
              result: channel === 'output'
                ? `${settledResults[modelId]?.result || ''}${delta}`
                : settledResults[modelId]?.result || '',
              reasoning: channel === 'reasoning'
                ? `${settledResults[modelId]?.reasoning || ''}${delta}`
                : settledResults[modelId]?.reasoning || '',
              status: 'thinking',
            };

            settledResults[modelId] = nextPartialResult;
            dispatch({ type: 'UPDATE_RESULT', modelId, result: nextPartialResult });
          });

          if (compareRunRef.current !== runId) return;
          settledResults[modelId] = normalizedResult;
          dispatch({ type: 'UPDATE_RESULT', modelId, result: normalizedResult });
        } catch (error) {
          if (controller.signal.aborted || compareRunRef.current !== runId) return;
          const partialResult = settledResults[modelId]?.result || '';
          const finalErrorResult: ComparisonResult = {
            modelId,
            result: partialResult
              ? `${partialResult}\n\n[生成中断] ${error instanceof Error ? error.message : '比较请求失败。'}`
              : error instanceof Error ? error.message : '比较请求失败。',
            status: 'error',
            reasoning: settledResults[modelId]?.reasoning || '',
          };
          settledResults[modelId] = finalErrorResult;
          dispatch({ type: 'UPDATE_RESULT', modelId, result: finalErrorResult });
        }
      })
    );

    if (compareRunRef.current === runId) {
      activeControllersRef.current = [];
      if (modelIds.length < 2) {
        dispatch({ 
          type: 'SET_SUMMARY', 
          summary: { 
            content: '当前仅选择了 1 个模型，至少选择 2 个模型后才会生成核心差异。', 
            status: 'completed' 
          } 
        });
        return;
      }

      // Start Summary
      const summaryController = new AbortController();
      summaryControllerRef.current = summaryController;
      dispatch({ type: 'SET_SUMMARY', summary: { content: '', status: 'thinking' } });

      try {
        const response = await authorizedFetch('/api/compare', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            prompt: buildDifferenceSummaryPrompt(prompt, modelIds, availableModels, settledResults),
            models: [DIFFERENCE_SUMMARY_MODEL_ID],
          }),
          signal: summaryController.signal,
        });

        const data = await response.json();
        const summaryResult = Array.isArray(data?.results)
          ? data.results.find((item: any) => item?.modelId === DIFFERENCE_SUMMARY_MODEL_ID)
          : null;

        if (compareRunRef.current !== runId || summaryController.signal.aborted) return;

        dispatch({
          type: 'SET_SUMMARY',
          summary: {
            content: typeof summaryResult?.result === 'string' && summaryResult.result
              ? summaryResult.result
              : '豆包已完成总结，但没有返回可展示的核心差异。',
            status: summaryResult?.status === 'completed' ? 'completed' : 'error',
          }
        });
      } catch (error) {
        if (summaryController.signal.aborted || compareRunRef.current !== runId) return;
        dispatch({
          type: 'SET_SUMMARY',
          summary: {
            content: error instanceof Error ? error.message : '核心差异总结失败。',
            status: 'error',
          }
        });
      }
    }
  };

  const handleReturnToHub = () => {
    abortActiveComparisons();
    abortDifferenceSummary();
    dispatch({ type: 'SET_PREVIEW', data: null });
    dispatch({ type: 'SET_WORKSPACE', workspace: 'hub' });
  };

  return (
    <div className="h-screen bg-[#FAFAFA] text-[#1D1D1F] font-sans selection:bg-blue-100 overflow-hidden flex flex-col">
      {authStatus !== 'authenticated' ? (
        <AuthOverlay
          activationInput={activationInput}
          authStatus={authStatus}
          authError={authError}
          onChange={(val) => dispatch({ type: 'SET_ACTIVATION_INPUT', value: val })}
          onSubmit={submitActivationKey}
        />
      ) : activeWorkspace === 'hub' ? (
        <WorkspaceHub
          onSelect={(id) => dispatch({ type: 'SET_WORKSPACE', workspace: id })}
          onLogout={() => lockApplication('', '')}
        />
      ) : activeWorkspace === 'open-day' ? (
        <div className="flex-1 overflow-hidden px-6 py-5">
          <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(20,20,43,0.08)] backdrop-blur-2xl md:flex-row md:items-center md:justify-between shrink-0">
              <div>
                <button
                  onClick={handleReturnToHub}
                  className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  返回功能页
                </button>
                <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#111111]">小区开放日选址</h1>
                <p className="mt-2 text-sm leading-7 text-[#6E6E73]">
                  上传楼盘表格后，系统会自动整理数据并完成测算，帮你更快筛出值得优先做开放日的项目。
                </p>
              </div>

              <button
                onClick={() => lockApplication('', '')}
                className="inline-flex items-center gap-2 self-start rounded-full border border-black/10 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F] md:self-auto"
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)]">
              <OpenDayWorkspace activationKey={authorizedKey} />
            </div>
          </div>
        </div>
      ) : (
        <ComparisonWorkspace
          state={state}
          onSetPrompt={(val) => dispatch({ type: 'SET_PROMPT', prompt: val })}
          onToggleModel={(id) => dispatch({ type: 'TOGGLE_MODEL', id })}
          onSetActiveTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
          onResetSelectedModels={() => dispatch({ type: 'SET_CATALOG', models: availableModels, selected: [] })}
          onStartComparison={startComparison}
          onReset={() => {
            compareRunRef.current += 1;
            abortActiveComparisons();
            abortDifferenceSummary();
            dispatch({ type: 'RESET_COMPARISON' });
          }}
          onReturnToHub={handleReturnToHub}
          onLogout={() => lockApplication('', '')}
          onPreview={(title, subtitle, content) => dispatch({ type: 'SET_PREVIEW', data: { title, subtitle, content } })}
        />
      )}

      <footer className="shrink-0 py-3 text-center text-[#86868B] text-[11px] border-t border-black/5 bg-white">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Model Sabrina II • 多模型PK + 小区开放日选址</span>
          <span className="text-black/10">|</span>
          <span>© 2026</span>
        </div>
      </footer>

      <PreviewModal
        data={previewData}
        onClose={() => dispatch({ type: 'SET_PREVIEW', data: null })}
      />
    </div>
  );
}
