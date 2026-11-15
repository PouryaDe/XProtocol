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
import { formatBytes, formatDuration } from '../lib/format';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EmptySonar, Input, PageHead, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';

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
  const [detailTab, setDetailTab] = useState<'overview' | 'protocols' | 'inbounds' | 'addresses'>('overview');
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
  }, []);

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

  const openDetails = (n: NodeItem, initialTab: 'overview' | 'protocols' | 'inbounds' | 'addresses' = 'overview') => {
    setDetailNode(n);
    setDetailTab(initialTab);
    setInstallLog('');
    loadProtocols(n.id);
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

  const nodeInstallCmd = `bash <(curl -fsSL ${window.location.origin}/install-node.sh) --port ${port || '62060'} --name "${name || 'eu-node'}"`;

  return (
    <div className="page nodes-page">
      <PageHead
        title={t.nodes.title}
        sub={
          lang === 'fa'
            ? `${summary.connected} نود متصل از ${summary.total} · ${summary.onlineNow} نشست فعال`
            : `${summary.connected} of ${summary.total} nodes connected · ${summary.onlineNow} live sessions`
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.nodes.connectNode}
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
            { id: 'attention', label: lang === 'fa' ? 'نیازمند توجه' : 'Attention', count: summary.attention },
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
            type="search"
            value={nodeSearchQuery}
            onChange={(e) => setNodeSearchQuery(e.target.value)}
            placeholder={lang === 'fa' ? 'جستجوی نود یا آدرس...' : 'Search node or address...'}
          />
        </label>
      </div>

      {filteredNodes.length === 0 ? (
        <div className="panel py-8">
          <EmptySonar text={lang === 'fa' ? 'نودی با این مشخصات یافت نشد' : 'No nodes match the filter'} />
        </div>
      ) : (
        <ul className="nd-rows">
          {filteredNodes.map((n) => {
            const dotTone = n.status === 'connected' ? 'ok' : n.enabled ? 'warn' : 'off';
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
                        {n.name}
                      </span>
                    </button>
                    <StatusPill
                      tone={n.status === 'connected' ? 'green' : n.status === 'disabled' ? 'gray' : 'red'}
                      label={n.status === 'connected' ? t.nodes.connected : n.status}
                    />
                    <span className="tag">×{n.multiplier}</span>
                  </div>

                  <div className="nr-sub">
                    {n.isLocal ? (
                      <span>{lang === 'fa' ? 'سرور اصلی پنل' : 'Panel host node'}</span>
                    ) : (
                      <span dir="ltr" className="font-mono">
                        {n.address}:{n.port}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span dir="ltr">XProtocol {n.xprotocolVersion}</span>
                    {n.uptimeSec > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatDuration(n.uptimeSec, lang)}</span>
                      </>
                    )}
                  </div>

                  <div className="nr-chips">
                    <span className="tag" dir="ltr">
                      OpenVPN {n.openvpnVersion}
                    </span>
                    <span className="tag" dir="ltr">
                      {n.wireguardReady ? 'WireGuard ready' : 'No TUN'}
                    </span>
                    <span className="tag" dir="ltr">
                      OpenConnect {n.openconnectVersion}
                    </span>
                    {n.inbounds.map((ib) => (
                      <span key={ib.id} className="tag" dir="ltr">
                        {ib.name}:{ib.port}
                      </span>
                    ))}
                  </div>

                  {n.connectAddresses.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-(--text-muted)">
                      <span>Relays</span>
                      <span className="rl-line min-w-8 flex-1" aria-hidden="true" />
                      <span className="font-mono text-(--text-primary)" dir="ltr">
                        {n.connectAddresses.join(', ')}
                      </span>
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
                    <b className="num">{n.onlineCount}</b>{' '}
                    <span>{lang === 'fa' ? 'نشست' : 'sessions'}</span>
                  </a>
                  <span className="nr-traffic">
                    <b className="num">{formatBytes(n.realTrafficBytes, lang)}</b>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      setAttachNodeId(n.id);
                      setAttachInboundId(unattached[0] ? String(unattached[0].id) : '');
                    }}
                    title={t.nodes.attachInbound}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => openEdit(n)}>
                    {t.common.edit}
                  </Button>
                  {!n.isLocal && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (!confirm(t.common.confirmDelete)) return;
                        await apiFetch(`/nodes/${n.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg p-1 text-(--text-muted) hover:text-(--text-primary)"
                    onClick={() => openDetails(n, 'overview')}
                    aria-label="Details"
                  >
                    <ChevronRight className="nr-chev h-4 w-4 rtl:rotate-180" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

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
            <div className="flex flex-wrap gap-1.5 border-b border-(--border-subtle) pb-3">
              {([
                { id: 'overview', label: lang === 'fa' ? 'نمای کلی' : 'Overview' },
                { id: 'protocols', label: lang === 'fa' ? 'پروتکل‌ها و نصب' : 'Protocols' },
                { id: 'inbounds', label: t.nav.inbounds },
                { id: 'addresses', label: lang === 'fa' ? 'آدرس‌ها' : 'Addresses' },
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
                  await navigator.clipboard.writeText(nodeInstallCmd);
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
