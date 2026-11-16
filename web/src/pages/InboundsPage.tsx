import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCode2,
  Play,
  Plus,
  RotateCw,
  Search,
  Server,
  Shield,
  Square,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EmptySonar, Input, PageHead, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';

interface InboundItem {
  id: number;
  nodeId: number | null;
  nodeName: string | null;
  protocol: string;
  name: string;
  transport: string;
  port: number;
  subnet: string;
  authMode: string;
  description: string;
  publicAddressOverride: string;
  enabled: boolean;
  running: boolean;
  onlineCount: number;
}

interface NodeOption {
  id: number;
  name: string;
  address?: string;
  status?: string;
}

const PROTOCOL_CARDS = [
  {
    id: 'wireguard',
    title: 'WireGuard',
    badge: 'UDP',
    desc: 'Fast kernel-level encrypted VPN tunnel',
    defaultName: 'wg-main',
    defaultTransport: 'udp',
    defaultPort: '51820',
    defaultSubnet: '10.66.0.0/24',
  },
  {
    id: 'amneziawg',
    title: 'AmneziaWG',
    badge: 'OBFS UDP',
    desc: 'WireGuard with DPI-resistant packet obfuscation',
    defaultName: 'awg-obfs',
    defaultTransport: 'udp',
    defaultPort: '51821',
    defaultSubnet: '10.67.0.0/24',
  },
  {
    id: 'openvpn',
    title: 'OpenVPN',
    badge: 'UDP / TCP',
    desc: 'Universal SSL/TLS VPN with .ovpn profile support',
    defaultName: 'ovpn-main',
    defaultTransport: 'udp',
    defaultPort: '1194',
    defaultSubnet: '10.8.0.0/24',
  },
  {
    id: 'openconnect',
    title: 'OpenConnect',
    badge: 'TLS 443',
    desc: 'Cisco AnyConnect compatible HTTPS/DTLS server',
    defaultName: 'ocserv-443',
    defaultTransport: 'tcp',
    defaultPort: '443',
    defaultSubnet: '10.72.0.0/24',
  },
  {
    id: 'ikev2',
    title: 'IKEv2 / IPsec',
    badge: 'UDP 500/4500',
    desc: 'Native iOS, macOS, Windows & Android strongSwan VPN',
    defaultName: 'ikev2-native',
    defaultTransport: 'udp',
    defaultPort: '500',
    defaultSubnet: '10.74.0.0/24',
  },
  {
    id: 'l2tp',
    title: 'L2TP / IPsec',
    badge: 'LEGACY',
    desc: 'Pre-shared key L2TP compatibility for routers & devices',
    defaultName: 'l2tp-legacy',
    defaultTransport: 'udp',
    defaultPort: '1701',
    defaultSubnet: '10.75.0.0/24',
  },
] as const;

export function InboundsPage() {
  const { t, lang } = useUi();
  const [inbounds, setInbounds] = useState<InboundItem[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'attention' | 'drafts'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [inspectInbound, setInspectInbound] = useState<InboundItem | null>(null);
  const [inspectTab, setInspectTab] = useState<'config' | 'logs'>('config');
  const [configData, setConfigData] = useState<{ path: string; content: string; logs: string[] } | null>(null);

  // Step 1: Protocol & name
  const [protocol, setProtocol] = useState('wireguard');
  const [name, setName] = useState('wg-main');
  const [transport, setTransport] = useState('udp');
  const [port, setPort] = useState('51820');
  const [subnet, setSubnet] = useState('10.66.0.0/24');
  const [description, setDescription] = useState('');

  // Step 2: Nodes
  const [nodeSearch, setNodeSearch] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [draftOnly, setDraftOnly] = useState(false);

  // Step 3: Protocol-specific settings
  const [authMode, setAuthMode] = useState('certificate');
  const [publicAddressOverride, setPublicAddressOverride] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [wgMtu, setWgMtu] = useState('1420');
  const [wgDns, setWgDns] = useState('1.1.1.1, 8.8.8.8');
  const [wgKeepalive, setWgKeepalive] = useState('25');
  const [awgJc, setAwgJc] = useState('4');
  const [awgJmin, setAwgJmin] = useState('40');
  const [awgJmax, setAwgJmax] = useState('70');
  const [ovpnCipher, setOvpnCipher] = useState('AES-256-GCM');
  const [ovpnTlsCrypt, setOvpnTlsCrypt] = useState(true);
  const [ocDtls, setOcDtls] = useState(true);
  const [ikeFqdn, setIkeFqdn] = useState('');
  const [l2tpPsk, setL2tpPsk] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [iRes, nRes] = await Promise.all([
      apiFetch<{ inbounds: InboundItem[] }>('/inbounds'),
      apiFetch<{ nodes: NodeOption[] }>('/nodes').catch(() => ({ nodes: [] })),
    ]);
    setInbounds(iRes.inbounds);
    setNodes(nRes.nodes);
  };

  useEffect(() => {
    load();
  }, []);

  const openWizard = () => {
    setWizardStep(1);
    setProtocol('wireguard');
    setName('wg-main');
    setTransport('udp');
    setPort('51820');
    setSubnet('10.66.0.0/24');
    setDescription('');
    setNodeSearch('');
    setDraftOnly(false);
    setSelectedNodeIds(nodes.length > 0 ? [nodes[0].id] : []);
    setAuthMode('publickey');
    setPublicAddressOverride('');
    setEnabled(true);
    setError('');
    setCreateOpen(true);
  };

  const selectProtocolCard = (id: string) => {
    setProtocol(id);
    const card = PROTOCOL_CARDS.find((c) => c.id === id);
    if (card) {
      setName(card.defaultName);
      setTransport(card.defaultTransport);
      setPort(card.defaultPort);
      setSubnet(card.defaultSubnet);
      setAuthMode(id === 'wireguard' || id === 'amneziawg' ? 'publickey' : id === 'l2tp' ? 'psk' : 'password');
    }
  };

  const filteredNodes = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.name.toLowerCase().includes(q) || (n.address || '').toLowerCase().includes(q));
  }, [nodes, nodeSearch]);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    const settings: Record<string, unknown> = {};
    if (protocol === 'wireguard' || protocol === 'amneziawg') {
      settings.mtu = Number(wgMtu || 1420);
      settings.dns = wgDns;
      settings.keepalive = Number(wgKeepalive || 25);
      if (protocol === 'amneziawg') {
        settings.jc = Number(awgJc || 4);
        settings.jmin = Number(awgJmin || 40);
        settings.jmax = Number(awgJmax || 70);
      }
    } else if (protocol === 'openvpn') {
      settings.cipher = ovpnCipher;
      settings.tlsCrypt = ovpnTlsCrypt;
      settings.dns = wgDns;
    } else if (protocol === 'openconnect') {
      settings.dtls = ocDtls;
      settings.dns = wgDns;
    } else if (protocol === 'ikev2') {
      settings.fqdn = ikeFqdn.trim();
    } else if (protocol === 'l2tp') {
      settings.psk = l2tpPsk.trim() || 'xprotocol-ipsec-psk';
    }

    try {
      await apiFetch('/inbounds', {
        method: 'POST',
        body: JSON.stringify({
          protocol,
          name,
          transport,
          port: Number(port),
          subnet,
          nodeIds: draftOnly ? [] : selectedNodeIds,
          authMode,
          description,
          publicAddressOverride,
          enabled,
          settings,
        }),
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const runAction = async (id: number, action: 'start' | 'stop' | 'restart') => {
    await apiFetch(`/inbounds/${id}/${action}`, { method: 'POST' });
    load();
  };

  const openInspect = async (ib: InboundItem) => {
    setInspectInbound(ib);
    setInspectTab('config');
    const data = await apiFetch<{ path: string; content: string; logs: string[] }>(`/inbounds/${ib.id}/config`);
    setConfigData(data);
  };

  const isAttention = (ib: InboundItem) => Boolean(ib.nodeId && ib.enabled && !ib.running);
  const isDraft = (ib: InboundItem) => !ib.nodeId;

  const filterCounts = {
    all: inbounds.length,
    attention: inbounds.filter(isAttention).length,
    drafts: inbounds.filter(isDraft).length,
  };

  const filteredInbounds = inbounds.filter((ib) => {
    if (filterMode === 'attention' && !isAttention(ib)) return false;
    if (filterMode === 'drafts' && !isDraft(ib)) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${ib.name} ${ib.protocol} ${ib.transport} ${ib.port} ${ib.nodeName || ''} ${ib.description}`
      .toLowerCase()
      .includes(q);
  });

  const go = (to: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };

  return (
    <div className="page inbounds-page">
      <PageHead
        title={t.inbounds.title}
        sub={
          lang === 'fa'
            ? 'یک‌بار تعریف کنید. روی نودهایی که انتخاب می‌کنید اجرا شوند.'
            : 'Define once. Run on the nodes you choose.'
        }
        actions={
          <Button variant="primary" onClick={openWizard}>
            <Plus className="h-4 w-4" />
            {t.inbounds.newInbound}
          </Button>
        }
      />

      {inbounds.length === 0 ? (
        <div className="panel py-8">
          <EmptySonar
            text={lang === 'fa' ? 'هنوز هیچ اینباندی ساخته نشده است' : 'No inbounds configured yet'}
          />
          <div className="mt-4 flex justify-center">
            <Button variant="primary" onClick={openWizard}>
              <Plus className="h-4 w-4" />
              {t.inbounds.newInbound}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="inb-toolbar">
            <label className="inb-search">
              <Search aria-hidden="true" />
              <input
                className="input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'fa' ? 'جستجوی اینباندها' : 'Search inbounds'}
              />
            </label>
            <div className="inb-filters" role="group" aria-label={t.inbounds.title}>
              {([
                { id: 'all', label: lang === 'fa' ? 'همه اینباندها' : 'All inbounds' },
                { id: 'attention', label: lang === 'fa' ? 'نیازمند توجه' : 'Needs attention' },
                { id: 'drafts', label: lang === 'fa' ? 'پیش‌نویس‌ها' : 'Drafts' },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filterMode === f.id}
                  onClick={() => setFilterMode(f.id)}
                >
                  {f.label}
                  <span>{filterCounts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          {filteredInbounds.length === 0 ? (
            <div className="panel py-6">
              <EmptySonar text={lang === 'fa' ? 'موردی با این فیلتر یافت نشد' : 'No inbounds match this filter'} />
            </div>
          ) : (
            <div className="inb-service-list">
              {filteredInbounds.map((ib) => {
                const healthClass = isAttention(ib) ? 'warn' : ib.running ? 'good' : '';
                return (
                  <article key={ib.id} className="inb-service">
                    <header>
                      <div className="inb-service-identity">
                        <span className="rounded-lg bg-(--accent-soft) px-2 py-0.5 text-[11px] font-bold uppercase text-(--accent-text)">
                          {ib.protocol}
                        </span>
                        <a href={toPanelUrl(`/inbounds/${ib.id}`)} onClick={go(`/inbounds/${ib.id}`)}>
                          <bdi>{ib.name}</bdi>
                        </a>
                      </div>
                      <span className={`inb-health ${healthClass}`}>
                        <StatusPill
                          tone={ib.running ? 'green' : ib.nodeId ? 'amber' : 'gray'}
                          label={ib.running ? t.inbounds.running : ib.nodeId ? t.inbounds.stopped : t.inbounds.notOnNode}
                        />
                      </span>
                    </header>

                    {ib.description ? <p className="hint">{ib.description}</p> : null}

                    <div className="inb-service-meta">
                      <span>
                        <strong>{ib.onlineCount}</strong> {lang === 'fa' ? 'آنلاین' : 'online'}
                      </span>
                      <span dir="ltr">
                        {ib.transport.toUpperCase()}/{ib.port}
                      </span>
                      <span dir="ltr">{ib.subnet}</span>
                      <span>{ib.authMode}</span>
                    </div>

                    <footer>
                      <div className="inb-node-chips">
                        <span>
                          <i className={ib.running ? 'good' : ib.nodeId ? 'bad' : ''} aria-hidden="true" />
                          <bdi>{ib.nodeName || t.inbounds.notOnNode}</bdi>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" onClick={() => openInspect(ib)}>
                          <FileCode2 className="h-3.5 w-3.5" />
                          {t.inbounds.configFile}
                        </Button>
                        {ib.running ? (
                          <>
                            <Button size="sm" onClick={() => runAction(ib.id, 'restart')}>
                              <RotateCw className="h-3.5 w-3.5" />
                              {t.inbounds.restart}
                            </Button>
                            <Button size="sm" onClick={() => runAction(ib.id, 'stop')}>
                              <Square className="h-3.5 w-3.5" />
                              {t.inbounds.stop}
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => runAction(ib.id, 'start')} disabled={!ib.nodeId}>
                            <Play className="h-3.5 w-3.5" />
                            {t.inbounds.start}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (!confirm(t.common.confirmDelete)) return;
                            await apiFetch(`/inbounds/${ib.id}`, { method: 'DELETE' });
                            load();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <a
                          className="inline-flex items-center gap-1.5 rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-primary) hover:border-(--accent)"
                          href={toPanelUrl(`/inbounds/${ib.id}`)}
                          onClick={go(`/inbounds/${ib.id}`)}
                        >
                          {lang === 'fa' ? 'مدیریت' : 'Manage'}
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                        </a>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 3-Step New Inbound Wizard Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.inbounds.newInbound}
        subtitle={
          wizardStep === 1
            ? lang === 'fa'
              ? 'مرحله ۱ از ۳ — پروتکل و نام'
              : 'Step 1 of 3 — Protocol & name'
            : wizardStep === 2
              ? lang === 'fa'
                ? 'مرحله ۲ از ۳ — انتخاب نودها'
                : 'Step 2 of 3 — Choose nodes'
              : lang === 'fa'
                ? 'مرحله ۳ از ۳ — تنظیمات پروتکل'
                : 'Step 3 of 3 — Protocol settings'
        }
        widthClass="max-w-2xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              onClick={() => (wizardStep === 1 ? setCreateOpen(false) : setWizardStep((s) => (s - 1) as 1 | 2))}
            >
              {wizardStep > 1 && <ArrowLeft className="h-4 w-4" />}
              {wizardStep === 1 ? t.common.cancel : lang === 'fa' ? 'قبلی' : 'Back'}
            </Button>

            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`h-2 rounded-full transition-all ${
                    step === wizardStep ? 'w-6 bg-(--accent)' : 'w-2 bg-(--border-strong)'
                  }`}
                />
              ))}
            </div>

            {wizardStep < 3 ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (wizardStep === 1 && !name.trim()) {
                    setError('Inbound name is required');
                    return;
                  }
                  setError('');
                  setWizardStep((s) => (s + 1) as 2 | 3);
                }}
              >
                {lang === 'fa' ? 'بعدی' : 'Next'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => handleCreate()}>
                <Check className="h-4 w-4" />
                {t.common.create}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {wizardStep === 1 && (
            <>
              <div>
                <div className="mb-2 text-xs font-medium text-(--text-secondary)">
                  {lang === 'fa' ? 'پروتکل VPN را انتخاب کنید' : 'Choose a protocol'}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {PROTOCOL_CARDS.map((card) => {
                    const selected = protocol === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => selectProtocolCard(card.id)}
                        className={`flex flex-col items-start rounded-2xl border p-3.5 text-start transition ${
                          selected
                            ? 'border-(--accent) bg-(--accent-soft)'
                            : 'border-(--border-subtle) bg-(--bg-elevated) hover:border-(--border-strong)'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--text-primary)">
                            <Shield className="h-4 w-4 text-(--accent)" />
                            {card.title}
                          </span>
                          <span className="rounded-md bg-(--bg-surface) px-1.5 py-0.5 font-mono text-[10px] text-(--text-muted)">
                            {card.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-(--text-secondary)">{card.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t.common.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="wg-eu"
                  required
                />
                <Input label={t.inbounds.description} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-(--text-muted)" />
                <input
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                  placeholder={lang === 'fa' ? 'جستجوی نود...' : 'Search nodes…'}
                  className="w-full rounded-xl border border-(--border-subtle) bg-(--bg-elevated) py-2 ps-9 pe-3 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
                />
              </div>

              <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs text-(--text-primary) cursor-pointer">
                <span>{lang === 'fa' ? 'فعلاً به نودی متصل نشود (پیش‌نویس)' : 'Create as unattached draft (no nodes yet)'}</span>
                <input
                  type="checkbox"
                  checked={draftOnly}
                  onChange={(e) => setDraftOnly(e.target.checked)}
                  className="rounded accent-(--accent)"
                />
              </label>

              {!draftOnly && (
                <div className="space-y-2">
                  {filteredNodes.map((n) => {
                    const checked = selectedNodeIds.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() =>
                          setSelectedNodeIds((prev) =>
                            checked ? prev.filter((id) => id !== n.id) : [...prev, n.id],
                          )
                        }
                        className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-start transition ${
                          checked
                            ? 'border-(--accent) bg-(--accent-soft)'
                            : 'border-(--border-subtle) bg-(--bg-elevated) hover:border-(--border-strong)'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Server className="h-4 w-4 text-(--accent)" />
                          <div>
                            <div className="text-sm font-semibold text-(--text-primary)">{n.name}</div>
                            {n.address && <div className="font-mono text-[11px] text-(--text-muted)">{n.address}</div>}
                          </div>
                        </div>
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                            checked
                              ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                              : 'border-(--border-strong)'
                          }`}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Select label={t.inbounds.transport} value={transport} onChange={(e) => setTransport(e.target.value)}>
                  <option value="udp">UDP</option>
                  <option value="tcp">TCP</option>
                </Select>
                <Input label={t.common.port} type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
                <Input label={t.inbounds.subnet} value={subnet} onChange={(e) => setSubnet(e.target.value)} required />
              </div>

              {(protocol === 'wireguard' || protocol === 'amneziawg') && (
                <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-xs font-semibold text-(--text-primary)">
                    {protocol === 'amneziawg' ? 'AmneziaWG & Obfuscation' : 'WireGuard Settings'}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input label="MTU" type="number" value={wgMtu} onChange={(e) => setWgMtu(e.target.value)} />
                    <Input label="Keepalive (s)" type="number" value={wgKeepalive} onChange={(e) => setWgKeepalive(e.target.value)} />
                    <Input label="DNS" value={wgDns} onChange={(e) => setWgDns(e.target.value)} />
                  </div>
                  {protocol === 'amneziawg' && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input label="Junk count (Jc)" type="number" value={awgJc} onChange={(e) => setAwgJc(e.target.value)} />
                      <Input label="Jmin" type="number" value={awgJmin} onChange={(e) => setAwgJmin(e.target.value)} />
                      <Input label="Jmax" type="number" value={awgJmax} onChange={(e) => setAwgJmax(e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              {protocol === 'openvpn' && (
                <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-xs font-semibold text-(--text-primary)">OpenVPN Settings</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Cipher" value={ovpnCipher} onChange={(e) => setOvpnCipher(e.target.value)}>
                      <option value="AES-256-GCM">AES-256-GCM</option>
                      <option value="CHACHA20-POLY1305">CHACHA20-POLY1305</option>
                    </Select>
                    <Input label="Push DNS" value={wgDns} onChange={(e) => setWgDns(e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-(--text-primary) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ovpnTlsCrypt}
                      onChange={(e) => setOvpnTlsCrypt(e.target.checked)}
                      className="rounded accent-(--accent)"
                    />
                    Enable tls-crypt control-channel obfuscation
                  </label>
                </div>
              )}

              {protocol === 'openconnect' && (
                <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-xs font-semibold text-(--text-primary)">OpenConnect (ocserv) Settings</div>
                  <Input label="DNS" value={wgDns} onChange={(e) => setWgDns(e.target.value)} />
                  <label className="flex items-center gap-2 text-xs text-(--text-primary) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ocDtls}
                      onChange={(e) => setOcDtls(e.target.checked)}
                      className="rounded accent-(--accent)"
                    />
                    Enable UDP DTLS acceleration
                  </label>
                </div>
              )}

              {protocol === 'ikev2' && (
                <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-xs font-semibold text-(--text-primary)">IKEv2 / strongSwan Settings</div>
                  <Input
                    label="Server Identity (FQDN)"
                    value={ikeFqdn}
                    onChange={(e) => setIkeFqdn(e.target.value)}
                    placeholder="vpn.example.com"
                  />
                </div>
              )}

              {protocol === 'l2tp' && (
                <div className="space-y-3 rounded-2xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="text-xs font-semibold text-(--text-primary)">L2TP / IPsec Settings</div>
                  <Input
                    label="IPsec Pre-Shared Key (PSK)"
                    value={l2tpPsk}
                    onChange={(e) => setL2tpPsk(e.target.value)}
                    placeholder="Auto-generated if empty"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={lang === 'fa' ? 'آدرس عمومی جایگزین (اختیاری)' : 'Public address override (optional)'}
                  value={publicAddressOverride}
                  onChange={(e) => setPublicAddressOverride(e.target.value)}
                  placeholder="edge.example.com"
                />
                <Select label="Auth mode" value={authMode} onChange={(e) => setAuthMode(e.target.value)}>
                  <option value="publickey">Public Key</option>
                  <option value="certificate">Certificate + Token</option>
                  <option value="password">Username + Password</option>
                  <option value="psk">Pre-Shared Key</option>
                </Select>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs text-(--text-primary) cursor-pointer">
                <span>{lang === 'fa' ? 'اینباند بلافاصله فعال شود' : 'Enable inbound immediately'}</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded accent-(--accent)"
                />
              </label>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>
      </Drawer>

      <Modal
        open={Boolean(inspectInbound)}
        onClose={() => setInspectInbound(null)}
        title={inspectInbound ? `${inspectInbound.name} (${inspectInbound.protocol.toUpperCase()})` : ''}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={inspectTab === 'config' ? 'primary' : 'secondary'} onClick={() => setInspectTab('config')}>
              {t.inbounds.configFile}
            </Button>
            <Button size="sm" variant={inspectTab === 'logs' ? 'primary' : 'secondary'} onClick={() => setInspectTab('logs')}>
              {t.inbounds.logs}
            </Button>
          </div>
          {configData && inspectTab === 'config' && (
            <div>
              <div className="mb-1.5 font-mono text-xs text-(--text-muted)">{configData.path}</div>
              <pre className="max-h-96 overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-app) p-3 font-mono text-xs text-(--text-primary)">
                {configData.content}
              </pre>
            </div>
          )}
          {configData && inspectTab === 'logs' && (
            <pre className="max-h-96 overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-app) p-3 font-mono text-xs text-(--text-secondary)">
              {configData.logs.join('\n')}
            </pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
