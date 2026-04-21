import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/Shell/AppShell';
import { TestPlansPage } from './components/TestPlans/TestPlansPage';
import { TestPlanDetailPage } from './components/TestPlanDetail/TestPlanDetailPage';
import { RecordingSession } from './components/Recording/RecordingSession';
import { TestResultsPage } from './components/Results/TestResultsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/plans" replace />} />
        <Route path="/plans" element={<TestPlansPage />} />
        <Route path="/plans/:planId" element={<TestPlanDetailPage />} />
        <Route path="/plans/:planId/cases/:caseId/record" element={<RecordingSession />} />
        <Route path="/plans/:planId/cases/:caseId/results" element={<TestResultsPage />} />
      </Route>
    </Routes>
  );
}
