import type { OpenDayUploadArtifactSummary } from '../domain/openDay.types.js';

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
  save(command: SaveOpenDayUploadArtifactCommand): Promise<OpenDayUploadArtifactSummary>;
}
