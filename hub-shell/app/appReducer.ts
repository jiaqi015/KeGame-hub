type AuthStatus = 'locked' | 'submitting' | 'authenticated';
type AuthMode = 'email' | 'activate' | 'verify';

export interface AppState {
  prompt: string;
  loginEmail: string;
  verificationCode: string;
  activationInput: string;
  authorizedKey: string;
  allowedWorkspaces: string[];
  authStatus: AuthStatus;
  authError: string | null;
  authMode: AuthMode;
  authHint: string;
  activeWorkspace: 'hub' | string;
  currentUserAccountId?: string;
  currentUserEmail?: string;
  currentUserNickname?: string;
  sessionExpiresAt?: string;
  availableModels: Array<{ id: string; name: string; enabled: boolean }>;
  selectedModels: string[];
  isComparing: boolean;
  results: Record<string, unknown>;
  previewData: { title: string; subtitle: string; content: string } | null;
  activeTab: string;
  summary: { content: string; status: string } | null;
}

type AppAction =
  | { type: 'SET_PROMPT'; prompt: string }
  | { type: 'SET_LOGIN_EMAIL'; value: string }
  | { type: 'SET_VERIFICATION_CODE'; value: string }
  | { type: 'SET_ACTIVATION_INPUT'; value: string }
  | { type: 'SET_AUTH_STATUS'; status: AuthStatus; error?: string }
  | { type: 'SET_AUTH_MODE'; mode: AuthMode; hint?: string }
  | { 
      type: 'COMPLETE_ACTIVATION'; 
      key: string; 
      allowedWorkspaces: string[];
      accountId?: string;
      email?: string;
      nickname?: string;
      sessionExpiresAt?: string;
    }
  | { type: 'SET_WORKSPACE'; workspace: 'hub' | string }
  | { type: 'TOGGLE_MODEL'; id: string }
  | { type: 'SET_ACTIVE_TAB'; tab: string }
  | { type: 'SET_CATALOG'; models: Array<{ id: string; name: string; enabled: boolean }>; selected: string[] }
  | { type: 'START_COMPARISON' }
  | { type: 'SET_SUMMARY'; summary: { content: string; status: string } }
  | { type: 'RESET_COMPARISON' }
  | { type: 'SET_PREVIEW'; data: { title: string; subtitle: string; content: string } | null }
  | { type: 'LOCK_APPLICATION'; message: string; nextInput: string };

export const initialState: AppState = {
  prompt: '',
  loginEmail: '',
  verificationCode: '',
  activationInput: '',
  authorizedKey: '',
  allowedWorkspaces: ['sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner'],
  authStatus: 'locked',
  authError: null,
  authMode: 'email',
  authHint: '',
  activeWorkspace: 'hub',
  availableModels: [
    { id: 'doubao', name: '豆包', enabled: true },
    { id: 'gpt', name: 'GPT-4', enabled: true },
    { id: 'claude', name: 'Claude', enabled: true },
  ],
  selectedModels: [],
  isComparing: false,
  results: {},
  previewData: null,
  activeTab: 'models',
  summary: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROMPT':
      return { ...state, prompt: action.prompt };
    case 'SET_LOGIN_EMAIL':
      return { ...state, loginEmail: action.value };
    case 'SET_VERIFICATION_CODE':
      return { ...state, verificationCode: action.value };
    case 'SET_ACTIVATION_INPUT':
      return { ...state, activationInput: action.value };
    case 'SET_AUTH_STATUS':
      return {
        ...state,
        authStatus: action.status,
        authError: action.error ?? state.authError,
      };
    case 'SET_AUTH_MODE':
      return {
        ...state,
        authMode: action.mode,
        authHint: action.hint ?? state.authHint,
      };
    case 'COMPLETE_ACTIVATION':
      return {
        ...state,
        authorizedKey: action.key,
        allowedWorkspaces: action.allowedWorkspaces,
        currentUserAccountId: action.accountId,
        currentUserEmail: action.email,
        currentUserNickname: action.nickname,
        sessionExpiresAt: action.sessionExpiresAt,
        authStatus: 'authenticated',
        authError: null,
      };
    case 'SET_WORKSPACE':
      return { ...state, activeWorkspace: action.workspace };
    case 'TOGGLE_MODEL':
      const isSelected = state.selectedModels.includes(action.id);
      return {
        ...state,
        selectedModels: isSelected
          ? state.selectedModels.filter(id => id !== action.id)
          : [...state.selectedModels, action.id],
      };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_CATALOG':
      return {
        ...state,
        availableModels: action.models,
        selectedModels: action.selected,
      };
    case 'START_COMPARISON':
      return { ...state, isComparing: true };
    case 'SET_SUMMARY':
      return { ...state, summary: action.summary };
    case 'RESET_COMPARISON':
      return { ...state, isComparing: false, results: {}, summary: null };
    case 'SET_PREVIEW':
      return { ...state, previewData: action.data };
    case 'LOCK_APPLICATION':
      return {
        ...state,
        authStatus: 'locked',
        authorizedKey: '',
        allowedWorkspaces: [],
        activeWorkspace: 'hub',
        authHint: action.nextInput,
        authError: action.message,
      };
    default:
      return state;
  }
}
