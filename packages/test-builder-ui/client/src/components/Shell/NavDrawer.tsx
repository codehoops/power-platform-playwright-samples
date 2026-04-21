import { makeStyles, tokens, Button, Title3, Divider } from '@fluentui/react-components';
import {
  DocumentBulletListRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { useNavigate, useLocation } from 'react-router-dom';

const useStyles = makeStyles({
  drawer: {
    width: '240px',
    minWidth: '240px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalM} 0`,
  },
  logo: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalM,
  },
  logoText: {
    color: tokens.colorBrandForeground1,
  },
  navItem: {
    margin: `0 ${tokens.spacingHorizontalS}`,
    justifyContent: 'flex-start',
    width: 'calc(100% - 16px)',
  },
  navItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  divider: {
    margin: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
});

const navItems = [
  { label: 'Test Plans', icon: <DocumentBulletListRegular />, path: '/plans' },
  { label: 'Settings', icon: <SettingsRegular />, path: '/settings' },
];

export function NavDrawer() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className={styles.drawer}>
      <div className={styles.logo}>
        <Title3 className={styles.logoText}>⚡ Test Builder</Title3>
      </div>
      <div className={styles.divider}>
        <Divider />
      </div>
      {navItems.map((item) => {
        const isActive = location.pathname.startsWith(item.path);
        return (
          <Button
            key={item.path}
            appearance="subtle"
            icon={item.icon}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
