import { Router, Request, Response } from 'express';
import {
  getAllTestPlans,
  getTestPlan,
  createTestPlan,
  updateTestPlan,
  deleteTestPlan,
  addTestCase,
  updateTestCase,
  deleteTestCase,
} from '../services/testStore';

export const testPlansRouter = Router();

testPlansRouter.get('/', (_req: Request, res: Response): void => {
  res.json(getAllTestPlans());
});

testPlansRouter.post('/', (req: Request, res: Response): void => {
  try {
    const plan = createTestPlan(req.body);
    res.status(201).json(plan);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

testPlansRouter.get('/:id', (req: Request, res: Response): void => {
  const plan = getTestPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  res.json(plan);
});

testPlansRouter.put('/:id', (req: Request, res: Response): void => {
  const plan = updateTestPlan(req.params.id, req.body);
  if (!plan) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  res.json(plan);
});

testPlansRouter.delete('/:id', (req: Request, res: Response): void => {
  const deleted = deleteTestPlan(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  res.status(204).send();
});

testPlansRouter.post('/:id/cases', (req: Request, res: Response): void => {
  const testCase = addTestCase(req.params.id, req.body);
  if (!testCase) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  res.status(201).json(testCase);
});

testPlansRouter.delete('/:id/cases/:caseId', (req: Request, res: Response): void => {
  const deleted = deleteTestCase(req.params.id, req.params.caseId);
  if (!deleted) {
    res.status(404).json({ error: 'Test case not found' });
    return;
  }
  res.status(204).send();
});

testPlansRouter.post('/:id/cases/:caseId/run', async (req: Request, res: Response): Promise<void> => {
  const plan = getTestPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  const testCase = plan.testCases.find(c => c.id === req.params.caseId);
  if (!testCase) {
    res.status(404).json({ error: 'Test case not found' });
    return;
  }
  // Stub: simulate running
  const durationMs = Math.floor(Math.random() * 3000) + 500;
  const status: 'passed' | 'failed' = Math.random() > 0.2 ? 'passed' : 'failed';
  await new Promise(r => setTimeout(r, 500)); // simulate delay
  updateTestCase(req.params.id, req.params.caseId, {
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status,
    lastRunDurationMs: durationMs,
  });
  res.json({ status, durationMs });
});

testPlansRouter.post('/:id/run-all', async (req: Request, res: Response): Promise<void> => {
  const plan = getTestPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Test plan not found' });
    return;
  }
  const results = plan.testCases.map(c => {
    const durationMs = Math.floor(Math.random() * 3000) + 500;
    const status: 'passed' | 'failed' = Math.random() > 0.2 ? 'passed' : 'failed';
    updateTestCase(req.params.id, c.id, {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: status,
      lastRunDurationMs: durationMs,
    });
    return { caseId: c.id, status, durationMs };
  });
  res.json({ results });
});
