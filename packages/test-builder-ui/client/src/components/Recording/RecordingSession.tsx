import { useEffect, useRef, useState } from 'react';
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Body1,
  Caption1,
  Badge,
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  Tag,
  Spinner,
  Link,
} from '@fluentui/react-components';
import { StopRegular, ArrowLeftRegular } from '@fluentui/react-icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { RecordedStep } from '../../types';

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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  recordingBadge: {
    animationName: {
      '0%': { opacity: 1 },
      '50%': { opacity: 0.4 },
      '100%': { opacity: 1 },
    },
    animationDuration: '1.5s',
    animationIterationCount: 'infinite',
  },
  actionFeed: {
    maxHeight: '400px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionDescription: {
    flex: 1,
  },
  timestamp: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  stopButton: {
    backgroundColor: tokens.colorStatusDangerBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorStatusDangerForeground1,
    },
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingVerticalM,
  },
});

function actionTypeColor(type: RecordedStep['type']): 'brand' | 'success' | 'informative' | 'warning' | 'danger' {
  switch (type) {
    case 'navigate': return 'brand';
    case 'click': return 'success';
    case 'fill': return 'informative';
    case 'select': return 'warning';
    case 'assertion': return 'danger';
    default: return 'brand';
  }
}

export function RecordingSession() {
  const styles = useStyles();
  const { planId, caseId } = useParams<{ planId: string; caseId: string }>();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [stopping, setStopping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: plan } = useQuery({
    queryKey: ['test-plan', planId],
    queryFn: () => api.testPlans.get(planId!),
    enabled: !!planId,
  });

  const testCase = plan?.testCases.find(tc => tc.id === caseId);

  const appUrl = plan?.appUrl ?? '';
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!planId || !caseId || !appUrl || hasStarted.current) return;
    hasStarted.current = true;

    api.recording.start({ planId, caseId, appUrl })
      .then(({ sessionId: newSessionId }) => {
        setSessionId(newSessionId);
        const ws = new WebSocket(`ws://localhost:3001/ws/recording?sessionId=${newSessionId}`);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const step = JSON.parse(event.data as string) as RecordedStep;
            setSteps(prev => [...prev, step]);
          } catch {
            // ignore parse errors
          }
        };
        ws.onerror = (err) => console.error('WebSocket error:', err);
      })
      .catch(console.error);

    return () => {
      wsRef.current?.close();
    };
  }, [planId, caseId, appUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const handleStop = async () => {
    if (!sessionId) return;
    setStopping(true);
    wsRef.current?.close();
    try {
      await api.recording.stop(sessionId, planId, caseId);
      navigate(`/plans/${planId}`);
    } finally {
      setStopping(false);
    }
  };

  if (!plan) return <Spinner label="Loading..." />;

  return (
    <div className={styles.root}>
      <div className={styles.breadcrumb}>
        <Link onClick={() => navigate(`/plans/${planId}`)}>
          <ArrowLeftRegular /> {plan.name}
        </Link>
        <span>/</span>
        <span>Recording: {testCase?.name ?? caseId}</span>
      </div>

      <div className={styles.header}>
        <Title2>Recording Session</Title2>
        <Badge
          color="danger"
          appearance="filled"
          className={styles.recordingBadge}
        >
          ● Recording
        </Badge>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Interact with the browser window to record actions. Click "Stop & Save" when done.
        </MessageBarBody>
      </MessageBar>

      <Card>
        <Title3>Recorded Actions ({steps.length})</Title3>
        <div className={styles.actionFeed}>
          {steps.length === 0 ? (
            <Body1>No actions recorded yet. Interact with the app...</Body1>
          ) : (
            steps.map((step) => (
              <div key={step.id} className={styles.actionRow}>
                <Tag
                  appearance="filled"
                  // @ts-expect-error color prop accepts string values not in type
                  color={actionTypeColor(step.type)}
                  size="small"
                >
                  {step.type}
                </Tag>
                <Caption1 className={styles.actionDescription}>{step.description}</Caption1>
                <span className={styles.timestamp}>
                  {new Date(step.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </Card>

      <div className={styles.footer}>
        <Button
          appearance="primary"
          icon={stopping ? <Spinner size="tiny" /> : <StopRegular />}
          className={styles.stopButton}
          onClick={handleStop}
          disabled={stopping || !sessionId}
        >
          Stop & Save
        </Button>
      </div>
    </div>
  );
}
