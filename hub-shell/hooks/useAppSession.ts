import { useEffect, useCallback } from 'react';
import {
  ACTIVATION_STORAGE_KEY,
  AUTH_EMAIL_STORAGE_KEY,
  fetchAuthenticatedUser,
  logoutCurrentSession,
} from '../services/apiService';
import {
  normalizeWorkspacePathname,
  resolveAllowedWorkspaceFromPathname,
} from '../workspaces/workspaceRegistry';

export function resolveWorkspaceRestorePath(currentPathname: string, cachedPathname: string | null) {
  const currentPath = normalizeWorkspacePathname(currentPathname || '/');
  if (currentPath === '/') {
    return null;
  }

  return currentPath || (cachedPathname?.trim() || null);
}

export function useAppSession(state: {
  authorizedKey: string;
  authStatus: string;
  allowedWorkspaces: string[];
  currentUserEmail?: string;
}, dispatch: (action: { type: string; [key: string]: unknown }) => void) {
  const { authorizedKey, authStatus, allowedWorkspaces, currentUserEmail } = state;

  const lockApplication = useCallback((message: string, nextInput = '') => {
    const currentPath = normalizeWorkspacePathname(window.location.pathname || '/');
    if (currentPath !== '/') {
      window.sessionStorage.setItem('kegame-target-path', currentPath);
    }
    window.localStorage.removeItem(ACTIVATION_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
    void logoutCurrentSession().catch(() => {});
    dispatch({ type: 'LOCK_APPLICATION', message, nextInput });
  }, [dispatch]);

  const _authorizedFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const response = await fetch(input, {
      ...init,
      headers: {
        ...init.headers,
        'X-Activation-Key': authorizedKey,
      },
    });

    if (response.status === 401 || response.status === 403) {
      const payload = await response.clone().json().catch(() => ({}));
      const message = typeof payload?.error === 'string' ? payload.error : '激活密钥无效或已失效。';
      lockApplication(message, authorizedKey);
      throw new Error(message);
    }

    return response;
  }, [authorizedKey, lockApplication]);

  useEffect(() => {
    let disposed = false;
    const restoreActivation = async () => {
      try {
        const user = await fetchAuthenticatedUser();
        if (!disposed) {
          const cachedPath = window.sessionStorage.getItem('kegame-target-path') || '';
          const candidatePath = resolveWorkspaceRestorePath(window.location.pathname || '/', cachedPath);
          const matchedWorkspace = resolveAllowedWorkspaceFromPathname(candidatePath, user.allowedWorkspaces);

          dispatch({
            type: 'COMPLETE_ACTIVATION',
            key: window.localStorage.getItem(ACTIVATION_STORAGE_KEY)?.trim() || 'session-authenticated',
            allowedWorkspaces: user.allowedWorkspaces,
            accountId: user.accountId,
            email: user.email,
            nickname: user.nickname,
            sessionExpiresAt: user.sessionExpiresAt,
          });
          dispatch({ type: 'SET_LOGIN_EMAIL', value: user.email });
          if (matchedWorkspace) {
            dispatch({ type: 'SET_WORKSPACE', workspace: matchedWorkspace });
          }
        }
      } catch (_error) {
        if (!disposed) {
          dispatch({ type: 'SET_AUTH_STATUS', status: 'locked' });
        }
      }
    };

    restoreActivation();
    return () => { disposed = true; };
  }, [dispatch]);

  useEffect(() => {
    if (authStatus === 'authenticated' && currentUserEmail) {
      window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, currentUserEmail);
    }
  }, [authStatus, currentUserEmail]);

  return { authorizedFetch: _authorizedFetch, lockApplication };
}
