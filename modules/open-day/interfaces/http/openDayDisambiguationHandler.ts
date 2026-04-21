import type { Request, Response } from 'express';
import type { DisambiguationRequest, DisambiguationCandidate } from '../../domain/openDayDisambiguation.types.js';
import { OpenDayDisambiguationService } from '../../application/openDayDisambiguationService.js';
import { authorizeRequest } from '../../../../lib/activation.js';

const disambiguationService = new OpenDayDisambiguationService();

export async function openDayDisambiguationHandler(req: Request, res: Response) {
  const authorization = authorizeRequest(req, 'open-day');
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const body = req.body as Partial<{
    inputName: string;
    inputArea: string;
    candidates: DisambiguationCandidate[];
    useAI: boolean;
  }>;

  if (!body.inputName || !Array.isArray(body.candidates) || body.candidates.length === 0) {
    res.status(400).json({ error: '缺少必填字段：inputName 和 candidates' });
    return;
  }

  const request: DisambiguationRequest = {
    inputName: body.inputName,
    inputArea: body.inputArea,
    candidates: body.candidates,
  };

  try {
    const result = await disambiguationService.disambiguate(request, body.useAI !== false);
    res.json(result);
  } catch (error) {
    console.error('指代消歧失败:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '指代消歧失败',
    });
  }
}
