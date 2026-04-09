import { put } from '@vercel/blob';
import type { OpenDayUploadArtifactSummary } from '../domain/openDay.types.js';
import type {
  OpenDayUploadArtifactRepository,
  SaveOpenDayUploadArtifactCommand,
} from '../application/openDayUploadArtifactRepository.js';
import { withOpenDayNeon } from './neonOpenDayDatabase.js';

export class BlobOpenDayUploadArtifactRepository implements OpenDayUploadArtifactRepository {
  async save(command: SaveOpenDayUploadArtifactCommand): Promise<OpenDayUploadArtifactSummary> {
    const blob = await put(command.storageKey, command.buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: command.contentType,
    });

    const summary: OpenDayUploadArtifactSummary = {
      id: command.id,
      createdAt: command.createdAt,
      originalFilename: command.originalFilename,
      byteSize: command.byteSize,
      contentType: command.contentType,
      checksumSha256: command.checksumSha256,
      storageBackend: 'blob',
      storageKey: blob.pathname,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
    };

    await withOpenDayNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO open_day_upload_artifacts (
            id,
            created_at,
            original_filename,
            byte_size,
            content_type,
            checksum_sha256,
            storage_backend,
            storage_key,
            url,
            download_url,
            artifact_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            created_at = EXCLUDED.created_at,
            original_filename = EXCLUDED.original_filename,
            byte_size = EXCLUDED.byte_size,
            content_type = EXCLUDED.content_type,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            storage_backend = EXCLUDED.storage_backend,
            storage_key = EXCLUDED.storage_key,
            url = EXCLUDED.url,
            download_url = EXCLUDED.download_url,
            artifact_json = EXCLUDED.artifact_json
        `,
        [
          summary.id,
          summary.createdAt,
          summary.originalFilename,
          summary.byteSize,
          summary.contentType,
          summary.checksumSha256,
          summary.storageBackend,
          summary.storageKey,
          summary.url,
          summary.downloadUrl,
          JSON.stringify(summary),
        ],
      );
    });

    return summary;
  }
}
