import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Dropdown,
  Option,
  RadioGroup,
  Radio,
  Spinner,
  Tag,
  Link,
  Badge,
  Body1,
  Caption1,
  Title3,
} from '@fluentui/react-components';
import { CheckmarkCircleRegular, CopyRegular } from '@fluentui/react-icons';
import { api } from '../../api/client';
import type { Environment, PowerApp, TestPlan } from '../../types';

const useStyles = makeStyles({
  stepIndicator: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    alignItems: 'center',
  },
  stepCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    flexShrink: 0,
  },
  stepCircleActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCircleCompleted: {
    backgroundColor: tokens.colorStatusSuccessBackground3,
    color: tokens.colorStatusSuccessForeground1,
  },
  stepLine: {
    flex: 1,
    height: '1px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
  content: {
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  deviceCodeCard: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    alignItems: 'flex-start',
  },
  userCode: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightBold,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
  },
  msSignInButton: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    border: `1px solid #8C8C8C`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  radioItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
  },
});

const STEP_LABELS = ['Sign In', 'Environment', 'App', 'Name Plan'];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (plan: TestPlan) => void;
}

export function NewTestPlanWizard({ open, onClose, onCreated }: Props) {
  const styles = useStyles();
  const [step, setStep] = useState(0);
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<{
    userCode: string;
    verificationUri: string;
    message: string;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [apps, setApps] = useState<PowerApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [selectedApp, setSelectedApp] = useState<PowerApp | null>(null);
  const [planName, setPlanName] = useState('');
  const [creating, setCreating] = useState(false);

  const resetState = useCallback(() => {
    setStep(0);
    setDeviceCodeInfo(null);
    setPolling(false);
    setEnvironments([]);
    setSelectedEnv(null);
    setApps([]);
    setSelectedApp(null);
    setPlanName('');
    setCreating(false);
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  // Poll for device code completion
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.auth.pollDeviceCode();
        if (result.status === 'complete') {
          setPolling(false);
          clearInterval(interval);
          // Load environments
          setLoadingEnvs(true);
          try {
            const envs = await api.environments.list();
            setEnvironments(envs);
          } finally {
            setLoadingEnvs(false);
          }
          setStep(1);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const handleStartDeviceCode = async () => {
    try {
      const info = await api.auth.startDeviceCode();
      setDeviceCodeInfo(info);
      setPolling(true);
    } catch (err) {
      console.error('Failed to start device code:', err);
    }
  };

  const handleEnvSelect = async (envId: string) => {
    const env = environments.find(e => e.id === envId);
    if (!env) return;
    setSelectedEnv(env);
    setLoadingApps(true);
    try {
      const appList = await api.environments.listApps(envId);
      setApps(appList);
    } finally {
      setLoadingApps(false);
    }
    setStep(2);
  };

  const handleAppSelect = (appId: string) => {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    setSelectedApp(app);
    setPlanName(app.name);
    setStep(3);
  };

  const handleCreate = async () => {
    if (!selectedEnv || !selectedApp || !planName) return;
    setCreating(true);
    try {
      const plan = await api.testPlans.create({
        name: planName,
        environmentId: selectedEnv.id,
        environmentName: selectedEnv.displayName,
        appId: selectedApp.id,
        appName: selectedApp.name,
        appType: selectedApp.type,
        appUrl: selectedApp.url,
      });
      onCreated(plan);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = () => {
    if (deviceCodeInfo?.userCode) {
      navigator.clipboard.writeText(deviceCodeInfo.userCode).catch(() => {});
    }
  };

  const completedSteps = step;

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ minWidth: '520px' }}>
        <DialogTitle>New Test Plan</DialogTitle>
        <DialogContent>
          {/* Step indicator */}
          <div className={styles.stepIndicator}>
            {STEP_LABELS.map((label, i) => (
              <>
                <div
                  key={`circle-${i}`}
                  className={`${styles.stepCircle} ${
                    i === step
                      ? styles.stepCircleActive
                      : i < completedSteps
                      ? styles.stepCircleCompleted
                      : ''
                  }`}
                >
                  {i < completedSteps ? <CheckmarkCircleRegular /> : i + 1}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div key={`line-${i}`} className={styles.stepLine} />
                )}
              </>
            ))}
          </div>

          <div className={styles.content}>
            {/* Step 0: Sign In */}
            {step === 0 && (
              <>
                <Title3>Sign in with Microsoft</Title3>
                <Body1>Sign in to access your Power Platform environments and apps.</Body1>
                {!deviceCodeInfo ? (
                  <button className={styles.msSignInButton} onClick={handleStartDeviceCode}>
                    <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                      <rect x="1" y="1" width="9" height="9" fill="#F35325" />
                      <rect x="11" y="1" width="9" height="9" fill="#81BC06" />
                      <rect x="1" y="11" width="9" height="9" fill="#05A6F0" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFBA08" />
                    </svg>
                    Sign in with Microsoft
                  </button>
                ) : (
                  <div className={styles.deviceCodeCard}>
                    <Body1>Go to <Link href={deviceCodeInfo.verificationUri} target="_blank">{deviceCodeInfo.verificationUri}</Link> and enter this code:</Body1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                      <Tag appearance="filled" size="large" className={styles.userCode}>
                        {deviceCodeInfo.userCode}
                      </Tag>
                      <Button appearance="subtle" icon={<CopyRegular />} onClick={handleCopyCode} aria-label="Copy code" />
                    </div>
                    {polling && <Spinner size="tiny" label="Waiting for sign-in..." />}
                  </div>
                )}
              </>
            )}

            {/* Step 1: Select Environment */}
            {step === 1 && (
              <>
                <Title3>Select Environment</Title3>
                {loadingEnvs ? (
                  <Spinner label="Loading environments..." />
                ) : (
                  <Field label="Power Platform Environment">
                    <Dropdown
                      placeholder="Select an environment"
                      onOptionSelect={(_, d) => {
                        if (d.optionValue) handleEnvSelect(d.optionValue);
                      }}
                    >
                      {environments.map(env => (
                        <Option key={env.id} value={env.id}>{env.displayName}</Option>
                      ))}
                    </Dropdown>
                  </Field>
                )}
              </>
            )}

            {/* Step 2: Select App */}
            {step === 2 && (
              <>
                <Title3>Select App</Title3>
                <Caption1>Environment: {selectedEnv?.displayName}</Caption1>
                {loadingApps ? (
                  <Spinner label="Loading apps..." />
                ) : apps.length === 0 ? (
                  <Body1>No apps found in this environment.</Body1>
                ) : (
                  <Field label="App">
                    <RadioGroup onValueChange={(_, d) => handleAppSelect(d.value)}>
                      {apps.map(app => (
                        <Radio
                          key={app.id}
                          value={app.id}
                          label={
                            <span className={styles.radioItem}>
                              {app.name}
                              <Badge
                                color={app.type === 'canvas' ? 'informative' : 'success'}
                                appearance="filled"
                                size="small"
                              >
                                {app.type === 'canvas' ? 'Canvas' : 'Model-Driven'}
                              </Badge>
                            </span>
                          }
                        />
                      ))}
                    </RadioGroup>
                  </Field>
                )}
              </>
            )}

            {/* Step 3: Name Plan */}
            {step === 3 && (
              <>
                <Title3>Name Your Test Plan</Title3>
                <Caption1>App: {selectedApp?.name} · {selectedEnv?.displayName}</Caption1>
                <Field label="Test Plan Name" required>
                  <Input
                    value={planName}
                    onChange={(_, d) => setPlanName(d.value)}
                    placeholder="Enter a name for this test plan"
                  />
                </Field>
              </>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <div className={styles.actions}>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            {step === 3 && (
              <Button
                appearance="primary"
                onClick={handleCreate}
                disabled={!planName || creating}
                icon={creating ? <Spinner size="tiny" /> : undefined}
              >
                Create Test Plan
              </Button>
            )}
            {step > 0 && step < 3 && (
              <Button appearance="secondary" onClick={() => setStep(s => s - 1)}>Back</Button>
            )}
          </div>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
