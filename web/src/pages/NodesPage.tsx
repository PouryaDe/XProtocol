import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  DownloadCloud,
  Link2,
  Plus,
  Search,
  Server,
  Terminal,
  Trash2,
  Unlink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { formatBytes, formatDuration } from '../lib/format';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EmptySonar, Input, PageHead, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';

interface NodeUptimeDay {
  day: string;
  up: number;
  down: number;
  unknown: number;
  pct: number | null;
}

interface NodeUptimeSummary {
  days: NodeUptimeDay[];
  pct: number | null;
  pct24: number | null;
  pct30: number | null;
}

interface HealthPoint {
  t: number;
  up: number;
  cpu: number | null;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  upload: number;
  download: number;
  clients: number;
}

interface NodeItem {
  id: number;
  isLocal: boolean;
  name: string;
  address: string;
  port: number;
  multiplier: number;
  connectAddresses: string[];
  note: string;
  enabled: boolean;
  status: string;
  cpuPct: number;
  memPct: number;
  uptimeSec: number;
  realTrafficBytes: number;
  xprotocolVersion: string;
  openvpnVersion: string;
  wireguardReady: boolean;
  openconnectVersion: string;
  xrayReady?: boolean;
  uptime?: NodeUptimeSummary;
  allowFrom?: string[];
  onlineCount: number;
  inbounds: { id: number; name: string; protocol: string; port: number; running: boolean }[];
}

interface UnattachedInbound {
  id: number;
  name: string;
  protocol: string;
  port: number;
  nodeId: number | null;
}

interface ProtocolRow {
  protocol: string;
  installed: boolean;
  version: string;
}

export function NodesPage() {
  const { t, lang } = useUi();
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [allInbounds, setAllInbounds] = useState<UnattachedInbound[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'connected' | 'attention' | 'disabled'>('all');
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectStep, setConnectStep] = useState<1 | 2 | 3>(1);
  const [editing, setEditing] = useState<NodeItem | null>(null);
  const [attachNodeId, setAttachNodeId] = useState<number | null>(null);
  const [attachInboundId, setAttachInboundId] = useState<string>('');

  // Node detail drawer state
  const [detailNode, setDetailNode] = useState<NodeItem | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'health' | 'protocols' | 'inbounds' | 'addresses' | 'security'>('overview');
  const [healthRange, setHealthRange] = useState<'24h' | '7d' | '30d' | '90d'>('24h');
  const [healthSeries, setHealthSeries] = useState<{ points: HealthPoint[]; uptime: NodeUptimeSummary } | null>(null);
  const [allowFromText, setAllowFromText] = useState('');
  const [panelIpHint, setPanelIpHint] = useState('');
  const [securityMsg, setSecurityMsg] = useState('');
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [protoLoading, setProtoLoading] = useState(false);
  const [installingProto, setInstallingProto] = useState<string | null>(null);
  const [installLog, setInstallLog] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('62060');
  const [nodeKey, setNodeKey] = useState('');
  const [multiplier, setMultiplier] = useState('1');
  const [connectAddresses, setConnectAddresses] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    const [nRes, iRes] = await Promise.all([
      apiFetch<{ nodes: NodeItem[] }>('/nodes'),
      apiFetch<{ inbounds: UnattachedInbound[] }>('/inbounds'),
    ]);
    setNodes(nRes.nodes);
    setAllInbounds(iRes.inbounds);
    if (detailNode) {
      const updated = nRes.nodes.find((n) => n.id === detailNode.id);
      if (updated) setDetailNode(updated);
    }
  };

  useEffect(() => {
    load();
    if (window.location.search.includes('connect=1')) {
      openCreate();
    }
  }, []);

  const loadHealth = async (id: number, range: string) => {
    const res = await apiFetch<{ points: HealthPoint[]; uptime: NodeUptimeSummary }>(`/nodes/${id}/health?range=${range}`).catch(() => null);
    if (res) setHealthSeries(res);
  };

  const loadAllowFrom = async (id: number) => {
    const res = await apiFetch<{ allowFrom: string[]; panelIp?: string }>(`/nodes/${id}/allow-from`).catch(() => null);
    if (res) {
      setAllowFromText((res.allowFrom || []).join('\n'));
      setPanelIpHint(res.panelIp || '');
    }
  };

  const loadProtocols = async (id: number) => {
    setProtoLoading(true);
    setInstallLog('');
    try {
      const res = await apiFetch<{ protocols: ProtocolRow[] }>(`/nodes/${id}/protocols`);
      setProtocols(res.protocols);
    } finally {
      setProtoLoading(false);
    }
  };

  const openDetails = (n: NodeItem, initialTab: 'overview' | 'health' | 'protocols' | 'inbounds' | 'addresses' | 'security' = 'overview') => {
    setDetailNode(n);
    setDetailTab(initialTab);
    setInstallLog('');
    setSecurityMsg('');
    loadProtocols(n.id);
    loadHealth(n.id, healthRange);
    loadAllowFrom(n.id);
  };

  const installProtocol = async (protocol: string) => {
    if (!detailNode) return;
    setInstallingProto(protocol);
    setInstallLog('');
    try {
      const res = await apiFetch<{ ok: boolean; log: string }>(`/nodes/${detailNode.id}/protocols/install`, {
        method: 'POST',
        body: JSON.stringify({ protocol }),
      });
      setInstallLog(res.log || (res.ok ? 'Installed cleanly' : 'Install failed'));
      await loadProtocols(detailNode.id);
      await load();
    } catch (err) {
      setInstallLog(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstallingProto(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setConnectStep(1);
    setName('');
    setAddress('');
    setPort('62060');
    setNodeKey('');
    setMultiplier('1');
    setConnectAddresses('');
    setNote('');
    setConnectOpen(true);
  };

  const openEdit = (n: NodeItem) => {
    setEditing(n);
    setConnectStep(1);
    setName(n.name);
    setAddress(n.address);
    setPort(String(n.port));
    setNodeKey('');
    setMultiplier(String(n.multiplier));
    setConnectAddresses(n.connectAddresses.join(', '));
    setNote(n.note);
    setConnectOpen(true);
  };

  const saveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      address,
      port: Number(port),
      nodeKey: nodeKey || undefined,
      multiplier: Number(multiplier || 1),
      connectAddresses: connectAddresses
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      note,
    };
    if (editing) {
      await apiFetch(`/nodes/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/nodes', { method: 'POST', body: JSON.stringify(payload) });
    }
    setConnectOpen(false);
    load();
  };

  const attachInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachNodeId || !attachInboundId) return;
    await apiFetch(`/nodes/${attachNodeId}/attach`, {
      method: 'POST',
      body: JSON.stringify({ inboundId: Number(attachInboundId) }),
    });
    setAttachNodeId(null);
    load();
  };

  const unattached = allInbounds.filter((i) => !i.nodeId);

  const summary = useMemo(() => {
    const connected = nodes.filter((n) => n.status === 'connected').length;
    const attention = nodes.filter((n) => n.enabled && n.status !== 'connected').length;
    const onlineNow = nodes.reduce((s, n) => s + (n.onlineCount || 0), 0);
    return { total: nodes.length, connected, attention, onlineNow };
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = nodeSearchQuery.trim().toLowerCase();
    return nodes
      .filter((n) => {
        if (filterTab === 'connected' && n.status !== 'connected') return false;
        if (filterTab === 'attention' && !(n.enabled && n.status !== 'connected')) return false;
        if (filterTab === 'disabled' && !(!n.enabled || n.status === 'disabled')) return false;
        if (q) {
          return `${n.name} ${n.address} ${n.note} ${n.connectAddresses.join(' ')}`.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
  }, [nodes, filterTab, nodeSearchQuery]);

  const nodeInstallCmd = `bash <(curl -fsSL ${window.location.origin}/install-node.sh) --port ${port || '62060'} --name "${name || 'eu-node'}" --panel-ip ${window.location.hostname}`;

  const hasRemoteNodes = nodes.some((n) => !n.isLocal);

  return (
    <div className="page nodes-page">
      <PageHead
        title={t.nodes.title}
        sub={
          lang === 'fa'
            ? 'سرورهای خود را پایش کنید، سلامت آن‌ها را ببینید و اینباندها را یک‌جا مدیریت کنید.'
            : 'Monitor your servers, check their health and manage inbounds in one place.'
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {lang === 'fa' ? 'اتصال نود' : 'Connect a node'}
          </Button>
        }
      />

      <dl className="nd-strip">
        <div>
          <dt>{lang === 'fa' ? 'کل نودها' : 'Total nodes'}</dt>
          <dd className="num">{summary.total}</dd>
        </div>
        <div>
          <dt>
            <span className="dot ok" aria-hidden="true" />
            {t.nodes.connected}
          </dt>
          <dd className="num">{summary.connected}</dd>
        </div>
        <div className={summary.attention ? 'has-warning' : undefined}>
          <dt>
            <span className={`dot ${summary.attention ? 'warn' : 'off'}`} aria-hidden="true" />
            {lang === 'fa' ? 'نیازمند توجه' : 'Needs attention'}
          </dt>
          <dd className="num">{summary.attention}</dd>
        </div>
        <div>
          <dt>{t.overview.onlineNow}</dt>
          <dd className="num">{summary.onlineNow}</dd>
        </div>
      </dl>

      <div className="nd-toolbar">
        <div className="nd-filters" role="group" aria-label={t.nodes.title}>
          {([
            { id: 'all', label: t.common.all, count: nodes.length },
            { id: 'connected', label: t.nodes.connected, count: summary.connected },
            { id: 'attention', label: lang === 'fa' ? 'نیازمند توجه' : 'Needs attention', count: summary.attention },
            {
              id: 'disabled',
              label: lang === 'fa' ? 'غیرفعال' : 'Disabled',
              count: nodes.filter((n) => !n.enabled || n.status === 'disabled').length,
            },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filterTab === tab.id}
              onClick={() => setFilterTab(tab.id)}
            >
              {tab.label}
              <span className="num">{tab.count}</span>
            </button>
          ))}
        </div>

        <label className="nd-search">
          <Search aria-hidden="true" />
          <input
            className="input"
            type="search"
            value={nodeSearchQuery}
            onChange={(e) => setNodeSearchQuery(e.target.value)}
            placeholder={lang === 'fa' ? 'جستجوی نام یا نشانی…' : 'Search name or address…'}
          />
        </label>
      </div>

      {filteredNodes.length === 0 ? (
        <div className="cert-empty-box">
          <EmptySonar text={lang === 'fa' ? 'نودی با این مشخصات یافت نشد' : 'No nodes match your search or filter.'} />
        </div>
      ) : (
        <ul className="nd-rows">
          {filteredNodes.map((n) => {
            const dotTone = n.status === 'connected' ? 'ok' : n.enabled ? 'warn' : 'off';
            const stateLabel = n.isLocal
              ? lang === 'fa'
                ? 'پنل + نود'
                : 'Panel + node'
              : !n.enabled || n.status === 'disabled'
                ? lang === 'fa'
                  ? 'غیرفعال'
                  : 'Disabled'
                : n.status === 'connected'
                  ? t.nodes.connected
                  : lang === 'fa'
                    ? 'آفلاین'
                    : 'Unreachable';
            const protos = Array.from(
              new Set([
                ...(n.openvpnVersion && n.openvpnVersion !== 'missing' ? ['OPENVPN'] : []),
                ...(n.openconnectVersion && n.openconnectVersion !== 'missing' ? ['OPENCONNECT'] : []),
                ...(n.wireguardReady ? ['WIREGUARD'] : []),
                ...n.inbounds.map((ib) => ib.protocol.toUpperCase()),
              ]),
            );
            const verText = n.xprotocolVersion
              ? n.xprotocolVersion.startsWith('v')
                ? n.xprotocolVersion
                : `v${n.xprotocolVersion}`
              : 'v1.0.4';

            return (
              <li
                key={n.id}
                className={`nd-row ${n.status !== 'connected' && n.enabled ? 'is-down' : ''} ${n.isLocal ? 'is-local' : ''}`}
              >
                <span className={`dot ${dotTone}`} aria-hidden="true" />
                <div className="nr-main">
                  <div className="nr-line">
                    <button type="button" className="nr-open" onClick={() => openDetails(n, 'overview')}>
                      <span className="nr-name" dir="auto">
                        {n.isLocal && (n.name === 'Main server' || n.name === 'localhost')
                          ? lang === 'fa'
                            ? 'این سرور'
                            : 'This server'
                          : n.name}
                      </span>
                    </button>
                    <span className={`nc-state ${dotTone}`}>{stateLabel}</span>
                    {n.multiplier !== 1 && <span className="tag cert-tag">×{n.multiplier}</span>}
                  </div>

                  <div className="nr-sub">
                    {n.isLocal ? (
                      <span>{lang === 'fa' ? 'سرور پنل' : 'Panel server'}</span>
                    ) : (
                      <span dir="ltr" className="font-mono">
                        {n.address}:{n.port}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span dir="ltr">{verText}</span>
                  </div>

                  {protos.length > 0 && (
                    <div className="nr-chips">
                      {protos.map((proto) => (
                        <span key={proto} className="tag cert-tag" dir="ltr">
                          {proto}
                        </span>
                      ))}
                    </div>
                  )}

                  {n.uptime && n.uptime.days.length > 0 && (
                    <div className="mt-2.5 max-w-md">
                      <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: 'var(--ink-3)' }}>
                        <span>{lang === 'fa' ? '۹۰ روز گذشته' : '90 days ago'}</span>
                        <span className="num">
                          24h {n.uptime.pct24 ?? 100}% · 30d {n.uptime.pct30 ?? 100}%
                        </span>
                        <span>{lang === 'fa' ? 'امروز' : 'Today'}</span>
                      </div>
                      <div className="flex items-center gap-[2px] h-2.5" aria-label="90-day uptime bar">
                        {n.uptime.days.slice(-90).map((d) => {
                          const bg =
                            d.unknown >= 0.99
                              ? 'var(--unlit)'
                              : d.down > 0.2
                                ? 'var(--bad)'
                                : d.down > 0
                                  ? 'var(--warn)'
                                  : 'var(--good)';
                          return (
                            <span
                              key={d.day}
                              title={`${d.day}: ${d.pct !== null ? `${d.pct}%` : 'no data'}`}
                              className="flex-1 h-full rounded-[1px]"
                              style={{ background: bg }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="nr-stats">
                  <a
                    className="nr-sessions"
                    href={toPanelUrl(`/connections?node=${encodeURIComponent(n.name)}`)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      navigate(`/connections?node=${encodeURIComponent(n.name)}`);
                    }}
                  >
                    <b className="num">{n.onlineCount}</b> <span>{t.overview.onlineNow}</span>
                  </a>
                  <span className="nr-traffic">
                    <b className="num">{formatBytes(n.realTrafficBytes, lang)}</b>
                  </span>
                </div>

                <ChevronRight className="nr-chev rtl:rotate-180" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      )}

      {!hasRemoteNodes && (
        <div className="cert-empty-box">
          <EmptySonar
            text={
              lang === 'fa'
                ? 'یک سرور دیگر متصل کنید و اینباندها را اینجا به آن وصل کنید.'
                : 'Connect another server, then attach inbounds to it here.'
            }
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {lang === 'fa' ? 'اتصال نود' : 'Connect a node'}
              </Button>
            }
          />
        </div>
      )}

      <p className="faint small nd-foot">
        {lang === 'fa'
          ? 'ضریب ترافیک مشخص می‌کند مصرف روی هر نود چطور در سهمیه حساب شود: در ضریب ×۱.۵، هر ۱ گیگابایت مصرف، ۱.۵ گیگابایت محاسبه می‌شود. ترافیک نمایش‌داده‌شده روی هر نود مقدار واقعی است.'
          : 'The multiplier changes how traffic on a node counts toward quotas: at ×1.5, 1 GB used counts as 1.5 GB. The traffic shown on each node is the real amount.'}
      </p>

      {/* Node Details Slide-Over Drawer */}
      <Drawer
        open={Boolean(detailNode)}
        onClose={() => setDetailNode(null)}
        title={detailNode ? detailNode.name : ''}
        subtitle={detailNode ? `${detailNode.address}:${detailNode.port} · ×${detailNode.multiplier}` : undefined}
        widthClass="max-w-2xl"
      >
        {detailNode && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-subtle) pb-3">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'overview', label: lang === 'fa' ? 'نمای کلی' : 'Overview' },
                  { id: 'health', label: lang === 'fa' ? 'سلامت نود' : 'Health' },
                  { id: 'protocols', label: lang === 'fa' ? 'پروتکل‌ها و نصب' : 'Protocols' },
                  { id: 'inbounds', label: t.nav.inbounds },
                  { id: 'addresses', label: lang === 'fa' ? 'آدرس‌ها' : 'Addresses' },
                  { id: 'security', label: lang === 'fa' ? 'امنیت' : 'Security' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      detailTab === tab.id
                        ? 'bg-(--accent-soft) text-(--accent)'
                        : 'text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary)'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => openEdit(detailNode)}>
                  {t.common.edit}
                </Button>
                {!detailNode.isLocal && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(t.common.confirmDelete)) return;
                      await apiFetch(`/nodes/${detailNode.id}`, { method: 'DELETE' });
                      setDetailNode(null);
                      load();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {detailTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs">
                    <div className="text-(--text-muted)">CPU</div>
                    <div className="mt-1 font-mono text-base font-bold text-(--text-primary)">{detailNode.cpuPct}%</div>
                  </div>
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs">
                    <div className="text-(--text-muted)">Memory</div>
                    <div className="mt-1 font-mono text-base font-bold text-(--text-primary)">{detailNode.memPct}%</div>
                  </div>
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs">
                    <div className="text-(--text-muted)">{t.overview.onlineNow}</div>
                    <div className="mt-1 font-mono text-base font-bold text-(--accent)">{detailNode.onlineCount}</div>
                  </div>
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs">
                    <div className="text-(--text-muted)">{t.nodes.uptime}</div>
                    <div className="mt-1 font-semibold text-(--text-primary)">{formatDuration(detailNode.uptimeSec, lang)}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-(--text-muted)">XProtocol Core</span>
                    <span className="font-mono text-(--text-primary)">{detailNode.xprotocolVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-(--text-muted)">{t.nodes.realTraffic}</span>
                    <span className="font-mono text-(--text-primary)">{formatBytes(detailNode.realTrafficBytes, lang)}</span>
                  </div>
                  {detailNode.note && (
                    <div className="pt-1 text-(--text-secondary)">Note: {detailNode.note}</div>
                  )}
                </div>
              </div>
            )}

            {detailTab === 'health' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1.5">
                    {(['24h', '7d', '30d', '90d'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setHealthRange(r);
                          void loadHealth(detailNode.id, r);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs border"
                        style={{
                          borderColor: healthRange === r ? 'var(--accent)' : 'var(--line)',
                          background: healthRange === r ? 'var(--accent-wash)' : 'var(--raise-2)',
                          color: healthRange === r ? 'var(--accent-text)' : 'var(--ink-2)',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-semibold num" style={{ color: 'var(--good)' }}>
                    {healthSeries?.uptime?.pct24 ?? 100}% {lang === 'fa' ? 'آپتایم ۲۴ ساعت' : 'uptime (24h)'}
                  </div>
                </div>

                {healthSeries && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        label: 'CPU %',
                        color: 'var(--accent)',
                        vals: healthSeries.points.map((p) => (p.cpu ?? 0) * 100),
                        latest: `${Math.round(((healthSeries.points.at(-1)?.cpu ?? 0) * 100) * 10) / 10}%`,
                      },
                      {
                        label: lang === 'fa' ? 'حافظه رم' : 'Memory',
                        color: 'var(--accent-2)',
                        vals: healthSeries.points.map((p) => (p.memTotal ? ((p.memUsed ?? 0) / p.memTotal) * 100 : 0)),
                        latest: `${Math.round(((healthSeries.points.at(-1)?.memTotal ? ((healthSeries.points.at(-1)?.memUsed ?? 0) / healthSeries.points.at(-1)!.memTotal!) * 100 : detailNode.memPct)) * 10) / 10}%`,
                      },
                      {
                        label: lang === 'fa' ? 'دیسک' : 'Disk',
                        color: 'var(--warn)',
                        vals: healthSeries.points.map((p) => (p.diskTotal ? ((p.diskUsed ?? 0) / p.diskTotal) * 100 : 0)),
                        latest: `${Math.round(((healthSeries.points.at(-1)?.diskTotal ? ((healthSeries.points.at(-1)?.diskUsed ?? 0) / healthSeries.points.at(-1)!.diskTotal!) * 100 : 0)) * 10) / 10}%`,
                      },
                      {
                        label: lang === 'fa' ? 'کلاینت‌های آنلاین' : 'Online tunnels',
                        color: 'var(--good)',
                        vals: healthSeries.points.map((p) => p.clients),
                        latest: String(healthSeries.points.at(-1)?.clients ?? detailNode.onlineCount),
                      },
                    ].map((chart) => {
                      const vals = chart.vals.length >= 2 ? chart.vals : [chart.vals[0] || 0, chart.vals[0] || 0];
                      const maxV = Math.max(100, ...vals, 1);
                      const pts = vals
                        .map((v, idx) => `${(idx / (vals.length - 1)) * 220},${52 - (v / maxV) * 44}`)
                        .join(' ');
                      return (
                        <div key={chart.label} className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--ink-2)' }}>{chart.label}</span>
                            <strong className="num" style={{ color: 'var(--ink)' }}>{chart.latest}</strong>
                          </div>
                          <svg viewBox="0 0 220 56" className="w-full h-14 overflow-visible">
                            <polyline fill="none" stroke={chart.color} strokeWidth="2" points={pts} />
                          </svg>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'security' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-4 space-y-3">
                  <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    {lang === 'fa' ? 'فهرست IP مجاز پنل (Allowlist)' : 'Panel IP allowlist'}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {lang === 'fa'
                      ? 'آی‌پی‌ها یا رنج‌های CIDR مجاز برای ارتباط با این نود (هر خط یک مورد؛ خالی = آزاد).'
                      : 'IPs or CIDR ranges this node accepts panel calls from (one per line; empty = any address).'}
                  </p>
                  <textarea
                    rows={4}
                    dir="ltr"
                    value={allowFromText}
                    onChange={(e) => setAllowFromText(e.target.value)}
                    placeholder={panelIpHint || '203.0.113.10/32'}
                    className="w-full rounded-xl border border-(--border-strong) bg-(--bg-app) p-2.5 font-mono text-xs text-(--text-primary)"
                  />
                  <div className="flex items-center justify-between gap-2">
                    {panelIpHint && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAllowFromText((prev) => (prev.trim() ? `${prev.trim()}\n${panelIpHint}` : panelIpHint))}
                      >
                        {lang === 'fa' ? `افزودن IP پنل (${panelIpHint})` : `Add panel IP (${panelIpHint})`}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        setSecurityMsg('');
                        const list = allowFromText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
                        await apiFetch(`/nodes/${detailNode.id}/allow-from`, {
                          method: 'PUT',
                          body: JSON.stringify({ allowFrom: list }),
                        });
                        setSecurityMsg(lang === 'fa' ? 'فهرست IP مجاز ذخیره شد.' : 'Allowlist saved.');
                      }}
                    >
                      {t.common.save}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                      {lang === 'fa' ? 'چرخش کلید API نود' : 'Rotate node API key'}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {lang === 'fa'
                        ? 'یک کلید جدید برای احراز هویت پنل و نود صادر می‌کند.'
                        : 'Issues a new API key between the panel and this node.'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(lang === 'fa' ? 'کلید نود تعویض شود؟' : 'Rotate this node key?')) return;
                      await apiFetch(`/nodes/${detailNode.id}/rotate-key`, { method: 'POST' });
                      setSecurityMsg(lang === 'fa' ? 'کلید نود با موفقیت تعویض شد.' : 'Node key rotated.');
                    }}
                  >
                    {lang === 'fa' ? 'چرخش کلید' : 'Rotate key'}
                  </Button>
                </div>

                {securityMsg && <div className="text-xs" style={{ color: 'var(--good)' }}>{securityMsg}</div>}
              </div>
            )}

            {detailTab === 'protocols' && (
              <div className="space-y-3">
                {protoLoading ? (
                  <div className="py-6 text-center text-xs text-(--text-muted)">{t.common.loading}</div>
                ) : (
                  <div className="space-y-2">
                    {protocols.map((p) => (
                      <div
                        key={p.protocol}
                        className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-semibold uppercase text-(--text-primary)">{p.protocol}</div>
                          <div className="text-[11px] text-(--text-muted)">
                            {p.version || (p.installed ? 'Installed' : 'Not installed')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill
                            tone={p.installed ? 'green' : 'amber'}
                            label={p.installed ? (lang === 'fa' ? 'نصب‌شده' : 'Installed') : lang === 'fa' ? 'نصب‌نشده' : 'Missing'}
                          />
                          {detailNode.isLocal && (
                            <Button
                              size="sm"
                              disabled={installingProto === p.protocol}
                              onClick={() => installProtocol(p.protocol)}
                            >
                              <DownloadCloud className="h-3.5 w-3.5" />
                              {installingProto === p.protocol
                                ? lang === 'fa'
                                  ? 'در حال نصب...'
                                  : 'Installing…'
                                : p.installed
                                  ? lang === 'fa'
                                    ? 'بروزرسانی'
                                    : 'Reinstall'
                                  : lang === 'fa'
                                    ? 'نصب'
                                    : 'Install'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {installLog && (
                  <pre className="max-h-48 overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-app) p-3 font-mono text-[11px] text-(--text-secondary)">
                    {installLog}
                  </pre>
                )}
              </div>
            )}

            {detailTab === 'inbounds' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-(--text-secondary)">{detailNode.inbounds.length} attached</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      setAttachNodeId(detailNode.id);
                      setAttachInboundId(unattached[0] ? String(unattached[0].id) : '');
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {t.nodes.attachInbound}
                  </Button>
                </div>
                {detailNode.inbounds.map((ib) => (
                  <div
                    key={ib.id}
                    className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-(--text-primary)">{ib.name}</span>
                      <span className="ms-2 font-mono text-(--text-muted)">
                        {ib.protocol.toUpperCase()} :{ib.port}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await apiFetch(`/nodes/${detailNode.id}/detach`, {
                          method: 'POST',
                          body: JSON.stringify({ inboundId: ib.id }),
                        });
                        load();
                      }}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {t.nodes.detach}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'addresses' && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-(--text-muted)">Control endpoint</div>
                  <div className="mt-1 font-mono font-semibold text-(--text-primary)">
                    {detailNode.address}:{detailNode.port}
                  </div>
                </div>
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-(--text-muted)">{t.nodes.connectAddresses}</div>
                  {detailNode.connectAddresses.length === 0 ? (
                    <div className="mt-1 text-(--text-secondary)">Default node address</div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {detailNode.connectAddresses.map((addr) => (
                        <span
                          key={addr}
                          className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-2.5 py-1 font-mono text-(--text-primary)"
                        >
                          {addr}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Connect / Edit Node Slide-Over Drawer */}
      <Drawer
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={editing ? `${t.common.edit}: ${editing.name}` : t.nodes.connectNode}
        subtitle={
          !editing
            ? `Step ${connectStep} of 3 — ${connectStep === 1 ? 'Endpoint details' : connectStep === 2 ? 'Install agent on server' : 'Relays & multiplier'}`
            : undefined
        }
        widthClass="max-w-xl"
      >
        <form onSubmit={saveNode} className="space-y-4">
          {(editing || connectStep === 1) && (
            <>
              <Input label={t.common.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="Frankfurt-01" required />
              {!editing?.isLocal && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Node address (IP or domain)"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="203.0.113.10"
                    required
                  />
                  <Input label="Node port" type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
                </div>
              )}
            </>
          )}

          {!editing && connectStep === 2 && (
            <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-(--text-primary)">
                <Terminal className="h-4 w-4 text-(--accent)" />
                {lang === 'fa' ? 'این دستور را روی سرور نود Ubuntu اجرا کنید:' : 'Run on the remote Ubuntu 22.04+ server:'}
              </div>
              <pre className="overflow-x-auto rounded-xl border border-(--border-subtle) bg-(--bg-app) p-3 font-mono text-xs text-(--text-primary)">
                {nodeInstallCmd}
              </pre>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  const ok = await copyToClipboard(nodeInstallCmd);
                  if (!ok) return;
                  setCopiedCmd(true);
                  setTimeout(() => setCopiedCmd(false), 1500);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedCmd ? t.common.copied : t.common.copy}
              </Button>
            </div>
          )}

          {(editing || connectStep === 3) && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t.nodes.trafficMultiplier}
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={multiplier}
                  onChange={(e) => setMultiplier(e.target.value)}
                />
                {!editing?.isLocal && (
                  <Input
                    label="Node key"
                    value={nodeKey}
                    onChange={(e) => setNodeKey(e.target.value)}
                    placeholder={editing ? 'Leave empty to keep' : 'Auto-generated if empty'}
                  />
                )}
              </div>
              <Input
                label={t.nodes.connectAddresses}
                value={connectAddresses}
                onChange={(e) => setConnectAddresses(e.target.value)}
                placeholder="relay1.example.com, 1.2.3.4"
              />
              <Input label={t.common.note} value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <>
                <Button type="button" onClick={() => setConnectOpen(false)}>{t.common.cancel}</Button>
                <Button type="submit" variant="primary">{t.common.save}</Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => (connectStep === 1 ? setConnectOpen(false) : setConnectStep((s) => (s - 1) as 1 | 2))}
                >
                  {connectStep > 1 && <ArrowLeft className="h-4 w-4" />}
                  {connectStep === 1 ? t.common.cancel : 'Back'}
                </Button>
                {connectStep < 3 ? (
                  <Button type="button" variant="primary" onClick={() => setConnectStep((s) => (s + 1) as 2 | 3)}>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" variant="primary">
                    <Check className="h-4 w-4" />
                    {t.common.save}
                  </Button>
                )}
              </>
            )}
          </div>
        </form>
      </Drawer>

      <Modal open={attachNodeId !== null} onClose={() => setAttachNodeId(null)} title={t.nodes.attachInbound}>
        <form onSubmit={attachInbound} className="space-y-4">
          {unattached.length === 0 ? (
            <p className="text-xs text-(--text-secondary)">
              All existing inbounds are already attached to a node. Create a new inbound first.
            </p>
          ) : (
            <Select label={t.nav.inbounds} value={attachInboundId} onChange={(e) => setAttachInboundId(e.target.value)}>
              {unattached.map((ib) => (
                <option key={ib.id} value={String(ib.id)}>
                  {ib.name} ({ib.protocol.toUpperCase()} :{ib.port})
                </option>
              ))}
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setAttachNodeId(null)}>{t.common.cancel}</Button>
            {unattached.length > 0 && <Button type="submit" variant="primary">{t.nodes.attachInbound}</Button>}
          </div>
        </form>
      </Modal>
    </div>
  );
}
