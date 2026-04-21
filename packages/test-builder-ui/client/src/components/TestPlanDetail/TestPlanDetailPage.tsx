import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Body1,
  Badge,
  Button,
  Card,
  CardHeader,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  Input,
  Spinner,
  Link,
  Toolbar,
  ToolbarButton,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  RecordRegular,
  ChartMultipleRegular,
  PlayRegular,
  ArrowLeftRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { TestCase } from '../../types';

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
  headerCard: {
    padding: tokens.spacingVerticalM,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    minWidth: '60px',
  },
});

function StatusBadge({ status }: { status: TestCase['lastRunStatus'] }) {
  if (!status || status === 'never') return <Badge appearance="outline">Never run</Badge>;
  if (status === 'passed') return <Badge color="success" appearance="filled">Passed</Badge>;
  return <Badge color="danger" appearance="filled">Failed</Badge>;
}

export function TestPlanDetailPage() {
  const styles = useStyles();
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newCaseName, setNewCaseName] = useState('');
  const [addCaseOpen, setAddCaseOpen] = useState(false);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['test-plan', planId],
    queryFn: () => api.testPlans.get(planId!),
    enabled: !!planId,
  });

  const addCaseMutation = useMutation({
    mutationFn: (name: string) => api.testPlans.addCase(planId!, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-plan', planId] });
      setAddCaseOpen(false);
      setNewCaseName('');
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (caseId: string) => api.testPlans.deleteCase(planId!, caseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-plan', planId] }),
  });

  const runAllMutation = useMutation({
    mutationFn: () => api.testPlans.runAll(planId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-plan', planId] }),
  });

  const columns: TableColumnDefinition<TestCase>[] = [
    createTableColumn<TestCase>({
      columnId: 'name',
      renderHeaderCell: () => 'Test Case',
      renderCell: (item) => item.name,
    }),
    createTableColumn<TestCase>({
      columnId: 'steps',
      renderHeaderCell: () => 'Steps',
      renderCell: (item) => item.steps.length,
    }),
    createTableColumn<TestCase>({
      columnId: 'status',
      renderHeaderCell: () => 'Last Status',
      renderCell: (item) => <StatusBadge status={item.lastRunStatus} />,
    }),
    createTableColumn<TestCase>({
      columnId: 'duration',
      renderHeaderCell: () => 'Duration',
      renderCell: (item) =>
        item.lastRunDurationMs != null ? `${(item.lastRunDurationMs / 1000).toFixed(1)}s` : '—',
    }),
    createTableColumn<TestCase>({
      columnId: 'lastRun',
      renderHeaderCell: () => 'Last Run',
      renderCell: (item) =>
        item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : '—',
    }),
    createTableColumn<TestCase>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: (item) => (
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS }}>
          <Button
            appearance="subtle"
            icon={<RecordRegular />}
            size="small"
            onClick={() => navigate(`/plans/${planId}/cases/${item.id}/record`)}
            title="Record"
          />
          {item.lastRunAt && (
            <Button
              appearance="subtle"
              icon={<ChartMultipleRegular />}
              size="small"
              onClick={() => navigate(`/plans/${planId}/cases/${item.id}/results`)}
              title="Results"
            />
          )}
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            size="small"
            onClick={() => deleteCaseMutation.mutate(item.id)}
            title="Delete"
          />
        </div>
      ),
    }),
  ];

  if (isLoading) return <Spinner label="Loading..." />;
  if (!plan) return <Body1>Test plan not found.</Body1>;

  return (
    <div className={styles.root}>
      <div className={styles.breadcrumb}>
        <Link onClick={() => navigate('/plans')}>
          <ArrowLeftRegular /> Test Plans
        </Link>
        <span>/</span>
        <span>{plan.name}</span>
      </div>

      <Card className={styles.headerCard}>
        <CardHeader
          header={<Title2>{plan.name}</Title2>}
          description={
            <div className={styles.headerRow}>
              <Body1>{plan.appName}</Body1>
              <Badge color="brand" appearance="outline">{plan.environmentName}</Badge>
              <Badge
                color={plan.appType === 'canvas' ? 'informative' : 'success'}
                appearance="filled"
              >
                {plan.appType === 'canvas' ? 'Canvas' : 'Model-Driven'}
              </Badge>
              {plan.appUrl && (
                <Link href={plan.appUrl} target="_blank">Open App</Link>
              )}
            </div>
          }
        />
      </Card>

      <div className={styles.toolbar}>
        <Title3>Test Cases ({plan.testCases.length})</Title3>
        <Toolbar>
          <ToolbarButton
            icon={<PlayRegular />}
            onClick={() => runAllMutation.mutate()}
            disabled={runAllMutation.isPending || plan.testCases.length === 0}
          >
            {runAllMutation.isPending ? 'Running...' : 'Run All'}
          </ToolbarButton>
          <ToolbarButton
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => setAddCaseOpen(true)}
          >
            New Test Case
          </ToolbarButton>
        </Toolbar>
      </div>

      {plan.testCases.length === 0 ? (
        <Body1>No test cases yet. Click "New Test Case" to add one.</Body1>
      ) : (
        <DataGrid items={plan.testCases} columns={columns} getRowId={(item) => item.id}>
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<TestCase>>
            {({ item, rowId }) => (
              <DataGridRow<TestCase> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}

      <Dialog open={addCaseOpen} onOpenChange={(_, d) => { if (!d.open) setAddCaseOpen(false); }}>
        <DialogSurface>
          <DialogTitle>New Test Case</DialogTitle>
          <DialogContent>
            <Field label="Test Case Name" required>
              <Input
                value={newCaseName}
                onChange={(_, d) => setNewCaseName(d.value)}
                placeholder="e.g. Create new order"
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => setAddCaseOpen(false)}>Cancel</Button>
            <Button
              appearance="primary"
              disabled={!newCaseName || addCaseMutation.isPending}
              onClick={() => addCaseMutation.mutate(newCaseName)}
            >
              Create
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
