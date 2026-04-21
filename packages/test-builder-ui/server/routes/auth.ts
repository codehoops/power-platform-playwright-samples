import { Router, Request, Response } from 'express';
import {
  initiateDeviceCodeAuth,
  pollForToken,
  getStoredAccount,
  signOut,
} from '../services/msalService';

export const authRouter = Router();

authRouter.get('/status', (_req: Request, res: Response): void => {
  const account = getStoredAccount();
  if (account) {
    res.json({
      signedIn: true,
      account: {
        name: account.name || account.username,
        username: account.username,
      },
    });
  } else {
    res.json({ signedIn: false });
  }
});

authRouter.post('/device-code/start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const info = await initiateDeviceCodeAuth();
    res.json(info);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

authRouter.get('/device-code/poll', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pollForToken();
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

authRouter.post('/signout', async (_req: Request, res: Response): Promise<void> => {
  try {
    await signOut();
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
