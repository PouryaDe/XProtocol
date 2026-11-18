import { useEffect, useState } from 'react';
import { UiProvider, useUi, type AccentName } from './i18n/context';
import { apiFetch, registerMfaConfirmHandler, setCsrfToken } from './lib/api';
import { Layout, NAV_PATHS, type CurrentAccount, type NavKey } from './components/Layout';
import { Ambient, EqLoader } from './components/UiPrimitives';
import { MfaConfirmModal } from './components/MfaConfirmModal';
import { useLocationState } from './lib/router';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { GroupsPage } from './pages/GroupsPage';
import { InboundsPage } from './pages/InboundsPage';
import { InboundDetailPage } from './pages/InboundDetailPage';
import { NodesPage } from './pages/NodesPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { RoutingPage } from './pages/RoutingPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { AccountsPage } from './pages/AccountsPage';
import { UpdatesPage } from './pages/UpdatesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';

function resolveRoute(pathname: string): {
  nav: NavKey;
  clientId?: number;
  inboundId?: number | 'new';
  routingTab?: 'rules' | 'outbounds';
  unknown?: boolean;
} {
  const clean = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  if (clean === '/' || clean === '') return { nav: 'overview' };
  if (clean === '/clients') return { nav: 'clients' };
  const clientMatch = clean.match(/^\/clients\/(\d+)$/);
  if (clientMatch) return { nav: 'clients', clientId: Number(clientMatch[1]) };
  if (clean === '/connections') return { nav: 'connections' };
  if (clean === '/inbounds' || clean === '/servers') return { nav: 'inbounds' };
  if (clean === '/inbounds/new' || clean === '/servers/new') return { nav: 'inbounds', inboundId: 'new' };
  const inboundMatch = clean.match(/^\/(?:inbounds|servers)\/(\d+)$/);
  if (inboundMatch) return { nav: 'inbounds', inboundId: Number(inboundMatch[1]) };
  if (clean === '/nodes') return { nav: 'nodes' };
  if (clean === '/certificates') return { nav: 'certificates' };
  if (clean === '/routing') return { nav: 'routing', routingTab: 'rules' };
  if (clean === '/routing/outbounds') return { nav: 'routing', routingTab: 'outbounds' };
  if (clean === '/templates') return { nav: 'templates' };
  if (clean === '/groups') return { nav: 'groups' };
  if (clean === '/accounts' || clean === '/admins') return { nav: 'accounts' };
  if (clean === '/updates') return { nav: 'updates' };
  if (clean === '/settings') return { nav: 'settings' };
  return { nav: 'overview', unknown: true };
}

function PanelRoot() {
  const { setAccent, setBrandName, setSupportTelegram } = useUi();
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [checking, setChecking] = useState(true);
  const { pathname, navigate } = useLocationState();
  const [newClientSignal, setNewClientSignal] = useState(0);
  const [mfaPromptOpen, setMfaPromptOpen] = useState(false);
  const [mfaResolve, setMfaResolve] = useState<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerMfaConfirmHandler(
      () =>
        new Promise<boolean>((resolve) => {
          setMfaPromptOpen(true);
          setMfaResolve(() => resolve);
        }),
    );
  }, []);

  const route = resolveRoute(pathname);
  const nav = route.nav;

  const setNav = (k: NavKey) => {
    navigate(NAV_PATHS[k]);
  };

  // Detect public subscription route: /<subPath>/:token
  const rawSubPath = ((window as unknown as { __XP_SUB_PATH__?: string }).__XP_SUB_PATH__ || 'sub').replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const subMatch = window.location.pathname.match(new RegExp(`/(?:${rawSubPath}|sub)/([^/]+)/?$`));

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
    if (subMatch) return;
    apiFetch<{ csrfToken: string | null; account: CurrentAccount }>('/auth/me')
      .then((res) => {
        setCsrfToken(res.csrfToken);
        setAccount(res.account);
        loadGeneralBranding(res.account.isOwner);
      })
      .catch(() => setAccount(null))
      .finally(() => setChecking(false));
  }, [Boolean(subMatch)]);

  useEffect(() => {
    if (!checking && account && !subMatch && route.unknown) {
      navigate('/', { replace: true });
    }
  }, [checking, Boolean(account), Boolean(subMatch), route.unknown, navigate]);

  if (subMatch) {
    return (
      <>
        <Ambient />
        <SubscriptionPage token={subMatch[1]} />
      </>
    );
  }

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
              setNewClientSignal((n) => n + 1);
              navigate('/clients?new=1');
            }}
          />
        )}
        {nav === 'clients' && route.clientId !== undefined && <ClientDetailPage clientId={route.clientId} />}
        {nav === 'clients' && route.clientId === undefined && <ClientsPage openCreateTrigger={newClientSignal} />}
        {nav === 'templates' && <TemplatesPage isOwner={account.isOwner} />}
        {nav === 'groups' && <GroupsPage />}
        {nav === 'inbounds' && route.inboundId !== undefined && <InboundDetailPage inboundId={route.inboundId} />}
        {nav === 'inbounds' && route.inboundId === undefined && <InboundsPage />}
        {nav === 'nodes' && <NodesPage />}
        {nav === 'connections' && <ConnectionsPage />}
        {nav === 'routing' && <RoutingPage />}
        {nav === 'certificates' && <CertificatesPage />}
        {nav === 'accounts' && <AccountsPage />}
        {nav === 'updates' && <UpdatesPage />}
        {nav === 'settings' && <SettingsPage account={account} />}
      </Layout>
      <MfaConfirmModal
        open={mfaPromptOpen}
        onConfirmed={() => {
          setMfaPromptOpen(false);
          mfaResolve?.(true);
          setMfaResolve(null);
        }}
        onCancel={() => {
          setMfaPromptOpen(false);
          mfaResolve?.(false);
          setMfaResolve(null);
        }}
      />
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
