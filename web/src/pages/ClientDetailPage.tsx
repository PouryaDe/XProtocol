import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  QrCode as QrCodeIcon,
  RotateCcw,
  Unplug,
} from 'lucide-react';
import { apiFetch, getApiBase } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import {
  formatBytes,
  formatBytesParts,
  formatDateTime,
  formatDuration,
  formatSpeed,
} from '../lib/format';
import { getSubPath, navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import {
  ActionMenu,
  EqLoader,
  Lamps,
  PageHead,
  Segmented,
  StatusPill,
} from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { QrCode } from '../components/QrCode';
import { ClientFormSheet } from '../components/ClientFormSheet';
import { TrafficChart, type TrafficSample } from '../components/TrafficChart';
import type { ClientItem } from './ClientsPage';

interface XrayServerItem {
  key: string;
  name: string;
  instanceId: number;
  instance: string;
  node: string;
  label?: string;
  host: string;
  port: number;
  protocol: string;
  transport: string;
  security: string;
  links: string[];
}

interface WireGuardInboundItem {
  id: number;
  name: string;
  port: number;
  protocol: string;
  configText: string;
  filename: string;
}

interface WireGuardDeviceSlot {
  slot: number;
  online: boolean;
  lastHandshakeAt: string | null;
  uploadBytes: number;
  downloadBytes: number;
  inbounds: WireGuardInboundItem[];
}

interface LiveSession {
  id: string;
  clientId: number;
  clientName: string;
  inboundName: string;
  protocol: string;
  nodeName: string;
  remoteIp: string;
  tunnelIp: string;
  device: string;
  connectedAt: string;
  speedInBps: number;
  speedOutBps: number;
}

interface HistSession {
  id: string;
  clientName: string;
  inboundName: string;
  protocol: string;
  nodeName: string;
  remoteIp: string;
  device: string;
  connectedAt: string;
  durationSec: number;
  bytesTotal: number;
  reason: string;
}

interface InboundSummary {
  id: number;
  name: string;
  protocol: string;
  transport: string;
  port: number;
  subnet?: string;
  nodeName: string;
  enabled: boolean;
}

interface GroupSummary {
  id: number;
  name: string;
  allInbounds: boolean;
  inboundIds: number[];
}

type UsageRange = '24h' | '7d' | '30d' | '90d';

type ConfirmModalState =
  | { kind: 'new_sub' }
  | { kind: 'replace_cert' }
  | { kind: 'delete_client' }
  | { kind: 'reset_wg'; slot: number }
  | { kind: 'new_xray_key' }
  | null;

const EXTEND_DAY_PRESETS = ['7', '30', '60', '90', '180', '365'] as const;

/** Format an ISO date string into a short localized calendar date. */
function formatShortDate(iso: string | null | undefined, lang: 'en' | 'fa'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/** Format client expiration status with exact end date and remaining days. */
function formatPlanEnds(
  expiresAt: string | null,
  firstConnectDays: number | null,
  lang: 'en' | 'fa',
): string {
  if (firstConnectDays && !expiresAt) {
    return lang === 'fa'
      ? `${firstConnectDays} روز از اولین اتصال`
      : `${firstConnectDays} days from first connect`;
  }
  if (!expiresAt) {
    return lang === 'fa' ? 'بدون تاریخ پایان' : 'No end date';
  }
  const expMs = Date.parse(expiresAt);
  const dateStr = formatShortDate(expiresAt, lang);
  const diff = expMs - Date.now();
  if (diff <= 0) {
    return lang === 'fa' ? `پایان ${dateStr} · منقضی‌شده` : `Ended ${dateStr} · Expired`;
  }
  const days = Math.ceil(diff / 86400_000);
  return lang === 'fa'
    ? `پایان ${dateStr} · ${days} روز مانده`
    : `Ends ${dateStr} · ${days} days left`;
}

/** Format an Xray transport identifier for tag pill display. */
function formatXrayTransport(t: string): string {
  const low = t.toLowerCase();
  if (low === 'raw' || low === 'tcp') return 'TCP (raw)';
  if (low === 'ws') return 'WebSocket';
  if (low === 'grpc') return 'gRPC';
  if (low === 'httpupgrade') return 'HTTPUpgrade';
  if (low === 'xhttp') return 'XHTTP';
  if (low === 'kcp') return 'mKCP';
  return t.toUpperCase();
}

/** Format an Xray security layer identifier for tag pill display. */
function formatXraySecurity(s: string): string {
  const low = s.toLowerCase();
  if (low === 'reality') return 'Reality';
  if (low === 'tls') return 'TLS';
  if (low === 'none') return 'None';
  return s;
}

/** Detailed management view for a single VPN client (`/clients/:id`). */
export function ClientDetailPage({ clientId }: { clientId: number }) {
  const { t, lang } = useUi();
  const [client, setClient] = useState<ClientItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [history, setHistory] = useState<HistSession[]>([]);
  const [inbounds, setInbounds] = useState<InboundSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [xrayServers, setXrayServers] = useState<XrayServerItem[]>([]);
  const [wgDevices, setWgDevices] = useState<WireGuardDeviceSlot[]>([]);
  const [usageRange, setUsageRange] = useState<UsageRange>('30d');
  const [usagePoints, setUsagePoints] = useState<TrafficSample[]>([]);

  const [expandedWgQrs, setExpandedWgQrs] = useState<Record<string, boolean>>({});
  const [expandedXrayQrs, setExpandedXrayQrs] = useState<Record<string, boolean>>({});
  const [copiedSub, setCopiedSub] = useState(false);
  const [copiedXrayKey, setCopiedXrayKey] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extDays, setExtDays] = useState('30');
  const [extGb, setExtGb] = useState('50');
  const [extResetUsed, setExtResetUsed] = useState(true);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);

  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const usageRangeRef = useRef<UsageRange>(usageRange);
  usageRangeRef.current = usageRange;

  const showToast = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Reset transient UI state when navigating directly between client detail views.
  useEffect(() => {
    setExpandedWgQrs({});
    setExpandedXrayQrs({});
    setConfirmModal(null);
    setExtendOpen(false);
    setEditOpen(false);
    setCopiedSub(false);
    setCopiedXrayKey('');
  }, [clientId]);

  const loadUsage = useCallback(async (range: UsageRange) => {
    try {
      const uRes = await apiFetch<{ points: TrafficSample[] }>(`/clients/${clientId}/usage?range=${range}`);
      setUsagePoints(uRes.points || []);
    } catch {
      setUsagePoints([]);
    }
  }, [clientId]);

  const load = useCallback(async () => {
    try {
      const [cOneRes, lRes, hRes, iRes, gRes, xRes, wRes, uRes] = await Promise.all([
        apiFetch<{ client: ClientItem }>(`/clients/${clientId}`).catch(() => null),
        apiFetch<{ connections: LiveSession[] }>('/connections/live').catch(() => ({ connections: [] })),
        apiFetch<{ history: HistSession[] }>('/connections/history').catch(() => ({ history: [] })),
        apiFetch<{ inbounds: InboundSummary[] }>('/inbounds').catch(() => ({ inbounds: [] })),
        apiFetch<{ groups: GroupSummary[] }>('/groups').catch(() => ({ groups: [] })),
        apiFetch<{ servers: XrayServerItem[] }>(`/clients/${clientId}/xray`).catch(() => ({ servers: [] })),
        apiFetch<{ devices: WireGuardDeviceSlot[] }>(`/clients/${clientId}/wireguard`).catch(() => ({ devices: [] })),
        apiFetch<{ points: TrafficSample[] }>(`/clients/${clientId}/usage?range=${usageRangeRef.current}`).catch(() => null),
      ]);

      let found = cOneRes?.client ?? null;
      if (!found) {
        const listRes = await apiFetch<{ clients: ClientItem[] }>('/clients');
        found = listRes.clients.find((c) => c.id === clientId) ?? null;
      }
      if (!found) {
        setNotFound(true);
        setClient(null);
        return;
      }
      setNotFound(false);
      setClient(found);
      setLive(lRes.connections.filter((s) => s.clientId === clientId));
      setHistory(hRes.history.filter((s) => s.clientName === found.name));
      setInbounds(iRes.inbounds);
      setGroups(gRes.groups);
      setXrayServers(xRes.servers || []);
      setWgDevices(wRes.devices || []);
      if (uRes) setUsagePoints(uRes.points || []);
    } catch {
      setNotFound(true);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadUsage(usageRange);
  }, [loadUsage, usageRange]);

  const assignedInbounds = useMemo(() => {
    if (!client) return [];
    const clientGroupIds = new Set(client.groups.map((g) => g.id));
    const matchedGroups = groups.filter((g) => clientGroupIds.has(g.id));
    if (matchedGroups.some((g) => g.allInbounds)) {
      return inbounds.filter((ib) => ib.enabled);
    }
    const ids = new Set<number>(client.inboundIds);
    for (const g of matchedGroups) {
      for (const id of g.inboundIds || []) ids.add(id);
    }
    return inbounds.filter((ib) => ib.enabled && ids.has(ib.id));
  }, [client, groups, inbounds]);

  const otherProfileInbounds = useMemo(
    () =>
      assignedInbounds.filter(
        (ib) => ib.protocol !== 'xray' && ib.protocol !== 'wireguard' && ib.protocol !== 'amneziawg',
      ),
    [assignedInbounds],
  );

  if (notFound) {
    return (
      <div className="page">
        <a
          href={toPanelUrl('/clients')}
          onClick={(e) => {
            e.preventDefault();
            navigate('/clients');
          }}
          className="backlink"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t.nav.clients}
        </a>
        <div className="panel p-8 text-center">
          <p className="text-sm text-(--text-secondary)">
            {lang === 'fa' ? 'کاربر مورد نظر پیدا نشد.' : 'Client not found.'}
          </p>
        </div>
      </div>
    );
  }

  if (!client) {
    return <EqLoader label={t.common.loading} />;
  }

  const subUrl = `${window.location.origin}/${getSubPath()}/${client.subToken}`;
  const remainingBytes =
    client.trafficLimitBytes && client.trafficLimitBytes > 0
      ? Math.max(0, client.trafficLimitBytes - client.trafficUsedBytes)
      : null;

  const remainingParts = remainingBytes !== null ? formatBytesParts(remainingBytes, lang) : null;
  const usedParts = formatBytesParts(client.trafficUsedBytes, lang);
  const allTimeDown = client.totalDownloadBytes ?? client.downloadBytes ?? 0;
  const allTimeUp = client.totalUploadBytes ?? client.uploadBytes ?? 0;

  const xrayLive = live.filter((s) => s.protocol === 'xray');
  const xrayDeviceCount = new Set(xrayLive.map((s) => s.remoteIp)).size;
  const xrayOpenConnections = xrayLive.length;
  const xrayActive = client.enabled && client.status !== 'expired' && client.status !== 'used_up';

  const statusTone = (s: ClientItem['status']) => {
    if (s === 'online') return 'lime';
    if (s === 'active') return 'green';
    if (s === 'not_started') return 'blue';
    if (s === 'used_up' || s === 'expired') return 'red';
    return 'gray';
  };

  const runAction = async (fn: () => Promise<unknown>, toastOnSuccess?: string): Promise<boolean> => {
    setBusyAction(true);
    try {
      await fn();
      await load();
      if (toastOnSuccess) showToast(toastOnSuccess);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : lang === 'fa' ? 'عملیات ناموفق بود' : 'Action failed';
      showToast(msg, true);
      return false;
    } finally {
      setBusyAction(false);
    }
  };

  const handleCopySub = async () => {
    const ok = await copyToClipboard(subUrl);
    if (!ok) return;
    setCopiedSub(true);
    showToast(lang === 'fa' ? 'لینک اشتراک کپی شد' : 'Subscription link copied');
    setTimeout(() => setCopiedSub(false), 1600);
  };

  const handleCopyXray = async (srv: XrayServerItem) => {
    const link = srv.links[0] || '';
    const ok = await copyToClipboard(link);
    if (!ok) return;
    setCopiedXrayKey(srv.key);
    showToast(lang === 'fa' ? 'لینک کپی شد' : 'Link copied');
    setTimeout(() => setCopiedXrayKey(''), 1600);
  };

  const toggleWgQr = (k: string) => {
    setExpandedWgQrs((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const toggleXrayQr = (k: string) => {
    setExpandedXrayQrs((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const openExtendModal = () => {
    setExtDays('30');
    setExtGb(client.trafficLimitBytes === null ? '' : '50');
    setExtResetUsed(true);
    setExtendOpen(true);
  };

  const submitExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await runAction(
      () =>
        apiFetch(`/clients/${client.id}/extend`, {
          method: 'POST',
          body: JSON.stringify({
            addDays: extDays ? Number(extDays) : 0,
            addTrafficGb: client.trafficLimitBytes === null || !extGb ? 0 : Number(extGb),
            resetUsedTraffic: extResetUsed,
          }),
        }),
      lang === 'fa' ? `${client.name} تمدید شد` : `${client.name} extended`,
    );
    if (ok) setExtendOpen(false);
  };

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    const current = confirmModal;
    if (current.kind === 'new_sub') {
      const ok = await runAction(
        () => apiFetch(`/clients/${client.id}/regenerate-sub`, { method: 'POST' }),
        lang === 'fa' ? 'لینک اشتراک جدید ساخته شد' : 'New subscription link created',
      );
      if (ok) setConfirmModal(null);
    } else if (current.kind === 'replace_cert') {
      const ok = await runAction(
        () => apiFetch(`/clients/${client.id}/replace-certificate`, { method: 'POST' }),
        lang === 'fa' ? 'گواهی جایگزین شد' : 'Certificate replaced',
      );
      if (ok) setConfirmModal(null);
    } else if (current.kind === 'delete_client') {
      setBusyAction(true);
      try {
        await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
        setConfirmModal(null);
        navigate('/clients');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', true);
      } finally {
        setBusyAction(false);
      }
    } else if (current.kind === 'reset_wg') {
      const ok = await runAction(
        () => apiFetch(`/clients/${client.id}/wireguard/${current.slot}/reset`, { method: 'POST' }),
        lang === 'fa' ? 'کلیدهای WireGuard ریست شد' : 'WireGuard keys reset',
      );
      if (ok) setConfirmModal(null);
    } else if (current.kind === 'new_xray_key') {
      const ok = await runAction(
        () => apiFetch(`/clients/${client.id}/xray/rotate`, { method: 'POST' }),
        lang === 'fa' ? 'کلید جدید Xray ساخته شد' : 'New Xray key created',
      );
      if (ok) setConfirmModal(null);
    }
  };

  const disconnectSession = async (sessionId: string) => {
    await runAction(
      () => apiFetch(`/connections/${sessionId}/disconnect`, { method: 'POST' }),
      lang === 'fa' ? 'نشست قطع شد' : 'Session disconnected',
    );
  };

  const statusLabel =
    lang === 'fa'
      ? t.clients.statuses[client.status]
      : t.clients.statuses[client.status].toUpperCase();

  const speedText =
    client.downloadMbps || client.uploadMbps
      ? `↓ ${client.downloadMbps ?? '∞'} / ↑ ${client.uploadMbps ?? '∞'} Mbps`
      : t.common.unlimited;

  const confirmDialogConfig = (() => {
    if (!confirmModal) return null;
    if (confirmModal.kind === 'new_sub') {
      return {
        title: lang === 'fa' ? 'لینک اشتراک جدید' : 'New subscription link',
        body:
          lang === 'fa'
            ? 'لینک فعلی از کار می‌افتد. لینک جدید را برای کاربر ارسال کنید.'
            : 'The current link stops working. Send the new one to the client.',
        confirmLabel: lang === 'fa' ? 'لینک اشتراک جدید' : 'New subscription link',
        danger: false,
      };
    }
    if (confirmModal.kind === 'replace_cert') {
      return {
        title: lang === 'fa' ? 'جایگزینی گواهی' : 'Replace certificate',
        body:
          lang === 'fa'
            ? 'تمام پروفایل‌هایی که این کاربر قبلاً دانلود کرده از کار می‌افتند و باید دوباره دانلود شوند.'
            : 'Every profile this client downloaded before will stop working. They will need to download it again.',
        confirmLabel: lang === 'fa' ? 'جایگزینی گواهی' : 'Replace certificate',
        danger: true,
      };
    }
    if (confirmModal.kind === 'delete_client') {
      return {
        title: lang === 'fa' ? 'حذف کاربر' : 'Delete client',
        body:
          lang === 'fa'
            ? `کاربر ${client.name} حذف شود؟ گواهی او باطل شده و تمام پروفایل‌ها از کار می‌افتند.`
            : `Delete ${client.name}? Their certificate is revoked and every profile stops working.`,
        confirmLabel: t.common.delete,
        danger: true,
      };
    }
    if (confirmModal.kind === 'reset_wg') {
      return {
        title: lang === 'fa' ? 'ریست کلیدها' : 'Reset keys',
        body:
          lang === 'fa'
            ? 'این کار دستگاه را در تمام سرورها قطع می‌کند. پس از آن تنظیمات جدید را وارد کنید.'
            : 'This disconnects the device on all servers. Import a new configuration afterward.',
        confirmLabel: lang === 'fa' ? 'ریست کلیدها' : 'Reset keys',
        danger: true,
      };
    }
    return {
      title: lang === 'fa' ? 'کلید جدید' : 'New key',
      body:
        lang === 'fa'
          ? 'کلید جدیدی برای این کاربر ساخته می‌شود. تمام لینک‌های Xray فعلی تا زمان وارد کردن لینک جدید از کار می‌افتند.'
          : 'Creates a new key for this client. Every Xray link they have stops working until they import the new one.',
      confirmLabel: lang === 'fa' ? 'کلید جدید' : 'New key',
      danger: true,
    };
  })();

  return (
    <div className="page">
      <a
        href={toPanelUrl('/clients')}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          navigate('/clients');
        }}
        className="backlink"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t.nav.clients}
      </a>

      <PageHead
        docTitle={client.name}
        title={
          <span className="title-with-tag">
            <span dir="ltr">{client.name}</span>
            <StatusPill tone={statusTone(client.status)} label={statusLabel} />
          </span>
        }
        sub={
          <span>
            {client.lastOnlineAt
              ? `${lang === 'fa' ? 'آخرین اتصال' : 'Last online'} ${formatDateTime(client.lastOnlineAt, lang)}`
              : lang === 'fa'
                ? 'هرگز متصل نشده'
                : 'Never connected'}
            {' · '}
            {lang === 'fa' ? 'ایجاد' : 'Created'} {formatShortDate(client.createdAt, lang)}
            {client.ownerUsername ? ` · ${lang === 'fa' ? 'مالک' : 'Owner'}: ${client.ownerUsername}` : ''}
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setEditOpen(true)}
              disabled={busyAction}
            >
              {t.common.edit}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={openExtendModal}
              disabled={busyAction}
            >
              {t.overview.extend}
            </button>
            <ActionMenu
              label={lang === 'fa' ? 'بیشتر' : 'More'}
              trigger={<MoreHorizontal className="h-4 w-4" />}
              items={[
                {
                  label: client.enabled
                    ? lang === 'fa'
                      ? 'غیرفعال‌سازی'
                      : 'Disable'
                    : lang === 'fa'
                      ? 'فعال‌سازی'
                      : 'Enable',
                  disabled: busyAction,
                  onSelect: () => {
                    const nextEnabled = !client.enabled;
                    void runAction(
                      () =>
                        apiFetch(`/clients/${client.id}/${nextEnabled ? 'enable' : 'disable'}`, {
                          method: 'POST',
                        }),
                      nextEnabled
                        ? lang === 'fa'
                          ? `${client.name} فعال شد`
                          : `${client.name} enabled`
                        : lang === 'fa'
                          ? `${client.name} غیرفعال شد`
                          : `${client.name} disabled`,
                    );
                  },
                },
                {
                  label: t.clients.resetTraffic,
                  disabled: busyAction,
                  onSelect: () => {
                    void runAction(
                      () => apiFetch(`/clients/${client.id}/reset-traffic`, { method: 'POST' }),
                      lang === 'fa' ? 'ترافیک ریست شد' : 'Traffic reset',
                    );
                  },
                },
                {
                  label: lang === 'fa' ? 'لینک اشتراک جدید' : 'New subscription link',
                  disabled: busyAction,
                  onSelect: () => setConfirmModal({ kind: 'new_sub' }),
                },
                {
                  label: lang === 'fa' ? 'جایگزینی گواهی' : 'Replace certificate',
                  disabled: busyAction,
                  onSelect: () => setConfirmModal({ kind: 'replace_cert' }),
                },
                null,
                {
                  label: lang === 'fa' ? 'حذف کاربر' : 'Delete client',
                  danger: true,
                  disabled: busyAction,
                  onSelect: () => setConfirmModal({ kind: 'delete_client' }),
                },
              ]}
            />
          </>
        }
      />

      <div className="detail-grid">
        <div className="detail-main">
          {wgDevices.length > 0 && (
            <section className="panel">
              <header className="panel-head">
                <h2>{lang === 'fa' ? 'دستگاه‌های WireGuard' : 'WireGuard devices'}</h2>
              </header>
              {(client.deviceLimit === null || client.deviceLimit > 1) && (
                <div className="px-5.5 pb-2">
                  <p className="hint" style={{ margin: 0 }}>
                    {lang === 'fa'
                      ? 'نکته: هر فایل WireGuard در یک Inbound همزمان فقط روی ۱ دستگاه کار می‌کند؛ برای استفاده همزمان چند دستگاه از پروتکل‌های دیگر (مانند Xray یا OpenVPN) یا Inbound مجزا استفاده کنید.'
                      : 'Note: One WireGuard config runs on one device per inbound at a time; for concurrent devices use another inbound or protocol (e.g. Xray or OpenVPN).'}
                  </p>
                </div>
              )}
              <ul className="rows">
                {wgDevices.map((dev) => (
                  <li key={dev.slot} className="wg-device">
                    <div className="wg-device-top">
                      <div className="wg-device-meta">
                        <div className="wg-device-title">
                          <span>
                            {lang === 'fa' ? `دستگاه ${dev.slot}` : `Device ${dev.slot}`}
                            {' · '}
                            <span style={{ color: dev.online ? 'var(--good)' : 'var(--ink-2)' }}>
                              {dev.online
                                ? lang === 'fa'
                                  ? 'آنلاین'
                                  : 'Online'
                                : lang === 'fa'
                                  ? 'آفلاین'
                                  : 'Offline'}
                            </span>
                          </span>
                        </div>
                        <div className="wg-device-sub">
                          {lang === 'fa' ? 'آخرین هندشیک:' : 'Last handshake:'}{' '}
                          {dev.lastHandshakeAt
                            ? formatDateTime(dev.lastHandshakeAt, lang)
                            : lang === 'fa'
                              ? 'هندشیکی ثبت نشده'
                              : 'No handshake recorded'}
                        </div>
                        <div className="wg-device-sub num">
                          {lang === 'fa' ? 'آپلود' : 'Upload'} {formatBytes(dev.uploadBytes, lang)}
                          {' · '}
                          {lang === 'fa' ? 'دانلود' : 'Download'} {formatBytes(dev.downloadBytes, lang)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn danger sm"
                        disabled={busyAction}
                        onClick={() => setConfirmModal({ kind: 'reset_wg', slot: dev.slot })}
                      >
                        {lang === 'fa' ? 'ریست کلیدها' : 'Reset keys'}
                      </button>
                    </div>

                    {dev.inbounds.map((ib) => {
                      const qrKey = `${dev.slot}-${ib.id}`;
                      const qrOpen = Boolean(expandedWgQrs[qrKey]);
                      return (
                        <div key={ib.id} className="wg-inbound-block">
                          <div className="wg-inbound-name" dir="ltr">
                            {ib.name}
                          </div>
                          <div className="wg-inbound-actions">
                            <a
                              className="btn sm"
                              href={`${getApiBase()}/clients/${client.id}/wireguard/${dev.slot}/${ib.id}/config.conf`}
                              download={ib.filename}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {lang === 'fa' ? 'دانلود .conf' : 'Download .conf'}
                            </a>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => toggleWgQr(qrKey)}
                            >
                              {qrOpen
                                ? lang === 'fa'
                                  ? 'مخفی کردن QR'
                                  : 'Hide QR'
                                : lang === 'fa'
                                  ? 'نمایش QR'
                                  : 'Show QR'}
                            </button>
                          </div>
                          {qrOpen && (
                            <div className="wg-qr-box">
                              <QrCode value={ib.configText} size={172} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel plan-panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'اشتراک و پلن' : 'Plan'}</h2>
            </header>
            <div className="plan-body">
              <div className="plan-figure">
                {remainingBytes !== null && remainingParts ? (
                  <>
                    <span className="big num">{remainingParts.value}</span>
                    <span className="big-unit">
                      {remainingParts.unit} {lang === 'fa' ? 'باقی‌مانده' : 'left'}
                    </span>
                    <span className="muted num">
                      {formatBytes(client.trafficUsedBytes, lang)}{' '}
                      {lang === 'fa' ? 'مصرف‌شده · از' : 'used · of'}{' '}
                      {formatBytes(client.trafficLimitBytes, lang)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="big num">{usedParts.value}</span>
                    <span className="big-unit">
                      {usedParts.unit} {lang === 'fa' ? 'مصرف‌شده' : 'used'}
                    </span>
                    <span className="muted">{t.common.unlimited}</span>
                  </>
                )}
              </div>

              <div
                role="img"
                aria-label={
                  remainingBytes !== null
                    ? `${formatBytes(remainingBytes, lang)} ${lang === 'fa' ? 'باقی‌مانده' : 'left'}`
                    : `${formatBytes(client.trafficUsedBytes, lang)} ${lang === 'fa' ? 'مصرف‌شده' : 'used'}`
                }
              >
                <Lamps
                  used={client.trafficUsedBytes}
                  limit={client.trafficLimitBytes ?? 0}
                  count={24}
                  size="lg"
                />
              </div>

              <dl className="plan-facts">
                <div>
                  <dt>{t.clients.columns.ends}</dt>
                  <dd>{formatPlanEnds(client.expiresAt, client.firstConnectDays, lang)}</dd>
                </div>
                <div>
                  <dt>{lang === 'fa' ? 'دستگاه هم‌زمان' : 'Devices at once'}</dt>
                  <dd className="num">
                    {client.onlineCount} / {client.deviceLimit ?? '∞'}
                  </dd>
                </div>
                <div>
                  <dt>{lang === 'fa' ? 'سرعت هر دستگاه' : 'Speed per device'}</dt>
                  <dd className="num">{speedText}</dd>
                </div>
                <div>
                  <dt>{lang === 'fa' ? 'ترافیک کل' : 'All-time traffic'}</dt>
                  <dd className="num">
                    ↓ {formatBytes(allTimeDown, lang)} · ↑ {formatBytes(allTimeUp, lang)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'مصرف' : 'Usage'}</h2>
              <div className="ov-chart-tools">
                <div className="ov-legend">
                  <span>
                    <i className="sw down" />
                    {t.overview.download}
                  </span>
                  <span>
                    <i className="sw up" />
                    {t.overview.upload}
                  </span>
                </div>
                <Segmented
                  label={lang === 'fa' ? 'بازه مصرف' : 'Usage range'}
                  value={usageRange}
                  onChange={setUsageRange}
                  options={[
                    { value: '24h', label: lang === 'fa' ? '۲۴ ساعت' : '24 hours' },
                    { value: '7d', label: lang === 'fa' ? '۷ روز' : '7 days' },
                    { value: '30d', label: lang === 'fa' ? '۳۰ روز' : '30 days' },
                    { value: '90d', label: lang === 'fa' ? '۹۰ روز' : '90 days' },
                  ]}
                />
              </div>
            </header>
            <TrafficChart
              data={usagePoints}
              height={230}
              mode="bars"
              daily={usageRange !== '24h'}
            />
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'متصل الان' : 'Connected now'}</h2>
            </header>
            {live.length === 0 ? (
              <div className="pad">
                <p className="muted" style={{ margin: 0 }}>
                  {lang === 'fa' ? 'متصل نیست.' : 'Not connected.'}
                </p>
              </div>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{lang === 'fa' ? 'اینباند / نود' : 'Inbound / Node'}</th>
                      <th>{lang === 'fa' ? 'از آی‌پی' : 'From'}</th>
                      <th>{lang === 'fa' ? 'آی‌پی تانل' : 'Tunnel IP'}</th>
                      <th>{lang === 'fa' ? 'دستگاه' : 'Device'}</th>
                      <th className="text-end">{lang === 'fa' ? 'سرعت' : 'Rate'}</th>
                      <th className="col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {live.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="font-medium text-(--text-primary)">{s.inboundName}</div>
                          <div className="text-xs text-(--text-muted)">
                            {s.nodeName} · {s.protocol.toUpperCase()}
                          </div>
                        </td>
                        <td className="font-mono text-xs" dir="ltr">
                          {s.remoteIp}
                        </td>
                        <td className="font-mono text-xs" dir="ltr">
                          {s.tunnelIp || '—'}
                        </td>
                        <td className="text-xs">{s.device || '—'}</td>
                        <td className="text-end font-mono text-xs">
                          ↓ {formatSpeed(s.speedInBps)} / ↑ {formatSpeed(s.speedOutBps)}
                        </td>
                        <td className="col-actions">
                          <button
                            type="button"
                            className="btn ghost sm icon"
                            title={t.clients.disconnect}
                            aria-label={t.clients.disconnect}
                            onClick={() => void disconnectSession(s.id)}
                          >
                            <Unplug className="h-3.5 w-3.5 text-(--bad)" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'اتصالات اخیر' : 'Recent connections'}</h2>
            </header>
            {history.length === 0 ? (
              <div className="pad">
                <p className="muted" style={{ margin: 0 }}>
                  {lang === 'fa' ? 'هنوز اتصالی ثبت نشده است.' : 'No connection history recorded yet.'}
                </p>
              </div>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{lang === 'fa' ? 'متصل‌شده' : 'Connected'}</th>
                      <th>{lang === 'fa' ? 'مدت' : 'Duration'}</th>
                      <th>{lang === 'fa' ? 'مبدا' : 'From'}</th>
                      <th>{lang === 'fa' ? 'دستگاه' : 'Device'}</th>
                      <th className="text-end">{lang === 'fa' ? 'ترافیک' : 'Traffic'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((h) => (
                      <tr key={h.id}>
                        <td className="text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{formatDateTime(h.connectedAt, lang)}</span>
                            <span className="tag" style={{ height: 18, fontSize: 10 }}>
                              {h.protocol === 'xray' ? 'Xray' : h.protocol.toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td className="text-xs num">{formatDuration(h.durationSec, lang)}</td>
                        <td className="font-mono text-xs" dir="ltr">
                          {h.remoteIp}
                        </td>
                        <td className="text-xs">{h.device && h.device !== 'Unknown' ? h.device : '—'}</td>
                        <td className="text-end font-mono text-xs num">
                          {formatBytes(h.bytesTotal, lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="detail-side">
          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'ارسال به کاربر' : 'Send to the client'}</h2>
            </header>
            <div className="detail-panel-body">
              <p className="text-xs text-(--text-secondary)" style={{ margin: 0, lineHeight: 1.6 }}>
                {lang === 'fa'
                  ? 'این لینک صفحه‌ای با حجم باقی‌مانده، تاریخ پایان و پروفایل‌های آماده را باز می‌کند.'
                  : 'The link opens a page with their remaining traffic, end date and the profiles to import.'}
              </p>

              <div className="share-link">
                <code dir="ltr" title={subUrl}>
                  {subUrl}
                </code>
                <button type="button" className="btn ghost sm" onClick={handleCopySub}>
                  {copiedSub ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSub ? t.common.copied : t.common.copy}
                </button>
              </div>

              <div className="send-qr-row">
                <QrCode value={subUrl} size={136} />
                <a href={subUrl} target="_blank" rel="noreferrer" className="btn">
                  <ExternalLink className="h-4 w-4" />
                  {lang === 'fa' ? 'VPN شما' : 'Your VPN'}
                </a>
              </div>
            </div>
          </section>

          {xrayServers.length > 0 && (
            <section className="panel xr-client">
              <header className="panel-head">
                <h2>Xray</h2>
                <span className={xrayActive ? 'tag tag-online' : 'tag tag-pending'}>
                  {xrayActive ? (lang === 'fa' ? 'روشن' : 'ON') : lang === 'fa' ? 'متوقف' : 'PAUSED'}
                </span>
              </header>
              <div className="detail-panel-body">
                {!xrayActive && (
                  <div className="banner warn" style={{ fontSize: 'var(--t-sm)' }}>
                    {!client.enabled
                      ? lang === 'fa'
                        ? 'این کاربر غیرفعال است، بنابراین سرورهای Xray اجازه اتصال نمی‌دهند.'
                        : 'The client is Disabled, so the Xray servers do not let them in.'
                      : client.status === 'expired'
                        ? lang === 'fa'
                          ? 'اشتراک این کاربر منقضی شده است، بنابراین سرورهای Xray اجازه اتصال نمی‌دهند.'
                          : 'The client is Expired, so the Xray servers do not let them in.'
                        : lang === 'fa'
                          ? 'حجم این کاربر تمام شده است، بنابراین سرورهای Xray اجازه اتصال نمی‌دهند.'
                          : 'The client has used up their traffic, so the Xray servers do not let them in.'}
                  </div>
                )}

                <p className="text-xs text-(--text-secondary)" style={{ margin: 0, lineHeight: 1.6 }}>
                  {lang === 'fa'
                    ? 'لینک اشتراک بالا همه این سرورها را هم‌زمان به برنامه اضافه می‌کند. لینک‌های زیر برای هر سرور به‌صورت جداگانه است.'
                    : 'The subscription link above adds all of these servers to an app at once. The links below are for one server each.'}
                </p>

                {xrayServers.map((srv) => {
                  const link = srv.links[0] || '';
                  const qrOpen = Boolean(expandedXrayQrs[srv.key]);
                  const titleText = srv.label ? `${srv.label} - ${srv.node}` : srv.name;
                  return (
                    <div key={srv.key} className="xr-server">
                      <div className="xr-server-head">
                        <h3>{titleText}</h3>
                        <span className="xr-server-addr" dir="ltr">
                          {srv.host}:{srv.port}
                        </span>
                      </div>

                      <div className="xr-tags">
                        <span className="tag">{srv.protocol.toUpperCase()}</span>
                        <span className="tag">{formatXrayTransport(srv.transport)}</span>
                        <span className="tag">{formatXraySecurity(srv.security)}</span>
                      </div>

                      <div className="xr-link-box">
                        <span className="xr-link-label">{lang === 'fa' ? 'لینک' : 'Link'}</span>
                        <span className="xr-link-mask" aria-hidden="true">
                          ••••••••••••
                        </span>
                        <button
                          type="button"
                          className="btn ghost sm icon"
                          aria-label={t.common.copy}
                          title={t.common.copy}
                          onClick={() => void handleCopyXray(srv)}
                        >
                          {copiedXrayKey === srv.key ? (
                            <Check className="h-3.5 w-3.5 text-(--good)" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn w-full"
                        onClick={() => toggleXrayQr(srv.key)}
                      >
                        <QrCodeIcon className="h-4 w-4" />
                        {qrOpen
                          ? lang === 'fa'
                            ? 'مخفی کردن کد QR'
                            : 'Hide QR code'
                          : lang === 'fa'
                            ? 'نمایش کد QR'
                            : 'Show QR code'}
                      </button>

                      {qrOpen && (
                        <div className="flex justify-center pt-1">
                          <QrCode value={link} size={184} />
                        </div>
                      )}
                    </div>
                  );
                })}

                <dl className="xr-counters">
                  <div>
                    <dt>{lang === 'fa' ? 'دستگاه هم‌زمان' : 'Devices at once'}</dt>
                    <dd className="num">
                      {xrayDeviceCount} / {client.deviceLimit ?? '∞'}
                    </dd>
                  </div>
                  <div>
                    <dt>{lang === 'fa' ? 'اتصالات باز' : 'Open connections'}</dt>
                    <dd className="num">{xrayOpenConnections}</dd>
                  </div>
                </dl>

                <p className="xr-explain">
                  {lang === 'fa'
                    ? 'نحوه شمارش دستگاه‌ها: هر آی‌پی متفاوتی که در ۹۰ ثانیه اخیر فعال بوده به‌عنوان یک دستگاه شمارش می‌شود. چند دستگاه پشت یک مودم یک دستگاه حساب می‌شوند. گوشی‌ای که آی‌پی عوض کند تا ۹۰ ثانیه آدرس قبلی‌اش در شمارش می‌ماند.'
                    : 'How devices are counted: every different IP address that was active in the last 90 seconds counts as one device. Several devices behind the same router count as one. A phone that changes IP keeps its old address counted for up to 90 seconds.'}
                </p>

                <button
                  type="button"
                  className="btn ghost sm w-fit"
                  disabled={busyAction}
                  onClick={() => setConfirmModal({ kind: 'new_xray_key' })}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {lang === 'fa' ? 'کلید جدید' : 'New key'}
                </button>
              </div>
            </section>
          )}

          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'جزئیات' : 'Details'}</h2>
            </header>
            <div className="detail-panel-body">
              <dl className="details-kv">
                {client.certSerial && (
                  <div className="details-kv-item">
                    <dt className="details-kv-label">{lang === 'fa' ? 'گواهی' : 'Certificate'}</dt>
                    <dd className="cert-serial" dir="ltr" style={{ margin: 0 }}>
                      {client.certSerial}
                    </dd>
                    {client.certExpiresAt && (
                      <dd className="text-xs text-(--text-muted)" style={{ margin: 0 }}>
                        {lang === 'fa' ? 'معتبر تا' : 'Valid until'}{' '}
                        {formatShortDate(client.certExpiresAt, lang)}
                      </dd>
                    )}
                  </div>
                )}

                {client.resetPeriod && client.resetPeriod !== 'never' && (
                  <div className="details-kv-item">
                    <dt className="details-kv-label">{t.clients.resetPeriod}</dt>
                    <dd className="details-kv-val capitalize" style={{ margin: 0 }}>
                      {client.resetPeriod.replace(/_/g, ' ')}
                    </dd>
                  </div>
                )}

                {client.fixedIp && (
                  <div className="details-kv-item">
                    <dt className="details-kv-label">{t.clients.fixedIp}</dt>
                    <dd className="details-kv-val font-mono" dir="ltr" style={{ margin: 0 }}>
                      {client.fixedIp}
                    </dd>
                  </div>
                )}

                {client.groups.length > 0 && (
                  <div className="details-kv-item">
                    <dt className="details-kv-label">{t.nav.groups}</dt>
                    <dd className="details-kv-val" style={{ margin: 0 }}>
                      {client.groups.map((g) => g.name).join(', ')}
                    </dd>
                  </div>
                )}

                {(client.contact || client.note) && (
                  <div className="details-kv-item">
                    <dt className="details-kv-label">
                      {lang === 'fa' ? 'تماس / یادداشت' : 'Contact / Note'}
                    </dt>
                    <dd className="details-kv-val" style={{ margin: 0 }}>
                      {[client.contact, client.note].filter(Boolean).join(' · ')}
                    </dd>
                  </div>
                )}
              </dl>

              {otherProfileInbounds.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-(--line)">
                  <div className="details-kv-label">
                    {lang === 'fa' ? 'پروفایل‌های دیگر' : 'Other tunnel profiles'}
                  </div>
                  {otherProfileInbounds.map((ib) => (
                    <a
                      key={ib.id}
                      href={`${getApiBase()}/clients/${client.id}/profile?inboundId=${ib.id}`}
                      download
                      className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs hover:border-(--accent)/50"
                    >
                      <div>
                        <div className="font-semibold text-(--text-primary)">{ib.name}</div>
                        <div className="text-[11px] text-(--text-muted)">
                          {ib.protocol.toUpperCase()} · {ib.transport.toUpperCase()}/{ib.port}
                        </div>
                      </div>
                      <Download className="h-4 w-4 text-(--accent-text)" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <ClientFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        client={client}
        groups={groups}
        inbounds={inbounds}
        onSaved={async () => {
          await load();
          showToast(lang === 'fa' ? 'تغییرات ذخیره شد' : 'Changes saved');
        }}
      />

      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title={lang === 'fa' ? `تمدید ${client.name}` : `Extend ${client.name}`}
        size="sm"
      >
        <form onSubmit={submitExtend} className="space-y-4">
          <div className="field">
            <label className="label">{t.clients.extendDays}</label>
            <div className="input-group">
              <input
                className="input"
                type="number"
                min="0"
                value={extDays}
                onChange={(e) => setExtDays(e.target.value)}
              />
              <span className="suffix">{lang === 'fa' ? 'روز' : 'days'}</span>
            </div>
            <div className="chips">
              {EXTEND_DAY_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={extDays === d}
                  onClick={() => setExtDays(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">{lang === 'fa' ? 'افزودن حجم' : 'Add traffic'}</label>
            <div className="input-group">
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                disabled={client.trafficLimitBytes === null}
                placeholder={client.trafficLimitBytes === null ? t.common.unlimited : '0'}
                value={extGb}
                onChange={(e) => setExtGb(e.target.value)}
              />
              <span className="suffix">GB</span>
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={extResetUsed}
              onChange={(e) => setExtResetUsed(e.target.checked)}
            />
            <span className="track" />
            <span className="sw-text">
              {lang === 'fa'
                ? 'صفر کردن حجم مصرف‌شده فعلی'
                : 'Also reset used traffic to zero'}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={() => setExtendOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={busyAction}>
              {t.overview.extend}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDialogConfig)}
        onClose={() => setConfirmModal(null)}
        title={confirmDialogConfig?.title || ''}
        size="sm"
      >
        {confirmDialogConfig && (
          <div className="space-y-5">
            <p className="text-sm text-(--text-secondary)" style={{ margin: 0, lineHeight: 1.6 }}>
              {confirmDialogConfig.body}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmModal(null)}
                disabled={busyAction}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                className={`btn ${confirmDialogConfig.danger ? 'danger-solid' : 'primary'}`}
                onClick={() => void handleConfirmAction()}
                disabled={busyAction}
              >
                {confirmDialogConfig.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <div aria-live="polite">
        {toast ? <div className={`xp-toast${toast.isError ? ' error' : ''}`}>{toast.msg}</div> : null}
      </div>
    </div>
  );
}
