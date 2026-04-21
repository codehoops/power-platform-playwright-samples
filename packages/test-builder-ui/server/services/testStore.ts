import fs from 'fs';
import path from 'path';
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

export interface TestCase {
  id: string;
  name: string;
  steps: RecordedStep[];
  lastRunAt: string | null;
  lastRunStatus: 'passed' | 'failed' | 'never' | null;
  lastRunDurationMs: number | null;
}

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

interface DbData {
  testPlans: TestPlan[];
}

const DATA_DIR = path.join(__dirname, '../../../data');
const DB_FILE = path.join(DATA_DIR, 'test-plans.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDb(): DbData {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    return { testPlans: [] };
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DbData;
  } catch {
    return { testPlans: [] };
  }
}

function writeDb(data: DbData): void {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getAllTestPlans(): TestPlan[] {
  return readDb().testPlans;
}

export function getTestPlan(id: string): TestPlan | undefined {
  return readDb().testPlans.find(plan => plan.id === id);
}

export function createTestPlan(input: Omit<TestPlan, 'id' | 'createdAt' | 'testCases'>): TestPlan {
  const db = readDb();
  const plan: TestPlan = {
    ...input,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    testCases: [],
  };
  db.testPlans.push(plan);
  writeDb(db);
  return plan;
}

export function updateTestPlan(id: string, updates: Partial<Omit<TestPlan, 'id' | 'createdAt'>>): TestPlan | undefined {
  const db = readDb();
  const planIndex = db.testPlans.findIndex(plan => plan.id === id);
  if (planIndex === -1) return undefined;
  db.testPlans[planIndex] = { ...db.testPlans[planIndex], ...updates };
  writeDb(db);
  return db.testPlans[planIndex];
}

export function deleteTestPlan(id: string): boolean {
  const db = readDb();
  const planIndex = db.testPlans.findIndex(plan => plan.id === id);
  if (planIndex === -1) return false;
  db.testPlans.splice(planIndex, 1);
  writeDb(db);
  return true;
}

export function addTestCase(planId: string, input: { name: string }): TestCase | undefined {
  const db = readDb();
  const plan = db.testPlans.find(plan => plan.id === planId);
  if (!plan) return undefined;
  const testCase: TestCase = {
    id: uuidv4(),
    name: input.name,
    steps: [],
    lastRunAt: null,
    lastRunStatus: null,
    lastRunDurationMs: null,
  };
  plan.testCases.push(testCase);
  writeDb(db);
  return testCase;
}

export function updateTestCase(planId: string, caseId: string, updates: Partial<Omit<TestCase, 'id'>>): TestCase | undefined {
  const db = readDb();
  const plan = db.testPlans.find(plan => plan.id === planId);
  if (!plan) return undefined;
  const caseIndex = plan.testCases.findIndex(c => c.id === caseId);
  if (caseIndex === -1) return undefined;
  plan.testCases[caseIndex] = { ...plan.testCases[caseIndex], ...updates };
  writeDb(db);
  return plan.testCases[caseIndex];
}

export function deleteTestCase(planId: string, caseId: string): boolean {
  const db = readDb();
  const plan = db.testPlans.find(plan => plan.id === planId);
  if (!plan) return false;
  const caseIndex = plan.testCases.findIndex(c => c.id === caseId);
  if (caseIndex === -1) return false;
  plan.testCases.splice(caseIndex, 1);
  writeDb(db);
  return true;
}
