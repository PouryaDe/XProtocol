import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Globe2, Play, Plus, RefreshCw, Shield, Trash2, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Button, Card, Input, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';

interface OutboundItem {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  lastTest: { reachable: boolean; latencyMs: number | null; error?: string | null; testedAt: string } | null;
}

interface RoutingRule {
  id: string;
  geosite?: string[];
  geoip?: string[];
  domains?: string[];
  ips?: string[];
  ports?: string;
  action: 'outbound' | 'direct' | 'block';
  outboundTag?: string;
}

interface NodeOption {
  id: number;
  name: string;
}

const GEOSITE_PRESETS = [
  'google-gemini',
  'openai',
  'anthropic',
  'youtube',
  'netflix',
  'spotify',
  'telegram',
  'category-ads-all',
  'category-ir',
];

const GEOIP_PRESETS = ['ir', 'private', 'cn', 'ru'];

export function RoutingPage() {
  const { t, lang } = useUi();
  const [tab, setTab] = useState<'outbounds' | 'rules'>('outbounds');
  const [outbounds, setOutbounds] = useState<OutboundItem[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number>(1);
  const [enabled, setEnabled] = useState(false);
  const [defaultAction, setDefaultAction] = useState<'direct' | 'outbound'>('direct');
  const [defaultOutboundId, setDefaultOutboundId] = useState<string>('');
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [renderedConfig, setRenderedConfig] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [geoUpdating, setGeoUpdating] = useState(false);

  // Add rule modal
  const [ruleOpen, setRuleOpen] = useState(false);
  const [geoSearch, setGeoSearch] = useState('');
  const [ruleGeosite, setRuleGeosite] = useState<string[]>([]);
  const [ruleGeoip, setRuleGeoip] = useState<string[]>([]);
  const [ruleDomains, setRuleDomains] = useState('');
  const [ruleIps, setRuleIps] = useState('');
  const [rulePorts, setRulePorts] = useState('');
  const [ruleAction, setRuleAction] = useState<'outbound' | 'direct' | 'block'>('outbound');
  const [ruleOutboundTag, setRuleOutboundTag] = useState('');

  // Add outbound modal
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<'form' | 'link' | 'json'>('form');
  const [obName, setObName] = useState('');
  const [obType, setObType] = useState('vless');
  const [obAddress, setObAddress] = useState('');
  const [obPort, setObPort] = useState('443');
  const [obId, setObId] = useState('');
  const [obTransport, setObTransport] = useState('tcp');
  const [obSecurity, setObSecurity] = useState('tls');
  const [obSni, setObSni] = useState('');
  const [obMux, setObMux] = useState(false);
  const [obLink, setObLink] = useState('');
  const [obJson, setObJson] = useState('{"settings":{}}');

  const loadBase = async () => {
    const [oRes, nRes] = await Promise.all([
      apiFetch<{ outbounds: OutboundItem[] }>('/routing/outbounds'),
      apiFetch<{ nodes: NodeOption[] }>('/nodes'),
    ]);
    setOutbounds(oRes.outbounds);
    setNodes(nRes.nodes);
    if (nRes.nodes.length > 0 && !nRes.nodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(nRes.nodes[0].id);
    }
  };

  const loadPolicy = async (nid: number) => {
    const res = await apiFetch<{
      policy: {
        enabled: boolean;
        defaultAction: 'direct' | 'outbound';
        defaultOutboundId: number | null;
        rules: RoutingRule[];
      };
      renderedConfig: string;
    }>(`/routing/policies/${nid}`);
    setEnabled(res.policy.enabled);
    setDefaultAction(res.policy.defaultAction);
    setDefaultOutboundId(res.policy.defaultOutboundId ? String(res.policy.defaultOutboundId) : '');
    setRules(res.policy.rules || []);
    setRenderedConfig(res.renderedConfig);
  };

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadPolicy(selectedNodeId);
  }, [selectedNodeId]);

  const parseLink = async () => {
    const parsed = await apiFetch<{ name: string; type: string; config: Record<string, unknown> }>(
      '/routing/outbounds/parse-link',
      { method: 'POST', body: JSON.stringify({ link: obLink }) },
    );
    setObName(parsed.name);
    setObType(parsed.type);
    setObAddress(String(parsed.config.address || ''));
    setObPort(String(parsed.config.port || '443'));
    setObId(String(parsed.config.id || parsed.config.password || ''));
    setMode('form');
  };

  const createOutbound = async (e: React.FormEvent) => {
    e.preventDefault();
    const config =
      mode === 'json'
        ? JSON.parse(obJson)
        : {
            address: obAddress,
            port: Number(obPort),
            id: obId,
            network: obTransport,
            security: obSecurity,
            sni: obSni.trim() || undefined,
            mux: obMux,
          };
    await apiFetch('/routing/outbounds', {
      method: 'POST',
      body: JSON.stringify({ name: obName, type: obType, config }),
    });
    setAddOpen(false);
    loadBase();
  };

  const addPresetOutbound = async (preset: 'warp' | 'nordvpn' | 'psiphon') => {
    await apiFetch('/routing/outbounds', {
      method: 'POST',
      body: JSON.stringify({ preset }),
    });
    loadBase();
  };

  const updateGeoLists = async () => {
    setGeoUpdating(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/routing/geo-update', { method: 'POST' });
      setSavedMsg(res.message);
      setTimeout(() => setSavedMsg(''), 3500);
    } finally {
      setGeoUpdating(false);
    }
  };

  const openNewRuleModal = () => {
    setGeoSearch('');
    setRuleGeosite([]);
    setRuleGeoip([]);
    setRuleDomains('');
    setRuleIps('');
    setRulePorts('');
    setRuleAction(outbounds.length > 0 ? 'outbound' : 'direct');
    setRuleOutboundTag(outbounds[0]?.name || '');
    setRuleOpen(true);
  };

  const saveNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    const newRule: RoutingRule = {
      id: `r-${Date.now()}`,
      geosite: ruleGeosite.length > 0 ? ruleGeosite.map((g) => `geosite:${g}`) : undefined,
      geoip: ruleGeoip.length > 0 ? ruleGeoip.map((g) => `geoip:${g}`) : undefined,
      domains: ruleDomains
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ips: ruleIps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ports: rulePorts.trim() || undefined,
      action: ruleAction,
      outboundTag: ruleAction === 'outbound' ? ruleOutboundTag || outbounds[0]?.name : undefined,
    };
    setRules((prev) => [...prev, newRule]);
    setRuleOpen(false);
  };

  const filteredGeosites = useMemo(() => {
    const q = geoSearch.trim().toLowerCase();
    return q ? GEOSITE_PRESETS.filter((g) => g.toLowerCase().includes(q)) : GEOSITE_PRESETS;
  }, [geoSearch]);

  const savePolicy = async () => {
    await apiFetch(`/routing/policies/${selectedNodeId}`, {
      method: 'PUT',
      body: JSON.stringify({
        enabled,
        inboundScope: 'all',
        defaultAction,
        defaultOutboundId: defaultOutboundId ? Number(defaultOutboundId) : null,
        rules,
      }),
    });
    setSavedMsg('Saved and applied.');
    setTimeout(() => setSavedMsg(''), 2500);
    loadPolicy(selectedNodeId);
  };

  const addQuickRule = (kind: 'gemini' | 'openai' | 'ir_direct') => {
    const targetTag = outbounds[0]?.name;
    const rule: RoutingRule =
      kind === 'gemini'
        ? { id: `r-${Date.now()}`, geosite: ['geosite:google-gemini'], action: 'outbound', outboundTag: targetTag }
        : kind === 'openai'
          ? { id: `r-${Date.now()}`, geosite: ['geosite:openai'], action: 'outbound', outboundTag: targetTag }
          : { id: `r-${Date.now()}`, geosite: ['geosite:category-ir'], geoip: ['geoip:ir'], action: 'direct' };
    setRules((prev) => [...prev, rule]);
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    const next = [...rules];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setRules(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-(--text-primary)">{t.routing.title}</h1>
        <div className="flex gap-2">
          <Button variant={tab === 'outbounds' ? 'primary' : 'secondary'} onClick={() => setTab('outbounds')}>
            {t.routing.outbounds}
          </Button>
          <Button variant={tab === 'rules' ? 'primary' : 'secondary'} onClick={() => setTab('rules')}>
            {t.routing.rules}
          </Button>
        </div>
      </div>

      {tab === 'outbounds' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.routing.addOutbound}
            </Button>
            <Button onClick={() => addPresetOutbound('warp')}>
              <Zap className="h-4 w-4 text-amber-400" />
              {t.routing.addWarp}
            </Button>
            <Button onClick={() => addPresetOutbound('nordvpn')}>
              <Shield className="h-4 w-4 text-sky-400" />
              {t.routing.addNord}
            </Button>
            <Button onClick={() => addPresetOutbound('psiphon')}>
              <Globe2 className="h-4 w-4 text-emerald-400" />
              {lang === 'fa' ? 'افزودن سایفون' : 'Add Psiphon'}
            </Button>
          </div>

          <div className="grid gap-3">
            {outbounds.map((ob) => (
              <Card key={ob.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-(--accent-soft) px-2 py-0.5 text-[11px] font-bold uppercase text-(--accent)">
                      {ob.type}
                    </span>
                    <span className="font-semibold text-(--text-primary)">{ob.name}</span>
                    {ob.lastTest && (
                      <StatusPill
                        tone={ob.lastTest.reachable ? 'green' : 'red'}
                        label={ob.lastTest.reachable ? `${ob.lastTest.latencyMs} ms` : 'Failed'}
                      />
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-(--text-muted)">
                    {String(ob.config.address || '—')}:{String(ob.config.port || '—')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await apiFetch(`/routing/outbounds/${ob.id}/test`, { method: 'POST' });
                      loadBase();
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t.routing.test}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await apiFetch(`/routing/outbounds/${ob.id}`, { method: 'DELETE' });
                      loadBase();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
            {outbounds.length === 0 && (
              <Card className="p-8 text-center text-xs text-(--text-muted)">
                No outbounds configured yet. Add a VLESS/VMess/Trojan/WireGuard outbound or create a 1-click WARP outbound.
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <Select
              label={t.common.node}
              value={String(selectedNodeId)}
              onChange={(e) => setSelectedNodeId(Number(e.target.value))}
            >
              {nodes.map((n) => (
                <option key={n.id} value={String(n.id)}>
                  {n.name}
                </option>
              ))}
            </Select>

            <label className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>{t.routing.enableRouting}</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t.routing.defaultAction}
                value={defaultAction}
                onChange={(e) => setDefaultAction(e.target.value as 'direct' | 'outbound')}
              >
                <option value="direct">{t.routing.direct}</option>
                <option value="outbound">{t.routing.throughOutbound}</option>
              </Select>
              {defaultAction === 'outbound' && (
                <Select
                  label="Default outbound"
                  value={defaultOutboundId}
                  onChange={(e) => setDefaultOutboundId(e.target.value)}
                >
                  <option value="">Select outbound…</option>
                  {outbounds.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-(--text-secondary)">{t.routing.quickStart}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={updateGeoLists} disabled={geoUpdating}>
                    <RefreshCw className={`h-3.5 w-3.5 ${geoUpdating ? 'animate-spin' : ''}`} />
                    {lang === 'fa' ? 'بروزرسانی لیست‌های Geo' : 'Update geo lists'}
                  </Button>
                  <Button size="sm" variant="primary" onClick={openNewRuleModal}>
                    <Plus className="h-3.5 w-3.5" />
                    {lang === 'fa' ? 'قانون جدید' : 'New rule'}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => addQuickRule('gemini')}>+ Gemini via outbound</Button>
                <Button size="sm" onClick={() => addQuickRule('openai')}>+ OpenAI via outbound</Button>
                <Button size="sm" onClick={() => addQuickRule('ir_direct')}>+ Iran direct</Button>
              </div>
            </div>

            <div className="space-y-2">
              {rules.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-mono text-(--text-primary)">
                      {[...(r.geosite || []), ...(r.geoip || []), ...(r.domains || []), ...(r.ips || [])].join(', ') || '*'}
                    </div>
                    <div className="text-(--text-muted)">
                      → {r.action} {r.outboundTag ? `(${r.outboundTag})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => moveRule(idx, -1)}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => moveRule(idx, 1)}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-400">{savedMsg}</span>
              <Button variant="primary" onClick={savePolicy}>{t.common.save}</Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-(--text-primary)">Generated Xray Routing Policy</h2>
            <pre className="max-h-[460px] overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-app) p-3 font-mono text-xs text-(--text-secondary)">
              {renderedConfig}
            </pre>
          </Card>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t.routing.addOutbound}>
        <div className="mb-4 flex gap-2">
          {(['form', 'link', 'json'] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </Button>
          ))}
        </div>

        {mode === 'link' ? (
          <div className="space-y-3">
            <Input
              label="Share link (vless://, vmess://, trojan://, ss://, hy2://)"
              value={obLink}
              onChange={(e) => setObLink(e.target.value)}
              placeholder="vless://..."
            />
            <Button variant="primary" onClick={parseLink}>Parse into form</Button>
          </div>
        ) : (
          <form onSubmit={createOutbound} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t.common.name} value={obName} onChange={(e) => setObName(e.target.value)} required />
              <Select label={t.common.protocol} value={obType} onChange={(e) => setObType(e.target.value)}>
                <option value="vless">VLESS</option>
                <option value="vmess">VMess</option>
                <option value="trojan">Trojan</option>
                <option value="shadowsocks">Shadowsocks</option>
                <option value="hysteria2">Hysteria2</option>
                <option value="wireguard">WireGuard</option>
                <option value="socks">SOCKS5</option>
                <option value="http">HTTP</option>
              </Select>
            </div>
            {mode === 'form' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Address" value={obAddress} onChange={(e) => setObAddress(e.target.value)} required />
                  <Input label={t.common.port} type="number" value={obPort} onChange={(e) => setObPort(e.target.value)} required />
                  <Input label="UUID / Password" value={obId} onChange={(e) => setObId(e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select label="Transport" value={obTransport} onChange={(e) => setObTransport(e.target.value)}>
                    <option value="tcp">TCP</option>
                    <option value="ws">WebSocket</option>
                    <option value="grpc">gRPC</option>
                    <option value="httpupgrade">HTTPUpgrade</option>
                  </Select>
                  <Select label="Security" value={obSecurity} onChange={(e) => setObSecurity(e.target.value)}>
                    <option value="none">None</option>
                    <option value="tls">TLS</option>
                    <option value="reality">REALITY</option>
                  </Select>
                  <Input label="SNI (optional)" value={obSni} onChange={(e) => setObSni(e.target.value)} placeholder="cdn.example.com" />
                </div>
                <label className="flex items-center gap-2 text-xs text-(--text-primary) cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obMux}
                    onChange={(e) => setObMux(e.target.checked)}
                    className="rounded accent-(--accent)"
                  />
                  Enable Xray Mux multiplexing
                </label>
              </div>
            ) : (
              <textarea
                rows={6}
                value={obJson}
                onChange={(e) => setObJson(e.target.value)}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) p-3 font-mono text-xs text-(--text-primary)"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setAddOpen(false)}>{t.common.cancel}</Button>
              <Button type="submit" variant="primary">{t.common.save}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* New Routing Rule Modal */}
      <Modal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title={lang === 'fa' ? 'قانون مسیریابی جدید' : 'New routing rule'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={saveNewRule} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-(--text-secondary)">Geosite</span>
              <input
                value={geoSearch}
                onChange={(e) => setGeoSearch(e.target.value)}
                placeholder={lang === 'fa' ? 'فیلتر...' : 'Search geosite…'}
                className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredGeosites.map((chip) => {
                const active = ruleGeosite.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setRuleGeosite((prev) => (active ? prev.filter((x) => x !== chip) : [...prev, chip]))
                    }
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                      active
                        ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                        : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-(--text-secondary)">GeoIP</div>
            <div className="flex flex-wrap gap-1.5">
              {GEOIP_PRESETS.map((chip) => {
                const active = ruleGeoip.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setRuleGeoip((prev) => (active ? prev.filter((x) => x !== chip) : [...prev, chip]))
                    }
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                      active
                        ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                        : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Domains (comma separated)"
              value={ruleDomains}
              onChange={(e) => setRuleDomains(e.target.value)}
              placeholder="domain:example.com, full:api.test"
            />
            <Input
              label="IPs / CIDRs"
              value={ruleIps}
              onChange={(e) => setRuleIps(e.target.value)}
              placeholder="1.1.1.1, 10.0.0.0/8"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Ports" value={rulePorts} onChange={(e) => setRulePorts(e.target.value)} placeholder="80,443" />
            <Select
              label="Action"
              value={ruleAction}
              onChange={(e) => setRuleAction(e.target.value as 'outbound' | 'direct' | 'block')}
            >
              <option value="outbound">{t.routing.throughOutbound}</option>
              <option value="direct">{t.routing.direct}</option>
              <option value="block">Block</option>
            </Select>
            {ruleAction === 'outbound' && (
              <Select
                label="Outbound"
                value={ruleOutboundTag}
                onChange={(e) => setRuleOutboundTag(e.target.value)}
              >
                {outbounds.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setRuleOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.create}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
