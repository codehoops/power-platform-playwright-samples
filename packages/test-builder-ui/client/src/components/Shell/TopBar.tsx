import {
  makeStyles,
  tokens,
  Title3,
  Button,
  Persona,
  Divider,
} from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

const useStyles = makeStyles({
  toolbar: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: `0 ${tokens.spacingHorizontalXL}`,
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: tokens.colorBrandForeground1,
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
});

export function TopBar() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: api.auth.status,
    refetchInterval: 10_000,
  });

  const handleSignOut = async () => {
    await api.auth.signOut();
    await queryClient.invalidateQueries({ queryKey: ['auth-status'] });
  };

  return (
    <div className={styles.toolbar}>
      <Title3 className={styles.title}>Power Platform Test Builder</Title3>
      <div className={styles.rightGroup}>
        {authStatus?.signedIn && authStatus.account && (
          <>
            <Persona
              name={authStatus.account.name}
              secondaryText={authStatus.account.username}
              size="small"
            />
            <Divider vertical style={{ height: '24px' }} />
            <Button appearance="subtle" onClick={handleSignOut}>
              Sign Out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
