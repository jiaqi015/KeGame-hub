import { AIModel, ComparisonResult } from '../types';

export type DifferenceSummaryStatus = 'idle' | 'waiting' | 'thinking' | 'completed' | 'error';
export type AuthStatus = 'checking' | 'locked' | 'submitting' | 'authenticated';
export type WorkspaceId = 'hub' | 'sabrina' | 'open-day' | 'selling-houses';

export interface DifferenceSummaryState {
  modelId: string | null;
  content: string;
  status: DifferenceSummaryStatus;
}

export interface AppState {
  // Auth
  activationInput: string;
  authorizedKey: string;
  authStatus: AuthStatus;
  authError: string;
  
  // Navigation
  activeWorkspace: WorkspaceId;
  previewData: { title: string; subtitle: string; content: string } | null;
  
  // Catalog
  availableModels: AIModel[];
  catalogReady: boolean;
  selectedModels: string[];
  activeTab: string;
  
  // Comparison
  prompt: string;
  isComparing: boolean;
  results: Record<string, ComparisonResult>;
  differenceSummary: DifferenceSummaryState;
}

export type AppAction =
  | { type: 'SET_AUTH_STATUS'; status: AuthStatus; error?: string }
  | { type: 'SET_ACTIVATION_INPUT'; value: string }
  | { type: 'COMPLETE_ACTIVATION'; key: string }
  | { type: 'LOCK_APPLICATION'; message: string; nextInput: string }
  | { type: 'SET_WORKSPACE'; workspace: WorkspaceId }
  | { type: 'SET_CATALOG'; models: AIModel[]; selected: string[] }
  | { type: 'TOGGLE_MODEL'; id: string }
  | { type: 'SET_ACTIVE_TAB'; tab: string }
  | { type: 'SET_PROMPT'; prompt: string }
  | { type: 'START_COMPARISON'; modelIds: string[] }
  | { type: 'UPDATE_RESULT'; modelId: string; result: ComparisonResult }
  | { type: 'SET_RESULTS'; results: Record<string, ComparisonResult> }
  | { type: 'FINISH_COMPARISON' }
  | { type: 'SET_SUMMARY'; summary: Partial<DifferenceSummaryState> }
  | { type: 'SET_PREVIEW'; data: { title: string; subtitle: string; content: string } | null }
  | { type: 'RESET_COMPARISON' }
  | { type: 'RESET_WORKSPACE' };

export const initialState: AppState = {
  activationInput: '',
  authorizedKey: '',
  authStatus: 'checking',
  authError: '',
  activeWorkspace: 'hub',
  previewData: null,
  availableModels: [],
  catalogReady: false,
  selectedModels: [],
  activeTab: 'all',
  prompt: '',
  isComparing: false,
  results: {},
  differenceSummary: {
    modelId: null,
    content: '',
    status: 'idle',
  },
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_AUTH_STATUS':
      return { ...state, authStatus: action.status, authError: action.error ?? '' };
      
    case 'SET_ACTIVATION_INPUT':
      return { ...state, activationInput: action.value };
      
    case 'COMPLETE_ACTIVATION':
      return {
        ...state,
        authorizedKey: action.key,
        activationInput: action.key,
        authError: '',
        activeWorkspace: 'hub',
        authStatus: 'authenticated',
      };
      
    case 'LOCK_APPLICATION':
      return {
        ...initialState,
        authStatus: 'locked',
        authError: action.message,
        activationInput: action.nextInput,
      };
      
    case 'SET_WORKSPACE':
      return { ...state, activeWorkspace: action.workspace };
      
    case 'SET_CATALOG':
      return {
        ...state,
        availableModels: action.models,
        selectedModels: action.selected,
        catalogReady: true,
      };
      
    case 'TOGGLE_MODEL': {
      const isSelected = state.selectedModels.includes(action.id);
      return {
        ...state,
        selectedModels: isSelected
          ? state.selectedModels.filter((m) => m !== action.id)
          : [...state.selectedModels, action.id],
      };
    }
    
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.tab };
      
    case 'SET_PROMPT':
      return { ...state, prompt: action.prompt };
      
    case 'START_COMPARISON': {
      const initialResults: Record<string, ComparisonResult> = {};
      action.modelIds.forEach((id) => {
        initialResults[id] = { modelId: id, result: '', reasoning: '', status: 'thinking' };
      });
      return {
        ...state,
        isComparing: true,
        results: initialResults,
        differenceSummary: {
          modelId: 'doubao-seed-2-0-pro-260215',
          content: '',
          status: 'waiting',
        },
      };
    }
    
    case 'UPDATE_RESULT':
      return {
        ...state,
        results: {
          ...state.results,
          [action.modelId]: action.result,
        },
      };
      
    case 'SET_RESULTS':
      return { ...state, results: action.results };
      
    case 'FINISH_COMPARISON':
      return { ...state, isComparing: false };
      
    case 'SET_SUMMARY':
      return {
        ...state,
        differenceSummary: { ...state.differenceSummary, ...action.summary },
      };
      
    case 'SET_PREVIEW':
      return { ...state, previewData: action.data };
      
    case 'RESET_COMPARISON':
      return {
        ...state,
        isComparing: false,
        results: {},
        previewData: null,
        differenceSummary: initialState.differenceSummary,
      };
      
    case 'RESET_WORKSPACE':
      return {
        ...initialState,
        authorizedKey: state.authorizedKey,
        authStatus: state.authStatus,
      };
      
    default:
      return state;
  }
}
