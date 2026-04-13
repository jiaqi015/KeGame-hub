import type {
  DisambiguationCandidate,
  DisambiguationRequest,
  DisambiguationResult,
  OpenDayNameDisambiguator,
} from '../domain/openDayDisambiguation.types.js';
import { RulesOpenDayNameDisambiguator } from '../infrastructure/rulesOpenDayNameDisambiguator.js';
import { AIOpenDayNameDisambiguator } from '../infrastructure/aiOpenDayNameDisambiguator.js';

export class OpenDayDisambiguationService {
  private readonly rulesDisambiguator: OpenDayNameDisambiguator;
  private readonly aiDisambiguator: OpenDayNameDisambiguator;

  constructor() {
    this.rulesDisambiguator = new RulesOpenDayNameDisambiguator();
    this.aiDisambiguator = new AIOpenDayNameDisambiguator();
  }

  async disambiguate(request: DisambiguationRequest, useAI = true): Promise<DisambiguationResult> {
    const rulesResult = await this.rulesDisambiguator.disambiguate(request);

    if (!useAI || !rulesResult.ambiguous) {
      return rulesResult;
    }

    return this.aiDisambiguator.disambiguate({
      ...request,
      candidates: rulesResult.candidates,
    });
  }

  static candidate(
    id: string,
    name: string,
    area?: string,
    plate?: string,
    baseConfidence = 0.5,
  ): DisambiguationCandidate {
    return {
      id,
      name,
      area,
      plate,
      confidence: baseConfidence,
    };
  }
}
