import React, { useRef, useState } from 'react';
import {
  Activity,
  ExternalLink,
  FolderKanban,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  Radio,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useUi, type ThemeMode } from '../i18n/context';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { BrandMark, useSlidingIndicator } from './UiPrimitives';

export type NavKey =
  | 'overview'
  | 'clients'
  | 'groups'
  | 'inbounds'
  | 'nodes'
  | 'connections'
  | 'routing'
  | 'certificates'
  | 'accounts'
  | 'settings';

export interface CurrentAccount {
  id: number;
  username: string;
  roleName: string;
  isOwner: boolean;
  status: string;
  permissions: {
    clients: { view: string; create: string; edit: string; delete: string; resetTraffic: string; disconnect: string };
    connections: { view: string; disconnect: string };
    groups: { view: string; manage: string };
    inbounds: { view: string; manage: string };
    nodes: { view: string; manage: string };
  };
  trafficPoolBytes: number | null;
  trafficUsedBytes: number;
  expiresAt: string | null;
}

interface LayoutProps {
  active: NavKey;
  onNavigate: (k: NavKey) => void;
  account: CurrentAccount;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ active, onNavigate, account, onLogout, children }: LayoutProps) {
  const { t, lang, setLang, theme, resolvedTheme, setTheme, brandName, supportTelegram } = useUi();
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopNavRef = useRef<HTMLElement | null>(null);
  useSlidingIndicator(desktopNavRef, '.xp-nav-active', active);

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeLabel =
    theme === 'system'
      ? lang === 'fa'
        ? 'سیستم'
        : 'System'
      : theme === 'dark'
        ? lang === 'fa'
          ? 'تیره'
          : 'Dark'
        : lang === 'fa'
          ? 'روشن'
          : 'Light';

  const themeIcon =
    theme === 'system' ? (
      <Monitor className="h-3.5 w-3.5" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="h-3.5 w-3.5" />
    ) : (
      <Sun className="h-3.5 w-3.5" />
    );

  const supportHref = supportTelegram
    ? supportTelegram.startsWith('http')
      ? supportTelegram
      : `https://t.me/${supportTelegram.replace(/^@/, '')}`
    : '';

  const items: { key: NavKey; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: 'overview', label: t.nav.overview, icon: <LayoutDashboard className="h-4 w-4" />, visible: true },
    {
      key: 'clients',
      label: t.nav.clients,
      icon: <Users className="h-4 w-4" />,
      visible: account.isOwner || account.permissions.clients.view !== 'none',
    },
    {
      key: 'inbounds',
      label: t.nav.inbounds,
      icon: <Radio className="h-4 w-4" />,
      visible: account.isOwner || account.permissions.inbounds.view !== 'none',
    },
    {
      key: 'nodes',
      label: t.nav.nodes,
      icon: <Server className="h-4 w-4" />,
      visible: account.isOwner || account.permissions.nodes.view !== 'none',
    },
    {
      key: 'connections',
      label: t.nav.connections,
      icon: <Activity className="h-4 w-4" />,
      visible: account.isOwner || account.permissions.connections.view !== 'none',
    },
    { key: 'certificates', label: t.nav.certificates, icon: <ShieldCheck className="h-4 w-4" />, visible: account.isOwner },
    { key: 'routing', label: t.nav.routing, icon: <Network className="h-4 w-4" />, visible: account.isOwner },
    {
      key: 'groups',
      label: t.nav.groups,
      icon: <FolderKanban className="h-4 w-4" />,
      visible: account.isOwner || account.permissions.groups.view !== 'none',
    },
    { key: 'accounts', label: t.nav.accounts, icon: <KeyRound className="h-4 w-4" />, visible: account.isOwner },
    { key: 'settings', label: t.nav.settings, icon: <Settings className="h-4 w-4" />, visible: true },
  ];

  const quotaPct =
    account.trafficPoolBytes && account.trafficPoolBytes > 0
      ? Math.min(100, Math.round((account.trafficUsedBytes / account.trafficPoolBytes) * 100))
      : 0;

  const renderNavBody = (navRef?: React.RefObject<HTMLElement | null>) => (
    <div className="flex h-full flex-col justify-between px-3 py-4">
      <div>
        <div className="xp-brand mb-5 flex items-center justify-between px-2 pt-0.5">
          <div className="flex items-center gap-3">
            <BrandMark size={30} />
            <div>
              <div className="font-display text-lg font-bold tracking-tight text-(--text-primary) leading-none">
                {brandName}
              </div>
              <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
                {lang === 'fa' ? 'پنل کنترل وی‌پی‌ان' : 'VPN CONTROL PANEL'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-(--text-secondary) lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav ref={navRef} className="xp-nav-track space-y-1">
          {items
            .filter((i) => i.visible)
            .map((item, idx) => {
              const isActive = item.key === active;
              return (
                <button
                  key={item.key}
                  type="button"
                  style={{ '--i': idx } as React.CSSProperties}
                  onClick={() => {
                    onNavigate(item.key);
                    setMobileOpen(false);
                  }}
                  className={`xp-nav-item flex h-10 w-full items-center gap-2.5 rounded-xl px-3.5 text-sm font-medium ${
                    isActive
                      ? 'xp-nav-active text-(--text-primary) font-semibold'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  {isActive && <span className="xp-led" />}
                  <span className={isActive ? 'text-(--accent-text)' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>
      </div>

      <div className="space-y-2.5 border-t border-(--border-subtle) pt-3">
        {supportHref && (
          <a
            href={supportHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-xs text-(--text-secondary) hover:border-(--accent) hover:bg-(--accent-wash) hover:text-(--text-primary) transition"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <LifeBuoy className="h-3.5 w-3.5 text-(--accent-text)" />
              {lang === 'fa' ? 'پشتیبانی' : 'Support'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-(--text-muted)">
              {supportTelegram}
              <ExternalLink className="h-3 w-3" />
            </span>
          </a>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) py-1.5 text-xs text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary) transition"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{lang === 'en' ? 'فارسی' : 'English'}</span>
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) py-1.5 text-xs text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary) transition"
          >
            {themeIcon}
            <span>{themeLabel}</span>
          </button>
        </div>

        {(account.trafficPoolBytes !== null || account.expiresAt) && (
          <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-(--text-muted)">{lang === 'fa' ? 'سهمیه ترافیک' : 'Traffic quota'}</span>
              <span className="font-mono font-medium text-(--text-primary)">
                {formatBytes(account.trafficUsedBytes, lang)} / {formatBytes(account.trafficPoolBytes, lang)}
              </span>
            </div>
            {account.trafficPoolBytes !== null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-hover)">
                <div
                  className="h-full rounded-full bg-(--accent) transition-all"
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-(--text-muted)">{lang === 'fa' ? 'اعتبار حساب' : 'Account validity'}</span>
              <span className="text-(--text-secondary)">
                {formatDaysLeft(account.expiresAt, null, lang)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-(--bg-elevated)/75 px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="xp-avatar grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold uppercase">
              {account.username.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-(--text-primary)">{account.username}</div>
              <div className="text-[11px] text-(--text-muted)">{account.roleName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title={t.nav.signOut}
            className="rounded-lg p-1.5 text-(--text-secondary) hover:bg-(--bg-hover) hover:text-red-400 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Floating Glassmorphic Sidebar */}
      <aside className="hidden w-64 shrink-0 p-3.5 lg:block">
        <div className="xp-sidebar sticky top-3.5 h-[calc(100dvh-1.75rem)] overflow-y-auto">
          {renderNavBody(desktopNavRef)}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="xp-backdrop fixed inset-0" onClick={() => setMobileOpen(false)} />
          <aside className="xp-sidebar relative z-50 m-3 w-64 rounded-2xl shadow-xl">{renderNavBody()}</aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-(--border-subtle) bg-(--glass) backdrop-blur-md px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-(--text-secondary) hover:bg-(--bg-hover)"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-(--text-primary)">
            <BrandMark size={22} />
            {brandName}
          </span>
          <div className="w-8" />
        </header>

        {!account.isOwner && account.status !== 'active' && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-2.5 text-xs font-medium text-red-400">
            {account.status === 'expired'
              ? 'Your reseller plan has expired. Contact the panel owner to extend it.'
              : account.status === 'out_of_traffic'
                ? 'Your reseller traffic pool is used up. Contact the panel owner to top up.'
                : 'Your account is switched off.'}
          </div>
        )}

        <main key={active} className="xp-stagger mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
