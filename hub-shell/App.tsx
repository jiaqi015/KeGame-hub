import React, { Suspense, useEffect, useMemo, useReducer, useRef, lazy } from 'react';
import { Sparkles } from 'lucide-react';
import { appReducer, initialState } from './app/appReducer';
import { useAppSession } from './hooks/useAppSession';

// UI Components
import { AuthOverlay } from './components/Auth/AuthOverlay';
import { WorkspaceHub } from './components/Hub/WorkspaceHub';
import { PreviewModal } from './components/common/PreviewModal';
import {
  preloadSellingHousesWorkspace,
  resolvePathnameForWorkspace,
  resolveWorkspaceFromPathname,
  WORKSPACE_REGISTRY_BY_ID,
} from './workspaces/workspaceRegistry';

// Eager loaded workspace
import { ComparisonWorkspace } from '../core-workspaces/sabrina/ComparisonWorkspace';

// Lazy loaded workspaces
const OpenDayWorkspace = lazy(() =>
  import('../core-workspaces/open-day/ui/OpenDayWorkspace')
    .then(module => ({ default: module.OpenDayWorkspace })),
);
const SellingHousesWorkspace = lazy(() =>
  import('../selling-houses-workspace/SellingHousesWorkspace')
    .then(module => ({ default: module.SellingHousesWorkspace })),
);
const MarketManagementWorkspace = lazy(() =>
  import('../sandbox-workspaces/market-management/MarketManagementWorkspace')
    .then(module => ({ default: module.MarketManagementWorkspace })),
);
const RationalOwnerWorkspace = lazy(() =>
  import('../sandbox-workspaces/rational-owner/RationalOwnerWorkspace')
    .then(module => ({ default: module.RationalOwnerWorkspace })),
);

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
  const workspaceFallback = useMemo(() => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">加载中...</p>
      </div>
    </div>
  ), []);
  const pendingWorkspaceRef = useRef<'hub' | string>(resolveWorkspaceFromPathname(window.location.pathname));
  
  const {
    activationKey,
    allowedWorkspaces,
    authStatus,
    activeWorkspace,
    currentUserAccountId,
    currentUserEmail,
    currentUserNickname,
    sessionExpiresAt,
    previewData,
  } = state;

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
        void preloadSellingHousesWorkspace();
      }, { timeout: 1200 })
      : window.setTimeout(() => {
        void preloadSellingHousesWorkspace();
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

  const handleReturnToHub = () => {
    dispatch({ type: 'SET_PREVIEW', data: null });
    dispatch({ type: 'SET_WORKSPACE', workspace: 'hub' });
    pendingWorkspaceRef.current = 'hub';
    window.sessionStorage.removeItem(WORKSPACE_PATH_STORAGE_KEY);
    window.history.pushState({}, '', '/');
  };

  const handleLogoutAccount = () => {
    lockApplication('', '');
  };

  const canAccessWorkspace = (workspace: string) =>
    allowedWorkspaces.includes(workspace);

  const handleSelectWorkspace = (workspace: string) => {
    if (!canAccessWorkspace(workspace)) {
      return;
    }

    const nextPath = resolvePathnameForWorkspace(workspace);
    pendingWorkspaceRef.current = workspace;
    window.history.pushState({}, '', nextPath);
    dispatch({ type: 'SET_WORKSPACE', workspace });
  };

  const renderWorkspace = (workspaceId: string) => {
    const commonProps = {
      activationKey,
      currentUserAccountId,
      currentUserNickname,
      currentUserEmail,
      onReturnToHub: handleReturnToHub,
      onLogout: handleLogoutAccount,
    };

    switch (workspaceId) {
      case 'sabrina':
        return (
          <ComparisonWorkspace
            state={state}
            onSetPrompt={(val) => dispatch({ type: 'SET_PROMPT', prompt: val })}
            onToggleModel={(id) => dispatch({ type: 'TOGGLE_MODEL', id })}
            onSetActiveTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
            onResetSelectedModels={() => dispatch({ type: 'SET_CATALOG', models: [], selected: [] })}
            onStartComparison={() => {}}
            onReset={() => dispatch({ type: 'RESET_COMPARISON' })}
            onReturnToHub={handleReturnToHub}
            onLogout={handleLogoutAccount}
            currentUserNickname={currentUserNickname}
            currentUserEmail={currentUserEmail}
            sessionExpiresAt={sessionExpiresAt}
          />
        );
      case 'open-day':
        return <OpenDayWorkspace {...commonProps} />;
      case 'selling-houses':
        return <SellingHousesWorkspace {...commonProps} />;
      case 'market-management':
        return <MarketManagementWorkspace {...commonProps} />;
      case 'rational-owner':
        return <RationalOwnerWorkspace {...commonProps} />;
      default:
        return null;
    }
  };

  const isSellingHousesActive = authStatus === 'authenticated' && activeWorkspace === 'selling-houses';

  return (
    <div className={`h-screen font-sans selection:bg-blue-100 overflow-hidden flex flex-col ${
      isSellingHousesActive
        ? 'bg-[var(--seller-bg)] text-[var(--seller-ink)]'
        : authStatus !== 'authenticated'
          ? 'bg-[#050505]'
          : 'bg-[#FAFAFA] text-slate-900'
    }`}>
      {authStatus !== 'authenticated' ? (
        <AuthOverlay
          loginEmail={state.loginEmail}
          verificationCode={state.verificationCode}
          activationInput={state.activationInput}
          authMode={state.authMode}
          authHint={state.authHint}
          authStatus={state.authStatus}
          authError={state.authError}
          onEmailChange={(value) => dispatch({ type: 'SET_LOGIN_EMAIL', value })}
          onCodeChange={(value) => dispatch({ type: 'SET_VERIFICATION_CODE', value })}
          onChange={(value) => dispatch({ type: 'SET_ACTIVATION_INPUT', value })}
          onSubmit={(e) => {
            e?.preventDefault();
            dispatch({ type: 'SET_AUTH_STATUS', status: 'authenticated' });
          }}
        />
      ) : activeWorkspace === 'hub' ? (
        <WorkspaceHub
          onSelect={handleSelectWorkspace}
          onLogout={handleLogoutAccount}
          allowedWorkspaces={allowedWorkspaces}
          currentUserNickname={currentUserNickname}
          currentUserEmail={currentUserEmail}
        />
      ) : activeWorkspace !== 'hub' && canAccessWorkspace(activeWorkspace) ? (
        <Suspense fallback={workspaceFallback}>
          {renderWorkspace(activeWorkspace)}
        </Suspense>
      ) : (
        <WorkspaceHub
          onSelect={handleSelectWorkspace}
          onLogout={handleLogoutAccount}
          allowedWorkspaces={allowedWorkspaces}
          currentUserNickname={currentUserNickname}
          currentUserEmail={currentUserEmail}
        />
      )}

      {authStatus === 'authenticated' && !isSellingHousesActive && activeWorkspace !== 'hub' && (
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
