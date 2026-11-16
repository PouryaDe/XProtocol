import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CircleArrowUp,
  Gauge,
  Layers,
  LogOut,
  Menu,
  Moon,
  Network,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  SunMoon,
  UserCog,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { useUi, type ThemeMode } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { toPanelUrl } from '../lib/router';
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
  | 'updates'
  | 'settings';

export const NAV_PATHS: Record<NavKey, string> = {
  overview: '/',
  clients: '/clients',
  inbounds: '/inbounds',
  nodes: '/nodes',
  connections: '/connections',
  certificates: '/certificates',
  routing: '/routing',
  groups: '/groups',
  accounts: '/accounts',
  updates: '/updates',
  settings: '/settings',
};

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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const desktopNavRef = useRef<HTMLElement | null>(null);
  useSlidingIndicator(desktopNavRef, '.xp-nav-active', active);

  useEffect(() => {
    if (!account.isOwner) return;
    let alive = true;
    let followUpTimer: number | undefined;

    const applyUpdateRes = (res: { latest?: { tag?: string } | null; newer?: unknown[] }) => {
      const tag = res?.latest?.tag || '';
      const hasUpdate = Boolean(tag || (res?.newer && res.newer.length > 0));
      setUpdateAvailable(hasUpdate);
      try {
        if (tag) sessionStorage.setItem('xp_latest_update_tag', tag);
        else sessionStorage.removeItem('xp_latest_update_tag');
      } catch {
        // ignore storage errors
      }
      window.dispatchEvent(new CustomEvent('xp-updates-state', { detail: tag || null }));
    };

    const syncUpdates = () => {
      apiFetch<{
        checking?: boolean;
        latest?: { tag?: string } | null;
        newer?: unknown[];
      }>('/updates?auto=1&ttl=180000')
        .then((res) => {
          if (!alive) return;
          applyUpdateRes(res);
          if (res?.checking) {
            window.clearTimeout(followUpTimer);
            followUpTimer = window.setTimeout(() => {
              if (!alive) return;
              apiFetch<{ latest?: { tag?: string } | null; newer?: unknown[] }>('/updates')
                .then((fresh) => {
                  if (!alive) return;
                  applyUpdateRes(fresh);
                })
                .catch(() => {});
            }, 2500);
          }
        })
        .catch(() => {});
    };

    syncUpdates();
    window.addEventListener('xp-updates-changed', syncUpdates);
    const timer = setInterval(syncUpdates, 10 * 60_000);
    return () => {
      alive = false;
      window.clearTimeout(followUpTimer);
      window.removeEventListener('xp-updates-changed', syncUpdates);
      clearInterval(timer);
    };
  }, [account.isOwner]);

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
      <SunMoon aria-hidden="true" />
    ) : resolvedTheme === 'dark' ? (
      <Moon aria-hidden="true" />
    ) : (
      <Sun aria-hidden="true" />
    );

  const supportHref = supportTelegram
    ? supportTelegram.startsWith('http')
      ? supportTelegram
      : `https://t.me/${supportTelegram.replace(/^@/, '')}`
    : '';

  const items: { key: NavKey; path: string; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: 'overview', path: '/', label: t.nav.overview, icon: <Gauge aria-hidden="true" />, visible: true },
    {
      key: 'clients',
      path: '/clients',
      label: t.nav.clients,
      icon: <Users aria-hidden="true" />,
      visible: account.isOwner || account.permissions.clients.view !== 'none',
    },
    {
      key: 'inbounds',
      path: '/inbounds',
      label: t.nav.inbounds,
      icon: <Server aria-hidden="true" />,
      visible: account.isOwner || account.permissions.inbounds.view !== 'none',
    },
    {
      key: 'nodes',
      path: '/nodes',
      label: t.nav.nodes,
      icon: <Network aria-hidden="true" />,
      visible: account.isOwner || account.permissions.nodes.view !== 'none',
    },
    { key: 'certificates', path: '/certificates', label: t.nav.certificates, icon: <ShieldCheck aria-hidden="true" />, visible: account.isOwner },
    { key: 'routing', path: '/routing', label: t.nav.routing, icon: <Waypoints aria-hidden="true" />, visible: account.isOwner },
    {
      key: 'groups',
      path: '/groups',
      label: t.nav.groups,
      icon: <Layers aria-hidden="true" />,
      visible: account.isOwner || account.permissions.groups.view !== 'none',
    },
    { key: 'accounts', path: '/accounts', label: t.nav.accounts, icon: <UserCog aria-hidden="true" />, visible: account.isOwner },
    { key: 'settings', path: '/settings', label: t.nav.settings, icon: <Settings aria-hidden="true" />, visible: true },
    { key: 'updates', path: '/updates', label: t.nav.updates, icon: <CircleArrowUp aria-hidden="true" />, visible: account.isOwner },
  ];

  const pool = account.trafficPoolBytes;
  const quotaPct =
    pool && pool > 0 ? Math.min(100, Math.round((account.trafficUsedBytes / pool) * 100)) : 0;
  const quotaExhausted = Boolean(pool && pool > 0 && account.trafficUsedBytes >= pool);
  const expiresDiff = account.expiresAt ? new Date(account.expiresAt).getTime() - Date.now() : null;
  const expiryClass =
    expiresDiff !== null && expiresDiff <= 0
      ? ' expired'
      : expiresDiff !== null && expiresDiff <= 5 * 86400_000
        ? ' soon'
        : '';

  const renderNavBody = (navRef?: React.RefObject<HTMLElement | null>) => (
    <>
      <div className="brand">
        <BrandMark size={30} />
        <div>
          <strong>{brandName}</strong>
          <span className="faint">{lang === 'fa' ? 'پنل مدیریت VPN' : 'VPN Control Panel'}</span>
        </div>
      </div>

      <nav ref={navRef}>
        {items
          .filter((i) => i.visible)
          .map((item, idx) => {
            const isActive = item.key === active;
            return (
              <a
                key={item.key}
                href={toPanelUrl(item.path)}
                style={{ '--i': idx } as React.CSSProperties}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(item.key);
                  setMobileOpen(false);
                }}
                className={`navlink ${isActive ? 'active xp-nav-active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.key === 'updates' && updateAvailable && (
                  <i className="nav-dot" aria-label={t.nav.updates} />
                )}
              </a>
            );
          })}
      </nav>

      <div className="side-foot">
        {supportHref && (
          <a
            className="side-support"
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            title={lang === 'fa' ? 'پیام به پشتیبانی در تلگرام' : 'Message support on Telegram'}
          >
            <Send aria-hidden="true" />
            <span className="side-support-text">
              <strong>{lang === 'fa' ? 'پشتیبانی' : 'Support'}</strong>
              <span dir="ltr">{supportTelegram}</span>
            </span>
          </a>
        )}

        <div className="prefs">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
            aria-label={lang === 'fa' ? 'زبان' : 'Language'}
          >
            {lang === 'fa' ? 'English' : 'فارسی'}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={cycleTheme}
            aria-label={`${lang === 'fa' ? 'پوسته' : 'Theme'}: ${themeLabel}`}
            title={`${lang === 'fa' ? 'پوسته' : 'Theme'}: ${themeLabel}`}
          >
            {themeIcon}
            <span>{themeLabel}</span>
          </button>
        </div>

        <div className="who">
          <span className="who-text">
            <strong dir="auto">{account.username}</strong>
          </span>
          <button
            type="button"
            className="btn ghost icon"
            onClick={onLogout}
            aria-label={t.nav.signOut}
            title={t.nav.signOut}
          >
            <LogOut size={16} />
          </button>
        </div>

        <section
          className={`side-usage${quotaExhausted ? ' exhausted' : ''}`}
          aria-label={lang === 'fa' ? 'سهمیهٔ ترافیک' : 'Traffic quota'}
        >
          <div className="side-usage-head">
            <span>{lang === 'fa' ? 'سهمیهٔ ترافیک' : 'Traffic quota'}</span>
            <strong>
              {pool !== null
                ? formatBytes(pool, lang)
                : lang === 'fa'
                  ? 'نامحدود'
                  : 'Unlimited'}
            </strong>
          </div>
          <div className="side-usage-value">
            <b className="num">{formatBytes(account.trafficUsedBytes, lang)}</b>
            <span>{lang === 'fa' ? 'مصرف‌شده' : 'used'}</span>
          </div>
          {pool !== null && pool > 0 && (
            <div className="side-usage-meter" aria-hidden="true">
              <span style={{ width: `${quotaPct}%` }} />
            </div>
          )}
          <div className={`side-expiry${expiryClass}`}>
            <span className="side-expiry-label">
              <CalendarDays aria-hidden="true" />
              <span>{lang === 'fa' ? 'اعتبار حساب' : 'Account validity'}</span>
            </span>
            <time>
              <strong>{formatDaysLeft(account.expiresAt, null, lang)}</strong>
            </time>
          </div>
        </section>
      </div>
    </>
  );

  return (
    <div className={`shell${mobileOpen ? ' nav-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="btn ghost icon"
          aria-label={lang === 'fa' ? 'منو' : 'Menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <span className="brand-sm">
          <BrandMark size={24} />
          <span>{brandName}</span>
        </span>
      </header>

      <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden={!mobileOpen} />

      <aside className="sidebar" aria-label={lang === 'fa' ? 'منو' : 'Navigation'}>
        {renderNavBody(desktopNavRef)}
      </aside>

      <div className="canvas">
        {!account.isOwner && account.status !== 'active' && (
          <div className="banner bad">
            {account.status === 'expired'
              ? 'Your reseller plan has expired. Contact the panel owner to extend it.'
              : account.status === 'out_of_traffic'
                ? 'Your reseller traffic pool is used up. Contact the panel owner to top up.'
                : 'Your account is switched off.'}
          </div>
        )}

        <main key={active} className="xp-stagger">
          {children}
        </main>
      </div>
    </div>
  );
}
