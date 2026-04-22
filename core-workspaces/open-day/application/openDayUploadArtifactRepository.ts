import type { OpenDayUploadArtifactSummary } from '../domain/openDay.types.js';

export interface FindOpenDayUploadArtifactQuery {
  originalFilename: string;
  byteSize: number;
  checksumSha256: string;
}

export interface SaveOpenDayUploadArtifactCommand {
  id: string;
  createdAt: string;
  originalFilename: string;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
  storageKey: string;
  buffer: Buffer;
}

export interface OpenDayUploadArtifactRepository {
  findExisting(query: FindOpenDayUploadArtifactQuery): Promise<OpenDayUploadArtifactSummary | null>;
  save(command: SaveOpenDayUploadArtifactCommand): Promise<OpenDayUploadArtifactSummary>;
}
