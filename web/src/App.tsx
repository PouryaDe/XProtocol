import { useEffect, useState } from 'react';
import { UiProvider, useUi, type AccentName } from './i18n/context';
import { apiFetch, setCsrfToken } from './lib/api';
import { Layout, type CurrentAccount, type NavKey } from './components/Layout';
import { Ambient, EqLoader } from './components/UiPrimitives';
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
      <>
        <Ambient />
        <div className="flex min-h-screen items-center justify-center">
          <EqLoader />
        </div>
      </>
    );
  }

  if (!account) {
    return (
      <>
        <Ambient />
        <LoginPage
          onSuccess={(acc) => {
            setAccount(acc);
            loadGeneralBranding(acc.isOwner);
          }}
        />
      </>
    );
  }

  const handleLogout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    setAccount(null);
  };

  return (
    <>
      <Ambient />
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
    </>
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
