import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  FileStack,
  Gauge,
  KeyRound,
  Layers,
  Network,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Waypoints,
  Webhook,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import { useUi } from '../i18n/context';

interface CommandItem {
  id: string;
  group: 'actions' | 'pages' | 'clients' | 'nodes';
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  onOpenNotifications: () => void;
}

export function CommandPalette({ open, onClose, isOwner, onOpenNotifications }: CommandPaletteProps) {
  const { lang } = useUi();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [clients, setClients] = useState<Array<{ id: number; name: string; status: string }>>([]);
  const [nodes, setNodes] = useState<Array<{ id: number; name: string; address: string; status: string }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 20);
    apiFetch<{ clients: Array<{ id: number; name: string; status: string }> }>('/clients')
      .then((res) => setClients(res.clients || []))
      .catch(() => undefined);
    if (isOwner) {
      apiFetch<{ nodes: Array<{ id: number; name: string; address: string; status: string }> }>('/nodes')
        .then((res) => setNodes(res.nodes || []))
        .catch(() => undefined);
    }
  }, [open, isOwner]);

  const items = useMemo<CommandItem[]>(() => {
    const fa = lang === 'fa';
    const actions: CommandItem[] = [
      {
        id: 'act-new-client',
        group: 'actions',
        label: fa ? 'کاربر جدید' : 'New client',
        hint: '/clients',
        icon: <Plus size={15} />,
        onSelect: () => navigate('/clients?new=1'),
      },
      {
        id: 'act-bulk-client',
        group: 'actions',
        label: fa ? 'ساخت دسته‌ای کاربر' : 'Create several clients',
        hint: '/clients',
        icon: <Users size={15} />,
        onSelect: () => navigate('/clients?bulk=1'),
      },
      ...(isOwner
        ? [
            {
              id: 'act-new-tpl',
              group: 'actions' as const,
              label: fa ? 'قالب کاربر جدید' : 'New template',
              hint: '/templates',
              icon: <FileStack size={15} />,
              onSelect: () => navigate('/templates?new=1'),
            },
            {
              id: 'act-new-xray',
              group: 'actions' as const,
              label: fa ? 'ایجاد inbound ایکس‌ری' : 'New Xray inbound',
              hint: '/inbounds/new?kind=xray',
              icon: <Server size={15} />,
              onSelect: () => navigate('/inbounds/new?kind=xray'),
            },
            {
              id: 'act-new-node',
              group: 'actions' as const,
              label: fa ? 'اتصال نود جدید' : 'Connect a node',
              hint: '/nodes',
              icon: <Network size={15} />,
              onSelect: () => navigate('/nodes?connect=1'),
            },
            {
              id: 'act-new-webhook',
              group: 'actions' as const,
              label: fa ? 'افزودن وب‌هوک' : 'Add webhook',
              hint: '/settings?tab=webhooks',
              icon: <Webhook size={15} />,
              onSelect: () => navigate('/settings?tab=webhooks'),
            },
          ]
        : []),
      {
        id: 'act-notifications',
        group: 'actions',
        label: fa ? 'مشاهده اعلان‌ها' : 'Open notifications',
        icon: <Bell size={15} />,
        onSelect: () => onOpenNotifications(),
      },
    ];

    const pages: CommandItem[] = [
      { id: 'pg-overview', group: 'pages', label: fa ? 'نمای کلی' : 'Overview', icon: <Gauge size={15} />, onSelect: () => navigate('/') },
      { id: 'pg-clients', group: 'pages', label: fa ? 'کاربران' : 'Clients', icon: <Users size={15} />, onSelect: () => navigate('/clients') },
      { id: 'pg-templates', group: 'pages', label: fa ? 'قالب‌های کاربر' : 'Templates', icon: <FileStack size={15} />, onSelect: () => navigate('/templates') },
      { id: 'pg-connections', group: 'pages', label: fa ? 'اتصالات' : 'Connections', icon: <Activity size={15} />, onSelect: () => navigate('/connections') },
      ...(isOwner
        ? [
            { id: 'pg-inbounds', group: 'pages' as const, label: fa ? 'اینباندها' : 'Inbounds', icon: <Server size={15} />, onSelect: () => navigate('/inbounds') },
            { id: 'pg-nodes', group: 'pages' as const, label: fa ? 'نودها' : 'Nodes', icon: <Network size={15} />, onSelect: () => navigate('/nodes') },
            { id: 'pg-certs', group: 'pages' as const, label: fa ? 'گواهی‌نامه‌ها' : 'Certificates', icon: <ShieldCheck size={15} />, onSelect: () => navigate('/certificates') },
            { id: 'pg-routing', group: 'pages' as const, label: fa ? 'مسیریابی' : 'Routing', icon: <Waypoints size={15} />, onSelect: () => navigate('/routing') },
            { id: 'pg-groups', group: 'pages' as const, label: fa ? 'گروه‌ها' : 'Groups', icon: <Layers size={15} />, onSelect: () => navigate('/groups') },
            { id: 'pg-accounts', group: 'pages' as const, label: fa ? 'حساب‌های پنل' : 'Panel accounts', icon: <UserCog size={15} />, onSelect: () => navigate('/accounts') },
          ]
        : []),
      { id: 'pg-settings', group: 'pages', label: fa ? 'تنظیمات' : 'Settings', icon: <Settings size={15} />, onSelect: () => navigate('/settings') },
      ...(isOwner
        ? [{ id: 'pg-security', group: 'pages' as const, label: fa ? 'امنیت ورود' : 'Sign-in protection', icon: <KeyRound size={15} />, onSelect: () => navigate('/settings?tab=security') }]
        : []),
    ];

    const q = query.trim().toLowerCase();
    const matchedClients: CommandItem[] = clients
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        id: `cli-${c.id}`,
        group: 'clients',
        label: c.name,
        hint: c.status,
        icon: <Users size={15} />,
        onSelect: () => navigate(`/clients/${c.id}`),
      }));

    const matchedNodes: CommandItem[] = nodes
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.address.toLowerCase().includes(q))
      .slice(0, 6)
      .map((n) => ({
        id: `node-${n.id}`,
        group: 'nodes',
        label: n.name,
        hint: `${n.address} · ${n.status}`,
        icon: <Network size={15} />,
        onSelect: () => navigate('/nodes'),
      }));

    const base = [...actions, ...pages].filter((it) => !q || it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q));
    return [...base, ...matchedClients, ...matchedNodes];
  }, [query, clients, nodes, isOwner, lang, onOpenNotifications]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].onSelect();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, items, activeIndex, onClose]);

  if (!open) return null;

  const groupLabels: Record<CommandItem['group'], string> = {
    actions: lang === 'fa' ? 'عملیات' : 'ACTIONS',
    pages: lang === 'fa' ? 'صفحات' : 'PAGES',
    clients: lang === 'fa' ? 'کاربران' : 'CLIENTS',
    nodes: lang === 'fa' ? 'نودها' : 'NODES',
  };

  const groups: CommandItem['group'][] = ['actions', 'pages', 'clients', 'nodes'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'fa' ? 'پالت فرمان' : 'Command palette'}
    >
      <div
        className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--raise)', borderColor: 'var(--line-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <Search size={17} style={{ color: 'var(--ink-3)' }} />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent outline-none text-sm"
            style={{ color: 'var(--ink)' }}
            placeholder={lang === 'fa' ? 'جستجوی صفحات، عملیات، کاربران و نودها...' : 'Search pages, actions, clients and nodes'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="text-[11px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
            Esc
          </kbd>
        </div>

        <div className="max-h-[54vh] overflow-y-auto p-2 space-y-3">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
              {lang === 'fa' ? 'موردی یافت نشد.' : 'No matching items.'}
            </div>
          ) : (
            groups.map((grp) => {
              const grpItems = items.filter((it) => it.group === grp);
              if (grpItems.length === 0) return null;
              return (
                <div key={grp}>
                  <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wider" style={{ color: 'var(--ink-3)' }}>
                    {groupLabels[grp]}
                  </div>
                  <div className="space-y-0.5">
                    {grpItems.map((it) => {
                      const idx = items.indexOf(it);
                      const isSel = idx === activeIndex;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            it.onSelect();
                            onClose();
                          }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-start transition-colors"
                          style={{
                            background: isSel ? 'var(--accent-wash)' : 'transparent',
                            color: isSel ? 'var(--accent-text)' : 'var(--ink)',
                          }}
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <span style={{ color: isSel ? 'var(--accent)' : 'var(--ink-3)' }}>{it.icon}</span>
                            <span className="truncate">{it.label}</span>
                          </span>
                          {it.hint && (
                            <span className="text-xs truncate max-w-[180px]" style={{ color: 'var(--ink-3)' }}>
                              {it.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-2 border-t text-[11px]"
          style={{ borderColor: 'var(--line)', color: 'var(--ink-3)', background: 'var(--raise-2)' }}
        >
          <span>{lang === 'fa' ? '↑ ↓ حرکت' : '↑ ↓ move'}</span>
          <span>{lang === 'fa' ? '↵ باز کردن' : '↵ open'}</span>
          <span>{lang === 'fa' ? 'Esc بستن' : 'Esc close'}</span>
        </div>
      </div>
    </div>
  );
}
