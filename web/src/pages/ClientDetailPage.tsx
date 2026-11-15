import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { apiFetch, getApiBase } from '../lib/api';
import { formatBytes, formatDateTime, formatDaysLeft, formatDuration, formatSpeed } from '../lib/format';
import { getSubPath, navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EqLoader, Input, Lamps, PageHead, Select, StatusPill } from '../components/UiPrimitives';
import { Drawer } from '../components/Drawer';
import { QrCode } from '../components/QrCode';
import type { ClientItem } from './ClientsPage';

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
  nodeName: string;
  enabled: boolean;
}

interface GroupSummary {
  id: number;
  name: string;
  allInbounds: boolean;
  inboundIds: number[];
}

export function ClientDetailPage({ clientId }: { clientId: number }) {
  const { t, lang } = useUi();
  const [client, setClient] = useState<ClientItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [history, setHistory] = useState<HistSession[]>([]);
  const [inbounds, setInbounds] = useState<InboundSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  // Edit drawer
  const [editOpen, setEditOpen] = useState(false);
  const [trafficGb, setTrafficGb] = useState('');
  const [deviceLimit, setDeviceLimit] = useState('');
  const [resetPeriod, setResetPeriod] = useState<'never' | 'daily' | 'weekly' | 'monthly'>('never');
  const [fixedIp, setFixedIp] = useState('');
  const [vpnPassword, setVpnPassword] = useState('');
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    try {
      const [cRes, lRes, hRes, iRes, gRes] = await Promise.all([
        apiFetch<{ clients: ClientItem[] }>('/clients'),
        apiFetch<{ connections: LiveSession[] }>('/connections/live').catch(() => ({ connections: [] })),
        apiFetch<{ history: HistSession[] }>('/connections/history').catch(() => ({ history: [] })),
        apiFetch<{ inbounds: InboundSummary[] }>('/inbounds').catch(() => ({ inbounds: [] })),
        apiFetch<{ groups: GroupSummary[] }>('/groups').catch(() => ({ groups: [] })),
      ]);
      const found = cRes.clients.find((c) => c.id === clientId);
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
    } catch {
      setNotFound(true);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const openEdit = () => {
    if (!client) return;
    setTrafficGb(client.trafficLimitBytes ? String(Math.round(client.trafficLimitBytes / 1024 ** 3)) : '');
    setDeviceLimit(client.deviceLimit ? String(client.deviceLimit) : '');
    setResetPeriod(client.resetPeriod);
    setFixedIp(client.fixedIp);
    setVpnPassword(client.vpnPassword || '');
    setNote(client.note);
    setContact(client.contact);
    setEnabled(client.enabled);
    setSelectedGroupIds(client.groups.map((g) => g.id));
    setEditError('');
    setEditOpen(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setEditError('');
    try {
      await apiFetch(`/clients/${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          trafficGb: trafficGb ? Number(trafficGb) : null,
          deviceLimit: deviceLimit ? Number(deviceLimit) : null,
          resetPeriod,
          fixedIp,
          vpnPassword: vpnPassword.trim() || undefined,
          note,
          contact,
          enabled,
          groupIds: selectedGroupIds,
        }),
      });
      setEditOpen(false);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Update failed');
    }
  };

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
          {lang === 'fa' ? 'بازگشت به کاربران' : 'All clients'}
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

  const statusTone = (s: ClientItem['status']) => {
    if (s === 'online') return 'lime';
    if (s === 'active') return 'green';
    if (s === 'not_started') return 'blue';
    if (s === 'used_up' || s === 'expired') return 'red';
    return 'gray';
  };

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusyAction(true);
    try {
      await fn();
      await load();
    } finally {
      setBusyAction(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(subUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return;
    await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
    navigate('/clients');
  };

  const disconnectSession = async (sessionId: string) => {
    await apiFetch(`/connections/${sessionId}/disconnect`, { method: 'POST' });
    await load();
  };

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
        {lang === 'fa' ? 'همه کاربران' : 'All clients'}
      </a>

      <PageHead
        title={
          <span className="title-with-tag">
            <span dir="ltr">{client.name}</span>
            <StatusPill tone={statusTone(client.status)} label={t.clients.statuses[client.status]} />
          </span>
        }
        sub={
          <span>
            {client.lastOnlineAt
              ? `${lang === 'fa' ? 'آخرین اتصال' : 'Last online'}: ${formatDateTime(client.lastOnlineAt, lang)}`
              : lang === 'fa'
                ? 'هرگز متصل نشده'
                : 'Never connected'}
            {' · '}
            {lang === 'fa' ? 'ساخته‌شده' : 'Created'}: {formatDateTime(client.createdAt, lang)}
            {client.ownerUsername ? ` · ${lang === 'fa' ? 'مالک' : 'Owner'}: ${client.ownerUsername}` : ''}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={openEdit} disabled={busyAction}>
              {t.common.edit}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busyAction}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/clients/${client.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ addDays: 30 }),
                  }),
                )
              }
            >
              +30d
            </Button>
            <Button
              size="sm"
              disabled={busyAction}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/clients/${client.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: !client.enabled }),
                  }),
                )
              }
            >
              {client.enabled ? (lang === 'fa' ? 'غیرفعال' : 'Disable') : lang === 'fa' ? 'فعال' : 'Enable'}
            </Button>
            <Button
              size="sm"
              disabled={busyAction}
              onClick={() => runAction(() => apiFetch(`/clients/${client.id}/reset-traffic`, { method: 'POST' }))}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.clients.resetTraffic}
            </Button>
            <Button size="sm" variant="danger" disabled={busyAction} onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              {t.common.delete}
            </Button>
          </>
        }
      />

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel plan-panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'اشتراک و حجم' : 'Plan & quota'}</h2>
            </header>
            <div className="plan-body">
              <div className="plan-figure">
                {remainingBytes !== null ? (
                  <>
                    <span className="big num">{formatBytes(remainingBytes, lang)}</span>
                    <span className="big-unit">{lang === 'fa' ? 'باقی‌مانده' : 'remaining'}</span>
                    <span className="muted num">
                      {formatBytes(client.trafficUsedBytes, lang)} {lang === 'fa' ? 'مصرف‌شده از' : 'used of'}{' '}
                      {formatBytes(client.trafficLimitBytes, lang)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="big num">{formatBytes(client.trafficUsedBytes, lang)}</span>
                    <span className="big-unit">{lang === 'fa' ? 'مصرف‌شده' : 'used'}</span>
                    <span className="muted">{t.common.unlimited}</span>
                  </>
                )}
              </div>

              <Lamps used={client.trafficUsedBytes} limit={client.trafficLimitBytes ?? 0} count={24} size="lg" />

              <dl className="plan-facts">
                <div>
                  <dt>{t.clients.columns.ends}</dt>
                  <dd>{formatDaysLeft(client.expiresAt, client.firstConnectDays, lang)}</dd>
                </div>
                <div>
                  <dt>{t.clients.deviceLimit}</dt>
                  <dd className="num">
                    {client.onlineCount} / {client.deviceLimit ?? '∞'}
                  </dd>
                </div>
                <div>
                  <dt>{t.clients.resetPeriod}</dt>
                  <dd className="capitalize">{client.resetPeriod}</dd>
                </div>
                <div>
                  <dt>{lang === 'fa' ? 'مصرف کل (آپلود / دانلود)' : 'Total up / down'}</dt>
                  <dd className="num">
                    ↓ {formatBytes(client.downloadBytes ?? 0, lang)} · ↑ {formatBytes(client.uploadBytes ?? 0, lang)}
                  </dd>
                </div>
                {client.fixedIp ? (
                  <div>
                    <dt>{t.clients.fixedIp}</dt>
                    <dd className="font-mono" dir="ltr">
                      {client.fixedIp}
                    </dd>
                  </div>
                ) : null}
                {client.groups.length > 0 ? (
                  <div>
                    <dt>{t.nav.groups}</dt>
                    <dd>{client.groups.map((g) => g.name).join(', ')}</dd>
                  </div>
                ) : null}
                {client.note || client.contact ? (
                  <div>
                    <dt>{lang === 'fa' ? 'یادداشت / تماس' : 'Note / contact'}</dt>
                    <dd>{[client.contact, client.note].filter(Boolean).join(' · ')}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>
                {lang === 'fa' ? 'نشست‌های فعال' : 'Live sessions'} ({live.length})
              </h2>
            </header>
            {live.length === 0 ? (
              <p className="py-4 text-xs text-(--text-muted)">
                {lang === 'fa' ? 'در حال حاضر نشست فعالی ندارد.' : 'No active connections right now.'}
              </p>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{lang === 'fa' ? 'اینباند / نود' : 'Inbound / Node'}</th>
                      <th>{lang === 'fa' ? 'آی‌پی مبدا' : 'Remote IP'}</th>
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
                          {s.tunnelIp}
                        </td>
                        <td className="text-xs">{s.device}</td>
                        <td className="text-end font-mono text-xs">
                          ↓ {formatSpeed(s.speedInBps)} / ↑ {formatSpeed(s.speedOutBps)}
                        </td>
                        <td className="col-actions">
                          <Button size="sm" variant="ghost" onClick={() => void disconnectSession(s.id)}>
                            <Unplug className="h-3.5 w-3.5 text-red-400" />
                          </Button>
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
              <h2>{lang === 'fa' ? 'تاریخچه اتصالات' : 'Connection history'}</h2>
            </header>
            {history.length === 0 ? (
              <p className="py-4 text-xs text-(--text-muted)">
                {lang === 'fa' ? 'تاریخچه‌ای ثبت نشده است.' : 'No connection history recorded yet.'}
              </p>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{lang === 'fa' ? 'زمان' : 'Connected'}</th>
                      <th>{lang === 'fa' ? 'مدت' : 'Duration'}</th>
                      <th>{lang === 'fa' ? 'مبدا' : 'Remote IP'}</th>
                      <th>{lang === 'fa' ? 'اینباند' : 'Inbound'}</th>
                      <th className="text-end">{lang === 'fa' ? 'ترافیک' : 'Traffic'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((h) => (
                      <tr key={h.id}>
                        <td className="text-xs">{formatDateTime(h.connectedAt, lang)}</td>
                        <td className="text-xs">{formatDuration(h.durationSec, lang)}</td>
                        <td className="font-mono text-xs" dir="ltr">
                          {h.remoteIp}
                        </td>
                        <td className="text-xs">
                          {h.inboundName} · {h.protocol.toUpperCase()}
                        </td>
                        <td className="text-end font-mono text-xs">{formatBytes(h.bytesTotal, lang)}</td>
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
              <h2>{t.clients.subLink}</h2>
              <Button
                size="sm"
                variant="ghost"
                disabled={busyAction}
                onClick={() => {
                  if (!confirm(lang === 'fa' ? 'لینک اشتراک قبلی باطل می‌شود. ادامه؟' : 'Rotate subscription token?')) {
                    return;
                  }
                  void runAction(() => apiFetch(`/clients/${client.id}/regenerate-sub`, { method: 'POST' }));
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {lang === 'fa' ? 'تعویض لینک' : 'Rotate'}
              </Button>
            </header>

            <div className="space-y-4">
              <p className="text-xs text-(--text-secondary)">
                {lang === 'fa'
                  ? 'این لینک را برای کاربر ارسال کنید تا به صفحه اشتراک و دانلود پروفایل‌ها دسترسی داشته باشد.'
                  : 'Share this URL with the user so they can open their subscription page and import configs.'}
              </p>

              <div className="share-link">
                <code dir="ltr">{subUrl}</code>
                <Button size="sm" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? t.common.copied : t.common.copy}
                </Button>
              </div>

              <div className="qr-row">
                <QrCode value={subUrl} size={148} />
                <a
                  href={subUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-(--accent) px-3.5 py-2 text-xs font-semibold text-(--accent-fg)"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {lang === 'fa' ? 'باز کردن صفحه اشتراک' : 'Open subscription page'}
                </a>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>{lang === 'fa' ? 'پروفایل‌های آماده دانلود' : 'Direct config profiles'}</h2>
            </header>
            {assignedInbounds.length === 0 ? (
              <p className="text-xs text-(--text-muted)">
                {lang === 'fa'
                  ? 'هیچ اینباندی از طریق گروه یا مستقیم به این کاربر اختصاص نیافته است.'
                  : 'No active inbounds assigned to this client.'}
              </p>
            ) : (
              <div className="space-y-2">
                {assignedInbounds.map((ib) => (
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
          </section>
        </aside>
      </div>

      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title={`${t.common.edit}: ${client.name}`} widthClass="max-w-lg">
        <form onSubmit={saveEdit} className="space-y-4">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={lang === 'fa' ? 'رمزعبور VPN' : 'VPN password'}
              value={vpnPassword}
              onChange={(e) => setVpnPassword(e.target.value)}
            />
            <Input label={t.clients.fixedIp} value={fixedIp} onChange={(e) => setFixedIp(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t.clients.contact} value={contact} onChange={(e) => setContact(e.target.value)} />
            <Input label={t.common.note} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

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

          <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs cursor-pointer">
            <span>{lang === 'fa' ? 'حساب کاربر فعال باشد' : 'Enabled'}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded accent-(--accent)"
            />
          </label>

          {editError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {editError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setEditOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.common.save}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
