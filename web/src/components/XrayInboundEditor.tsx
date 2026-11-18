import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Shield, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Button, Input, Select, StatusPill } from './UiPrimitives';
import { Modal } from './Modal';

export interface XrayComboItem {
  protocol: 'vless' | 'vmess' | 'trojan' | 'shadowsocks';
  transport: 'raw' | 'ws' | 'httpupgrade' | 'xhttp' | 'grpc' | 'kcp';
  security: 'none' | 'tls' | 'reality';
  flows: string[];
  headers: string[];
  modes: string[];
  proxyProtocol: boolean;
  xff: boolean;
  fallbacks: boolean;
  deprecated: string[];
}

export interface XrayCombosResponse {
  items: XrayComboItem[];
  kcpHeaders: string[];
  xhttpModes: string[];
  ssMethods: string[];
}

export interface SniResultItem {
  domain: string;
  tag: string;
  last?: {
    domain: string;
    tag: string;
    grade: 'green' | 'yellow' | 'red';
    reasons: string[];
    tcpMs: number;
    tlsMs: number;
    checkedAt: number;
  };
}

export interface XrayEditorProps {
  settings: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  combos: XrayCombosResponse | null;
  nodeId: number;
  showSniPicker?: boolean;
  inboundId?: number;
  onRefreshInbound?: () => void;
}

export function XraySniPickerModal({
  open,
  onClose,
  nodeId,
  currentSni,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  nodeId: number;
  currentSni: string;
  onSelect: (domain: string, grade?: string, tlsMs?: number) => void;
}) {
  const { lang } = useUi();
  const fa = lang === 'fa';
  const [curated, setCurated] = useState<SniResultItem[]>([]);
  const [found, setFound] = useState<SniResultItem[]>([]);
  const [customDomain, setCustomDomain] = useState('');
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filterTag, setFilterTag] = useState('all');

  const loadSni = async () => {
    const res = await apiFetch<{ curated: SniResultItem[]; found: SniResultItem[] }>(`/xray/sni?node=${nodeId}`);
    setCurated(res.curated || []);
    setFound(res.found || []);
  };

  useEffect(() => {
    if (open) loadSni().catch(() => undefined);
  }, [open, nodeId]);

  const pollJob = async (jobId: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const job = await apiFetch<{ state: string }>(`/xray/sni/jobs/${jobId}`);
      if (job.state === 'done' || job.state === 'error') break;
    }
    await loadSni();
  };

  const testDomains = async (domains: string[]) => {
    if (domains.length === 0) return;
    setTesting(true);
    try {
      const job = await apiFetch<{ id: string }>('/xray/sni/test', {
        method: 'POST',
        body: JSON.stringify({ node: nodeId, domains }),
      });
      await pollJob(job.id);
    } finally {
      setTesting(false);
    }
  };

  const scanNeighbours = async () => {
    setScanning(true);
    try {
      const job = await apiFetch<{ id: string }>('/xray/sni/scan', {
        method: 'POST',
        body: JSON.stringify({ node: nodeId, force: true }),
      });
      await pollJob(job.id);
    } finally {
      setScanning(false);
    }
  };

  const tags = useMemo(() => {
    const s = new Set(['all', ...curated.map((c) => c.tag)]);
    return [...s];
  }, [curated]);

  const combined = useMemo(() => {
    const list = [...curated, ...found];
    return filterTag === 'all' ? list : list.filter((i) => i.tag === filterTag);
  }, [curated, found, filterTag]);

  const gradeTone = (g?: string) => (g === 'green' ? 'good' : g === 'yellow' ? 'warn' : g === 'red' ? 'bad' : 'neutral');

  return (
    <Modal open={open} onClose={onClose} title={fa ? 'انتخاب دامنه استتار (SNI)' : 'Choose camouflage site (SNI)'} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Input
              label={fa ? 'آزمایش دامنه دلخواه' : 'Test custom domain'}
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="www.example.com"
            />
          </div>
          <Button
            variant="ghost"
            disabled={testing || !customDomain.trim()}
            onClick={() => testDomains([customDomain.trim()]).then(() => setCustomDomain(''))}
          >
            {testing ? (fa ? 'در حال تست...' : 'Testing...') : fa ? 'تست' : 'Test'}
          </Button>
          <Button
            variant="ghost"
            disabled={testing}
            onClick={() => testDomains(curated.slice(0, 12).map((c) => c.domain))}
          >
            <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
            {fa ? 'تست لیست پیشنهادی' : 'Test top sites'}
          </Button>
          <Button variant="ghost" disabled={scanning} onClick={scanNeighbours}>
            <Search size={14} />
            {scanning ? (fa ? 'در حال اسکن...' : 'Scanning...') : fa ? 'یافتن از همسایه‌های سرور' : 'Find from neighbours'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tg) => (
            <button
              key={tg}
              type="button"
              onClick={() => setFilterTag(tg)}
              className="px-2.5 py-1 rounded-lg text-xs border"
              style={{
                borderColor: filterTag === tg ? 'var(--accent)' : 'var(--line)',
                background: filterTag === tg ? 'var(--accent-wash)' : 'var(--raise-2)',
                color: filterTag === tg ? 'var(--accent-text)' : 'var(--ink-2)',
              }}
            >
              {tg}
            </button>
          ))}
        </div>

        <div className="max-h-[45vh] overflow-y-auto divide-y rounded-xl border" style={{ borderColor: 'var(--line)' }}>
          {combined.map((item) => {
            const selected = item.domain === currentSni;
            return (
              <div
                key={`${item.tag}-${item.domain}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                style={{ background: selected ? 'var(--accent-wash)' : 'transparent' }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs sm:text-sm truncate" style={{ color: 'var(--ink)' }}>
                    {item.domain}
                  </div>
                  <div className="text-[11px] flex items-center gap-2" style={{ color: 'var(--ink-3)' }}>
                    <span>{item.tag}</span>
                    {item.last && (
                      <>
                        <span>·</span>
                        <span className="num">{item.last.tlsMs} ms</span>
                        {item.last.reasons.length > 0 && <span>({item.last.reasons.join(', ')})</span>}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.last && (
                    <StatusPill tone={gradeTone(item.last.grade)}>{item.last.grade}</StatusPill>
                  )}
                  <Button
                    size="sm"
                    variant={selected ? 'primary' : 'ghost'}
                    onClick={() => {
                      onSelect(item.domain, item.last?.grade, item.last?.tlsMs);
                      onClose();
                    }}
                  >
                    {selected ? (fa ? 'انتخاب‌شده' : 'Selected') : fa ? 'انتخاب' : 'Use'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export function XrayAdvancedSection({
  settings,
  onChange,
  combos,
  nodeId,
  inboundId,
  onRefreshInbound,
}: XrayEditorProps) {
  const { lang } = useUi();
  const fa = lang === 'fa';
  const [sniModalOpen, setSniModalOpen] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [proxyCheckResult, setProxyCheckResult] = useState<{
    headerReceived: boolean;
    lastIp: string;
    looksLikeRelay: boolean;
  } | null>(null);

  const protocol = String(settings.protocol || 'vless') as XrayComboItem['protocol'];
  const transport = String(settings.transport || 'raw') as XrayComboItem['transport'];
  const security = String(settings.security || 'reality') as XrayComboItem['security'];

  const allowedTransports = useMemo(() => {
    if (!combos) return ['raw', 'ws', 'httpupgrade', 'xhttp', 'grpc', 'kcp'];
    return [...new Set(combos.items.filter((c) => c.protocol === protocol).map((c) => c.transport))];
  }, [combos, protocol]);

  const allowedSecurities = useMemo(() => {
    if (!combos) return ['reality', 'tls', 'none'];
    return [...new Set(combos.items.filter((c) => c.protocol === protocol && c.transport === transport).map((c) => c.security))];
  }, [combos, protocol, transport]);

  const activeCombo = useMemo(() => {
    return combos?.items.find((c) => c.protocol === protocol && c.transport === transport && c.security === security) || null;
  }, [combos, protocol, transport, security]);

  const update = (patch: Record<string, unknown>) => {
    onChange({ ...settings, ...patch });
  };

  const handleProtocolChange = (nextProto: XrayComboItem['protocol']) => {
    const firstCombo = combos?.items.find((c) => c.protocol === nextProto);
    update({
      protocol: nextProto,
      transport: firstCombo?.transport || 'raw',
      security: firstCombo?.security || 'none',
      flow: firstCombo?.flows.includes(String(settings.flow || '')) ? settings.flow : firstCombo?.flows[0] || '',
    });
  };

  const handleTransportChange = (nextTrans: XrayComboItem['transport']) => {
    const firstCombo = combos?.items.find((c) => c.protocol === protocol && c.transport === nextTrans);
    update({
      transport: nextTrans,
      security: firstCombo?.security || security,
      flow: firstCombo?.flows.includes(String(settings.flow || '')) ? settings.flow : '',
    });
  };

  const reality = (settings.reality && typeof settings.reality === 'object' ? settings.reality : {}) as Record<string, unknown>;
  const tlsObj = (settings.tls && typeof settings.tls === 'object' ? settings.tls : {}) as Record<string, unknown>;
  const sniffing = (settings.sniffing && typeof settings.sniffing === 'object' ? settings.sniffing : { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: false }) as Record<string, unknown>;
  const currentSni = Array.isArray(reality.serverNames) ? String(reality.serverNames[0] || '') : '';

  const rotateRealityKeys = async () => {
    if (!inboundId) return;
    if (!window.confirm(fa ? 'تغییر کلید Reality لینک تمام کاربران را تغییر می‌دهد. ادامه می‌دهید؟' : 'Rotating Reality keys changes every client link. Continue?')) return;
    setBusyAction('keys');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/reality-keys`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      onRefreshInbound?.();
    } finally {
      setBusyAction('');
    }
  };

  const replaceBestSni = async () => {
    if (!inboundId) return;
    if (!window.confirm(fa ? 'جایگزینی دامنه SNI لینک تمام کاربران را تغییر می‌دهد. ادامه می‌دهید؟' : 'Replacing the camouflage site changes every client link. Continue?')) return;
    setBusyAction('sni');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/sni/replace`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      onRefreshInbound?.();
    } finally {
      setBusyAction('');
    }
  };

  const checkProxyProtocol = async () => {
    if (!inboundId) return;
    setBusyAction('proxy');
    try {
      const res = await apiFetch<{ headerReceived: boolean; lastIp: string; looksLikeRelay: boolean }>(
        `/inbounds/${inboundId}/xray/proxy-check`,
      );
      setProxyCheckResult(res);
    } finally {
      setBusyAction('');
    }
  };

  const retryTlsCert = async () => {
    if (!inboundId) return;
    setBusyAction('cert');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/certificate`, { method: 'POST' });
      onRefreshInbound?.();
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select
          label={fa ? 'پروتکل' : 'Protocol'}
          value={protocol}
          onChange={(e) => handleProtocolChange(e.target.value as XrayComboItem['protocol'])}
        >
          <option value="vless">VLESS</option>
          <option value="vmess">VMess</option>
          <option value="trojan">Trojan</option>
          <option value="shadowsocks">Shadowsocks</option>
        </Select>

        <Select
          label={fa ? 'ترنسپورت' : 'Transport'}
          value={transport}
          onChange={(e) => handleTransportChange(e.target.value as XrayComboItem['transport'])}
        >
          {allowedTransports.map((tr) => (
            <option key={tr} value={tr}>
              {tr === 'raw' ? 'TCP (raw)' : tr === 'ws' ? 'WebSocket (ws)' : tr === 'xhttp' ? 'XHTTP (splithttp)' : tr}
            </option>
          ))}
        </Select>

        <Select
          label={fa ? 'امنیت' : 'Security'}
          value={security}
          onChange={(e) => update({ security: e.target.value })}
        >
          {allowedSecurities.map((sec) => (
            <option key={sec} value={sec}>
              {sec === 'reality' ? 'Reality' : sec === 'tls' ? 'TLS' : fa ? 'بدون رمزنگاری (None)' : 'None'}
            </option>
          ))}
        </Select>
      </div>

      {activeCombo && activeCombo.flows.length > 1 && (
        <Select
          label="Flow"
          value={String(settings.flow || '')}
          onChange={(e) => update({ flow: e.target.value })}
        >
          {activeCombo.flows.map((f) => (
            <option key={f || 'none'} value={f}>
              {f || (fa ? 'بدون flow' : 'None')}
            </option>
          ))}
        </Select>
      )}

      {protocol === 'shadowsocks' && (
        <Select
          label={fa ? 'روش رمزنگاری Shadowsocks' : 'Shadowsocks method'}
          value={String(settings.ssMethod || '2022-blake3-aes-128-gcm')}
          onChange={(e) => update({ ssMethod: e.target.value })}
        >
          {(combos?.ssMethods || ['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', 'aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305']).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      )}

      {/* Transport options */}
      {transport === 'raw' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label={fa ? 'نوع هدر TCP' : 'Raw header'}
            value={String(settings.rawHeader || 'none')}
            onChange={(e) => update({ rawHeader: e.target.value })}
          >
            <option value="none">{fa ? 'عادی (none)' : 'none'}</option>
            <option value="http">http</option>
          </Select>
          {settings.rawHeader === 'http' && (
            <>
              <Input
                label={fa ? 'مسیر HTTP' : 'HTTP path'}
                value={String(settings.rawHttpPath || '/')}
                onChange={(e) => update({ rawHttpPath: e.target.value })}
              />
              <Input
                label={fa ? 'هاست‌های HTTP (با کاما)' : 'HTTP hosts (comma-separated)'}
                value={Array.isArray(settings.rawHttpHosts) ? settings.rawHttpHosts.join(', ') : ''}
                onChange={(e) => update({ rawHttpHosts: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </>
          )}
        </div>
      )}

      {(transport === 'ws' || transport === 'httpupgrade' || transport === 'xhttp') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label={fa ? 'مسیر (Path)' : 'Path'}
            value={String(settings.path || '/')}
            onChange={(e) => update({ path: e.target.value })}
          />
          <Input
            label={fa ? 'هدر Host' : 'Host header'}
            value={String(settings.host || '')}
            onChange={(e) => update({ host: e.target.value })}
          />
          {transport === 'xhttp' && (
            <Select
              label={fa ? 'حالت XHTTP' : 'XHTTP mode'}
              value={String(settings.xhttpMode || 'auto')}
              onChange={(e) => update({ xhttpMode: e.target.value })}
            >
              {(combos?.xhttpModes || ['auto', 'packet-up', 'stream-up']).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          )}
        </div>
      )}

      {transport === 'grpc' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <Input
            label="gRPC serviceName"
            value={String(settings.serviceName || 'grpc')}
            onChange={(e) => update({ serviceName: e.target.value })}
          />
          <label className="inline-flex items-center gap-2 text-xs pb-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.grpcMultiMode)}
              onChange={(e) => update({ grpcMultiMode: e.target.checked })}
            />
            <span>{fa ? 'حالت Multi-mode' : 'Multi mode'}</span>
          </label>
        </div>
      )}

      {transport === 'kcp' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label={fa ? 'نوع هدر mKCP' : 'mKCP header'}
            value={String(settings.kcpHeader || 'none')}
            onChange={(e) => update({ kcpHeader: e.target.value })}
          >
            {(combos?.kcpHeaders || ['none', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard']).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </Select>
          <Input
            label={fa ? 'سید mKCP (اختیاری)' : 'mKCP seed'}
            value={String(settings.kcpSeed || '')}
            onChange={(e) => update({ kcpSeed: e.target.value })}
          />
        </div>
      )}

      {/* Security: Reality */}
      {security === 'reality' && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
              <Shield size={14} style={{ color: 'var(--accent)' }} />
              <span>Reality</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setSniModalOpen(true)}>
                <Sparkles size={13} />
                {fa ? 'تغییر دامنه استتار' : 'Change SNI'}
              </Button>
              {inboundId && (
                <>
                  <Button type="button" size="sm" variant="ghost" disabled={busyAction === 'sni'} onClick={replaceBestSni}>
                    {fa ? 'جایگزینی خودکار SNI' : 'Auto-replace SNI'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busyAction === 'keys'} onClick={rotateRealityKeys}>
                    {fa ? 'چرخش کلید Reality' : 'Rotate Reality keys'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label={fa ? 'دامنه استتار (SNI)' : 'Camouflage site (SNI)'}
              value={currentSni}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({
                  reality: { ...reality, serverNames: v ? [v] : [], target: v ? `${v}:443` : '' },
                });
              }}
            />
            <Input
              label="Target (dest)"
              value={String(reality.target || '')}
              onChange={(e) => update({ reality: { ...reality, target: e.target.value } })}
            />
            <Input
              label="Short IDs (comma-separated hex)"
              value={Array.isArray(reality.shortIds) ? reality.shortIds.join(', ') : ''}
              onChange={(e) =>
                update({
                  reality: {
                    ...reality,
                    shortIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            />
            <Select
              label="TLS Fingerprint (uTLS)"
              value={String(settings.fingerprint || 'chrome')}
              onChange={(e) => update({ fingerprint: e.target.value })}
            >
              {['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'random', 'randomized'].map((fp) => (
                <option key={fp} value={fp}>{fp}</option>
              ))}
            </Select>
          </div>
          {Boolean(settings.realityPublicKey) && (
            <div className="text-[11px] font-mono break-all" style={{ color: 'var(--ink-3)' }}>
              Public Key: {String(settings.realityPublicKey)}
            </div>
          )}
        </div>
      )}

      {/* Security: TLS */}
      {security === 'tls' && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>TLS</div>
            {inboundId && (
              <Button type="button" size="sm" variant="ghost" disabled={busyAction === 'cert'} onClick={retryTlsCert}>
                {fa ? 'درخواست گواهی Let’s Encrypt' : 'Issue / retry Let’s Encrypt cert'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={fa ? 'نام میزبان گواهی (TLS Host)' : 'Certificate host'}
              value={String(settings.tlsHost || settings.cdnHost || '')}
              onChange={(e) => update({ tlsHost: e.target.value })}
            />
            <Input
              label={fa ? 'فایل گواهی (certFile)' : 'Cert file'}
              value={String(tlsObj.certFile || '')}
              onChange={(e) => update({ tls: { ...tlsObj, certFile: e.target.value } })}
            />
            <Input
              label={fa ? 'فایل کلید خصوصی (keyFile)' : 'Key file'}
              value={String(tlsObj.keyFile || '')}
              onChange={(e) => update({ tls: { ...tlsObj, keyFile: e.target.value } })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="ALPN"
              value={Array.isArray(tlsObj.alpn) ? tlsObj.alpn.join(', ') : 'h2, http/1.1'}
              onChange={(e) =>
                update({ tls: { ...tlsObj, alpn: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })
              }
            />
            <Select
              label={fa ? 'حداقل نسخه TLS' : 'Lowest TLS version'}
              value={String(tlsObj.minVersion || '1.2')}
              onChange={(e) => update({ tls: { ...tlsObj, minVersion: e.target.value } })}
            >
              <option value="1.2">1.2</option>
              <option value="1.3">1.3</option>
            </Select>
          </div>
        </div>
      )}

      {/* Relay / CDN / Device Limits */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
            {fa ? 'رله، CDN و محدودیت سرعت/دستگاه' : 'Relay, CDN and devices'}
          </div>
          {inboundId && Boolean(settings.proxyProtocol) && (
            <Button type="button" size="sm" variant="ghost" disabled={busyAction === 'proxy'} onClick={checkProxyProtocol}>
              {fa ? 'بررسی دریافت PROXY protocol' : 'Check PROXY header'}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.proxyProtocol)}
              onChange={(e) => update({ proxyProtocol: e.target.checked })}
            />
            <span>{fa ? 'الزام PROXY protocol' : 'Require PROXY protocol'}</span>
          </label>

          <Select
            label={fa ? 'محاسبه محدودیت سرعت بر اساس' : 'Speed limit counted per'}
            value={String(settings.speedMode || 'device')}
            onChange={(e) => update({ speedMode: e.target.value })}
          >
            <option value="device">{fa ? 'هر دستگاه' : 'Device'}</option>
            <option value="client">{fa ? 'کل کاربر' : 'Whole client'}</option>
          </Select>
        </div>

        <Input
          label={fa ? 'آی‌پی یا رنج مجاز رله‌ها (allowFrom، با کاما)' : 'Allowed relay IPs/CIDRs (comma-separated)'}
          value={Array.isArray(settings.allowFrom) ? settings.allowFrom.join(', ') : ''}
          onChange={(e) => update({ allowFrom: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />

        {proxyCheckResult && (
          <div className="text-xs" style={{ color: proxyCheckResult.headerReceived ? 'var(--good)' : 'var(--warn)' }}>
            {proxyCheckResult.headerReceived
              ? `PROXY header received · last IP: ${proxyCheckResult.lastIp}${proxyCheckResult.looksLikeRelay ? ' (relay IP)' : ''}`
              : fa
                ? 'هنوز هدر PROXY دریافت نشده است.'
                : 'No PROXY protocol header seen yet.'}
          </div>
        )}
      </div>

      {/* Sniffing & Link Overrides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          label={fa ? 'آدرس اتصال در لینک‌ها (Connect address)' : 'Connect address override'}
          value={String(settings.connectAddress || '')}
          onChange={(e) => update({ connectAddress: e.target.value })}
          placeholder={fa ? 'پیش‌فرض آی‌پی نود' : 'Default node IP/host'}
        />
        <Input
          label={fa ? 'SNI در لینک‌ها' : 'SNI in links'}
          value={String(settings.sniOverride || '')}
          onChange={(e) => update({ sniOverride: e.target.value })}
        />
        <Input
          label={fa ? 'Host در لینک‌ها' : 'Host in links'}
          value={String(settings.hostOverride || '')}
          onChange={(e) => update({ hostOverride: e.target.value })}
        />
      </div>

      <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={sniffing.enabled !== false}
          onChange={(e) => update({ sniffing: { ...sniffing, enabled: e.target.checked } })}
        />
        <span>{fa ? 'فعال‌سازی Sniffing ترافیک (http, tls, quic)' : 'Sniff traffic (http, tls, quic)'}</span>
      </label>

      <XraySniPickerModal
        open={sniModalOpen}
        onClose={() => setSniModalOpen(false)}
        nodeId={nodeId}
        currentSni={currentSni}
        onSelect={(domain, grade, tlsMs) => {
          update({
            reality: { ...reality, serverNames: [domain], target: `${domain}:443` },
            ...(grade ? { sniGrade: grade, sniMillis: tlsMs ?? 0, sniTested: true } : {}),
          });
        }}
      />
    </div>
  );
}
