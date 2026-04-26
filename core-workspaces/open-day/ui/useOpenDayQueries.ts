import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import type { ParsedWorkbookPayload } from '../lib/openDayWorkbook.ts';
import type {
  OpenDayAnalysisResponse,
  OpenDayAnalysisRunListResponse,
  OpenDayAnalysisRunRecord,
  OpenDayCatalogResponse,
  OpenDaySaveScenarioCommand,
  OpenDayScenarioListResponse,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioVersionListResponse,
  OpenDayScoreCommand,
  OpenDaySnapshotListResponse,
} from '../domain/openDay.types.ts';
import type {
  DisambiguationRequest,
  DisambiguationResult,
} from '../domain/openDayDisambiguation.types.js';
import {
  fetchOpenDayCatalog,
  fetchOpenDayAnalysisRuns,
  fetchOpenDayAnalysisRunDetail,
  fetchOpenDayScenarios,
  fetchOpenDayScenarioDetail,
  fetchOpenDayScenarioVersions,
  fetchOpenDayAnalysis,
  saveOpenDayScenario,
  uploadWorkbook,
  disambiguateOpenDayNames,
} from './openDayClient.ts';

const QUERY_KEYS = {
  catalog: (activationKey: string) => ['openDay', 'catalog', activationKey] as const,
  analysisRuns: (activationKey: string, limit: number, scenarioId: string) => 
    ['openDay', 'analysisRuns', activationKey, limit, scenarioId] as const,
  analysisRunDetail: (activationKey: string, id: string) => 
    ['openDay', 'analysisRunDetail', activationKey, id] as const,
  scenarios: (activationKey: string, limit: number) => 
    ['openDay', 'scenarios', activationKey, limit] as const,
  scenarioDetail: (activationKey: string, id: string) => 
    ['openDay', 'scenarioDetail', activationKey, id] as const,
  scenarioVersions: (activationKey: string, templateId: string, limit: number) => 
    ['openDay', 'scenarioVersions', activationKey, templateId, limit] as const,
};

export function useOpenDayCatalog(
  activationKey: string,
  options?: Omit<UseQueryOptions<
    OpenDayCatalogResponse,
    Error,
    OpenDayCatalogResponse,
    ReturnType<typeof QUERY_KEYS.catalog>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.catalog(activationKey),
    queryFn: () => fetchOpenDayCatalog(activationKey),
    enabled: !!activationKey,
    ...options,
  });
}

export function useOpenDayAnalysisRuns(
  activationKey: string,
  limit = 8,
  scenarioId = '',
  options?: Omit<UseQueryOptions<
    OpenDayAnalysisRunListResponse,
    Error,
    OpenDayAnalysisRunListResponse,
    ReturnType<typeof QUERY_KEYS.analysisRuns>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.analysisRuns(activationKey, limit, scenarioId),
    queryFn: () => fetchOpenDayAnalysisRuns(activationKey, limit, scenarioId),
    enabled: !!activationKey,
    ...options,
  });
}

export function useOpenDayAnalysisRunDetail(
  activationKey: string,
  id: string,
  options?: Omit<UseQueryOptions<
    OpenDayAnalysisRunRecord,
    Error,
    OpenDayAnalysisRunRecord,
    ReturnType<typeof QUERY_KEYS.analysisRunDetail>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.analysisRunDetail(activationKey, id),
    queryFn: () => fetchOpenDayAnalysisRunDetail(activationKey, id),
    enabled: !!activationKey && !!id,
    ...options,
  });
}

export function useOpenDayScenarios(
  activationKey: string,
  limit = 8,
  options?: Omit<UseQueryOptions<
    OpenDayScenarioListResponse,
    Error,
    OpenDayScenarioListResponse,
    ReturnType<typeof QUERY_KEYS.scenarios>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.scenarios(activationKey, limit),
    queryFn: () => fetchOpenDayScenarios(activationKey, limit),
    enabled: !!activationKey,
    ...options,
  });
}

export function useOpenDayScenarioDetail(
  activationKey: string,
  id: string,
  options?: Omit<UseQueryOptions<
    OpenDayScenarioTemplateRecord,
    Error,
    OpenDayScenarioTemplateRecord,
    ReturnType<typeof QUERY_KEYS.scenarioDetail>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.scenarioDetail(activationKey, id),
    queryFn: () => fetchOpenDayScenarioDetail(activationKey, id),
    enabled: !!activationKey && !!id,
    ...options,
  });
}

export function useOpenDayScenarioVersions(
  activationKey: string,
  templateId: string,
  limit = 20,
  options?: Omit<UseQueryOptions<
    OpenDayScenarioVersionListResponse,
    Error,
    OpenDayScenarioVersionListResponse,
    ReturnType<typeof QUERY_KEYS.scenarioVersions>
  >, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: QUERY_KEYS.scenarioVersions(activationKey, templateId, limit),
    queryFn: () => fetchOpenDayScenarioVersions(activationKey, templateId, limit),
    enabled: !!activationKey && !!templateId,
    ...options,
  });
}

interface UploadWorkbookVariables {
  activationKey: string;
  file: File;
  requestedSheet?: string;
}

export function useUploadWorkbook(
  options?: UseMutationOptions<ParsedWorkbookPayload, Error, UploadWorkbookVariables>
) {
  return useMutation({
    mutationFn: ({ activationKey, file, requestedSheet = '' }) =>
      uploadWorkbook(activationKey, file, requestedSheet),
    ...options,
  });
}

interface RunAnalysisVariables {
  activationKey: string;
  command: OpenDayScoreCommand;
}

export function useRunAnalysis(
  options?: UseMutationOptions<OpenDayAnalysisResponse, Error, RunAnalysisVariables>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ activationKey, command }) =>
      fetchOpenDayAnalysis(activationKey, command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ 
        queryKey: ['openDay', 'analysisRuns'] 
      });
    },
    ...options,
  });
}

interface SaveScenarioVariables {
  activationKey: string;
  command: OpenDaySaveScenarioCommand;
}

export function useSaveScenario(
  options?: UseMutationOptions<OpenDayScenarioTemplateRecord, Error, SaveScenarioVariables>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ activationKey, command }) =>
      saveOpenDayScenario(activationKey, command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ 
        queryKey: ['openDay', 'scenarios'] 
      });
    },
    ...options,
  });
}

interface DisambiguateNamesVariables {
  activationKey: string;
  request: DisambiguationRequest;
  useAI?: boolean;
}

export function useDisambiguateNames(
  options?: UseMutationOptions<DisambiguationResult, Error, DisambiguateNamesVariables>
) {
  return useMutation({
    mutationFn: ({ activationKey, request, useAI = true }) =>
      disambiguateOpenDayNames(activationKey, request, useAI),
    ...options,
  });
}

export function useOpenDayInvalidate() {
  const queryClient = useQueryClient();

  return {
    invalidateAnalysisRuns: () =>
      queryClient.invalidateQueries({ queryKey: ['openDay', 'analysisRuns'] }),
    invalidateScenarios: () =>
      queryClient.invalidateQueries({ queryKey: ['openDay', 'scenarios'] }),
    invalidateCatalog: () =>
      queryClient.invalidateQueries({ queryKey: ['openDay', 'catalog'] }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: ['openDay'] }),
  };
}
