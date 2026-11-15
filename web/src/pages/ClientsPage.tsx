import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Plus,
  QrCode as QrIcon,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { apiFetch, getApiBase } from '../lib/api';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { getSubPath, navigate, toPanelUrl, updateSearchParams, useLocationState } from '../lib/router';
import { useUi } from '../i18n/context';
import {
  Button,
  EmptySonar,
  Input,
  Lamps,
  PageHead,
  Select,
  StatusPill,
  Tabs,
} from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { QrCode } from '../components/QrCode';

export interface ClientItem {
  id: number;
  name: string;
  ownerId: number;
  ownerUsername: string;
  status: 'online' | 'active' | 'disabled' | 'expired' | 'used_up' | 'not_started';
  runningOutReason: string | null;
  trafficLimitBytes: number | null;
  trafficUsedBytes: number;
  uploadBytes?: number;
  downloadBytes?: number;
  expiresAt: string | null;
  firstConnectDays: number | null;
  firstConnectedAt?: string | null;
  deviceLimit: number | null;
  onlineCount: number;
  resetPeriod: 'never' | 'daily' | 'weekly' | 'monthly';
  fixedIp: string;
  enabled: boolean;
  note: string;
  contact: string;
  subToken: string;
  groups: { id: number; name: string }[];
  inboundIds: number[];
  createdAt: string;
  lastOnlineAt: string | null;
  vpnPassword?: string;
}

interface GroupOption {
  id: number;
  name: string;
}

export function ClientsPage({
  openCreateTrigger,
}: {
  openCreateTrigger?: number;
}) {
  const { t, lang } = useUi();
  const { searchParams } = useLocationState();
  const rawStatusParam = searchParams.get('status') || 'all';
  const tab = rawStatusParam === 'limited' ? 'used_up' : rawStatusParam;
  const groupFilter = searchParams.get('group') || 'all';
  const qParam = searchParams.get('q') || '';

  const [clients, setClients] = useState<ClientItem[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [search, setSearch] = useState(qParam);
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'traffic' | 'ending'>('newest');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientItem | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [qrClient, setQrClient] = useState<ClientItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [startNumber, setStartNumber] = useState('1');
  const [bulkCount, setBulkCount] = useState('10');
  const [trafficGb, setTrafficGb] = useState('50');
  const [expiryMode, setExpiryMode] = useState<'unlimited' | 'days' | 'first_connect'>('days');
  const [expiryDays, setExpiryDays] = useState('30');
  const [deviceLimit, setDeviceLimit] = useState('2');
  const [resetPeriod, setResetPeriod] = useState<'never' | 'daily' | 'weekly' | 'monthly'>('never');
  const [fixedIp, setFixedIp] = useState('');
  const [vpnPassword, setVpnPassword] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [formError, setFormError] = useState('');

  const load = async () => {
    const [cRes, gRes] = await Promise.all([
      apiFetch<{ clients: ClientItem[] }>('/clients'),
      apiFetch<{ groups: GroupOption[] }>('/groups').catch(() => ({ groups: [] })),
    ]);
    setClients(cRes.clients);
    setGroups(gRes.groups);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (openCreateTrigger && openCreateTrigger > 0) {
      openNew(false);
    }
  }, [openCreateTrigger]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew(false);
      updateSearchParams((p) => p.delete('new'), { replace: true });
    }
  }, [searchParams]);

  const setTab = (next: string) => {
    setSelectedIds([]);
    updateSearchParams((p) => {
      if (next === 'all') p.delete('status');
      else p.set('status', next);
    }, { replace: true });
  };

  const setGroupFilterParam = (next: string) => {
    setSelectedIds([]);
    updateSearchParams((p) => {
      if (next === 'all') p.delete('group');
      else p.set('group', next);
    }, { replace: true });
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    updateSearchParams((p) => {
      if (val.trim()) p.set('q', val);
      else p.delete('q');
    }, { replace: true });
  };

  const openNew = (isBulk: boolean) => {
    setEditing(null);
    setBulkMode(isBulk);
    setName('');
    setStartNumber('1');
    setBulkCount('10');
    setTrafficGb('50');
    setExpiryMode('days');
    setExpiryDays('30');
    setDeviceLimit('2');
    setResetPeriod('never');
    setFixedIp('');
    setVpnPassword('');
    setEnabled(true);
    setNote('');
    setContact('');
    setShowMoreOptions(false);
    setSelectedGroupIds(groups.length > 0 ? [groups[0].id] : []);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (c: ClientItem) => {
    setEditing(c);
    setBulkMode(false);
    setName(c.name);
    setTrafficGb(c.trafficLimitBytes ? String(Math.round(c.trafficLimitBytes / 1024 ** 3)) : '');
    setDeviceLimit(c.deviceLimit ? String(c.deviceLimit) : '');
    setResetPeriod(c.resetPeriod);
    setFixedIp(c.fixedIp);
    setVpnPassword(c.vpnPassword || '');
    setEnabled(c.enabled);
    setNote(c.note);
    setContact(c.contact);
    setShowMoreOptions(Boolean(c.fixedIp || c.note || c.contact || !c.enabled));
    setSelectedGroupIds(c.groups.map((g) => g.id));
    setFormError('');
    setFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      if (editing) {
        await apiFetch(`/clients/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            trafficGb: trafficGb ? Number(trafficGb) : null,
            deviceLimit: deviceLimit ? Number(deviceLimit) : null,
            resetPeriod,
            fixedIp,
            vpnPassword: vpnPassword.trim() || undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
          }),
        });
      } else {
        await apiFetch('/clients', {
          method: 'POST',
          body: JSON.stringify({
            name: bulkMode ? undefined : name,
            prefix: bulkMode ? name : undefined,
            startNumber: bulkMode ? Number(startNumber || 1) : undefined,
            count: bulkMode ? Number(bulkCount) : 1,
            trafficGb: trafficGb ? Number(trafficGb) : null,
            expiryMode,
            expiryDays: Number(expiryDays || 30),
            deviceLimit: deviceLimit ? Number(deviceLimit) : null,
            resetPeriod,
            fixedIp,
            vpnPassword: !bulkMode && vpnPassword.trim() ? vpnPassword.trim() : undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
          }),
        });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const counts = useMemo(() => {
    const map = {
      all: clients.length,
      online: 0,
      running_out: 0,
      used_up: 0,
      expired: 0,
      disabled: 0,
      active: 0,
      not_started: 0,
    };
    for (const c of clients) {
      if (c.status === 'online') map.online++;
      if (c.status === 'active' || c.status === 'online') map.active++;
      if (c.status === 'not_started') map.not_started++;
      if (c.runningOutReason) map.running_out++;
      if (c.status === 'used_up') map.used_up++;
      if (c.status === 'expired') map.expired++;
      if (c.status === 'disabled') map.disabled++;
    }
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    return clients
      .filter((c) => {
        if (tab === 'online' && c.status !== 'online') return false;
        if (tab === 'active' && c.status !== 'active' && c.status !== 'online') return false;
        if (tab === 'not_started' && c.status !== 'not_started') return false;
        if (tab === 'running_out' && !c.runningOutReason) return false;
        if (tab === 'used_up' && c.status !== 'used_up') return false;
        if (tab === 'expired' && c.status !== 'expired') return false;
        if (tab === 'disabled' && c.status !== 'disabled') return false;
        if (groupFilter !== 'all' && !c.groups.some((g) => String(g.id) === groupFilter)) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            c.note.toLowerCase().includes(q) ||
            c.contact.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'traffic') return b.trafficUsedBytes - a.trafficUsedBytes;
        if (sortBy === 'ending') {
          return (a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity) -
            (b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity);
        }
        return b.id - a.id;
      });
  }, [clients, tab, search, sortBy, groupFilter]);

  const buildSubUrl = (token: string) => `${window.location.origin}/${getSubPath()}/${token}`;

  const copySub = async (c: ClientItem) => {
    await navigator.clipboard.writeText(buildSubUrl(c.subToken));
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const bulkAction = async (action: 'enable' | 'disable' | 'reset_traffic' | 'disconnect' | 'delete' | 'extend') => {
    if (action === 'delete' && !confirm(t.common.confirmDelete)) return;
    await apiFetch('/clients/bulk', {
      method: 'POST',
      body: JSON.stringify({
        ids: selectedIds,
        action,
        addDays: action === 'extend' ? 30 : undefined,
      }),
    });
    setSelectedIds([]);
    load();
  };

  const statusTone = (s: ClientItem['status']) => {
    if (s === 'online') return 'lime';
    if (s === 'active') return 'green';
    if (s === 'not_started') return 'blue';
    if (s === 'used_up' || s === 'expired') return 'red';
    return 'gray';
  };

  return (
    <div className="page">
      <PageHead
        title={t.clients.title}
        sub={
          lang === 'fa'
            ? `${counts.all} کاربر ثبت‌شده · ${counts.online} آنلاین`
            : `${counts.all} clients total · ${counts.online} online`
        }
        actions={
          <>
            <Button onClick={() => openNew(true)}>
              <Users className="h-4 w-4" />
              {t.clients.bulkCreate}
            </Button>
            <Button variant="primary" onClick={() => openNew(false)}>
              <Plus className="h-4 w-4" />
              {t.clients.newClient}
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'all', label: t.clients.tabs.all, count: counts.all },
          { id: 'online', label: t.clients.tabs.online, count: counts.online },
          { id: 'running_out', label: t.clients.tabs.running_out, count: counts.running_out },
          { id: 'used_up', label: t.clients.tabs.used_up, count: counts.used_up },
          { id: 'expired', label: t.clients.tabs.expired, count: counts.expired },
          { id: 'disabled', label: t.clients.tabs.disabled, count: counts.disabled },
        ]}
      />

      <div className="toolbar">
        <label className="search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t.common.search}
            className="input"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupFilter} onChange={(e) => setGroupFilterParam(e.target.value)}>
            <option value="all">{lang === 'fa' ? 'گروه: همه' : 'Group: All'}</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="newest">{lang === 'fa' ? 'مرتب‌سازی: جدیدترین' : 'Sort: Newest'}</option>
            <option value="name">{lang === 'fa' ? 'مرتب‌سازی: نام' : 'Sort: Name'}</option>
            <option value="traffic">{lang === 'fa' ? 'مرتب‌سازی: بیشترین مصرف' : 'Sort: Most traffic'}</option>
            <option value="ending">{lang === 'fa' ? 'مرتب‌سازی: نزدیک‌ترین انقضا' : 'Sort: Ending soonest'}</option>
          </Select>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="bulkbar" role="region" aria-label={`${selectedIds.length} selected`}>
          <strong className="num">
            {selectedIds.length} {lang === 'fa' ? 'انتخاب‌شده' : 'selected'}
          </strong>
          <Button size="sm" onClick={() => bulkAction('extend')}>+30d</Button>
          <Button size="sm" onClick={() => bulkAction('enable')}>{lang === 'fa' ? 'فعال' : 'Enable'}</Button>
          <Button size="sm" onClick={() => bulkAction('disable')}>{lang === 'fa' ? 'غیرفعال' : 'Disable'}</Button>
          <Button size="sm" onClick={() => bulkAction('reset_traffic')}>{t.clients.resetTraffic}</Button>
          <Button size="sm" variant="danger" onClick={() => bulkAction('delete')}>{t.common.delete}</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="panel py-6">
          <EmptySonar text={lang === 'fa' ? 'هیچ کاربری پیدا نشد' : 'No clients match the filter'} />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table clients-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((c) => c.id) : [])}
                  />
                </th>
                <th>{t.clients.columns.client}</th>
                <th>{t.clients.columns.status}</th>
                <th>{t.clients.columns.traffic}</th>
                <th>{t.clients.columns.ends}</th>
                <th className="text-end">{t.clients.columns.online}</th>
                <th className="col-actions text-end">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={selectedIds.includes(c.id) ? 'selected cursor-pointer' : 'cursor-pointer'}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('a,button,input')) return;
                    navigate(`/clients/${c.id}`);
                  }}
                >
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className="cell-2">
                      <a
                        href={toPanelUrl(`/clients/${c.id}`)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          navigate(`/clients/${c.id}`);
                        }}
                        className="strong-link"
                        dir="ltr"
                      >
                        {c.name}
                      </a>
                      <span className="text-xs text-(--text-muted)">
                        {c.note || c.contact || c.groups.map((g) => g.name).join(', ') || '—'}
                      </span>
                    </span>
                  </td>
                  <td>
                    <StatusPill tone={statusTone(c.status)} label={t.clients.statuses[c.status]} />
                  </td>
                  <td>
                    <div className="space-y-1">
                      <div className="font-mono text-xs text-(--text-primary)">
                        {formatBytes(c.trafficUsedBytes, lang)} / {formatBytes(c.trafficLimitBytes, lang)}
                      </div>
                      <Lamps used={c.trafficUsedBytes} limit={c.trafficLimitBytes ?? 0} count={14} />
                    </div>
                  </td>
                  <td className="text-xs text-(--text-secondary)">
                    {formatDaysLeft(c.expiresAt, c.firstConnectDays, lang)}
                  </td>
                  <td className="text-end font-mono text-xs text-(--text-secondary)">
                    {c.onlineCount} / {c.deviceLimit ?? '∞'}
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <Button size="sm" variant="ghost" onClick={() => copySub(c)} title={t.clients.subLink}>
                        <Copy className="h-3.5 w-3.5" />
                        {copiedId === c.id ? t.common.copied : ''}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setQrClient(c)} title="QR">
                        <QrIcon className="h-3.5 w-3.5" />
                      </Button>
                      <a
                        href={`${getApiBase()}/clients/${c.id}/profile`}
                        download
                        className="inline-flex items-center rounded-xl p-1.5 text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                        title={t.clients.profile}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        {t.common.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await apiFetch(`/clients/${c.id}/reset-traffic`, { method: 'POST' });
                          load();
                        }}
                        title={t.clients.resetTraffic}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(t.common.confirmDelete)) return;
                          await apiFetch(`/clients/${c.id}`, { method: 'DELETE' });
                          load();
                        }}
                        className="text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Slide-Over Drawer */}
      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          editing
            ? `${t.common.edit}: ${editing.name}`
            : bulkMode
              ? lang === 'fa'
                ? 'ساخت چند کاربر'
                : 'Create several'
              : t.clients.newClient
        }
        subtitle={
          bulkMode
            ? lang === 'fa'
              ? 'ساخت دسته‌ای کاربران شماره‌گذاری‌شده با یک الگو'
              : 'Generate numbered accounts sharing one quota & duration plan'
            : undefined
        }
        widthClass="max-w-xl"
      >
        <form onSubmit={submitForm} className="space-y-4">
          {!editing && !bulkMode && (
            <Input
              label={t.common.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="john_doe"
              required
            />
          )}

          {!editing && bulkMode && (
            <div className="space-y-2.5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label={lang === 'fa' ? 'پیشوند' : 'Prefix'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="user"
                  required
                />
                <Input
                  label={lang === 'fa' ? 'شماره شروع' : 'First number'}
                  type="number"
                  min={1}
                  max={999}
                  value={startNumber}
                  onChange={(e) => setStartNumber(e.target.value)}
                  required
                />
                <Input
                  label={lang === 'fa' ? 'تعداد (۲ تا ۵۰)' : 'How many (2-50)'}
                  type="number"
                  min={2}
                  max={50}
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                  required
                />
              </div>
              {name.trim() && (
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs text-(--text-secondary)">
                  {lang === 'fa' ? 'پیش‌نمایش: ' : 'Preview: '}
                  <span className="font-mono font-semibold text-(--accent)">
                    {name.trim()}-{String(Math.max(1, Number(startNumber || 1))).padStart(2, '0')} …{' '}
                    {name.trim()}-
                    {String(Math.max(1, Number(startNumber || 1)) + Math.max(2, Number(bulkCount || 2)) - 1).padStart(
                      2,
                      '0',
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t.clients.trafficAllowance}
                type="number"
                value={trafficGb}
                onChange={(e) => setTrafficGb(e.target.value)}
                placeholder={lang === 'fa' ? 'خالی = نامحدود' : 'Empty = Unlimited'}
              />
              <Input
                label={t.clients.deviceLimit}
                type="number"
                value={deviceLimit}
                onChange={(e) => setDeviceLimit(e.target.value)}
                placeholder={lang === 'fa' ? 'خالی = نامحدود' : 'Empty = Unlimited'}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['10', '20', '50', '100', '200', '500', ''].map((preset) => {
                const active = trafficGb === preset;
                return (
                  <button
                    key={preset || 'unl'}
                    type="button"
                    onClick={() => setTrafficGb(preset)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                      active
                        ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                        : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {preset ? `${preset} GB` : t.common.unlimited}
                  </button>
                );
              })}
            </div>
          </div>

          {!editing && (
            <div className="space-y-2.5 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-(--text-secondary)">
                  {lang === 'fa' ? 'شروع محاسبه زمان' : 'Start the clock'}
                </span>
                <div className="inline-flex rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (expiryMode === 'unlimited') setExpiryMode('days');
                      else setExpiryMode('days');
                    }}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      expiryMode === 'days'
                        ? 'bg-(--accent-soft) text-(--accent)'
                        : 'text-(--text-secondary)'
                    }`}
                  >
                    {lang === 'fa' ? 'اکنون' : 'Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiryMode('first_connect')}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      expiryMode === 'first_connect'
                        ? 'bg-(--accent-soft) text-(--accent)'
                        : 'text-(--text-secondary)'
                    }`}
                  >
                    {lang === 'fa' ? 'اولین اتصال' : 'At first connection'}
                  </button>
                </div>
              </div>

              {expiryMode !== 'unlimited' && (
                <Input
                  label={lang === 'fa' ? 'مدت اعتبار (روز)' : 'Duration (days)'}
                  type="number"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                />
              )}

              <div className="flex flex-wrap gap-1.5">
                {['1', '7', '30', '60', '90', '180', '365'].map((d) => {
                  const active = expiryMode !== 'unlimited' && expiryDays === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        if (expiryMode === 'unlimited') setExpiryMode('days');
                        setExpiryDays(d);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                          : 'border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary)'
                      }`}
                    >
                      {d}d
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setExpiryMode('unlimited')}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    expiryMode === 'unlimited'
                      ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                      : 'border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  {lang === 'fa' ? 'بدون تاریخ انقضا' : 'No end date'}
                </button>
              </div>
            </div>
          )}

          <Select
            label={t.clients.resetPeriod}
            value={resetPeriod}
            onChange={(e) => setResetPeriod(e.target.value as typeof resetPeriod)}
          >
            <option value="never">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>

          {groups.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-(--text-secondary)">{t.nav.groups}</div>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const checked = selectedGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setSelectedGroupIds((prev) =>
                          checked ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                        )
                      }
                      className={`rounded-xl border px-3 py-1 text-xs transition ${
                        checked
                          ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                          : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary)'
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible More Options */}
          <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-elevated)">
            <button
              type="button"
              onClick={() => setShowMoreOptions((s) => !s)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-(--text-primary)"
            >
              <span>{lang === 'fa' ? 'تنظیمات بیشتر' : 'More options'}</span>
              {showMoreOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showMoreOptions && (
              <div className="space-y-3 border-t border-(--border-subtle) p-3.5">
                {!bulkMode && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label={lang === 'fa' ? 'رمزعبور VPN' : 'VPN password'}
                      value={vpnPassword}
                      onChange={(e) => setVpnPassword(e.target.value)}
                      placeholder={lang === 'fa' ? 'خودکار در صورت خالی بودن' : 'Auto-generated if blank'}
                    />
                    <Input
                      label={t.clients.fixedIp}
                      value={fixedIp}
                      onChange={(e) => setFixedIp(e.target.value)}
                      placeholder="e.g. 10.66.0.210"
                    />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label={t.clients.contact} value={contact} onChange={(e) => setContact(e.target.value)} />
                  <Input label={t.common.note} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-xs text-(--text-primary) cursor-pointer">
                  <span>{lang === 'fa' ? 'حساب کاربر فعال باشد' : 'Enabled'}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded accent-(--accent)"
                  />
                </label>
              </div>
            )}
          </div>

          {formError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setFormOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Drawer>

      {/* QR & Subscription Modal */}
      <Modal
        open={Boolean(qrClient)}
        onClose={() => setQrClient(null)}
        title={qrClient ? `${qrClient.name} — ${t.clients.subLink}` : ''}
      >
        {qrClient && (
          <div className="flex flex-col items-center space-y-4 text-center">
            <QrCode value={buildSubUrl(qrClient.subToken)} size={200} />
            <code className="w-full break-all rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs text-(--text-primary)">
              {buildSubUrl(qrClient.subToken)}
            </code>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => copySub(qrClient)}>
                <Copy className="h-4 w-4" />
                {t.common.copy}
              </Button>
              <a
                href={buildSubUrl(qrClient.subToken)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-(--accent) px-3.5 py-2 text-sm font-semibold text-(--accent-fg)"
              >
                <ExternalLink className="h-4 w-4" />
                Open page
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
