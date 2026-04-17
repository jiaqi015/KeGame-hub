import React, { useEffect, useCallback } from 'react';
import { AppState, AppAction } from '../app/appReducer';
import { 
  ACTIVATION_STORAGE_KEY, 
  verifyActivationKey, 
  buildAuthorizedHeaders 
} from '../services/apiService';
import { AIModel } from '../types';

export function useAppSession(state: AppState, dispatch: React.Dispatch<AppAction>) {
  const { authorizedKey, authStatus, allowedWorkspaces } = state;

  const lockApplication = useCallback((message: string, nextInput = '') => {
    window.localStorage.removeItem(ACTIVATION_STORAGE_KEY);
    dispatch({ type: 'LOCK_APPLICATION', message, nextInput });
  }, [dispatch]);

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
      const storedKey = window.localStorage.getItem(ACTIVATION_STORAGE_KEY)?.trim() || '';
      if (!storedKey) {
        if (!disposed) dispatch({ type: 'SET_AUTH_STATUS', status: 'locked' });
        return;
      }

      if (!disposed) {
        dispatch({ type: 'SET_ACTIVATION_INPUT', value: storedKey });
        dispatch({ type: 'SET_AUTH_STATUS', status: 'checking' });
      }

      try {
        const verified = await verifyActivationKey(storedKey);
        if (!disposed) {
          dispatch({
            type: 'COMPLETE_ACTIVATION',
            key: verified.key,
            allowedWorkspaces: verified.allowedWorkspaces,
          });
        }
      } catch (error) {
        if (!disposed) {
          lockApplication(error instanceof Error ? error.message : '激活失败。', storedKey);
        }
      }
    };

    restoreActivation();
    return () => { disposed = true; };
  }, [dispatch, lockApplication]);

  // Catalog loading
  useEffect(() => {
    let disposed = false;
    if (authStatus !== 'authenticated' || !authorizedKey || !allowedWorkspaces.includes('sabrina')) return;

    const loadModels = async () => {
      try {
        const response = await authorizedFetch('/api/models');
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
  }, [authStatus, authorizedKey, authorizedFetch, allowedWorkspaces, dispatch]);

  return { authorizedFetch, lockApplication };
}
