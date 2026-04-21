import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Title2,
  Caption1,
  Button,
  Badge,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  Link,
  Spinner,
  Title3,
  Body1,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, DocumentBulletListRegular } from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { TestPlan } from '../../types';
import { NewTestPlanWizard } from './NewTestPlanWizard';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
  emptyIcon: {
    fontSize: '48px',
    color: tokens.colorNeutralForeground3,
  },
});

export function TestPlansPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['test-plans'],
    queryFn: api.testPlans.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.testPlans.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-plans'] }),
  });

  const columns: TableColumnDefinition<TestPlan>[] = [
    createTableColumn<TestPlan>({
      columnId: 'name',
      renderHeaderCell: () => 'Plan Name',
      renderCell: (item) => (
        <Link onClick={() => navigate(`/plans/${item.id}`)}>{item.name}</Link>
      ),
    }),
    createTableColumn<TestPlan>({
      columnId: 'appName',
      renderHeaderCell: () => 'App',
      renderCell: (item) => item.appName,
    }),
    createTableColumn<TestPlan>({
      columnId: 'environmentName',
      renderHeaderCell: () => 'Environment',
      renderCell: (item) => item.environmentName,
    }),
    createTableColumn<TestPlan>({
      columnId: 'appType',
      renderHeaderCell: () => 'Type',
      renderCell: (item) => (
        <Badge
          color={item.appType === 'canvas' ? 'informative' : 'success'}
          appearance="filled"
        >
          {item.appType === 'canvas' ? 'Canvas' : 'Model-Driven'}
        </Badge>
      ),
    }),
    createTableColumn<TestPlan>({
      columnId: 'testCount',
      renderHeaderCell: () => 'Tests',
      renderCell: (item) => item.testCases.length,
    }),
    createTableColumn<TestPlan>({
      columnId: 'created',
      renderHeaderCell: () => 'Created',
      renderCell: (item) => new Date(item.createdAt).toLocaleDateString(),
    }),
    createTableColumn<TestPlan>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: (item) => (
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate(item.id);
          }}
        />
      ),
    }),
  ];

  if (isLoading) {
    return <Spinner label="Loading test plans..." />;
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Test Plans</Title2>
        <Caption1>Manage and run your Playwright test plans for Power Platform apps</Caption1>
      </div>

      <div className={styles.toolbar}>
        <Button
          appearance="primary"
          icon={<AddRegular />}
          onClick={() => setWizardOpen(true)}
        >
          New Test Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className={styles.emptyState}>
          <DocumentBulletListRegular className={styles.emptyIcon} />
          <Title3>No test plans yet</Title3>
          <Body1>Create your first test plan to get started</Body1>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setWizardOpen(true)}>
            New Test Plan
          </Button>
        </div>
      ) : (
        <DataGrid items={plans} columns={columns} getRowId={(item) => item.id}>
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<TestPlan>>
            {({ item, rowId }) => (
              <DataGridRow<TestPlan> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}

      <NewTestPlanWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(plan) => {
          queryClient.invalidateQueries({ queryKey: ['test-plans'] });
          setWizardOpen(false);
          navigate(`/plans/${plan.id}`);
        }}
      />
    </div>
  );
}
