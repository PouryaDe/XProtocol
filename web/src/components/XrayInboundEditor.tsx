import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import type { InboundRemote } from '../lib/inboundTypes';
import { Button, Segmented, StatusPill } from './UiPrimitives';
import { Modal } from './Modal';
import { ConnectAddressesField } from './ConnectAddressesField';

export interface XrayComboItem {
  protocol: string;
  transport: string;
  security: string;
  flows: string[];
  deprecated: string[];
}

export interface XrayCombosResponse {
  items: XrayComboItem[];
  kcpHeaders: string[];
  xhttpModes: string[];
  ssMethods: string[];
}

export interface SniCandidate {
  domain: string;
  ip?: string;
  grade: 'Good' | 'Okay' | 'Poor' | string;
  millis?: number;
  h2?: boolean;
  tls13?: boolean;
  source?: string;
  error?: string;
}

const DEFAULT_FINGERPRINTS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'random', 'randomized'];

const TRANSPORT_LABELS: Record<string, { en: string; fa: string }> = {
  raw: { en: 'TCP (raw)', fa: 'TCP (خام)' },
  ws: { en: 'WebSocket', fa: 'WebSocket' },
  httpupgrade: { en: 'HTTPUpgrade', fa: 'HTTPUpgrade' },
  xhttp: { en: 'XHTTP', fa: 'XHTTP' },
  grpc: { en: 'gRPC', fa: 'gRPC' },
  kcp: { en: 'mKCP', fa: 'mKCP' },
};

const PROTOCOL_LABELS: Record<string, string> = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
};

const SECURITY_LABELS: Record<string, { en: string; fa: string }> = {
  none: { en: 'None', fa: 'بدون رمزنگاری' },
  tls: { en: 'TLS', fa: 'TLS' },
  reality: { en: 'Reality', fa: 'Reality' },
};

function toLinesText(val: unknown): string {
  if (Array.isArray(val)) return val.map((x) => String(x)).join('\n');
  if (typeof val === 'string') return val;
  return '';
}

function fromLinesText(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function gradeTone(grade: string): 'green' | 'amber' | 'red' | 'gray' {
  const g = grade.toLowerCase();
  if (g === 'good' || g === 'green') return 'green';
  if (g === 'okay' || g === 'yellow') return 'amber';
  if (g === 'poor' || g === 'red') return 'red';
  return 'gray';
}

function formatGradeMeta(grade: string): { label: string; cls: 'good' | 'warn' | 'bad' } {
  const g = grade.toLowerCase();
  if (g === 'good' || g === 'green') return { label: 'Good', cls: 'good' };
  if (g === 'okay' || g === 'yellow') return { label: 'Okay', cls: 'warn' };
  return { label: 'Poor', cls: 'bad' };
}

interface RawBackendSniResult {
  domain: string;
  grade: string;
  tlsMs?: number;
  tcpMs?: number;
  reasons?: string[];
  tag?: string;
}

interface RawSniListResponse {
  curated?: Array<{ domain: string; tag?: string; last?: RawBackendSniResult | null }>;
  found?: Array<{ domain: string; tag?: string; last?: RawBackendSniResult | null }>;
  neighbours?: Array<{ domain: string; tag?: string; grade?: string; tlsMs?: number; last?: RawBackendSniResult | null }>;
  items?: SniCandidate[];
}

function mapRawSniResult(r: RawBackendSniResult): SniCandidate {
  const meta = formatGradeMeta(r.grade);
  return {
    domain: r.domain,
    grade: meta.label,
    millis: r.tlsMs ?? r.tcpMs ?? 0,
    source: r.tag,
    error: r.reasons && r.reasons.length > 0 && meta.cls === 'bad' ? r.reasons.join(', ') : undefined,
  };
}

function parseSniListResponse(res: RawSniListResponse): SniCandidate[] {
  if (Array.isArray(res.items) && res.items.length > 0) return res.items;
  const out: SniCandidate[] = [];
  const seen = new Set<string>();
  for (const c of res.curated || []) {
    if (!c.domain || seen.has(c.domain)) continue;
    seen.add(c.domain);
    out.push({
      domain: c.domain,
      grade: c.last ? formatGradeMeta(c.last.grade).label : 'Good',
      millis: c.last?.tlsMs ?? 0,
      source: c.tag,
    });
  }
  for (const n of [...(res.found || []), ...(res.neighbours || [])]) {
    if (!n.domain || seen.has(n.domain)) continue;
    seen.add(n.domain);
    const gradeVal = 'grade' in n && n.grade ? String(n.grade) : undefined;
    const msVal = 'tlsMs' in n && typeof n.tlsMs === 'number' ? n.tlsMs : undefined;
    out.push({
      domain: n.domain,
      grade: n.last ? formatGradeMeta(n.last.grade).label : formatGradeMeta(gradeVal || 'green').label,
      millis: n.last?.tlsMs ?? msVal ?? 0,
      source: n.tag || 'neighbour',
    });
  }
  return out;
}

async function pollSniJob(
  endpoint: '/xray/sni/test' | '/xray/sni/scan',
  payload: Record<string, unknown>,
  onProgress?: (results: SniCandidate[]) => void,
): Promise<SniCandidate[]> {
  const job = await apiFetch<{ id: string; state: string; results?: RawBackendSniResult[] }>(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  let latest = (job.results || []).map(mapRawSniResult);
  if (latest.length > 0) onProgress?.(latest);
  if (job.state !== 'running') return latest;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 350));
    const st = await apiFetch<{ state: string; results?: RawBackendSniResult[] }>(`/xray/sni/jobs/${job.id}`);
    if (st.results && st.results.length > 0) {
      latest = st.results.map(mapRawSniResult);
      onProgress?.(latest);
    }
    if (st.state !== 'running') break;
  }
  return latest;
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
  onSelect: (domain: string) => void;
}) {
  const { lang } = useUi();
  const L = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [candidates, setCandidates] = useState<SniCandidate[]>([]);
  const [customInput, setCustomInput] = useState(currentSni);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [jobProgress, setJobProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCustomInput(currentSni);
    setError('');
    apiFetch<RawSniListResponse>(`/xray/sni?node=${nodeId || 0}`)
      .then((res) => setCandidates(parseSniListResponse(res)))
      .catch(() => {});
  }, [open, nodeId, currentSni]);

  const handleTestCustom = async () => {
    const clean = customInput.trim();
    if (!clean) return;
    setTesting(true);
    setError('');
    try {
      const results = await pollSniJob('/xray/sni/test', { node: nodeId || 0, domains: [clean] });
      const r = results[0];
      if (r) {
        setCandidates((prev) => [r, ...prev.filter((x) => x.domain !== r.domain)]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleScanNeighbours = async () => {
    setScanning(true);
    setError('');
    setJobProgress(L('Scanning neighbouring IPs...', 'در حال اسکن آی‌پی‌های همسایه...'));
    try {
      await pollSniJob('/xray/sni/scan', { node: nodeId || 0, force: true }, (partial) => {
        if (partial.length > 0) setCandidates(partial);
      });
      const latest = await apiFetch<RawSniListResponse>(`/xray/sni?node=${nodeId || 0}`);
      setCandidates(parseSniListResponse(latest));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      setJobProgress('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={L('Choose camouflage site (Reality SNI)', 'انتخاب سایت استتار (Reality SNI)')}
      subtitle={L(
        'Test TLS 1.3 + H2 reachability from the server or scan neighbouring IPs.',
        'تست دسترسی TLS 1.3 و HTTP/2 از روی سرور یا اسکن سایت‌های همسایه.',
      )}
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            dir="ltr"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="www.microsoft.com"
            className="input h-9! min-w-50 flex-1 font-mono text-xs"
          />
          <Button size="sm" variant="secondary" onClick={handleTestCustom} disabled={testing}>
            <Search className="h-3.5 w-3.5" />
            {testing ? L('Testing…', 'در حال تست…') : L('Test', 'تست')}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleScanNeighbours} disabled={scanning}>
            <Sparkles className="h-3.5 w-3.5" />
            {scanning ? L('Scanning…', 'در حال اسکن…') : L('Find from neighbours', 'یافتن از همسایه‌ها')}
          </Button>
        </div>

        {jobProgress && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
            {jobProgress}
          </div>
        )}

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((c) => {
            const active = c.domain === currentSni;
            return (
              <button
                key={c.domain}
                type="button"
                onClick={() => {
                  onSelect(c.domain);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? 'border-(--accent) bg-(--accent-soft)'
                    : 'border-(--border-subtle) bg-(--bg-surface) hover:border-(--border-strong)'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium text-(--text-primary)">{c.domain}</span>
                    {c.ip && <span className="font-mono text-[11px] text-(--text-muted)">({c.ip})</span>}
                  </div>
                  {c.error && <p className="mt-0.5 text-[11px] text-red-400">{c.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {typeof c.millis === 'number' && c.millis > 0 && (
                    <span className="font-mono text-[11px] text-(--text-muted)">{c.millis} ms</span>
                  )}
                  <StatusPill tone={gradeTone(c.grade)} label={c.grade} />
                </div>
              </button>
            );
          })}
          {candidates.length === 0 && (
            <p className="py-6 text-center text-xs text-(--text-muted)">
              {L('No scanned SNIs yet. Enter a domain above or scan neighbours.', 'موردی یافت نشد.')}
            </p>
          )}
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
  port,
  onPortChange,
  remotes,
  onRemotesChange,
  sniGrade,
  sniMillis,
  onRefreshInbound,
}: {
  settings: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  combos: XrayCombosResponse | null;
  nodeId: number;
  inboundId?: number;
  port?: number;
  onPortChange?: (port: number) => void;
  remotes?: InboundRemote[];
  onRemotesChange?: (remotes: InboundRemote[]) => void;
  sniGrade?: string;
  sniMillis?: number | null;
  onRefreshInbound?: () => void;
}) {
  const { lang } = useUi();
  const L = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [sniModalOpen, setSniModalOpen] = useState(false);
  const [neighboursOpen, setNeighboursOpen] = useState(false);
  const [neighbourList, setNeighbourList] = useState<SniCandidate[]>([]);
  const [scanningNeighbours, setScanningNeighbours] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [testingSni, setTestingSni] = useState(false);
  const [testedSniResult, setTestedSniResult] = useState<SniCandidate | null>(null);
  const [confirmKeysModal, setConfirmKeysModal] = useState(false);
  const [confirmReplaceSniModal, setConfirmReplaceSniModal] = useState(false);
  const [replaceSniTarget, setReplaceSniTarget] = useState('');
  const [issuingCert, setIssuingCert] = useState(false);
  const [proxyCheckResult, setProxyCheckResult] = useState('');
  const [actionError, setActionError] = useState('');

  const patch = (partial: Record<string, unknown>) => {
    onChange({ ...settings, ...partial });
  };

  const patchNested = (key: 'reality' | 'tls' | 'sniffing', partial: Record<string, unknown>) => {
    const prev =
      settings[key] && typeof settings[key] === 'object' ? (settings[key] as Record<string, unknown>) : {};
    onChange({ ...settings, [key]: { ...prev, ...partial } });
  };

  const proto = String(settings.protocol || 'vless');
  const transport = String(settings.transport || 'raw');
  const security = String(settings.security || 'reality');
  const ssMethod = String(settings.ssMethod || '2022-blake3-aes-128-gcm');
  const ssNetwork = String(settings.ssNetwork || 'tcp,udp');
  const headerType = String(settings.headerType || 'none');

  const reality = (settings.reality && typeof settings.reality === 'object'
    ? settings.reality
    : {}) as Record<string, unknown>;
  const tls = (settings.tls && typeof settings.tls === 'object' ? settings.tls : {}) as Record<string, unknown>;
  const sniffing = (settings.sniffing && typeof settings.sniffing === 'object'
    ? settings.sniffing
    : { enabled: true, destOverride: ['http', 'tls', 'quic'] }) as Record<string, unknown>;

  const realitySni = String((reality.serverNames as string[] | undefined)?.[0] || settings.realitySni || '');
  const realityPublicKey = String(settings.realityPublicKey || reality.publicKey || '');
  const activeCombo = combos?.items.find(
    (c) => c.protocol === proto && c.transport === transport && c.security === security,
  );
  const items = combos?.items || [];

  const availableProtocols = Array.from(new Set(items.map((c) => c.protocol)));
  const protocolsForView = availableProtocols.length > 0 ? availableProtocols : ['vless', 'vmess', 'trojan', 'shadowsocks'];

  const transportsForProto = Array.from(
    new Set(items.filter((c) => c.protocol === proto).map((c) => c.transport)),
  );
  const transportOptions =
    transportsForProto.length > 0 ? transportsForProto : ['raw', 'ws', 'httpupgrade', 'xhttp', 'grpc', 'kcp'];

  const securitiesForProtoTransport = Array.from(
    new Set(items.filter((c) => c.protocol === proto && c.transport === transport).map((c) => c.security)),
  );
  const securityOptions =
    securitiesForProtoTransport.length > 0 ? securitiesForProtoTransport : ['none', 'tls', 'reality'];

  const applyTuple = (nextProto: string, nextTransport: string, nextSecurity: string) => {
    let chosenTransport = nextTransport;
    let chosenSecurity = nextSecurity;
    if (items.length > 0) {
      const exact = items.find(
        (c) => c.protocol === nextProto && c.transport === chosenTransport && c.security === chosenSecurity,
      );
      if (!exact) {
        const sameT = items.find((c) => c.protocol === nextProto && c.transport === chosenTransport);
        const fallback = sameT || items.find((c) => c.protocol === nextProto);
        if (fallback) {
          chosenTransport = fallback.transport;
          chosenSecurity = fallback.security;
        }
      }
    }
    const flowOpts =
      items.find(
        (c) => c.protocol === nextProto && c.transport === chosenTransport && c.security === chosenSecurity,
      )?.flows || [];
    patch({
      protocol: nextProto,
      transport: chosenTransport,
      security: chosenSecurity,
      flow: flowOpts.includes(String(settings.flow || ''))
        ? settings.flow
        : flowOpts.includes('xtls-rprx-vision')
          ? 'xtls-rprx-vision'
          : flowOpts[0] || '',
    });
  };

  const activeRemotes =
    remotes !== undefined
      ? remotes
      : Array.isArray(settings.remotes)
        ? (settings.remotes as InboundRemote[])
        : [];
  const handleRemotesUpdate = (next: InboundRemote[]) => {
    if (onRemotesChange) onRemotesChange(next);
    patch({ remotes: next });
  };

  const fallbacks = Array.isArray(settings.fallbacks)
    ? (settings.fallbacks as Array<{ name?: string; path?: string; dest: string }>)
    : [];

  const canBehindCdn = ['ws', 'httpupgrade', 'xhttp', 'grpc'].includes(transport);
  const canProxyProtocol = transport !== 'kcp';

  useEffect(() => {
    setTestedSniResult(null);
  }, [nodeId]);

  useEffect(() => {
    apiFetch<RawSniListResponse>(`/xray/sni?node=${nodeId || 0}`)
      .then((res) => setNeighbourList(parseSniListResponse(res)))
      .catch(() => {});
  }, [nodeId]);

  const handleInlineTestSni = async () => {
    const clean = realitySni.trim();
    if (!clean) return;
    setTestingSni(true);
    setActionError('');
    try {
      const results = await pollSniJob('/xray/sni/test', { node: nodeId || 0, domains: [clean] });
      if (results[0]) {
        setTestedSniResult(results[0]);
      }
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTestingSni(false);
    }
  };

  const handleFindNeighbours = async () => {
    setScanningNeighbours(true);
    setActionError('');
    setScanMessage(L('Scanning neighbouring IPs...', 'در حال اسکن سایت‌های همسایه...'));
    try {
      await pollSniJob('/xray/sni/scan', { node: nodeId || 0, force: true }, (partial) => {
        if (partial.length > 0) setNeighbourList(partial);
      });
      const latest = await apiFetch<RawSniListResponse>(`/xray/sni?node=${nodeId || 0}`);
      setNeighbourList(parseSniListResponse(latest));
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setScanningNeighbours(false);
      setScanMessage('');
    }
  };

  const handleRotateRealityKeys = async () => {
    if (!inboundId) return;
    setActionError('');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/reality-keys`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      setConfirmKeysModal(false);
      onRefreshInbound?.();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleReplaceSni = async () => {
    if (!inboundId || !replaceSniTarget.trim()) return;
    setActionError('');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/sni/replace`, {
        method: 'POST',
        body: JSON.stringify({ sni: replaceSniTarget.trim(), confirm: true }),
      });
      setConfirmReplaceSniModal(false);
      onRefreshInbound?.();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleIssueCert = async () => {
    if (!inboundId) return;
    setIssuingCert(true);
    setActionError('');
    try {
      await apiFetch(`/inbounds/${inboundId}/xray/certificate`, {
        method: 'POST',
        body: JSON.stringify({ host: String(tls.certHost || tls.serverName || settings.cdnDomain || '') }),
      });
      onRefreshInbound?.();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIssuingCert(false);
    }
  };

  const handleProxyCheck = async () => {
    if (!inboundId) return;
    setActionError('');
    try {
      const res = await apiFetch<{ message?: string; ok?: boolean }>(`/inbounds/${inboundId}/xray/proxy-check`);
      setProxyCheckResult(res.message || (res.ok ? L('Verified.', 'تایید شد.') : L('Check finished.', 'بررسی انجام شد.')));
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const effectiveSniGrade = testedSniResult?.grade || sniGrade || '';
  const effectiveSniMillis = testedSniResult?.millis ?? sniMillis ?? null;
  const effectiveGradeMeta = effectiveSniGrade ? formatGradeMeta(effectiveSniGrade) : null;

  return (
    <div className="xr-groups text-sm">
      {actionError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {actionError}
        </div>
      )}

      {/* Top Reality SNI status strip */}
      {security === 'reality' && realitySni && (
        <div className="xr-sni-current justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-(--text-muted)">{L('Camouflage site', 'سایت استتار')}</span>
            <span className="font-mono font-semibold text-(--text-primary)">{realitySni}</span>
            {effectiveGradeMeta && (
              <span className={`xr-grade-pill ${effectiveGradeMeta.cls}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {effectiveGradeMeta.label}
                {typeof effectiveSniMillis === 'number' && effectiveSniMillis > 0 ? ` ${effectiveSniMillis} ms` : ''}
              </span>
            )}
          </div>
          {inboundId && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setReplaceSniTarget(realitySni);
                  setConfirmReplaceSniModal(true);
                }}
              >
                {L('Change camouflage site', 'تغییر سایت استتار')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmKeysModal(true)}>
                <RefreshCw className="h-3.5 w-3.5" />
                {L('Replace keys', 'تغییر کلیدها')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Basics */}
      <fieldset className="xr-group">
        <legend>{L('Basics', 'پایه')}</legend>

        <div className="xr-row-3">
          {onPortChange && (
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Port', 'پورت')}</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={port ?? 443}
                onChange={(e) => onPortChange(Number(e.target.value) || 443)}
                className="input font-mono text-sm"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Protocol', 'پروتکل')}</span>
            <select
              value={proto}
              onChange={(e) => applyTuple(e.target.value, transport, security)}
              className="select text-sm"
            >
              {protocolsForView.map((p) => (
                <option key={p} value={p}>
                  {PROTOCOL_LABELS[p] || p}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Transport', 'انتقال')}</span>
            <select
              value={transport}
              onChange={(e) => applyTuple(proto, e.target.value, security)}
              className="select text-sm"
            >
              {transportOptions.map((t) => (
                <option key={t} value={t}>
                  {L(TRANSPORT_LABELS[t]?.en || t, TRANSPORT_LABELS[t]?.fa || t)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="xr-row-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Security', 'امنیت')}</span>
            <select
              value={security}
              onChange={(e) => applyTuple(proto, transport, e.target.value)}
              className="select text-sm"
            >
              {securityOptions.map((s) => (
                <option key={s} value={s}>
                  {L(SECURITY_LABELS[s]?.en || s, SECURITY_LABELS[s]?.fa || s)}
                </option>
              ))}
            </select>
          </label>

          {proto === 'shadowsocks' && (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs text-(--text-muted)">{L('Cipher', 'رمزنگاری (Cipher)')}</span>
                <select
                  value={ssMethod}
                  onChange={(e) => patch({ ssMethod: e.target.value })}
                  className="select font-mono text-sm"
                >
                  {(
                    combos?.ssMethods || [
                      '2022-blake3-aes-128-gcm',
                      '2022-blake3-aes-256-gcm',
                      'aes-128-gcm',
                      'aes-256-gcm',
                      'chacha20-ietf-poly1305',
                      'xchacha20-ietf-poly1305',
                    ]
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-(--text-muted)">{L('Network', 'شبکه')}</span>
                <select
                  value={ssNetwork}
                  onChange={(e) => patch({ ssNetwork: e.target.value })}
                  className="select font-mono text-sm"
                >
                  <option value="tcp,udp">tcp,udp</option>
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
              </label>
            </>
          )}
        </div>

        {proto === 'vless' && transport === 'raw' && (security === 'tls' || security === 'reality') && (
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Flow', 'جریان (Flow)')}</span>
            <select
              value={String(settings.flow || '')}
              onChange={(e) => patch({ flow: e.target.value })}
              className="select text-sm"
            >
              <option value="">{L('None', 'هیچ‌کدام')}</option>
              <option value="xtls-rprx-vision">xtls-rprx-vision</option>
            </select>
            <span className="block text-xs text-(--text-muted)">
              {L('Vision is the recommended flow where it is available.', 'حالت Vision در صورت پشتیبانی توصیه می‌شود.')}
            </span>
          </label>
        )}

        {(activeCombo?.deprecated?.includes(proto) || ['vmess', 'trojan', 'shadowsocks'].includes(proto)) && (
          <p className="banner quiet flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>
              {L(
                `Xray marks this as old (${proto}). It still works in the bundled version and may be removed later.`,
                `هسته Xray این پروتکل (${proto}) را قدیمی اعلام کرده است. در نسخه فعلی کار می‌کند اما ممکن است بعداً حذف شود.`,
              )}
            </span>
          </p>
        )}

        {(activeCombo?.deprecated?.includes(transport) || ['ws', 'httpupgrade', 'grpc'].includes(transport)) && (
          <p className="banner quiet">
            {L(
              `Xray marks this as old (${transport}). It still works in the bundled version and may be removed later.`,
              `هسته Xray این انتقال (${transport}) را قدیمی اعلام کرده است. در نسخه فعلی کار می‌کند اما ممکن است بعداً حذف شود.`,
            )}
          </p>
        )}
      </fieldset>

      {/* Transport sub-sections */}
      {transport === 'raw' && (
        <fieldset className="xr-group">
          <legend>{L('HTTP header', 'هدر HTTP')}</legend>
          <p className="m-0 text-xs text-(--text-muted)">
            {L('Makes the traffic look like plain HTTP.', 'ترافیک را شبیه به HTTP معمولی نشان می‌دهد.')}
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Header type', 'نوع هدر')}</span>
            <select
              value={headerType}
              onChange={(e) => patch({ headerType: e.target.value })}
              className="select text-sm"
            >
              <option value="none">none</option>
              <option value="http">http</option>
            </select>
          </label>
          {headerType === 'http' && (
            <div className="xr-row-2">
              <label className="block space-y-1.5">
                <span className="text-xs text-(--text-muted)">{L('Host names', 'نام‌های Host')}</span>
                <textarea
                  rows={2}
                  dir="ltr"
                  value={toLinesText(settings.httpHosts)}
                  onChange={(e) => patch({ httpHosts: fromLinesText(e.target.value) })}
                  placeholder="www.bing.com"
                  className="textarea min-h-19! font-mono text-xs"
                />
                <span className="block text-xs text-(--text-muted)">{L('One per line.', 'در هر خط یک مورد.')}</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-(--text-muted)">{L('Path', 'مسیر')}</span>
                <input
                  type="text"
                  dir="ltr"
                  value={String(settings.path || '/')}
                  onChange={(e) => patch({ path: e.target.value })}
                  className="input font-mono text-sm"
                />
              </label>
            </div>
          )}
        </fieldset>
      )}

      {transport === 'ws' && (
        <fieldset className="xr-group">
          <legend>WebSocket</legend>
          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">Host</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.host || '')}
                onChange={(e) => patch({ host: e.target.value })}
                placeholder="vpn.example.com"
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The Host header; usually your domain.', 'هدر Host؛ معمولاً دامنه شما.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Path', 'مسیر')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.path || '/')}
                onChange={(e) => patch({ path: e.target.value })}
                className="input font-mono text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Heartbeat (seconds)', 'ضربان (ثانیه)')}</span>
              <input
                type="number"
                dir="ltr"
                value={settings.wsHeartbeat ? String(settings.wsHeartbeat) : ''}
                onChange={(e) => patch({ wsHeartbeat: e.target.value ? Number(e.target.value) : 0 })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Empty is off.', 'خالی یعنی خاموش.')}</span>
            </label>
          </div>
        </fieldset>
      )}

      {transport === 'httpupgrade' && (
        <fieldset className="xr-group">
          <legend>HTTPUpgrade</legend>
          <div className="xr-row-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">Host</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.host || '')}
                onChange={(e) => patch({ host: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The Host header; usually your domain.', 'هدر Host؛ معمولاً دامنه شما.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Path', 'مسیر')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.path || '/')}
                onChange={(e) => patch({ path: e.target.value })}
                className="input font-mono text-sm"
              />
            </label>
          </div>
        </fieldset>
      )}

      {transport === 'xhttp' && (
        <fieldset className="xr-group">
          <legend>XHTTP</legend>
          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">Host</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.host || '')}
                onChange={(e) => patch({ host: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The Host header; usually your domain.', 'هدر Host؛ معمولاً دامنه شما.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Path', 'مسیر')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.path || '/')}
                onChange={(e) => patch({ path: e.target.value })}
                className="input font-mono text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('XHTTP mode', 'حالت XHTTP')}</span>
              <select
                value={String(settings.xhttpMode || 'auto')}
                onChange={(e) => patch({ xhttpMode: e.target.value })}
                className="select font-mono text-sm"
              >
                {(combos?.xhttpModes || ['auto', 'packet-up', 'stream-up']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Padding bytes', 'بایت‌های Padding')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.xPaddingBytes || '')}
                onChange={(e) => patch({ xPaddingBytes: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('A number or a range such as 100-1000. Empty is the Xray default.', 'عدد یا بازه مثل 100-1000. خالی یعنی پیش‌فرض.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Max buffered posts', 'حداکثر پست‌های بافر')}</span>
              <input
                type="number"
                dir="ltr"
                value={settings.scMaxBufferedPosts ? String(settings.scMaxBufferedPosts) : ''}
                onChange={(e) => patch({ scMaxBufferedPosts: e.target.value ? Number(e.target.value) : '' })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Empty is the Xray default.', 'خالی یعنی پیش‌فرض.')}</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Max bytes per post', 'حداکثر بایت در هر پست')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.scMaxEachPostBytes || '')}
                onChange={(e) => patch({ scMaxEachPostBytes: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('A number or a range such as 100-1000. Empty is the Xray default.', 'عدد یا بازه مثل 100-1000. خالی یعنی پیش‌فرض.')}
              </span>
            </label>
          </div>

          <label className="block max-w-sm space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Stream-up keep-alive (seconds)', 'نگهداری Stream-up (ثانیه)')}</span>
            <input
              type="text"
              dir="ltr"
              value={String(settings.scStreamUpServerSecs || '')}
              onChange={(e) => patch({ scStreamUpServerSecs: e.target.value })}
              className="input font-mono text-sm"
            />
            <span className="block text-xs text-(--text-muted)">
              {L('A number or a range such as 100-1000. Empty is the Xray default.', 'عدد یا بازه مثل 100-1000. خالی یعنی پیش‌فرض.')}
            </span>
          </label>

          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.noSSEHeader)}
              onChange={(e) => patch({ noSSEHeader: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L('No SSE header', 'بدون هدر SSE')}</span>
          </label>
        </fieldset>
      )}

      {transport === 'grpc' && (
        <fieldset className="xr-group">
          <legend>gRPC</legend>
          <div className="xr-row-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Service name', 'نام سرویس')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.grpcServiceName || '')}
                onChange={(e) => patch({ grpcServiceName: e.target.value })}
                className="input font-mono text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Authority', 'Authority')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.grpcAuthority || '')}
                onChange={(e) => patch({ grpcAuthority: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Optional.', 'اختیاری.')}</span>
            </label>
          </div>
        </fieldset>
      )}

      {transport === 'kcp' && (
        <fieldset className="xr-group">
          <legend>mKCP</legend>
          <p className="m-0 text-xs text-(--text-muted)">
            {L('Works over UDP and does not support PROXY protocol.', 'روی UDP کار می‌کند و از PROXY protocol پشتیبانی نمی‌کند.')}
          </p>
          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Header', 'هدر')}</span>
              <select
                value={String(settings.kcpHeader || 'none')}
                onChange={(e) => patch({ kcpHeader: e.target.value })}
                className="select font-mono text-sm"
              >
                {(combos?.kcpHeaders || ['none', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard']).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Seed', 'رمز (Seed)')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.kcpSeed || '')}
                onChange={(e) => patch({ kcpSeed: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Optional shared password for the stream.', 'گذرواژه مشترک اختیاری برای جریان داده.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">MTU</span>
              <input
                type="number"
                dir="ltr"
                value={settings.kcpMtu ? String(settings.kcpMtu) : ''}
                onChange={(e) => patch({ kcpMtu: e.target.value ? Number(e.target.value) : '' })}
                className="input font-mono text-sm"
              />
            </label>
          </div>
          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('TTI (ms)', 'TTI (میلی‌ثانیه)')}</span>
              <input
                type="number"
                dir="ltr"
                value={settings.kcpTti ? String(settings.kcpTti) : ''}
                onChange={(e) => patch({ kcpTti: e.target.value ? Number(e.target.value) : '' })}
                className="input font-mono text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Uplink (MB/s)', 'آپ‌لینک (MB/s)')}</span>
              <input
                type="number"
                dir="ltr"
                value={settings.kcpUplinkCapacity ? String(settings.kcpUplinkCapacity) : ''}
                onChange={(e) => patch({ kcpUplinkCapacity: e.target.value ? Number(e.target.value) : '' })}
                className="input font-mono text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Downlink (MB/s)', 'داون‌لینک (MB/s)')}</span>
              <input
                type="number"
                dir="ltr"
                value={settings.kcpDownlinkCapacity ? String(settings.kcpDownlinkCapacity) : ''}
                onChange={(e) => patch({ kcpDownlinkCapacity: e.target.value ? Number(e.target.value) : '' })}
                className="input font-mono text-sm"
              />
            </label>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.kcpCongestion)}
              onChange={(e) => patch({ kcpCongestion: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L('Congestion control', 'کنترل ازدحام')}</span>
          </label>
        </fieldset>
      )}

      {/* Reality section */}
      {security === 'reality' && (
        <fieldset className="xr-group">
          <legend>Reality</legend>
          <p className="m-0 text-xs text-(--text-muted)">
            {L(
              'The camouflage site, its names and the short IDs clients use.',
              'سایت استتار، نام‌های پذیرفته‌شده و Short IDها.',
            )}
          </p>

          <div className="space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Camouflage site', 'سایت استتار')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                <input
                  type="text"
                  dir="ltr"
                  list={`sni-datalist-${nodeId}`}
                  value={realitySni}
                  onChange={(e) => {
                    const val = e.target.value;
                    const cleanHost = val.split(':')[0]?.trim() || '';
                    patch({
                      realitySni: val,
                      reality: {
                        ...reality,
                        serverNames: [val, ...((reality.serverNames as string[] | undefined)?.slice(1) || [])],
                        dest:
                          !reality.dest || String(reality.dest).startsWith(`${realitySni}:`)
                            ? cleanHost
                              ? `${cleanHost}:443`
                              : ''
                            : reality.dest,
                      },
                    });
                  }}
                  placeholder="www.microsoft.com"
                  className="input pl-9! font-mono text-sm"
                />
                <datalist id={`sni-datalist-${nodeId}`}>
                  {neighbourList.map((c) => (
                    <option key={c.domain} value={c.domain} />
                  ))}
                </datalist>
              </div>
              <Button variant="secondary" onClick={handleInlineTestSni} disabled={testingSni}>
                {testingSni ? L('Testing…', 'در حال تست…') : L('Test', 'تست')}
              </Button>
            </div>
            <span className="block text-xs text-(--text-muted)">
              {L(
                'Reality makes your server look like a visit to this site. Pick one from the list or type your own.',
                'پروتکل Reality سرور را شبیه بازدید از این سایت نشان می‌دهد. از فهرست انتخاب کنید یا تایپ نمایید.',
              )}
            </span>
            {(testedSniResult || (effectiveGradeMeta && realitySni)) && (
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5 text-xs">
                {effectiveGradeMeta && (
                  <span className={`xr-grade-pill ${effectiveGradeMeta.cls}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {effectiveGradeMeta.label}
                    {typeof effectiveSniMillis === 'number' && effectiveSniMillis > 0 ? ` ${effectiveSniMillis} ms` : ''}
                  </span>
                )}
                <span className="text-(--text-muted)">
                  {testedSniResult?.error
                    ? testedSniResult.error
                    : effectiveSniMillis
                      ? L(
                          `Suitable. The server reaches it in ${effectiveSniMillis} ms.`,
                          `مناسب است. سرور در ${effectiveSniMillis} میلی‌ثانیه به آن می‌رسد.`,
                        )
                      : ''}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setNeighboursOpen((v) => !v)}
            className="xr-neighbours-btn"
          >
            {L("Find a site from the server's neighbours", 'یافتن سایت از همسایه‌های سرور')}
          </button>

          {neighboursOpen && (
            <div className="space-y-2.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3">
              <p className="m-0 text-xs text-(--text-muted)">
                {L(
                  'Looks at nearby addresses in the same data center for sites that suit Reality. It is slow and gentle, and runs once a day at most.',
                  'آدرس‌های همسایه در همان دیتاسنتر را برای سایت‌های مناسب Reality بررسی می‌کند.',
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleFindNeighbours} disabled={scanningNeighbours}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {scanningNeighbours ? L('Scanning…', 'در حال اسکن…') : L('Find from neighbours', 'یافتن از همسایه‌ها')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSniModalOpen(true)}>
                  {L('Open SNI picker', 'باز کردن لیست کامل')}
                </Button>
                {scanMessage && <span className="text-xs text-blue-300">{scanMessage}</span>}
              </div>
              {neighbourList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {neighbourList.slice(0, 14).map((c) => (
                    <button
                      key={c.domain}
                      type="button"
                      onClick={() =>
                        patch({
                          realitySni: c.domain,
                          reality: {
                            ...reality,
                            serverNames: [c.domain],
                            dest: `${c.domain}:443`,
                          },
                        })
                      }
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                        c.domain === realitySni
                          ? 'border-(--accent) bg-(--accent-soft) text-(--text-primary)'
                          : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary) hover:border-(--border-strong)'
                      }`}
                    >
                      {c.domain} {typeof c.millis === 'number' && c.millis > 0 ? `(${c.millis}ms)` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Other accepted names', 'سایر نام‌های پذیرفته‌شده')}</span>
              <textarea
                rows={3}
                dir="ltr"
                value={toLinesText(((reality.serverNames as string[] | undefined) || []).slice(1))}
                onChange={(e) => {
                  const rest = fromLinesText(e.target.value);
                  patchNested('reality', { serverNames: realitySni ? [realitySni, ...rest] : rest });
                }}
                className="textarea min-h-20.5! font-mono text-xs"
              />
              <span className="block text-xs text-(--text-muted)">{L('One per line.', 'در هر خط یک نام.')}</span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">Short IDs</span>
              <textarea
                rows={3}
                dir="ltr"
                value={toLinesText(reality.shortIds)}
                onChange={(e) => patchNested('reality', { shortIds: fromLinesText(e.target.value) })}
                className="textarea min-h-20.5! font-mono text-xs"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Hex, an even number of characters, up to 16.', 'هگز، تعداد کاراکتر زوج، تا ۱۶ کاراکتر.')}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Target', 'هدف (Target)')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(reality.dest || (realitySni ? `${realitySni}:443` : ''))}
                onChange={(e) => patchNested('reality', { dest: e.target.value })}
                placeholder="www.microsoft.com:443"
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Where unknown visitors are sent, normally the site on port 443.', 'مقصد بازدیدکنندگان ناشناس، معمولاً پورت ۴۴۳ سایت استتار.')}
              </span>
            </label>
          </div>

          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">xver</span>
              <select
                value={Number(reality.xver || 0)}
                onChange={(e) => patchNested('reality', { xver: Number(e.target.value) })}
                className="select font-mono text-sm"
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
              <span className="block text-xs text-(--text-muted)">
                {L('PROXY protocol version sent to the target. Normally 0.', 'نسخه PROXY protocol ارسالی به هدف. معمولاً ۰.')}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">spiderX</span>
              <input
                type="text"
                dir="ltr"
                value={String(reality.spiderX ?? '/')}
                onChange={(e) => patchNested('reality', { spiderX: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The path apps start from (links only).', 'مسیر شروع برای کلاینت‌ها (فقط در لینک).')}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Max time difference (ms)', 'حداکثر اختلاف زمان (ms)')}</span>
              <input
                type="number"
                dir="ltr"
                value={reality.maxTimeDiff ? String(reality.maxTimeDiff) : ''}
                onChange={(e) =>
                  patchNested('reality', { maxTimeDiff: e.target.value ? Number(e.target.value) : 0 })
                }
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Empty is the Xray default.', 'خالی یعنی پیش‌فرض.')}</span>
            </label>
          </div>

          <div className="xr-row-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Lowest client Xray version', 'کمترین نسخه Xray کلاینت')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(reality.minClientVer || '')}
                onChange={(e) => patchNested('reality', { minClientVer: e.target.value })}
                placeholder="25.1.1"
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Optional.', 'اختیاری.')}</span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Highest client Xray version', 'بیشترین نسخه Xray کلاینت')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(reality.maxClientVer || '')}
                onChange={(e) => patchNested('reality', { maxClientVer: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Optional.', 'اختیاری.')}</span>
            </label>
          </div>

          <div className="pt-1 font-mono text-xs text-(--text-secondary)">
            {L('Public key', 'کلید عمومی')}:{' '}
            <span className="break-all text-(--text-primary)">
              {realityPublicKey || L('Generated automatically on create', 'در زمان ساخت به‌صورت خودکار تولید می‌شود')}
            </span>
          </div>
        </fieldset>
      )}

      {/* TLS section */}
      {security === 'tls' && (
        <fieldset className="xr-group">
          <legend>TLS</legend>
          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Certificate host', 'میزبان گواهی')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(tls.certHost || tls.serverName || '')}
                onChange={(e) => patchNested('tls', { certHost: e.target.value })}
                placeholder="vpn.example.com"
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The domain of a certificate the panel already has.', 'دامنه گواهی موجود در پنل.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">SNI</span>
              <input
                type="text"
                dir="ltr"
                value={String(tls.sni || tls.serverName || '')}
                onChange={(e) => patchNested('tls', { sni: e.target.value, serverName: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('The name links ask for. Empty uses the certificate name.', 'نام مورد استفاده در لینک. خالی یعنی نام گواهی.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">ALPN</span>
              <input
                type="text"
                dir="ltr"
                value={Array.isArray(tls.alpn) ? tls.alpn.join(',') : String(tls.alpn || 'h2,http/1.1')}
                onChange={(e) =>
                  patchNested('tls', {
                    alpn: e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">{L('Comma separated.', 'جداشده با کاما.')}</span>
            </label>
          </div>

          <div className="xr-row-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Lowest TLS version', 'کمترین نسخه TLS')}</span>
              <select
                value={String(tls.minVersion || '')}
                onChange={(e) => patchNested('tls', { minVersion: e.target.value })}
                className="select font-mono text-sm"
              >
                <option value="">{L('Default', 'پیش‌فرض')}</option>
                <option value="1.2">1.2</option>
                <option value="1.3">1.3</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Highest TLS version', 'بیشترین نسخه TLS')}</span>
              <select
                value={String(tls.maxVersion || '')}
                onChange={(e) => patchNested('tls', { maxVersion: e.target.value })}
                className="select font-mono text-sm"
              >
                <option value="">{L('Default', 'پیش‌فرض')}</option>
                <option value="1.2">1.2</option>
                <option value="1.3">1.3</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Cipher suites', 'Cipher suites')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(tls.cipherSuites || '')}
                onChange={(e) => patchNested('tls', { cipherSuites: e.target.value })}
                className="input font-mono text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Go names separated by colons. Empty is the Go default.', 'نام‌های Go با دونقطه جدا شوند. خالی یعنی پیش‌فرض.')}
              </span>
            </label>
          </div>

          <div className="space-y-2.5 pt-1">
            <div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(tls.rejectUnknownSni)}
                  onChange={(e) => patchNested('tls', { rejectUnknownSni: e.target.checked })}
                />
                <span className="track" />
                <span className="sw-text">{L('Reject unknown SNI', 'رد SNI ناشناس')}</span>
              </label>
              <p className="mt-1 pl-12 text-xs text-(--text-muted)">
                {L('Refuse handshakes for names the certificate does not cover.', 'رد اتصال برای دامنه‌هایی که در گواهی نیستند.')}
              </p>
            </div>
            <div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(tls.allowInsecure)}
                  onChange={(e) => patchNested('tls', { allowInsecure: e.target.checked })}
                />
                <span className="track" />
                <span className="sw-text">{L('Allow insecure (links)', 'اجازه ناامن (در لینک‌ها)')}</span>
              </label>
              <p className="mt-1 pl-12 text-xs text-(--text-muted)">
                {L(
                  'Apps accept a certificate they cannot verify. Only for self-signed certificates.',
                  'اپلیکیشن‌ها گواهی امضا‌شده شخصی را می‌پذیرند.',
                )}
              </p>
            </div>
          </div>

          {inboundId && (
            <div>
              <Button size="sm" variant="secondary" onClick={handleIssueCert} disabled={issuingCert}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {issuingCert ? L('Issuing…', 'در حال صدور…') : L('Issue / check certificate', 'صدور / بررسی گواهی')}
              </Button>
            </div>
          )}
        </fieldset>
      )}

      {/* Client side */}
      {(security === 'tls' || security === 'reality') && (
        <fieldset className="xr-group">
          <legend>{L('Client side', 'سمت کلاینت')}</legend>
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('TLS fingerprint', 'اثر انگشت TLS')}</span>
            <select
              value={String(settings.fingerprint || 'chrome')}
              onChange={(e) => patch({ fingerprint: e.target.value })}
              className="select font-mono text-sm"
            >
              {DEFAULT_FINGERPRINTS.map((fp) => (
                <option key={fp} value={fp}>
                  {fp}
                </option>
              ))}
            </select>
            <span className="block text-xs text-(--text-muted)">
              {L('Which browser the connection pretends to be.', 'مرورگری که اتصال خود را شبیه آن می‌کند.')}
            </span>
          </label>
        </fieldset>
      )}

      {/* Connect addresses */}
      <fieldset className="xr-group">
        <legend>{L('Connect addresses', 'آدرس‌های اتصال')}</legend>
        <p className="m-0 text-xs text-(--text-muted)">
          {L(
            'Clients connect to the server address. Add your relay or tunnel servers (for example each Iranian server) to give every one a config.',
            'کلاینت‌ها به آدرس سرور متصل می‌شوند. سرورهای تانل یا ریلی را اضافه کنید.',
          )}
        </p>
        <ConnectAddressesField
          lang={lang}
          remotes={activeRemotes}
          onChange={handleRemotesUpdate}
          showSni={security === 'tls' || security === 'reality'}
          showHostHeader={transport === 'ws' || transport === 'httpupgrade' || transport === 'xhttp'}
        />
      </fieldset>

      {/* Relay, CDN and devices */}
      <fieldset className="xr-group">
        <legend>{L('Relay, CDN and devices', 'ریلی، CDN و دستگاه‌ها')}</legend>
        <p className="m-0 text-xs text-(--text-muted)">
          {L('Settings for servers placed in front of this inbound.', 'تنظیمات سرورهای قرارگرفته پیش از این اینباند.')}
        </p>

        <div>
          <label className={`switch ${!canProxyProtocol ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              disabled={!canProxyProtocol}
              checked={Boolean(settings.proxyProtocol) && canProxyProtocol}
              onChange={(e) => patch({ proxyProtocol: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L('Require PROXY protocol', 'الزام به PROXY protocol')}</span>
          </label>
          <p className="mt-1 pl-12 text-xs text-(--text-muted)">
            {L(
              'For a tunnel on this server (Kariz and the like) or a relay in front of it. Xray then reads the real client address, so device limits and per-device speed work.',
              'برای تانل روی همین سرور یا سرور واسط پیش از آن. در این حالت آی‌پی واقعی کلاینت خوانده می‌شود.',
            )}
          </p>
        </div>

        {Boolean(settings.proxyProtocol) && canProxyProtocol && (
          <div className="space-y-2 pl-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Relay server IPs (optional)', 'آی‌پی سرورهای ریلی (اختیاری)')}</span>
              <textarea
                rows={2}
                dir="ltr"
                value={toLinesText(settings.relayAllowlist)}
                onChange={(e) => patch({ relayAllowlist: fromLinesText(e.target.value) })}
                placeholder="203.0.113.10"
                className="textarea min-h-18! font-mono text-xs"
              />
            </label>
            {inboundId && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleProxyCheck}>
                  {L('Verify relay headers', 'بررسی هدر ریلی')}
                </Button>
                {proxyCheckResult && <span className="text-xs text-emerald-400">{proxyCheckResult}</span>}
              </div>
            )}
          </div>
        )}

        <div>
          <label className={`switch ${!canBehindCdn ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              disabled={!canBehindCdn}
              checked={Boolean(settings.behindCdn) && canBehindCdn}
              onChange={(e) => patch({ behindCdn: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L('Behind a CDN (Cloudflare)', 'پشت CDN (کلادفلر)')}</span>
          </label>
          <p className="mt-1 pl-12 text-xs text-(--text-muted)">
            {L(
              'A CDN carries WebSocket, HTTPUpgrade, XHTTP or gRPC.',
              'CDN از WebSocket، HTTPUpgrade، XHTTP یا gRPC پشتیبانی می‌کند.',
            )}
          </p>
        </div>

        {Boolean(settings.behindCdn) && canBehindCdn && (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Extra allowed ranges', 'بازه‌های مجاز اضافی')}</span>
              <textarea
                rows={2}
                dir="ltr"
                value={toLinesText(settings.cdnExtraRanges)}
                onChange={(e) => patch({ cdnExtraRanges: fromLinesText(e.target.value) })}
                className="textarea min-h-18! font-mono text-xs"
              />
              <span className="block text-xs text-(--text-muted)">
                {L("The CDN's own ranges are always allowed. Add others here, one per line.", 'بازه‌های CDN همیشه مجاز هستند.')}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-(--text-muted)">{L('Your domain on the CDN', 'دامنه شما روی CDN')}</span>
              <input
                type="text"
                dir="ltr"
                value={String(settings.cdnDomain || '')}
                onChange={(e) => patch({ cdnDomain: e.target.value })}
                placeholder="vpn.example.com"
                className="input font-mono text-sm"
              />
            </label>
          </div>
        )}

        {canBehindCdn && (
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">
              {L('Trusted X-Forwarded-For headers', 'هدرهای مورد اعتماد X-Forwarded-For')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={String(settings.trustedXff || '')}
              onChange={(e) => patch({ trustedXff: e.target.value })}
              placeholder="X-Forwarded-For"
              className="input font-mono text-sm"
            />
            <span className="block text-xs text-(--text-muted)">
              {L('Header names, comma separated. Leave empty unless you know you need it.', 'جداشده با کاما. در صورت عدم نیاز خالی بگذارید.')}
            </span>
          </label>
        )}

        <div className="space-y-1.5">
          <span className="block text-xs text-(--text-muted)">
            {L('Speed limit counted per', 'محاسبه محدودیت سرعت بر اساس')}
          </span>
          <Segmented
            value={String(settings.speedMode || 'device')}
            onChange={(val) => patch({ speedMode: val })}
            options={[
              { value: 'device', label: L('Device', 'دستگاه') },
              { value: 'client', label: L('Whole client', 'کل کاربر') },
            ]}
          />
          <p className="text-xs text-(--text-muted)">
            {L('Behind a CDN every connection comes from the CDN, so the whole client is the safer choice.', 'پشت CDN انتخاب کل کاربر امن‌تر است.')}
          </p>
        </div>
      </fieldset>

      {/* Socket options */}
      <fieldset className="xr-group">
        <legend>{L('Socket options', 'تنظیمات سوکت')}</legend>
        <p className="m-0 text-xs text-(--text-muted)">
          {L('Tuning of the connections. Empty fields keep the Xray defaults.', 'بهینه‌سازی اتصالات. فیلدهای خالی پیش‌فرض Xray باقی می‌مانند.')}
        </p>
        <div className="xr-row-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('TCP congestion', 'کنترل ازدحام TCP')}</span>
            <select
              value={String(settings.tcpCongestion || '')}
              onChange={(e) => patch({ tcpCongestion: e.target.value })}
              className="select font-mono text-sm"
            >
              <option value="">{L('Default', 'پیش‌فرض')}</option>
              <option value="bbr">bbr</option>
              <option value="cubic">cubic</option>
              <option value="reno">reno</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Domain strategy', 'استراتژی دامنه')}</span>
            <select
              value={String(settings.domainStrategy || '')}
              onChange={(e) => patch({ domainStrategy: e.target.value })}
              className="select font-mono text-sm"
            >
              <option value="">{L('Default', 'پیش‌فرض')}</option>
              <option value="AsIs">AsIs</option>
              <option value="UseIP">UseIP</option>
              <option value="UseIPv4">UseIPv4</option>
              <option value="UseIPv6">UseIPv6</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Keep-alive idle (seconds)', 'زمان بیکاری Keep-alive (ثانیه)')}</span>
            <input
              type="number"
              dir="ltr"
              value={settings.tcpKeepAliveIdle ? String(settings.tcpKeepAliveIdle) : ''}
              onChange={(e) => patch({ tcpKeepAliveIdle: e.target.value ? Number(e.target.value) : '' })}
              className="input font-mono text-sm"
            />
            <span className="block text-xs text-(--text-muted)">{L('Empty is the Xray default.', 'خالی یعنی پیش‌فرض.')}</span>
          </label>
        </div>

        <label className="block max-w-sm space-y-1.5">
          <span className="text-xs text-(--text-muted)">{L('Keep-alive interval (seconds)', 'فاصله Keep-alive (ثانیه)')}</span>
          <input
            type="number"
            dir="ltr"
            value={settings.tcpKeepAliveInterval ? String(settings.tcpKeepAliveInterval) : ''}
            onChange={(e) => patch({ tcpKeepAliveInterval: e.target.value ? Number(e.target.value) : '' })}
            className="input font-mono text-sm"
          />
          <span className="block text-xs text-(--text-muted)">{L('Empty is the Xray default.', 'خالی یعنی پیش‌فرض.')}</span>
        </label>

        <div className="checks-inline">
          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.tcpFastOpen)}
              onChange={(e) => patch({ tcpFastOpen: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">TCP Fast Open</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.tcpMptcp)}
              onChange={(e) => patch({ tcpMptcp: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">Multipath TCP</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.v6only)}
              onChange={(e) => patch({ v6only: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L('IPv6 only', 'فقط IPv6')}</span>
          </label>
        </div>
      </fieldset>

      {/* Sniffing */}
      <fieldset className="xr-group">
        <legend>Sniffing</legend>
        <p className="m-0 text-xs text-(--text-muted)">
          {L(
            'Lets the server read the site name inside the traffic, for routing.',
            'به سرور اجازه می‌دهد نام سایت را برای مسیریابی از ترافیک بخواند.',
          )}
        </p>
        <label className="switch">
          <input
            type="checkbox"
            checked={sniffing.enabled !== false}
            onChange={(e) => patchNested('sniffing', { enabled: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">{L('Sniff traffic', 'شنود ترافیک (Sniffing)')}</span>
        </label>
        <div className="flex flex-wrap gap-5">
          {(['http', 'tls', 'quic', 'fakedns'] as const).map((protoKey) => {
            const arr = Array.isArray(sniffing.destOverride) ? (sniffing.destOverride as string[]) : [];
            const checked = arr.includes(protoKey);
            return (
              <label key={protoKey} className="inline-flex items-center gap-1.5 text-xs text-(--text-primary)">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const nextArr = e.target.checked
                      ? Array.from(new Set([...arr, protoKey]))
                      : arr.filter((x) => x !== protoKey);
                    patchNested('sniffing', { destOverride: nextArr });
                  }}
                />
                <span className="font-mono">{protoKey}</span>
              </label>
            );
          })}
        </div>
        <div className="space-y-2.5">
          <div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(sniffing.routeOnly)}
                onChange={(e) => patchNested('sniffing', { routeOnly: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">routeOnly</span>
            </label>
            <p className="mt-1 pl-12 text-xs text-(--text-muted)">
              {L('Use the sniffed name only for routing.', 'استفاده از نام شنودشده فقط برای مسیریابی.')}
            </p>
          </div>
          <div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(sniffing.metadataOnly)}
                onChange={(e) => patchNested('sniffing', { metadataOnly: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">metadataOnly</span>
            </label>
            <p className="mt-1 pl-12 text-xs text-(--text-muted)">
              {L('Sniff from connection metadata only, never the payload.', 'شنود فقط از متادیتای اتصال، بدون خواندن محتوا.')}
            </p>
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs text-(--text-muted)">{L('Excluded domains', 'دامنه‌های مستثنی')}</span>
          <textarea
            rows={3}
            dir="ltr"
            value={toLinesText(sniffing.domainsExcluded)}
            onChange={(e) => patchNested('sniffing', { domainsExcluded: fromLinesText(e.target.value) })}
            placeholder="courier.push.apple.com"
            className="textarea min-h-19.5! font-mono text-xs"
          />
          <span className="block text-xs text-(--text-muted)">{L('One per line.', 'در هر خط یک مورد.')}</span>
        </label>
      </fieldset>

      {/* Fallbacks (TCP raw + TLS) */}
      {transport === 'raw' && security === 'tls' && (
        <fieldset className="xr-group">
          <legend>{L('Fallbacks', 'مسیرهای جایگزین (Fallbacks)')}</legend>
          <p className="m-0 text-xs text-(--text-muted)">
            {L(
              'Forward unmatched connections to a web server or another service.',
              'اتصالات تطبیق‌نیافته را به وب‌سرور یا سرویس دیگر هدایت می‌کند.',
            )}
          </p>
          {fallbacks.map((fb, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-4">
              <input
                type="text"
                dir="ltr"
                placeholder={L('Name (SNI)', 'نام (SNI)')}
                value={fb.name || ''}
                onChange={(e) =>
                  patch({
                    fallbacks: fallbacks.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                  })
                }
                className="input h-9! font-mono text-xs"
              />
              <input
                type="text"
                dir="ltr"
                placeholder={L('Path', 'مسیر')}
                value={fb.path || ''}
                onChange={(e) =>
                  patch({
                    fallbacks: fallbacks.map((x, i) => (i === idx ? { ...x, path: e.target.value } : x)),
                  })
                }
                className="input h-9! font-mono text-xs"
              />
              <input
                type="text"
                dir="ltr"
                placeholder={L('Destination (e.g. 80)', 'مقصد')}
                value={fb.dest || ''}
                onChange={(e) =>
                  patch({
                    fallbacks: fallbacks.map((x, i) => (i === idx ? { ...x, dest: e.target.value } : x)),
                  })
                }
                className="input h-9! font-mono text-xs"
              />
              <Button
                size="sm"
                variant="danger"
                onClick={() => patch({ fallbacks: fallbacks.filter((_, i) => i !== idx) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {L('Remove', 'حذف')}
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch({ fallbacks: [...fallbacks, { name: '', path: '', dest: '80' }] })}
            className="xr-neighbours-btn justify-center"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {L('Add a fallback', 'افزودن fallback')}
          </button>
        </fieldset>
      )}

      {/* Client links */}
      <fieldset className="xr-group">
        <legend>{L('Client links', 'لینک‌های کلاینت')}</legend>
        <p className="m-0 text-xs text-(--text-muted)">
          {L(
            'The SNI and host every address uses unless the address sets its own.',
            'مقدار SNI و Host پیش‌فرض برای تمام آدرس‌ها مگر آنکه آدرس مقدار خودش را داشته باشد.',
          )}
        </p>
        <div className="xr-row-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('SNI in links', 'SNI در لینک‌ها')}</span>
            <input
              type="text"
              dir="ltr"
              value={String(settings.linkSni || '')}
              onChange={(e) => patch({ linkSni: e.target.value })}
              className="input font-mono text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-(--text-muted)">{L('Host in links', 'Host در لینک‌ها')}</span>
            <input
              type="text"
              dir="ltr"
              value={String(settings.linkHost || '')}
              onChange={(e) => patch({ linkHost: e.target.value })}
              className="input font-mono text-sm"
            />
          </label>
        </div>
      </fieldset>

      {/* Modals */}
      <XraySniPickerModal
        open={sniModalOpen}
        onClose={() => setSniModalOpen(false)}
        nodeId={nodeId}
        currentSni={realitySni}
        onSelect={(domain) =>
          patch({
            realitySni: domain,
            reality: { ...reality, serverNames: [domain], dest: `${domain}:443` },
          })
        }
      />

      <Modal
        open={confirmKeysModal}
        onClose={() => setConfirmKeysModal(false)}
        title={L('Replace Reality keys?', 'جایگزینی کلیدهای Reality؟')}
        subtitle={L(
          'Rotating the X25519 keypair invalidates older client links until they refresh their subscription.',
          'تغییر کلیدهای X25519 لینک‌های قبلی را نامعتبر می‌کند تا زمانی که اشتراک را به‌روزرسانی کنند.',
        )}
        size="sm"
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setConfirmKeysModal(false)}>
            {L('Cancel', 'انصراف')}
          </Button>
          <Button variant="danger" onClick={handleRotateRealityKeys}>
            {L('Replace keys', 'تغییر کلیدها')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmReplaceSniModal}
        onClose={() => setConfirmReplaceSniModal(false)}
        title={L('Change camouflage site', 'تغییر سایت استتار')}
        size="sm"
      >
        <div className="space-y-3">
          <input
            type="text"
            dir="ltr"
            value={replaceSniTarget}
            onChange={(e) => setReplaceSniTarget(e.target.value)}
            placeholder="www.microsoft.com"
            className="input font-mono text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmReplaceSniModal(false)}>
              {L('Cancel', 'انصراف')}
            </Button>
            <Button onClick={handleReplaceSni}>{L('Apply', 'اعمال')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
