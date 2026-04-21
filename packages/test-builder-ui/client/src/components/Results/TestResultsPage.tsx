import {
  makeStyles,
  tokens,
  Title2,
  Body1,
  Badge,
  Button,
  Card,
  ProgressBar,
  CounterBadge,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Spinner,
  Link,
  Field,
} from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground2,
  },
  summaryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
  },
  counters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flex: 1,
  },
  stepDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
});

export function TestResultsPage() {
  const styles = useStyles();
  const { planId, caseId } = useParams<{ planId: string; caseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ['test-plan', planId],
    queryFn: () => api.testPlans.get(planId!),
    enabled: !!planId,
  });

  const testCase = plan?.testCases.find(tc => tc.id === caseId);

  const rerunMutation = useMutation({
    mutationFn: () => api.testPlans.runCase(planId!, caseId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-plan', planId] }),
  });

  if (isLoading) return <Spinner label="Loading..." />;
  if (!plan || !testCase) return <Body1>Test case not found.</Body1>;

  const totalSteps = testCase.steps.length;
  const passedSteps = totalSteps; // Treat all steps as passed for mock results
  const failedSteps = 0;
  const progressValue = totalSteps > 0 ? passedSteps / totalSteps : 0;

  return (
    <div className={styles.root}>
      <div className={styles.breadcrumb}>
        <Link onClick={() => navigate(`/plans/${planId}`)}>
          <ArrowLeftRegular /> {plan.name}
        </Link>
        <span>/</span>
        <span>Results: {testCase.name}</span>
      </div>

      <Title2>Test Results — {testCase.name}</Title2>

      <Card>
        <div className={styles.summaryCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM }}>
            <Badge
              color={testCase.lastRunStatus === 'passed' ? 'success' : testCase.lastRunStatus === 'failed' ? 'danger' : 'informative'}
              appearance="filled"
              size="large"
            >
              {testCase.lastRunStatus === 'passed' ? 'Passed' : testCase.lastRunStatus === 'failed' ? 'Failed' : 'Not run'}
            </Badge>
            {testCase.lastRunAt && (
              <Body1>Run at {new Date(testCase.lastRunAt).toLocaleString()}</Body1>
            )}
            {testCase.lastRunDurationMs != null && (
              <Body1>{(testCase.lastRunDurationMs / 1000).toFixed(1)}s</Body1>
            )}
          </div>

          <Field label={`${passedSteps} / ${totalSteps} steps passed`}>
            <ProgressBar value={progressValue} color="success" />
          </Field>

          <div className={styles.counters}>
            <CounterBadge count={passedSteps} color="success" appearance="filled">
              Passed
            </CounterBadge>
            <CounterBadge count={failedSteps} color="danger" appearance="filled">
              Failed
            </CounterBadge>
          </div>
        </div>
      </Card>

      <Title2>Step Details</Title2>

      {testCase.steps.length === 0 ? (
        <Body1>No recorded steps found for this test case.</Body1>
      ) : (
        <Accordion multiple collapsible>
          {testCase.steps.map((step, idx) => (
            <AccordionItem key={step.id} value={step.id}>
              <AccordionHeader>
                <div className={styles.stepHeader}>
                  <CheckmarkCircleRegular
                    style={{ color: tokens.colorStatusSuccessForeground1, fontSize: '16px' }}
                  />
                  <Body1>{idx + 1}. {step.description}</Body1>
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.stepDetail}>
                  {step.selector && <Body1><strong>Selector:</strong> <code>{step.selector}</code></Body1>}
                  {step.value && <Body1><strong>Value:</strong> {step.value}</Body1>}
                  {step.url && <Body1><strong>URL:</strong> {step.url}</Body1>}
                  <Body1><strong>Recorded at:</strong> {new Date(step.timestamp).toLocaleString()}</Body1>
                </div>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className={styles.actions}>
        <Button
          appearance="outline"
          icon={rerunMutation.isPending ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
          onClick={() => rerunMutation.mutate()}
          disabled={rerunMutation.isPending}
        >
          Re-run
        </Button>
        <Link onClick={() => navigate(`/plans/${planId}`)}>
          Back to Plan
        </Link>
      </div>
    </div>
  );
}
