import type {
  DisambiguationCandidate,
  DisambiguationRequest,
  DisambiguationResult,
  OpenDayNameDisambiguator,
} from '../domain/openDayDisambiguation.types.js';

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function containsArea(candidateArea: string, inputArea: string): boolean {
  if (!candidateArea || !inputArea) return false;
  const normCandidate = candidateArea.replace(/市|区|县|镇/g, '').toLowerCase();
  const normInput = inputArea.replace(/市|区|县|镇/g, '').toLowerCase();
  return normCandidate.includes(normInput) || normInput.includes(normCandidate);
}

export class RulesOpenDayNameDisambiguator implements OpenDayNameDisambiguator {
  constructor(
    private readonly areaBonus = 0.15,
    private readonly ambiguityThreshold = 0.1,
  ) {}

  async disambiguate(request: DisambiguationRequest): Promise<DisambiguationResult> {
    const { inputName, inputArea, candidates } = request;

    if (candidates.length === 0) {
      return {
        matched: null,
        candidates: [],
        ambiguous: false,
      };
    }

    const inputNorm = inputName.toLowerCase().replace(/\s/g, '');
    const scored = candidates.map(candidate => {
      let score = candidate.confidence;

      const candidateNorm = candidate.name.toLowerCase().replace(/\s/g, '');
      const nameSimilarity = stringSimilarity(inputNorm, candidateNorm);

      if (candidateNorm.includes(inputNorm) || inputNorm.includes(candidateNorm)) {
        score += 0.1;
      }

      score = score * 0.5 + nameSimilarity * 0.5;

      if (inputArea && candidate.area && containsArea(candidate.area, inputArea)) {
        score += this.areaBonus;
      }

      return {
        candidate,
        score: Math.min(1, score),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const topCandidates = scored.map(s => ({
      ...s.candidate,
      confidence: s.score,
    }));

    const best = topCandidates[0];
    const second = topCandidates[1];

    const ambiguous = second && (best.confidence - second.confidence) < this.ambiguityThreshold;

    return {
      matched: best,
      candidates: topCandidates,
      ambiguous,
    };
  }
}
