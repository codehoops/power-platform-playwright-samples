export interface TestPlan {
  id: string;
  name: string;
  environmentId: string;
  environmentName: string;
  appId: string;
  appName: string;
  appType: 'canvas' | 'model-driven';
  appUrl: string;
  createdAt: string;
  testCases: TestCase[];
}

export interface TestCase {
  id: string;
  name: string;
  steps: RecordedStep[];
  lastRunAt: string | null;
  lastRunStatus: 'passed' | 'failed' | 'never' | null;
  lastRunDurationMs: number | null;
}

export interface RecordedStep {
  id: string;
  type: 'click' | 'fill' | 'select' | 'navigate' | 'assertion';
  selector?: string;
  value?: string;
  url?: string;
  description: string;
  timestamp: string;
}

export interface Environment {
  id: string;
  name: string;
  displayName: string;
  location: string;
}

export interface PowerApp {
  id: string;
  name: string;
  type: 'canvas' | 'model-driven';
  url: string;
}

export interface AuthStatus {
  signedIn: boolean;
  account?: {
    name: string;
    username: string;
  };
}
