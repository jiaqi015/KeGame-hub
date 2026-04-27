import { OpenDayAnalysisService } from '../application/openDayAnalysisService.js';
import type { OpenDayAnalysisCache } from '../application/openDayAnalysisCache.js';
import { OpenDayDatasetService } from '../application/openDayDatasetService.js';
import type { OpenDayDatasetRepository } from '../application/openDayDatasetRepository.js';
import { OpenDayScenarioService } from '../application/openDayScenarioService.js';
import type { OpenDayScenarioRepository } from '../application/openDayScenarioRepository.js';
import { OpenDaySnapshotService } from '../application/openDaySnapshotService.js';
import type { OpenDaySnapshotRepository } from '../application/openDaySnapshotRepository.js';
import { OpenDayUploadArtifactService } from '../application/openDayUploadArtifactService.js';
import type { OpenDayUploadArtifactRepository } from '../application/openDayUploadArtifactRepository.js';
import type { OpenDayWorkbookParseCache } from '../application/openDayWorkbookParseCache.js';
import { OpenDayWorkbookParseService } from '../application/openDayWorkbookParseService.js';
import { BlobOpenDayUploadArtifactRepository } from './blobOpenDayUploadArtifactRepository.js';
import { FileOpenDayScenarioRepository } from './fileOpenDayScenarioRepository.js';
import { FileOpenDaySnapshotRepository } from './fileOpenDaySnapshotRepository.js';
import { FileOpenDayDatasetRepository } from './fileOpenDayDatasetRepository.js';
import { FileOpenDayUploadArtifactRepository } from './fileOpenDayUploadArtifactRepository.js';
import { InMemoryOpenDayAnalysisCache } from './inMemoryOpenDayAnalysisCache.js';
import { InMemoryOpenDayWorkbookParseCache } from './inMemoryOpenDayWorkbookParseCache.js';
import { LayeredOpenDayAnalysisCache } from './layeredOpenDayAnalysisCache.js';
import { LayeredOpenDayWorkbookParseCache } from './layeredOpenDayWorkbookParseCache.js';
import { NeonOpenDayScenarioRepository } from './neonOpenDayScenarioRepository.js';
import { NeonOpenDaySnapshotRepository } from './neonOpenDaySnapshotRepository.js';
import { NeonOpenDayDatasetRepository } from './neonOpenDayDatasetRepository.js';
import { RuntimeCacheOpenDayAnalysisCache } from './runtimeCacheOpenDayAnalysisCache.js';
import { RuntimeCacheOpenDayWorkbookParseCache } from './runtimeCacheOpenDayWorkbookParseCache.js';

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function hasBlobToken() {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || '').trim());
}

function resolveStorageBackend() {
  const explicit = (process.env.OPEN_DAY_STORAGE_BACKEND || '').trim().toLowerCase();
  if (explicit === 'local' || explicit === 'file') {
    return 'local' as const;
  }

  if (explicit === 'neon' || explicit === 'vercel') {
    return 'neon' as const;
  }

  return process.env.DATABASE_URL || process.env.POSTGRES_URL ? ('neon' as const) : ('local' as const);
}

function resolveCacheBackend() {
  const explicit = (process.env.OPEN_DAY_CACHE_BACKEND || '').trim().toLowerCase();
  if (explicit === 'memory' || explicit === 'local') {
    return 'memory' as const;
  }

  if (explicit === 'runtime') {
    return 'runtime' as const;
  }

  return isVercelRuntime() ? ('runtime' as const) : ('memory' as const);
}

function resolveUploadBackend() {
  const explicit = (process.env.OPEN_DAY_UPLOAD_BACKEND || '').trim().toLowerCase();
  if (explicit === 'local' || explicit === 'file') {
    return 'local' as const;
  }

  if (explicit === 'blob') {
    return 'blob' as const;
  }

  return hasBlobToken() && resolveStorageBackend() === 'neon' ? ('blob' as const) : ('local' as const);
}

let analysisServiceSingleton: OpenDayAnalysisService | null = null;
let snapshotServiceSingleton: OpenDaySnapshotService | null = null;
let scenarioServiceSingleton: OpenDayScenarioService | null = null;
let datasetServiceSingleton: OpenDayDatasetService | null = null;
let uploadArtifactServiceSingleton: OpenDayUploadArtifactService | null = null;
let workbookParseServiceSingleton: OpenDayWorkbookParseService | null = null;

function createAnalysisCache(): OpenDayAnalysisCache {
  const memoryCache = new InMemoryOpenDayAnalysisCache();
  if (resolveCacheBackend() !== 'runtime') {
    return memoryCache;
  }

  return new LayeredOpenDayAnalysisCache(memoryCache, new RuntimeCacheOpenDayAnalysisCache());
}

function createSnapshotRepository(): OpenDaySnapshotRepository {
  return resolveStorageBackend() === 'neon'
    ? new NeonOpenDaySnapshotRepository()
    : new FileOpenDaySnapshotRepository();
}

function createDatasetRepository(): OpenDayDatasetRepository {
  return resolveStorageBackend() === 'neon'
    ? new NeonOpenDayDatasetRepository()
    : new FileOpenDayDatasetRepository();
}

function createScenarioRepository(): OpenDayScenarioRepository {
  return resolveStorageBackend() === 'neon'
    ? new NeonOpenDayScenarioRepository()
    : new FileOpenDayScenarioRepository();
}

function createUploadArtifactRepository(): OpenDayUploadArtifactRepository {
  return resolveUploadBackend() === 'blob'
    ? new BlobOpenDayUploadArtifactRepository()
    : new FileOpenDayUploadArtifactRepository();
}

function createWorkbookParseCache(): OpenDayWorkbookParseCache {
  const memoryCache = new InMemoryOpenDayWorkbookParseCache();
  if (resolveCacheBackend() !== 'runtime') {
    return memoryCache;
  }

  return new LayeredOpenDayWorkbookParseCache(memoryCache, new RuntimeCacheOpenDayWorkbookParseCache());
}

export function getOpenDayAnalysisService() {
  if (!analysisServiceSingleton) {
    analysisServiceSingleton = new OpenDayAnalysisService(
      createAnalysisCache(),
      createSnapshotRepository(),
      getOpenDayDatasetService(),
      createDatasetRepository(),
    );
  }

  return analysisServiceSingleton;
}

export function getOpenDaySnapshotService() {
  if (!snapshotServiceSingleton) {
    snapshotServiceSingleton = new OpenDaySnapshotService(createSnapshotRepository());
  }

  return snapshotServiceSingleton;
}

export function getOpenDayScenarioService() {
  if (!scenarioServiceSingleton) {
    scenarioServiceSingleton = new OpenDayScenarioService(createScenarioRepository());
  }

  return scenarioServiceSingleton;
}

export function getOpenDayDatasetService() {
  if (!datasetServiceSingleton) {
    datasetServiceSingleton = new OpenDayDatasetService(createDatasetRepository());
  }

  return datasetServiceSingleton;
}

export function getOpenDayUploadArtifactService() {
  if (!uploadArtifactServiceSingleton) {
    uploadArtifactServiceSingleton = new OpenDayUploadArtifactService(createUploadArtifactRepository());
  }

  return uploadArtifactServiceSingleton;
}

export function getOpenDayWorkbookParseService() {
  if (!workbookParseServiceSingleton) {
    workbookParseServiceSingleton = new OpenDayWorkbookParseService(
      createWorkbookParseCache(),
      getOpenDayUploadArtifactService(),
      getOpenDayDatasetService(),
    );
  }

  return workbookParseServiceSingleton;
}
