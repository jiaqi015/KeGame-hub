import React, { useEffect, useCallback } from 'react';
import { AppState, AppAction } from '../app/appReducer';
import { 
  ACTIVATION_STORAGE_KEY, 
  AUTH_EMAIL_STORAGE_KEY,
  buildAuthorizedHeaders,
  fetchAuthenticatedUser,
  logoutCurrentSession,
} from '../services/apiService';
import { AIModel } from '../types';
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

export function useAppSession(state: AppState, dispatch: React.Dispatch<AppAction>) {
  const { authorizedKey, authStatus, allowedWorkspaces, currentUserEmail, activeWorkspace } = state;

  const lockApplication = useCallback((message: string, nextInput = '') => {
    if (activeWorkspace !== 'hub') {
      window.sessionStorage.setItem('kegame-target-path', window.location.pathname || '/');
    }
    window.localStorage.removeItem(ACTIVATION_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
    void logoutCurrentSession().catch(() => {});
    dispatch({ type: 'LOCK_APPLICATION', message, nextInput });
  }, [activeWorkspace, dispatch]);

  const authorizedFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const response = await fetch(input, {
      ...init,
      headers: buildAuthorizedHeaders(authorizedKey, init.headers),
    });

    if (response.status === 401 || response.status === 403) {
      const payload = await response.clone().json().catch(() => ({}));
      const message = typeof payload?.error === 'string' ? payload.error : '激活密钥无效或已失效。';
      lockApplication(message, authorizedKey);
      throw new Error(message);
    }

    return response;
  }, [authorizedKey, lockApplication]);

  // Initial restoration
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
          });
          dispatch({ type: 'SET_LOGIN_EMAIL', value: user.email });
          if (matchedWorkspace) {
            dispatch({ type: 'SET_WORKSPACE', workspace: matchedWorkspace });
          }
        }
      } catch (error) {
        if (!disposed) {
          dispatch({ type: 'SET_AUTH_STATUS', status: 'locked' });
        }
      }
    };

    restoreActivation();
    return () => { disposed = true; };
  }, [dispatch, lockApplication]);

  // Catalog loading
  useEffect(() => {
    let disposed = false;
    if (
      authStatus !== 'authenticated'
      || !authorizedKey
      || activeWorkspace !== 'sabrina'
      || !allowedWorkspaces.includes('sabrina')
    ) {
      return;
    }

    const loadModels = async () => {
      try {
        const response = await authorizedFetch('/api/compare');
        const payload = await response.json();
        const models = Array.isArray(payload?.models) ? (payload.models as AIModel[]) : [];
        
        if (!disposed) {
          dispatch({ 
            type: 'SET_CATALOG', 
            models, 
            selected: models[0] ? [models[0].id] : [] 
          });
        }
      } catch (error) {
        console.error('Failed to load model catalog:', error);
      }
    };

    loadModels();
    return () => { disposed = true; };
  }, [authStatus, authorizedKey, authorizedFetch, allowedWorkspaces, activeWorkspace, dispatch]);

  useEffect(() => {
    if (authStatus === 'authenticated' && currentUserEmail) {
      window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, currentUserEmail);
    }
  }, [authStatus, currentUserEmail]);

  return { authorizedFetch, lockApplication };
}
