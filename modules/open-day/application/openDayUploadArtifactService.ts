import { createHash } from 'node:crypto';
import path from 'node:path';
import type { OpenDayUploadArtifactSummary } from '../domain/openDay.types.js';
import type { OpenDayUploadArtifactRepository } from './openDayUploadArtifactRepository.js';

export interface SaveOpenDayUploadArtifactInput {
  buffer: Buffer;
  originalFilename: string;
  contentType?: string;
}

function sanitizeFilename(filename: string) {
  const extension = path.extname(filename).replace(/[^.\w-]/g, '').toLowerCase().slice(0, 16);
  const basename = path
    .basename(filename, extension)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${basename || 'upload'}${extension || '.bin'}`;
}

function resolveContentType(filename: string, contentType?: string) {
  const normalized = (contentType || '').trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }

  const extension = path.extname(filename).toLowerCase();
  if (extension === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  if (extension === '.xls') {
    return 'application/vnd.ms-excel';
  }

  if (extension === '.csv') {
    return 'text/csv';
  }

  return 'application/octet-stream';
}

function buildStorageKey(id: string, createdAt: string, originalFilename: string) {
  const created = new Date(createdAt);
  const year = Number.isNaN(created.getTime()) ? 'unknown' : `${created.getUTCFullYear()}`;
  const month = Number.isNaN(created.getTime()) ? '00' : `${created.getUTCMonth() + 1}`.padStart(2, '0');
  return `open-day/uploads/${year}/${month}/${id}-${sanitizeFilename(originalFilename)}`;
}

export class OpenDayUploadArtifactService {
  constructor(private readonly repository: OpenDayUploadArtifactRepository) {}

  async save(input: SaveOpenDayUploadArtifactInput): Promise<OpenDayUploadArtifactSummary> {
    const originalFilename = input.originalFilename.trim() || 'workbook.xlsx';
    const createdAt = new Date().toISOString();
    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');
    const id = createHash('sha256')
      .update(`${createdAt}:${originalFilename}:${checksumSha256}:${input.buffer.byteLength}`)
      .digest('hex')
      .slice(0, 24);

    return this.repository.save({
      id,
      createdAt,
      originalFilename,
      byteSize: input.buffer.byteLength,
      contentType: resolveContentType(originalFilename, input.contentType),
      checksumSha256,
      storageKey: buildStorageKey(id, createdAt, originalFilename),
      buffer: input.buffer,
    });
  }
}
