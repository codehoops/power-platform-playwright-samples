import { v4 as uuidv4 } from 'uuid';

export interface RecordedStep {
  id: string;
  type: 'click' | 'fill' | 'select' | 'navigate' | 'assertion';
  selector?: string;
  value?: string;
  url?: string;
  description: string;
  timestamp: string;
}

interface RecordingSession {
  interval: ReturnType<typeof setInterval>;
  steps: RecordedStep[];
  appUrl: string;
}

const activeSessions = new Map<string, RecordingSession>();

export function startRecording(
  sessionId: string,
  appUrl: string,
  onAction: (step: RecordedStep) => void,
): void {
  const mockActions: Omit<RecordedStep, 'id' | 'timestamp'>[] = [
    { type: 'navigate', url: appUrl, description: `Navigate to ${appUrl}` },
    { type: 'click', selector: '[data-control-name="Gallery1"]', description: 'Click Gallery1' },
    { type: 'fill', selector: 'input[placeholder="Search"]', value: 'Northwind', description: 'Fill Search with "Northwind"' },
    { type: 'click', selector: '[data-control-name="NextArrow1"]', description: 'Click Next arrow' },
    { type: 'assertion', selector: '[data-control-name="Label1"]', description: 'Assert Label1 is visible' },
  ];

  let currentIndex = 0;
  const steps: RecordedStep[] = [];

  const interval = setInterval(() => {
    if (currentIndex >= mockActions.length) {
      clearInterval(interval);
      return;
    }
    const step: RecordedStep = {
      id: uuidv4(),
      ...mockActions[currentIndex],
      timestamp: new Date().toISOString(),
    };
    steps.push(step);
    onAction(step);
    currentIndex++;
  }, 1500);

  activeSessions.set(sessionId, { interval, steps, appUrl });
}

export function stopRecording(sessionId: string): RecordedStep[] {
  const session = activeSessions.get(sessionId);
  if (!session) return [];
  clearInterval(session.interval);
  const steps = [...session.steps];
  activeSessions.delete(sessionId);
  return steps;
}

export function getRecordingStatus(sessionId: string): { active: boolean; stepCount: number } {
  const session = activeSessions.get(sessionId);
  if (!session) return { active: false, stepCount: 0 };
  return { active: true, stepCount: session.steps.length };
}
