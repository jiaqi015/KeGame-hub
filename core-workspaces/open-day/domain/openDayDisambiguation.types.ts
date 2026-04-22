export interface DisambiguationCandidate {
  id: string;
  name: string;
  area?: string;
  plate?: string;
  confidence: number;
}

export interface DisambiguationRequest {
  inputName: string;
  inputArea?: string;
  candidates: DisambiguationCandidate[];
}

export interface DisambiguationResult {
  matched: DisambiguationCandidate | null;
  candidates: DisambiguationCandidate[];
  ambiguous: boolean;
  reasoning?: string;
}

export interface OpenDayNameDisambiguator {
  disambiguate(request: DisambiguationRequest): Promise<DisambiguationResult>;
}
