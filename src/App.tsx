import React, { Suspense, useMemo, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles } from 'lucide-react';

import { appReducer, initialState } from './app/appReducer';
import { useAppSession } from './hooks/useAppSession';
import { 
  ACTIVATION_STORAGE_KEY,
  AUTH_EMAIL_STORAGE_KEY,
  verifyActivationKey, 
  readCompareStream, 
  shouldUsePromptThinkingFallback, 
  wrapPromptForVisibleThinking,
  buildDifferenceSummaryPrompt,
  completeEmailLogin,
  DIFFERENCE_SUMMARY_MODEL_ID,
  startEmailLogin,
} from './services/apiService';
import { ComparisonResult, ActivationWorkspaceId } from './types';

// UI Components
import { AuthOverlay } from './components/Auth/AuthOverlay';
import { WorkspaceHub } from './components/Hub/WorkspaceHub';
import { ComparisonWorkspace } from './components/Comparison/ComparisonWorkspace';
import { PreviewModal } from './components/Common/PreviewModal';
import { WORKSPACE_REGISTRY_BY_ID } from './workspaces/workspaceRegistry';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { authorizedFetch, lockApplication } = useAppSession(state, dispatch);
  const workspaceFallback = useMemo(() => <WorkspaceShellSkeleton />, []);
  
  const {
    prompt,
    loginEmail,
    verificationCode,
    activationInput,
    authorizedKey,
    allowedWorkspaces,
    authStatus,
    authError,
    authMode,
    authHint,
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
    dispatch({ type: 'SET_AUTH_STATUS', status: 'submitting' });

    try {
      if (authMode === 'email') {
        const result = await startEmailLogin(loginEmail);
        dispatch({ type: 'SET_LOGIN_EMAIL', value: result.email });
        window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, result.email);

        if (result.mode === 'trusted-bypass') {
          const user = await completeEmailLogin({ email: result.email });
          dispatch({
            type: 'COMPLETE_ACTIVATION',
            key: 'session-authenticated',
            allowedWorkspaces: user.allowedWorkspaces,
            email: user.email,
          });
          return;
        }

        dispatch({
          type: 'SET_AUTH_MODE',
          mode: result.mode === 'activation_required' ? 'activate' : 'verify',
          hint: result.verificationCode
            ? `开发占位：验证码 ${result.verificationCode}`
            : '验证码已发送，请查收邮件。',
        });
        dispatch({ type: 'SET_AUTH_STATUS', status: 'locked' });
        return;
      }

      const user = await completeEmailLogin({
        email: loginEmail,
        code: verificationCode,
        activationKey: authMode === 'activate' ? activationInput : '',
      });

      let authorizedSessionKey = 'session-authenticated';
      if (authMode === 'activate' && activationInput.trim()) {
        const verified = await verifyActivationKey(activationInput.trim());
        authorizedSessionKey = verified.key;
        window.localStorage.setItem(ACTIVATION_STORAGE_KEY, verified.key);
      }

      dispatch({
        type: 'COMPLETE_ACTIVATION',
        key: authorizedSessionKey,
        allowedWorkspaces: user.allowedWorkspaces,
        email: user.email,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '激活失败。';
      if (message.includes('激活密钥')) {
        dispatch({
          type: 'SET_AUTH_MODE',
          mode: 'activate',
          hint: '这是首次登录，请补充当前分配给你的激活密钥。',
        });
      }
      dispatch({ 
        type: 'SET_AUTH_STATUS', 
        status: 'locked', 
        error: message,
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
          const response = await authorizedFetch('/api/compare?stream=1', {
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

  const canAccessWorkspace = (workspace: ActivationWorkspaceId) =>
    allowedWorkspaces.includes(workspace);

  const handleSelectWorkspace = (workspace: ActivationWorkspaceId) => {
    if (!canAccessWorkspace(workspace)) {
      return;
    }

    dispatch({ type: 'SET_WORKSPACE', workspace });
  };

  const renderWorkspaceShell = (workspace: ActivationWorkspaceId, content: React.ReactNode) => {
    const meta = WORKSPACE_REGISTRY_BY_ID[workspace];

    return (
      <div className="flex-1 overflow-hidden px-6 py-3">
        <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-4">
          <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
            <div className="flex items-center gap-6">
              <button
                onClick={handleReturnToHub}
                className={`inline-flex items-center gap-2 text-sm font-medium transition ${meta.accentClassName}`}
              >
                <ArrowLeft className="h-4 w-4" />
                返回功能页
              </button>
            </div>

            <button
              onClick={() => lockApplication('', '')}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
            >
              注销
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)]">
            {content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#FAFAFA] text-[#1D1D1F] font-sans selection:bg-blue-100 overflow-hidden flex flex-col">
      {authStatus !== 'authenticated' ? (
        <AuthOverlay
          loginEmail={loginEmail}
          verificationCode={verificationCode}
          activationInput={activationInput}
          authMode={authMode}
          authHint={authHint}
          authStatus={authStatus}
          authError={authError}
          onEmailChange={(value) => dispatch({ type: 'SET_LOGIN_EMAIL', value })}
          onCodeChange={(value) => dispatch({ type: 'SET_VERIFICATION_CODE', value })}
          onChange={(val) => dispatch({ type: 'SET_ACTIVATION_INPUT', value: val })}
          onSubmit={submitActivationKey}
        />
      ) : activeWorkspace === 'hub' ? (
        <WorkspaceHub
          onSelect={handleSelectWorkspace}
          onLogout={() => lockApplication('', '')}
          allowedWorkspaces={allowedWorkspaces}
        />
      ) : activeWorkspace === 'sabrina' && canAccessWorkspace('sabrina') ? (
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
      ) : activeWorkspace !== 'hub' && canAccessWorkspace(activeWorkspace) ? (
        renderWorkspaceShell(
          activeWorkspace,
          <Suspense fallback={workspaceFallback}>
            {WORKSPACE_REGISTRY_BY_ID[activeWorkspace].render({ activationKey: authorizedKey })}
          </Suspense>,
        )
      ) : (
        <WorkspaceHub
          onSelect={handleSelectWorkspace}
          onLogout={() => lockApplication('', '')}
          allowedWorkspaces={allowedWorkspaces}
        />
      )}

      <footer className="shrink-0 py-3 text-center text-[#86868B] text-[11px] border-t border-black/5 bg-white">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Model Sabrina II • 多模型PK + 开放日选址 + 资产顾问 + 商圈经营 + 理性业主</span>
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

function WorkspaceShellSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,251,235,0.35),rgba(255,255,255,1))]">
      <div className="w-full max-w-5xl animate-pulse px-8">
        <div className="rounded-[36px] border border-black/5 bg-white/85 p-8 shadow-[0_24px_70px_rgba(20,20,43,0.08)]">
          <div className="h-8 w-56 rounded bg-slate-200" />
          <div className="mt-4 h-4 w-96 max-w-full rounded bg-slate-100" />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
