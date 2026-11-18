import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { apiFetch, getApiBase } from '../lib/api';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { getSubPath, navigate, toPanelUrl, updateSearchParams, useLocationState } from '../lib/router';
import { useUi } from '../i18n/context';
import {
  ActionMenu,
  Button,
  EmptySonar,
  Input,
  Lamps,
  PageHead,
  Segmented,
  Select,
  Tabs,
} from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { QrCode } from '../components/QrCode';

import type { ClientTemplateItem } from './TemplatesPage';

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
  downloadMbps?: number | null;
  uploadMbps?: number | null;
  onlineCount: number;
  resetPeriod: string;
  resetEveryDays?: number;
  resetAnchor?: number;
  nextResetAt?: string | null;
  templateId?: number;
  subUpdateHours?: number;
  subAnnounce?: string;
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
  const [templates, setTemplates] = useState<ClientTemplateItem[]>([]);
  const [owners, setOwners] = useState<Array<{ id: number; username: string }>>([]);
  const [isOwner, setIsOwner] = useState(true);
  const [templatesOnly, setTemplatesOnly] = useState(false);
  const [search, setSearch] = useState(qParam);
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'traffic' | 'ending'>('newest');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientItem | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [qrClient, setQrClient] = useState<ClientItem | null>(null);
  const [extendClient, setExtendClient] = useState<ClientItem | null>(null);
  const [bulkExtendOpen, setBulkExtendOpen] = useState(false);
  const [bulkGroupsOpen, setBulkGroupsOpen] = useState(false);
  const [bulkSpeedOpen, setBulkSpeedOpen] = useState(false);
  const [bulkDevicesOpen, setBulkDevicesOpen] = useState(false);
  const [bulkSubOpen, setBulkSubOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTplOpen, setBulkTplOpen] = useState(false);
  const [bulkCreatedItems, setBulkCreatedItems] = useState<Array<{ id: number; name: string; subToken: string }>>([]);
  const [bulkSpeedDl, setBulkSpeedDl] = useState('');
  const [bulkSpeedUl, setBulkSpeedUl] = useState('');
  const [bulkDevCap, setBulkDevCap] = useState('');
  const [bulkSubHrs, setBulkSubHrs] = useState('0');
  const [bulkSubAnn, setBulkSubAnn] = useState('');
  const [bulkMoveOwnerId, setBulkMoveOwnerId] = useState('');
  const [bulkTplId, setBulkTplId] = useState('');
  const [bulkTplOp, setBulkTplOp] = useState<'apply_template' | 'renew'>('apply_template');
  const [bulkGroupOp, setBulkGroupOp] = useState<'add' | 'replace' | 'remove'>('add');
  const [bulkGroupIds, setBulkGroupIds] = useState<number[]>([]);
  const [extDays, setExtDays] = useState('30');
  const [extGb, setExtGb] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Form fields
  const [templateId, setTemplateId] = useState<number>(0);
  const [name, setName] = useState('');
  const [startNumber, setStartNumber] = useState('1');
  const [bulkCount, setBulkCount] = useState('10');
  const [trafficGb, setTrafficGb] = useState('50');
  const [downloadMbps, setDownloadMbps] = useState('');
  const [uploadMbps, setUploadMbps] = useState('');
  const [expiryMode, setExpiryMode] = useState<'unlimited' | 'days' | 'first_connect'>('days');
  const [expiryDays, setExpiryDays] = useState('30');
  const [deviceLimit, setDeviceLimit] = useState('2');
  const [resetPeriod, setResetPeriod] = useState('never');
  const [resetEveryDays, setResetEveryDays] = useState('30');
  const [resetAnchor, setResetAnchor] = useState(0);
  const [subUpdateHours, setSubUpdateHours] = useState('0');
  const [subAnnounce, setSubAnnounce] = useState('');
  const [fixedIp, setFixedIp] = useState('');
  const [vpnPassword, setVpnPassword] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [formError, setFormError] = useState('');

  const load = async () => {
    const [cRes, gRes, tRes, meRes] = await Promise.all([
      apiFetch<{ clients: ClientItem[] }>('/clients'),
      apiFetch<{ groups: GroupOption[] }>('/groups').catch(() => ({ groups: [] })),
      apiFetch<{ items: ClientTemplateItem[] }>('/client-templates').catch(() => ({ items: [] })),
      apiFetch<{ account?: { isOwner?: boolean; effectiveLimits?: { templatesOnly?: boolean } } }>('/auth/me').catch(
        () => ({ account: undefined }),
      ),
    ]);
    setClients(cRes.clients);
    setGroups(gRes.groups);
    setTemplates(tRes.items || []);
    const ownerFlag = Boolean(meRes.account?.isOwner ?? true);
    setIsOwner(ownerFlag);
    setTemplatesOnly(Boolean(!ownerFlag && meRes.account?.effectiveLimits?.templatesOnly));
    if (ownerFlag) {
      apiFetch<{ accounts: Array<{ id: number; username: string }> }>('/accounts')
        .then((a) => setOwners(a.accounts || []))
        .catch(() => undefined);
    }
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
    } else if (searchParams.get('bulk') === '1') {
      openNew(true);
      updateSearchParams((p) => p.delete('bulk'), { replace: true });
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

  const applyTemplateToForm = (tpl: ClientTemplateItem) => {
    setTemplateId(tpl.id);
    setTrafficGb(tpl.settings.trafficLimit > 0 ? String(Math.round((tpl.settings.trafficLimit / 1024 ** 3) * 100) / 100) : '');
    setDownloadMbps(tpl.settings.speedDown > 0 ? String(tpl.settings.speedDown / 1000) : '');
    setUploadMbps(tpl.settings.speedUp > 0 ? String(tpl.settings.speedUp / 1000) : '');
    if (tpl.settings.days > 0) {
      setExpiryMode(tpl.settings.startOnFirstUse ? 'first_connect' : 'days');
      setExpiryDays(String(tpl.settings.days));
    } else {
      setExpiryMode('unlimited');
    }
    setDeviceLimit(tpl.settings.maxDevices > 0 ? String(tpl.settings.maxDevices) : '');
    setResetPeriod(tpl.settings.resetStrategy === 'none' ? 'never' : tpl.settings.resetStrategy || 'never');
    setResetEveryDays(String(tpl.settings.resetEveryDays || 30));
    setResetAnchor(tpl.settings.resetAnchor || 0);
    setSubUpdateHours(String(tpl.settings.subUpdateHours || 0));
    setSubAnnounce(tpl.settings.subAnnounce || '');
    if (tpl.settings.groups?.length) setSelectedGroupIds(tpl.settings.groups);
  };

  const openNew = (isBulk: boolean) => {
    setEditing(null);
    setBulkMode(isBulk);
    setTemplateId(0);
    setName('');
    setStartNumber('1');
    setBulkCount('10');
    setTrafficGb('50');
    setDownloadMbps('');
    setUploadMbps('');
    setExpiryMode('days');
    setExpiryDays('30');
    setDeviceLimit('2');
    setResetPeriod('never');
    setResetEveryDays('30');
    setResetAnchor(0);
    setSubUpdateHours('0');
    setSubAnnounce('');
    setFixedIp('');
    setVpnPassword('');
    setEnabled(true);
    setNote('');
    setContact('');
    setShowMoreOptions(false);
    setSelectedGroupIds(groups.length > 0 ? [groups[0].id] : []);
    setFormError('');
    if (templatesOnly && templates.length > 0) {
      applyTemplateToForm(templates[0]);
    }
    setFormOpen(true);
  };

  const openEdit = (c: ClientItem) => {
    setEditing(c);
    setBulkMode(false);
    setTemplateId(c.templateId || 0);
    setName(c.name);
    setTrafficGb(c.trafficLimitBytes ? String(Math.round(c.trafficLimitBytes / 1024 ** 3)) : '');
    setDownloadMbps(c.downloadMbps ? String(c.downloadMbps) : '');
    setUploadMbps(c.uploadMbps ? String(c.uploadMbps) : '');
    setDeviceLimit(c.deviceLimit ? String(c.deviceLimit) : '');
    setResetPeriod(c.resetPeriod || 'never');
    setResetEveryDays(String(c.resetEveryDays || 30));
    setResetAnchor(c.resetAnchor || 0);
    setSubUpdateHours(String(c.subUpdateHours || 0));
    setSubAnnounce(c.subAnnounce || '');
    setFixedIp(c.fixedIp);
    setVpnPassword(c.vpnPassword || '');
    setEnabled(c.enabled);
    setNote(c.note);
    setContact(c.contact);
    setShowMoreOptions(Boolean(c.fixedIp || c.note || c.contact || !c.enabled || c.subUpdateHours || c.subAnnounce));
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
            downloadMbps: downloadMbps ? Number(downloadMbps) : null,
            uploadMbps: uploadMbps ? Number(uploadMbps) : null,
            deviceLimit: deviceLimit ? Number(deviceLimit) : null,
            resetPeriod,
            resetEveryDays: resetPeriod === 'every_n_days' ? Number(resetEveryDays || 30) : 0,
            resetAnchor,
            subUpdateHours: Number(subUpdateHours || 0),
            subAnnounce,
            fixedIp,
            vpnPassword: vpnPassword.trim() || undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
          }),
        });
      } else {
        const res = await apiFetch<{ ids: number[]; items?: Array<{ id: number; name: string; subToken: string }> }>('/clients', {
          method: 'POST',
          body: JSON.stringify({
            name: bulkMode ? undefined : name,
            prefix: bulkMode ? name : undefined,
            startNumber: bulkMode ? Number(startNumber || 1) : undefined,
            count: bulkMode ? Number(bulkCount) : 1,
            templateId: templateId || undefined,
            trafficGb: trafficGb ? Number(trafficGb) : null,
            downloadMbps: downloadMbps ? Number(downloadMbps) : null,
            uploadMbps: uploadMbps ? Number(uploadMbps) : null,
            expiryMode,
            expiryDays: Number(expiryDays || 30),
            deviceLimit: deviceLimit ? Number(deviceLimit) : null,
            resetPeriod,
            resetEveryDays: resetPeriod === 'every_n_days' ? Number(resetEveryDays || 30) : 0,
            resetAnchor,
            subUpdateHours: Number(subUpdateHours || 0),
            subAnnounce,
            fixedIp,
            vpnPassword: !bulkMode && vpnPassword.trim() ? vpnPassword.trim() : undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
          }),
        });
        if (bulkMode && res.items && res.items.length > 0) {
          setBulkCreatedItems(res.items);
        }
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

  const formatEndDate = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  const renderClientStatusTag = (s: ClientItem['status']) => {
    const label = t.clients.statuses[s];
    const cls =
      s === 'online'
        ? 'tag tag-online cert-tag'
        : s === 'active'
          ? 'tag tag-active cert-tag'
          : s === 'not_started'
            ? 'tag tag-pending cert-tag'
            : s === 'used_up' || s === 'expired'
              ? 'tag tag-expired cert-tag'
              : 'tag tag-disabled cert-tag';
    return <span className={cls}>{label}</span>;
  };

  const submitExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIds = extendClient ? [extendClient.id] : bulkExtendOpen ? selectedIds : [];
    if (targetIds.length === 0) return;
    await apiFetch('/clients/bulk', {
      method: 'POST',
      body: JSON.stringify({
        ids: targetIds,
        action: 'extend',
        addDays: extDays ? Number(extDays) : undefined,
        addTrafficGb: extGb ? Number(extGb) : undefined,
      }),
    });
    if (bulkExtendOpen) setSelectedIds([]);
    setExtendClient(null);
    setBulkExtendOpen(false);
    load();
  };

  const submitBulkGroups = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    await apiFetch('/clients/bulk', {
      method: 'POST',
      body: JSON.stringify({
        ids: selectedIds,
        action: 'group',
        groupOp: bulkGroupOp,
        groupIds: bulkGroupIds,
      }),
    });
    setBulkGroupsOpen(false);
    setSelectedIds([]);
    load();
  };

  return (
    <div className="page clients-page">
      <PageHead
        title={t.clients.title}
        sub={lang === 'fa' ? `${counts.all} کاربر` : `${counts.all} clients`}
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

      <div className="toolbar clients-toolbar">
        <label className="search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={lang === 'fa' ? 'نام، یادداشت یا راه ارتباطی' : 'Name, note or contact'}
            className="input"
          />
        </label>
        <div className="sort-group">
          {groups.length > 0 && (
            <label className="sort">
              <span className="faint small">{lang === 'fa' ? 'گروه' : 'Group'}</span>
              <select
                className="select"
                value={groupFilter}
                onChange={(e) => setGroupFilterParam(e.target.value)}
              >
                <option value="all">{lang === 'fa' ? 'همه گروه‌ها' : 'All groups'}</option>
                {groups.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="sort">
            <span className="faint small">{lang === 'fa' ? 'مرتب‌سازی' : 'Sort'}</span>
            <select
              className="select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="newest">{lang === 'fa' ? 'جدیدترین' : 'Newest'}</option>
              <option value="name">{lang === 'fa' ? 'نام' : 'Name'}</option>
              <option value="traffic">{lang === 'fa' ? 'بیشترین مصرف' : 'Most traffic'}</option>
              <option value="ending">{lang === 'fa' ? 'نزدیک‌ترین پایان' : 'Ending soonest'}</option>
            </select>
          </label>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="bulkbar flex-wrap" role="region" aria-label={`${selectedIds.length} selected`}>
          <strong className="num">
            {selectedIds.length} {lang === 'fa' ? 'انتخاب‌شده' : 'selected'}
          </strong>
          <Button
            size="sm"
            onClick={() => {
              setExtDays('30');
              setExtGb('');
              setBulkExtendOpen(true);
            }}
          >
            {lang === 'fa' ? 'تمدید...' : 'Extend…'}
          </Button>
          <Button size="sm" onClick={() => { setBulkSpeedDl(''); setBulkSpeedUl(''); setBulkSpeedOpen(true); }}>
            {lang === 'fa' ? 'سرعت...' : 'Speed…'}
          </Button>
          <Button size="sm" onClick={() => { setBulkDevCap(''); setBulkDevicesOpen(true); }}>
            {lang === 'fa' ? 'دستگاه‌ها...' : 'Devices…'}
          </Button>
          <Button size="sm" onClick={() => { setBulkSubHrs('0'); setBulkSubAnn(''); setBulkSubOpen(true); }}>
            {lang === 'fa' ? 'اشتراک اپ‌ها...' : 'Proxy app sub…'}
          </Button>
          {templates.length > 0 && (
            <Button size="sm" onClick={() => { setBulkTplId(String(templates[0].id)); setBulkTplOp('apply_template'); setBulkTplOpen(true); }}>
              {lang === 'fa' ? 'قالب...' : 'Template…'}
            </Button>
          )}
          {isOwner && owners.length > 1 && (
            <Button size="sm" onClick={() => { setBulkMoveOwnerId(String(owners[0].id)); setBulkMoveOpen(true); }}>
              {lang === 'fa' ? 'انتقال مالک...' : 'Move…'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setBulkGroupOp('add');
              setBulkGroupIds([]);
              setBulkGroupsOpen(true);
            }}
          >
            {lang === 'fa' ? 'گروه‌ها' : 'Groups'}
          </Button>
          <Button size="sm" onClick={() => bulkAction('enable')}>{lang === 'fa' ? 'فعال‌سازی' : 'Enable'}</Button>
          <Button size="sm" onClick={() => bulkAction('disable')}>{lang === 'fa' ? 'غیرفعال' : 'Disable'}</Button>
          <Button size="sm" onClick={() => bulkAction('reset_traffic')}>{t.clients.resetTraffic}</Button>
          <Button size="sm" onClick={() => bulkAction('disconnect')}>{lang === 'fa' ? 'قطع اتصال' : 'Disconnect'}</Button>
          <Button size="sm" variant="danger" onClick={() => bulkAction('delete')}>{t.common.delete}</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="cert-empty-box">
          <EmptySonar text={lang === 'fa' ? 'هیچ کاربری پیدا نشد' : 'No clients match this view.'} />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table clients-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    aria-label={t.clients.tabs.all}
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((c) => c.id) : [])}
                  />
                </th>
                <th>{t.clients.columns.client}</th>
                <th>{t.clients.columns.status}</th>
                <th>{t.clients.columns.traffic}</th>
                <th>{t.clients.columns.ends}</th>
                <th className="end">{t.clients.columns.online}</th>
                <th className="hide-md">{t.clients.columns.owner}</th>
                <th className="col-actions">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const subNote = c.note || c.contact;
                const endDate = formatEndDate(c.expiresAt);
                return (
                  <tr
                    key={c.id}
                    className={selectedIds.includes(c.id) ? 'selected cursor-pointer' : 'cursor-pointer'}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('a,button,input,.menu-wrap,.menu,.menu-scrim')) return;
                      navigate(`/clients/${c.id}`);
                    }}
                  >
                    <td className="col-check">
                      <input
                        type="checkbox"
                        aria-label={c.name}
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
                        {subNote ? (
                          <span className="faint small clip" dir="auto">
                            {subNote}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>{renderClientStatusTag(c.status)}</td>
                    <td>
                      <div className="traffic-cell">
                        <Lamps used={c.trafficUsedBytes} limit={c.trafficLimitBytes ?? 0} count={10} />
                        <span className="small num">
                          <strong>{formatBytes(c.trafficUsedBytes, lang)}</strong>{' '}
                          <span className="faint">/ {formatBytes(c.trafficLimitBytes, lang)}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-2">
                        <span>{formatDaysLeft(c.expiresAt, c.firstConnectDays, lang)}</span>
                        {endDate ? <span className="faint small">{endDate}</span> : null}
                      </div>
                    </td>
                    <td className="end num">
                      <span className={c.onlineCount > 0 ? '' : 'faint'}>{c.onlineCount}</span>
                      {c.deviceLimit ? <span className="faint"> / {c.deviceLimit}</span> : null}
                    </td>
                    <td className="hide-md faint">{c.ownerUsername}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn ghost sm icon"
                          onClick={() => copySub(c)}
                          title={copiedId === c.id ? t.common.copied : t.clients.subLink}
                          aria-label={t.clients.subLink}
                        >
                          {copiedId === c.id ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                        </button>
                        <a
                          href={`${getApiBase()}/clients/${c.id}/profile`}
                          download
                          className="btn ghost sm icon"
                          title={t.clients.profile}
                          aria-label={t.clients.profile}
                        >
                          <Download size={16} aria-hidden="true" />
                        </a>
                        <ActionMenu
                          label={t.common.actions}
                          trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                          items={[
                            {
                              label: lang === 'fa' ? 'تمدید' : 'Extend',
                              onSelect: () => {
                                setExtDays('30');
                                setExtGb('');
                                setExtendClient(c);
                              },
                            },
                            {
                              label: t.common.edit,
                              onSelect: () => openEdit(c),
                            },
                            {
                              label: c.enabled
                                ? lang === 'fa'
                                  ? 'غیرفعال کردن'
                                  : 'Disable'
                                : lang === 'fa'
                                  ? 'فعال کردن'
                                  : 'Enable',
                              onSelect: async () => {
                                await apiFetch(`/clients/${c.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ enabled: !c.enabled }),
                                });
                                load();
                              },
                            },
                            {
                              label: t.clients.resetTraffic,
                              onSelect: async () => {
                                await apiFetch(`/clients/${c.id}/reset-traffic`, { method: 'POST' });
                                load();
                              },
                            },
                            c.onlineCount > 0
                              ? {
                                  label: t.clients.disconnect,
                                  onSelect: async () => {
                                    await apiFetch('/clients/bulk', {
                                      method: 'POST',
                                      body: JSON.stringify({ ids: [c.id], action: 'disconnect' }),
                                    });
                                    load();
                                  },
                                }
                              : null,
                            {
                              label: 'QR Code',
                              onSelect: () => setQrClient(c),
                            },
                            null,
                            {
                              label: t.common.delete,
                              danger: true,
                              onSelect: async () => {
                                if (!confirm(t.common.confirmDelete)) return;
                                await apiFetch(`/clients/${c.id}`, { method: 'DELETE' });
                                load();
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
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
          {!editing && templates.length > 0 && (
            <div className="space-y-1.5">
              <Select
                label={lang === 'fa' ? 'انتخاب از قالب آماده' : 'Plan template'}
                value={String(templateId)}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (!id) {
                    setTemplateId(0);
                  } else {
                    const tpl = templates.find((tItem) => tItem.id === id);
                    if (tpl) applyTemplateToForm(tpl);
                  }
                }}
              >
                {!templatesOnly && <option value="0">{lang === 'fa' ? '— تنظیم دستی —' : '— Custom plan —'}</option>}
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
              {templatesOnly && (
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {lang === 'fa'
                    ? 'حساب شما فقط مجاز به فروش از روی قالب‌های مجاز است.'
                    : 'Your role sells from approved templates only.'}
                </p>
              )}
            </div>
          )}

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

          {(!templatesOnly || editing) && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={lang === 'fa' ? 'محدودیت دانلود (Mbps)' : 'Download speed (Mbps)'}
                  type="number"
                  min="0"
                  step="0.5"
                  value={downloadMbps}
                  onChange={(e) => setDownloadMbps(e.target.value)}
                  placeholder={lang === 'fa' ? 'نامحدود' : 'Unlimited'}
                />
                <Input
                  label={lang === 'fa' ? 'محدودیت آپلود (Mbps)' : 'Upload speed (Mbps)'}
                  type="number"
                  min="0"
                  step="0.5"
                  value={uploadMbps}
                  onChange={(e) => setUploadMbps(e.target.value)}
                  placeholder={lang === 'fa' ? 'نامحدود' : 'Unlimited'}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t.clients.resetPeriod}
                  value={resetPeriod}
                  onChange={(e) => setResetPeriod(e.target.value)}
                >
                  <option value="never">{lang === 'fa' ? 'هیچ‌وقت' : 'Never'}</option>
                  <option value="daily">{lang === 'fa' ? 'روزانه' : 'Every day'}</option>
                  <option value="weekly">{lang === 'fa' ? 'هفتگی' : 'Every week'}</option>
                  <option value="monthly">{lang === 'fa' ? 'ماهانه میلادی' : 'Every month'}</option>
                  <option value="yearly">{lang === 'fa' ? 'سالانه میلادی' : 'Every year'}</option>
                  <option value="jalali_monthly">{lang === 'fa' ? 'ماهانه شمسی' : 'Every Persian month'}</option>
                  <option value="jalali_yearly">{lang === 'fa' ? 'سالانه شمسی' : 'Every Persian year'}</option>
                  <option value="every_n_days">{lang === 'fa' ? 'هر N روز' : 'Every N days'}</option>
                </Select>

                {resetPeriod === 'every_n_days' && (
                  <Input
                    label={lang === 'fa' ? 'هر چند روز (۱ تا ۳۶۵)' : 'Every N days (1-365)'}
                    type="number"
                    min="1"
                    max="365"
                    value={resetEveryDays}
                    onChange={(e) => setResetEveryDays(e.target.value)}
                  />
                )}

                {['monthly', 'yearly', 'jalali_monthly', 'jalali_yearly'].includes(resetPeriod) && (
                  <Select
                    label={lang === 'fa' ? 'مبنای ریست' : 'Count from'}
                    value={String(resetAnchor)}
                    onChange={(e) => setResetAnchor(Number(e.target.value))}
                  >
                    <option value="0">{lang === 'fa' ? 'ابتدای تقویم' : 'Calendar start'}</option>
                    <option value="1">{lang === 'fa' ? 'تاریخ ساخت کاربر' : 'Client start'}</option>
                  </Select>
                )}
              </div>
            </>
          )}

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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={lang === 'fa' ? 'بازه بروزرسانی در اپ‌ها (ساعت)' : 'Proxy app refresh (hours)'}
                    type="number"
                    min="0"
                    max="720"
                    value={subUpdateHours}
                    onChange={(e) => setSubUpdateHours(e.target.value)}
                  />
                  <Input
                    label={lang === 'fa' ? 'پیام اعلان اپ‌ها' : 'Proxy app announcement'}
                    maxLength={200}
                    value={subAnnounce}
                    onChange={(e) => setSubAnnounce(e.target.value)}
                  />
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

      {/* Extend Modal */}
      <Modal
        open={Boolean(extendClient) || bulkExtendOpen}
        onClose={() => {
          setExtendClient(null);
          setBulkExtendOpen(false);
        }}
        title={
          extendClient
            ? `${lang === 'fa' ? 'تمدید' : 'Extend'} ${extendClient.name}`
            : lang === 'fa'
              ? `تمدید ${selectedIds.length} کاربر`
              : `Extend ${selectedIds.length} selected`
        }
      >
        <form onSubmit={submitExtend} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90, 365].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={extDays === String(d) ? 'primary' : 'secondary'}
                onClick={() => setExtDays(String(d))}
              >
                +{d}{lang === 'fa' ? ' روز' : 'd'}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t.clients.extendDays}
              type="number"
              min={0}
              value={extDays}
              onChange={(e) => setExtDays(e.target.value)}
            />
            <Input
              label={t.clients.extendTraffic}
              type="number"
              min={0}
              placeholder="0"
              value={extGb}
              onChange={(e) => setExtGb(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setExtendClient(null);
                setBulkExtendOpen(false);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {lang === 'fa' ? 'تمدید' : 'Extend'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Groups Modal */}
      <Modal
        open={bulkGroupsOpen}
        onClose={() => setBulkGroupsOpen(false)}
        title={lang === 'fa' ? `مدیریت گروه‌ها (${selectedIds.length} کاربر)` : `Groups for ${selectedIds.length} selected`}
      >
        <form onSubmit={submitBulkGroups} className="space-y-4">
          <div className="field">
            <span className="label">{lang === 'fa' ? 'نوع تغییر' : 'Action'}</span>
            <Segmented
              value={bulkGroupOp}
              onChange={setBulkGroupOp}
              options={[
                { value: 'add', label: lang === 'fa' ? 'افزودن به گروه‌ها' : 'Add to groups' },
                { value: 'replace', label: lang === 'fa' ? 'جایگزینی گروه‌ها' : 'Set groups' },
                { value: 'remove', label: lang === 'fa' ? 'حذف از گروه‌ها' : 'Remove from groups' },
              ]}
            />
          </div>

          {groups.length === 0 ? (
            <p className="hint">{lang === 'fa' ? 'هنوز هیچ گروهی ساخته نشده است.' : 'No groups created yet.'}</p>
          ) : (
            <div className="space-y-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3">
              {groups.map((g) => {
                const checked = bulkGroupIds.includes(g.id);
                return (
                  <label key={g.id} className="check" style={{ display: 'flex', fontSize: 'var(--t-sm)' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setBulkGroupIds((prev) =>
                          e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                        )
                      }
                    />
                    <span>{g.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkGroupsOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={groups.length === 0 || (bulkGroupOp !== 'replace' && bulkGroupIds.length === 0)}
            >
              {t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Speed Modal */}
      <Modal open={bulkSpeedOpen} onClose={() => setBulkSpeedOpen(false)} title={lang === 'fa' ? 'تنظیم سرعت گروهی' : 'Set speed limit'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/clients/bulk-action', {
              method: 'POST',
              body: JSON.stringify({
                ids: selectedIds,
                action: 'set_speed',
                speedLimitDown: bulkSpeedDl ? Math.round(Number(bulkSpeedDl) * 1000) : 0,
                speedLimitUp: bulkSpeedUl ? Math.round(Number(bulkSpeedUl) * 1000) : 0,
              }),
            });
            setBulkSpeedOpen(false);
            setSelectedIds([]);
            load();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Input label={lang === 'fa' ? 'دانلود (Mbps، ۰=نامحدود)' : 'Download (Mbps, 0=unlimited)'} type="number" min="0" step="0.5" value={bulkSpeedDl} onChange={(e) => setBulkSpeedDl(e.target.value)} />
            <Input label={lang === 'fa' ? 'آپلود (Mbps، ۰=نامحدود)' : 'Upload (Mbps, 0=unlimited)'} type="number" min="0" step="0.5" value={bulkSpeedUl} onChange={(e) => setBulkSpeedUl(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkSpeedOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Devices Modal */}
      <Modal open={bulkDevicesOpen} onClose={() => setBulkDevicesOpen(false)} title={lang === 'fa' ? 'تنظیم تعداد دستگاه گروهی' : 'Set device limit'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/clients/bulk-action', {
              method: 'POST',
              body: JSON.stringify({
                ids: selectedIds,
                action: 'set_devices',
                maxDevices: bulkDevCap ? Number(bulkDevCap) : 0,
              }),
            });
            setBulkDevicesOpen(false);
            setSelectedIds([]);
            load();
          }}
          className="space-y-4"
        >
          <Input label={lang === 'fa' ? 'حداکثر دستگاه هم‌زمان (۰=نامحدود)' : 'Devices at once (0 = unlimited)'} type="number" min="0" max="1000" value={bulkDevCap} onChange={(e) => setBulkDevCap(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkDevicesOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Proxy App Subscription Modal */}
      <Modal open={bulkSubOpen} onClose={() => setBulkSubOpen(false)} title={lang === 'fa' ? 'اشتراک اپ‌های پروکسی' : 'Proxy app subscription'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/clients/bulk-action', {
              method: 'POST',
              body: JSON.stringify({
                ids: selectedIds,
                action: 'set_sub',
                subUpdateHours: Number(bulkSubHrs || 0),
                subAnnounce: bulkSubAnn,
              }),
            });
            setBulkSubOpen(false);
            setSelectedIds([]);
            load();
          }}
          className="space-y-4"
        >
          <Input label={lang === 'fa' ? 'بازه بروزرسانی (ساعت، ۰=پیش‌فرض پنل)' : 'Refresh interval (hours, 0 = panel default)'} type="number" min="0" max="720" value={bulkSubHrs} onChange={(e) => setBulkSubHrs(e.target.value)} />
          <Input label={lang === 'fa' ? 'متن اعلان در اپ' : 'Announcement in proxy apps'} maxLength={200} value={bulkSubAnn} onChange={(e) => setBulkSubAnn(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkSubOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Template Apply / Renew Modal */}
      <Modal open={bulkTplOpen} onClose={() => setBulkTplOpen(false)} title={lang === 'fa' ? 'اعمال یا تمدید با قالب' : 'Apply or renew from template'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/clients/bulk-action', {
              method: 'POST',
              body: JSON.stringify({
                ids: selectedIds,
                action: bulkTplOp,
                templateId: Number(bulkTplId),
              }),
            });
            setBulkTplOpen(false);
            setSelectedIds([]);
            load();
          }}
          className="space-y-4"
        >
          <Select label={lang === 'fa' ? 'عملیات' : 'Operation'} value={bulkTplOp} onChange={(e) => setBulkTplOp(e.target.value as 'apply_template' | 'renew')}>
            <option value="apply_template">{lang === 'fa' ? 'اعمال تنظیمات قالب' : 'Apply template plan'}</option>
            <option value="renew">{lang === 'fa' ? 'تمدید (افزودن روز و حجم قالب)' : 'Renew (add template days & traffic)'}</option>
          </Select>
          <Select label={lang === 'fa' ? 'قالب' : 'Template'} value={bulkTplId} onChange={(e) => setBulkTplId(e.target.value)}>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkTplOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Move Owner Modal */}
      <Modal open={bulkMoveOpen} onClose={() => setBulkMoveOpen(false)} title={lang === 'fa' ? 'انتقال کاربران به حساب دیگر' : 'Move clients to another account'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/clients/bulk-action', {
              method: 'POST',
              body: JSON.stringify({
                ids: selectedIds,
                action: 'move_owner',
                ownerId: Number(bulkMoveOwnerId),
              }),
            });
            setBulkMoveOpen(false);
            setSelectedIds([]);
            load();
          }}
          className="space-y-4"
        >
          <Select label={lang === 'fa' ? 'حساب مقصد' : 'Target account'} value={bulkMoveOwnerId} onChange={(e) => setBulkMoveOwnerId(e.target.value)}>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBulkMoveOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{lang === 'fa' ? 'انتقال' : 'Move'}</Button>
          </div>
        </form>
      </Modal>

      {/* Batch Created Links (.txt Download) Modal */}
      <Modal
        open={bulkCreatedItems.length > 0}
        onClose={() => setBulkCreatedItems([])}
        title={lang === 'fa' ? `${bulkCreatedItems.length} کاربر ساخته شد` : `Created ${bulkCreatedItems.length} clients`}
      >
        <div className="space-y-3">
          <div className="max-h-56 overflow-y-auto rounded-xl border p-3 font-mono text-xs space-y-1" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}>
            {bulkCreatedItems.map((it) => (
              <div key={it.id} className="truncate">
                {it.name}: {buildSubUrl(it.subToken)}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              onClick={() => {
                const text = bulkCreatedItems.map((it) => `${it.name}\t${buildSubUrl(it.subToken)}`).join('\n');
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `clients-sub-links-${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={15} />
              {lang === 'fa' ? 'دانلود فایل TXT لینک‌ها' : 'Download .txt links'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
