import {
  getEvaluationModelBoundary,
  type EvaluationModelBoundary,
  type EvaluationModelForbiddenInputFacet,
  type EvaluationModelLegacyMirrorField,
} from './evaluation-model-boundaries.js';
import type {
  EvaluationSubjectRef,
  SellingHousesEvaluationSnapshot,
} from './models.js';

export type EvaluationBoundaryGuardStatus =
  | 'clean'
  | 'legacy-warning'
  | 'boundary-violation';

export interface EvaluationForbiddenInputHit {
  readonly facet: string;
  readonly field: string;
  readonly reason: string;
}

export interface EvaluationLegacyMirrorHit {
  readonly field: string;
  readonly concept: string;
  readonly warningLevel: EvaluationModelLegacyMirrorField['warningLevel'];
  readonly note: string;
}

export interface EvaluationSnapshotBoundaryReport {
  readonly modelId: SellingHousesEvaluationSnapshot['modelId'];
  readonly subjectRef: EvaluationSubjectRef;
  readonly forbiddenInputHits: readonly EvaluationForbiddenInputHit[];
  readonly legacyMirrorHits: readonly EvaluationLegacyMirrorHit[];
  readonly unknownInputFields: readonly string[];
  readonly status: EvaluationBoundaryGuardStatus;
}

function buildAllowedInputFields(boundary: EvaluationModelBoundary) {
  return new Set(boundary.allowedInputFacets.flatMap((entry) => entry.fields));
}

function findForbiddenHit(
  field: string,
  forbiddenFacets: readonly EvaluationModelForbiddenInputFacet[],
): EvaluationForbiddenInputHit | null {
  for (const facet of forbiddenFacets) {
    if (facet.fields.includes(field)) {
      return {
        facet: facet.facet,
        field,
        reason: facet.reason,
      };
    }
  }
  return null;
}

function findLegacyMirrorHit(
  field: string,
  legacyMirrorFields: readonly EvaluationModelLegacyMirrorField[],
): EvaluationLegacyMirrorHit | null {
  for (const mirror of legacyMirrorFields) {
    if (mirror.field === field || mirror.sourceFields?.includes(field)) {
      return {
        field,
        concept: mirror.concept,
        warningLevel: mirror.warningLevel,
        note: mirror.note,
      };
    }
  }
  return null;
}

function resolveStatus(
  forbiddenInputHits: readonly EvaluationForbiddenInputHit[],
  legacyMirrorHits: readonly EvaluationLegacyMirrorHit[],
): EvaluationBoundaryGuardStatus {
  if (forbiddenInputHits.length > 0) {
    return 'boundary-violation';
  }
  if (legacyMirrorHits.length > 0) {
    return 'legacy-warning';
  }
  return 'clean';
}

function freezeArray<T>(items: T[]) {
  return Object.freeze(items);
}

export function validateEvaluationSnapshotBoundary(
  snapshot: SellingHousesEvaluationSnapshot,
): EvaluationSnapshotBoundaryReport {
  const boundary = getEvaluationModelBoundary(snapshot.modelId);
  const inputFields = Object.keys(snapshot.inputs);

  if (!boundary) {
    return {
      modelId: snapshot.modelId,
      subjectRef: snapshot.subjectRef,
      forbiddenInputHits: Object.freeze([]),
      legacyMirrorHits: Object.freeze([]),
      unknownInputFields: freezeArray([...inputFields]),
      status: 'clean',
    };
  }

  const allowedInputFields = buildAllowedInputFields(boundary);
  const forbiddenInputHits: EvaluationForbiddenInputHit[] = [];
  const legacyMirrorHits: EvaluationLegacyMirrorHit[] = [];
  const unknownInputFields: string[] = [];

  for (const field of inputFields) {
    const forbiddenHit = findForbiddenHit(field, boundary.forbiddenInputFacets);
    const legacyMirrorHit = findLegacyMirrorHit(field, boundary.legacyMirrorFields);

    if (forbiddenHit) {
      forbiddenInputHits.push(forbiddenHit);
    }

    if (legacyMirrorHit) {
      legacyMirrorHits.push(legacyMirrorHit);
    }

    if (!allowedInputFields.has(field) && !forbiddenHit && !legacyMirrorHit) {
      unknownInputFields.push(field);
    }
  }

  return Object.freeze({
    modelId: snapshot.modelId,
    subjectRef: snapshot.subjectRef,
    forbiddenInputHits: freezeArray(forbiddenInputHits),
    legacyMirrorHits: freezeArray(legacyMirrorHits),
    unknownInputFields: freezeArray(unknownInputFields),
    status: resolveStatus(forbiddenInputHits, legacyMirrorHits),
  });
}

export function validateEvaluationSnapshotsBoundaries(
  snapshots: readonly SellingHousesEvaluationSnapshot[],
): readonly EvaluationSnapshotBoundaryReport[] {
  return freezeArray(snapshots.map((snapshot) => validateEvaluationSnapshotBoundary(snapshot)));
}
