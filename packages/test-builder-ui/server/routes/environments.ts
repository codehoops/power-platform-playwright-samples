import { Router, Request, Response } from 'express';
import { listEnvironments, listApps } from '../services/powerPlatformService';
import { getAccessToken } from '../services/msalService';

export const environmentsRouter = Router();

environmentsRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = getAccessToken();
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const environments = await listEnvironments(token);
    res.json(environments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

environmentsRouter.get('/:id/apps', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getAccessToken();
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const apps = await listApps(token, req.params.id);
    res.json(apps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
