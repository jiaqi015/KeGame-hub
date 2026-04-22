import React, { Suspense, useEffect, useMemo, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

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
import { UserIdentityBadge } from './components/Auth/UserIdentityBadge';
import { WorkspaceHub } from './components/Hub/WorkspaceHub';
import { ComparisonWorkspace } from './components/Comparison/ComparisonWorkspace';
import { PreviewModal } from './components/Common/PreviewModal';
import { LoadingScene } from './components/Common/LoadingScene';
import {
  preloadSellingHousesWorkspace,
  resolvePathnameForWorkspace,
  resolveWorkspaceFromPathname,
  WORKSPACE_REGISTRY_BY_ID,
} from './workspaces/workspaceRegistry';

const WORKSPACE_PATH_STORAGE_KEY = 'kegame-target-path';

export default function App() {
  const [state, dispatch] = useReducer(
    appReducer,
    initialState,
    (seed) => ({
      ...seed,
      activeWorkspace: resolveWorkspaceFromPathname(window.location.pathname),
    }),
  );
  const { authorizedFetch, lockApplication } = useAppSession(state, dispatch);
  const workspaceFallback = useMemo(() => <WorkspaceShellSkeleton />, []);
  const pendingWorkspaceRef = useRef<'hub' | ActivationWorkspaceId>(resolveWorkspaceFromPathname(window.location.pathname));
  
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
    currentUserEmail,
    currentUserNickname,
    sessionExpiresAt,
    availableModels,
    selectedModels,
    isComparing,
    results,
    previewData,
  } = state;

  const compareRunRef = useRef(0);
  const activeControllersRef = useRef<AbortController[]>([]);
  const summaryControllerRef = useRef<AbortController | null>(null);

  const prepareWorkspace = (workspace: ActivationWorkspaceId) => {
    if (workspace !== 'selling-houses') {
      return;
    }

    void preloadSellingHousesWorkspace()
      .then((module) => module.preloadSellingHousesPrimaryViews?.())
      .catch(() => {});
  };

  useEffect(() => {
    const initialWorkspace = resolveWorkspaceFromPathname(window.location.pathname);
    pendingWorkspaceRef.current = initialWorkspace;
    if (initialWorkspace !== 'hub') {
      window.sessionStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, resolvePathnameForWorkspace(initialWorkspace));
    }

    const handlePopState = () => {
      const nextWorkspace = resolveWorkspaceFromPathname(window.location.pathname);
      pendingWorkspaceRef.current = nextWorkspace;
      dispatch({ type: 'SET_WORKSPACE', workspace: nextWorkspace });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const targetWorkspace = pendingWorkspaceRef.current;
    const shouldPreloadSellingHouses = targetWorkspace === 'selling-houses'
      || allowedWorkspaces.includes('selling-houses');

    if (!shouldPreloadSellingHouses) {
      return;
    }

    const schedulePreload = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
        void preloadSellingHousesWorkspace()
          .then((module) => module.preloadSellingHousesPrimaryViews?.())
          .catch(() => {});
      }, { timeout: 1200 })
      : window.setTimeout(() => {
        void preloadSellingHousesWorkspace()
          .then((module) => module.preloadSellingHousesPrimaryViews?.())
          .catch(() => {});
      }, 120);

    return () => {
      if (window.requestIdleCallback && typeof schedulePreload === 'number') {
        window.cancelIdleCallback(schedulePreload);
        return;
      }
      window.clearTimeout(schedulePreload);
    };
  }, [allowedWorkspaces]);

  useEffect(() => {
    const expectedPath = resolvePathnameForWorkspace(activeWorkspace);
    const currentPath = window.location.pathname.endsWith('/')
      ? window.location.pathname.slice(0, -1) || '/'
      : window.location.pathname || '/';
    if (currentPath !== expectedPath) {
      window.history.replaceState({}, '', expectedPath);
    }
    if (activeWorkspace !== 'hub') {
      window.sessionStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, expectedPath);
    } else {
      window.sessionStorage.removeItem(WORKSPACE_PATH_STORAGE_KEY);
    }
  }, [activeWorkspace]);

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
          const targetWorkspace = pendingWorkspaceRef.current;
          dispatch({
            type: 'COMPLETE_ACTIVATION',
            key: 'session-authenticated',
            allowedWorkspaces: user.allowedWorkspaces,
            accountId: user.accountId,
            email: user.email,
            nickname: user.nickname,
            sessionExpiresAt: user.sessionExpiresAt,
          });
          if (targetWorkspace !== 'hub' && user.allowedWorkspaces.includes(targetWorkspace)) {
            dispatch({ type: 'SET_WORKSPACE', workspace: targetWorkspace });
          }
          return;
        }

        dispatch({
          type: 'SET_AUTH_MODE',
          mode: result.mode === 'activation_required' ? 'activate' : 'verify',
          hint: '验证码已发送，请查收邮件。',
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
        accountId: user.accountId,
        email: user.email,
        nickname: user.nickname,
        sessionExpiresAt: user.sessionExpiresAt,
      });
      const targetWorkspace = pendingWorkspaceRef.current;
      if (targetWorkspace !== 'hub' && user.allowedWorkspaces.includes(targetWorkspace)) {
        dispatch({ type: 'SET_WORKSPACE', workspace: targetWorkspace });
      }
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
    pendingWorkspaceRef.current = 'hub';
    window.sessionStorage.removeItem(WORKSPACE_PATH_STORAGE_KEY);
    window.history.pushState({}, '', '/');
  };

  const handleLogoutAccount = () => {
    abortActiveComparisons();
    abortDifferenceSummary();
    lockApplication('', '');
  };

  const canAccessWorkspace = (workspace: ActivationWorkspaceId) =>
    allowedWorkspaces.includes(workspace);

  const handleSelectWorkspace = (workspace: ActivationWorkspaceId) => {
    if (!canAccessWorkspace(workspace)) {
      return;
    }

    const nextPath = resolvePathnameForWorkspace(workspace);
    pendingWorkspaceRef.current = workspace;
    window.history.pushState({}, '', nextPath);
    dispatch({ type: 'SET_WORKSPACE', workspace });
  };

  const renderWorkspaceShell = (workspace: ActivationWorkspaceId, content: React.ReactNode) => {
    const meta = WORKSPACE_REGISTRY_BY_ID[workspace];
    const shouldRenderShellHeader = workspace !== 'selling-houses';

    if (workspace === 'selling-houses') {
      return (
        <div className="selling-houses-shell flex-1 overflow-hidden">
          {content}
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-hidden px-6 py-3">
        <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-4">
          {shouldRenderShellHeader ? (
            <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/85 px-6 py-2.5 shadow-[0_12px_40px_rgba(20,20,43,0.06)] backdrop-blur-2xl shrink-0">
              <div className="flex items-center gap-6">
                <button
                  onClick={handleReturnToHub}
                  className={`inline-flex items-center gap-2 text-sm font-medium transition ${meta.accentClassName}`}
                >
                  返回 Hub
                </button>
              </div>

              <div className="flex items-center gap-3">
                <UserIdentityBadge
                  nickname={currentUserNickname}
                  email={currentUserEmail}
                  sessionExpiresAt={sessionExpiresAt}
                  compact
                />
                <button
                  onClick={handleLogoutAccount}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
                >
                  登出账号
                </button>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden rounded-[36px] border border-black/5 bg-white/70 shadow-[0_24px_70px_rgba(20,20,43,0.08)]">
            {content}
          </div>
        </div>
      </div>
    );
  };

  const isSellingHousesActive = authStatus === 'authenticated' && activeWorkspace === 'selling-houses';

  return (
    <div className={`h-screen font-sans selection:bg-blue-100 overflow-hidden flex flex-col ${
      isSellingHousesActive
        ? 'bg-[var(--seller-bg)] text-[var(--seller-ink)]'
        : authStatus !== 'authenticated'
          ? 'bg-black'
          : 'bg-[#FAFAFA] text-[#1D1D1F]'
    }`}>
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
          onPrepareWorkspace={prepareWorkspace}
          onLogout={handleLogoutAccount}
          allowedWorkspaces={allowedWorkspaces}
          currentUserNickname={currentUserNickname}
          currentUserEmail={currentUserEmail}
          sessionExpiresAt={sessionExpiresAt}
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
          onLogout={handleLogoutAccount}
          sessionExpiresAt={sessionExpiresAt}
          onPreview={(title, subtitle, content) => dispatch({ type: 'SET_PREVIEW', data: { title, subtitle, content } })}
        />
      ) : activeWorkspace !== 'hub' && canAccessWorkspace(activeWorkspace) ? (
        renderWorkspaceShell(
          activeWorkspace,
          <Suspense fallback={workspaceFallback}>
              {WORKSPACE_REGISTRY_BY_ID[activeWorkspace].render({
                activationKey: authorizedKey,
                currentUserAccountId: state.currentUserAccountId,
                currentUserNickname: currentUserNickname,
                currentUserEmail: currentUserEmail,
                onReturnToHub: handleReturnToHub,
                onLogout: handleLogoutAccount,
            })}
          </Suspense>,
        )
      ) : (
        <WorkspaceHub
          onSelect={handleSelectWorkspace}
          onPrepareWorkspace={prepareWorkspace}
          onLogout={handleLogoutAccount}
          allowedWorkspaces={allowedWorkspaces}
          currentUserNickname={currentUserNickname}
          currentUserEmail={currentUserEmail}
          sessionExpiresAt={sessionExpiresAt}
        />
      )}

      {authStatus === 'authenticated' && !isSellingHousesActive && (
        <footer className="shrink-0 border-t border-black/5 bg-white py-3 text-center text-[11px] text-[#86868B]">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>KeGame • 多模型PK + 开放日选址 + 资产顾问 + 商圈经营 + 理性业主</span>
            <span className="text-black/10">|</span>
            <span>© 2026</span>
          </div>
        </footer>
      )}

      <PreviewModal
        data={previewData}
        onClose={() => dispatch({ type: 'SET_PREVIEW', data: null })}
      />
    </div>
  );
}

function WorkspaceShellSkeleton() {
  return (
    <LoadingScene
      title="正在进入工作台"
      subtitle="先载入工作区骨架，业务进度进入页面后再按本地优先恢复。"
    />
  );
}
