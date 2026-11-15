import { useEffect, useState } from 'react';
import { UiProvider, useUi, type AccentName } from './i18n/context';
import { apiFetch, setCsrfToken } from './lib/api';
import { Layout, type CurrentAccount, type NavKey } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ClientsPage } from './pages/ClientsPage';
import { GroupsPage } from './pages/GroupsPage';
import { InboundsPage } from './pages/InboundsPage';
import { NodesPage } from './pages/NodesPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { RoutingPage } from './pages/RoutingPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { AccountsPage } from './pages/AccountsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';

function PanelRoot() {
  const { setAccent, setBrandName, setSupportTelegram } = useUi();
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [checking, setChecking] = useState(true);
  const [nav, setNav] = useState<NavKey>('overview');
  const [newClientSignal, setNewClientSignal] = useState(0);

  // Detect public subscription route: /sub/:token
  const subMatch = window.location.pathname.match(/\/sub\/([^/]+)\/?$/);
  if (subMatch) {
    return <SubscriptionPage token={subMatch[1]} />;
  }

  const loadGeneralBranding = (isOwner: boolean) => {
    if (!isOwner) return;
    apiFetch<{ general: { brandName: string; panelColor: AccentName; supportTelegram?: string } }>('/settings/general')
      .then((g) => {
        if (g.general.brandName) setBrandName(g.general.brandName);
        if (g.general.panelColor) setAccent(g.general.panelColor);
        if (typeof g.general.supportTelegram === 'string') setSupportTelegram(g.general.supportTelegram);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const root = document.documentElement;
      root.style.setProperty('--cx', `${e.clientX}px`);
      root.style.setProperty('--cy', `${e.clientY}px`);
      const card = (e.target as HTMLElement | null)?.closest('.ovira-card') as HTMLElement | null;
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        card.style.setProperty('--my', `${e.clientY - rect.top}px`);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    apiFetch<{ csrfToken: string | null; account: CurrentAccount }>('/auth/me')
      .then((res) => {
        setCsrfToken(res.csrfToken);
        setAccount(res.account);
        loadGeneralBranding(res.account.isOwner);
      })
      .catch(() => setAccount(null))
      .finally(() => setChecking(false));
  }, [setAccent, setBrandName, setSupportTelegram]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] text-sm text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }

  if (!account) {
    return (
      <LoginPage
        onSuccess={(acc) => {
          setAccount(acc);
          loadGeneralBranding(acc.isOwner);
        }}
      />
    );
  }

  const handleLogout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    setAccount(null);
  };

  return (
    <Layout active={nav} onNavigate={setNav} account={account} onLogout={handleLogout}>
      {nav === 'overview' && (
        <OverviewPage
          onNavigate={setNav}
          onOpenNewClient={() => {
            setNav('clients');
            setNewClientSignal((n) => n + 1);
          }}
        />
      )}
      {nav === 'clients' && <ClientsPage openCreateTrigger={newClientSignal} />}
      {nav === 'groups' && <GroupsPage />}
      {nav === 'inbounds' && <InboundsPage />}
      {nav === 'nodes' && <NodesPage />}
      {nav === 'connections' && <ConnectionsPage />}
      {nav === 'routing' && <RoutingPage />}
      {nav === 'certificates' && <CertificatesPage />}
      {nav === 'accounts' && <AccountsPage />}
      {nav === 'settings' && <SettingsPage account={account} />}
    </Layout>
  );
}

export function App() {
  return (
    <UiProvider>
      <PanelRoot />
    </UiProvider>
  );
}

export default App;
