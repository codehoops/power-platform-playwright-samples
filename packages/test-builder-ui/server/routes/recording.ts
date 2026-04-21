import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { startRecording, stopRecording, getRecordingStatus } from '../services/recordingService';
import { updateTestCase } from '../services/testStore';
import { broadcastAction } from '../ws/recordingSocket';

export const recordingRouter = Router();

recordingRouter.post('/start', (req: Request, res: Response): void => {
  try {
    const { planId, caseId, appUrl } = req.body as { planId: string; caseId: string; appUrl: string };
    if (!planId || !caseId || !appUrl) {
      res.status(400).json({ error: 'planId, caseId, and appUrl are required' });
      return;
    }
    const sessionId = uuidv4();
    startRecording(sessionId, appUrl, (step) => {
      broadcastAction(sessionId, step);
    });
    res.json({ sessionId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

recordingRouter.post('/stop/:sessionId', (req: Request, res: Response): void => {
  try {
    const { sessionId } = req.params;
    const steps = stopRecording(sessionId);
    // Optionally persist steps to test case if planId/caseId provided
    const { planId, caseId } = req.body as { planId?: string; caseId?: string };
    if (planId && caseId) {
      updateTestCase(planId, caseId, { steps });
    }
    res.json({ steps });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

recordingRouter.get('/status/:sessionId', (req: Request, res: Response): void => {
  const status = getRecordingStatus(req.params.sessionId);
  res.json(status);
});
