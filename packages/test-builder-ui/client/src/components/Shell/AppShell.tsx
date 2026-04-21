import { makeStyles, tokens } from '@fluentui/react-components';
import { Outlet } from 'react-router-dom';
import { NavDrawer } from './NavDrawer';
import { TopBar } from './TopBar';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
  },
});

export function AppShell() {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <TopBar />
      <div className={styles.body}>
        <NavDrawer />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
