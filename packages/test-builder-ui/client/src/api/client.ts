import type { TestPlan, TestCase, RecordedStep, Environment, PowerApp, AuthStatus } from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    status: () => request<AuthStatus>('/auth/status'),
    startDeviceCode: () =>
      request<{ userCode: string; verificationUri: string; message: string }>(
        '/auth/device-code/start',
        { method: 'POST' },
      ),
    pollDeviceCode: () =>
      request<{ status: 'pending' | 'complete' | 'error'; account?: AuthStatus['account'] }>(
        '/auth/device-code/poll',
      ),
    signOut: () => request<void>('/auth/signout', { method: 'POST' }),
  },
  environments: {
    list: () => request<Environment[]>('/environments'),
    listApps: (envId: string) => request<PowerApp[]>(`/environments/${envId}/apps`),
  },
  testPlans: {
    list: () => request<TestPlan[]>('/test-plans'),
    get: (id: string) => request<TestPlan>(`/test-plans/${id}`),
    create: (data: Partial<TestPlan>) =>
      request<TestPlan>('/test-plans', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/test-plans/${id}`, { method: 'DELETE' }),
    addCase: (planId: string, data: { name: string }) =>
      request<TestCase>(`/test-plans/${planId}/cases`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteCase: (planId: string, caseId: string) =>
      request<void>(`/test-plans/${planId}/cases/${caseId}`, { method: 'DELETE' }),
    runCase: (planId: string, caseId: string) =>
      request<{ status: 'passed' | 'failed'; durationMs: number; error?: string }>(
        `/test-plans/${planId}/cases/${caseId}/run`,
        { method: 'POST' },
      ),
    runAll: (planId: string) =>
      request<{ results: Array<{ caseId: string; status: 'passed' | 'failed'; durationMs: number }> }>(
        `/test-plans/${planId}/run-all`,
        { method: 'POST' },
      ),
  },
  recording: {
    start: (data: { planId: string; caseId: string; appUrl: string }) =>
      request<{ sessionId: string }>('/recording/start', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    stop: (sessionId: string, planId?: string, caseId?: string) =>
      request<{ steps: RecordedStep[] }>(`/recording/stop/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ planId, caseId }),
      }),
    status: (sessionId: string) =>
      request<{ active: boolean; stepCount: number }>(`/recording/status/${sessionId}`),
  },
};
