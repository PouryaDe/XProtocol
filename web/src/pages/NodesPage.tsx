import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  DownloadCloud,
  Link2,
  Plus,
  Server,
  Terminal,
  Trash2,
  Unlink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDuration } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Card, Input, Select, StatusPill } from '../components/UiPrimitives';
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
    return nodes.filter((n) => {
      if (filterTab === 'connected') return n.status === 'connected';
      if (filterTab === 'attention') return n.enabled && n.status !== 'connected';
      if (filterTab === 'disabled') return !n.enabled || n.status === 'disabled';
      return true;
    });
  }, [nodes, filterTab]);

  const nodeInstallCmd = `bash <(curl -fsSL ${window.location.origin}/install-node.sh) --port ${port || '62060'} --name "${name || 'eu-node'}"`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-(--text-primary)">{t.nodes.title}</h1>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t.nodes.connectNode}
        </Button>
      </div>

      {/* Summary Strip */}
      <Card className="grid divide-y divide-(--border-subtle) sm:grid-cols-2 sm:divide-y-0 sm:divide-x xl:grid-cols-4 rtl:sm:divide-x-reverse">
        <div className="p-4">
          <div className="text-xs text-(--text-secondary)">{lang === 'fa' ? 'کل نودها' : 'Total nodes'}</div>
          <div className="mt-1 text-2xl font-bold text-(--text-primary)">{summary.total}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-(--text-secondary)">{t.nodes.connected}</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{summary.connected}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-(--text-secondary)">{lang === 'fa' ? 'نیازمند توجه' : 'Needs attention'}</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{summary.attention}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-(--text-secondary)">{t.overview.onlineNow}</div>
          <div className="mt-1 text-2xl font-bold text-(--accent)">{summary.onlineNow}</div>
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
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
            onClick={() => setFilterTab(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              filterTab === tab.id
                ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                : 'border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            <span>{tab.label}</span>
            <span className="rounded-md bg-(--bg-elevated) px-1.5 py-0.5 text-[10px]">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredNodes.map((n) => (
          <Card key={n.id} className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-(--text-primary)">{n.name}</span>
                    <StatusPill
                      tone={n.status === 'connected' ? 'green' : n.status === 'disabled' ? 'gray' : 'red'}
                      label={n.status === 'connected' ? t.nodes.connected : n.status}
                    />
                    <span className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2 py-0.5 font-mono text-[11px] text-(--text-secondary)">
                      ×{n.multiplier}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-(--text-muted)">
                    {n.address}:{n.port}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => openDetails(n, 'overview')}>
                  {lang === 'fa' ? 'جزئیات' : 'Details'}
                </Button>
                <Button size="sm" onClick={() => openEdit(n)}>{t.common.edit}</Button>
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
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-(--bg-elevated) p-3 text-xs">
              <div>
                <div className="text-(--text-muted)">{t.overview.onlineNow}</div>
                <div className="mt-0.5 font-bold text-(--text-primary)">{n.onlineCount}</div>
              </div>
              <div>
                <div className="text-(--text-muted)">{t.nodes.realTraffic}</div>
                <div className="mt-0.5 font-mono font-semibold text-(--text-primary)">
                  {formatBytes(n.realTrafficBytes, lang)}
                </div>
              </div>
              <div>
                <div className="text-(--text-muted)">{t.nodes.uptime}</div>
                <div className="mt-0.5 font-semibold text-(--text-primary)">{formatDuration(n.uptimeSec, lang)}</div>
              </div>
            </div>

            <div className="text-xs text-(--text-secondary)">
              XProtocol {n.xprotocolVersion} · OpenVPN {n.openvpnVersion} ·{' '}
              {n.wireguardReady ? 'WireGuard ready' : 'No TUN'} · OpenConnect {n.openconnectVersion}
            </div>

            {n.connectAddresses.length > 0 && (
              <div className="text-xs text-(--text-muted)">
                Relays: <span className="font-mono text-(--text-primary)">{n.connectAddresses.join(', ')}</span>
              </div>
            )}

            <div className="space-y-2 border-t border-(--border-subtle) pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-(--text-secondary)">{t.nav.inbounds}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setAttachNodeId(n.id);
                    setAttachInboundId(unattached[0] ? String(unattached[0].id) : '');
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {t.nodes.attachInbound}
                </Button>
              </div>
              {n.inbounds.length === 0 ? (
                <div className="text-xs text-(--text-muted)">No inbounds attached.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {n.inbounds.map((ib) => (
                    <div
                      key={ib.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1 text-xs"
                    >
                      <span className="font-semibold text-(--text-primary)">{ib.name}</span>
                      <span className="font-mono text-(--text-muted)">:{ib.port}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/nodes/${n.id}/detach`, {
                            method: 'POST',
                            body: JSON.stringify({ inboundId: ib.id }),
                          });
                          load();
                        }}
                        title={t.nodes.detach}
                        className="text-(--text-muted) hover:text-red-400"
                      >
                        <Unlink className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

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
