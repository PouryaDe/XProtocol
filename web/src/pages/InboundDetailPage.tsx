import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Check, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import {
  buildDefaultSettings,
  defaultPortForKind,
  formatKindBadge,
  normalizeKind,
  pickFreeCidr,
  validateCidr,
  type InboundItem,
  type InboundRemote,
  type InboundSettings,
  type NodeOption,
} from '../lib/inboundTypes';
import { Button, EqLoader, PageHead, Tabs } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import {
  DeploymentNodesPanel,
  FoldSection,
  IpsecSection,
  L,
  NodePickerGrid,
  OpenConnectSection,
  TunnelNetworkPicker,
  WireGuardSection,
  type CertOption,
} from '../components/InboundSubforms';

interface GroupOption {
  id: number;
  name: string;
  clientCount?: number;
}

type ProtocolCardKind = 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp';

const PROTOCOL_CARDS: Array<{
  kind: ProtocolCardKind;
  title: string;
  badge: string;
  port: string;
  descEn: string;
  descFa: string;
}> = [
  {
    kind: 'openvpn',
    title: 'OpenVPN',
    badge: 'UDP / TCP',
    port: '1194',
    descEn: 'Broad compatibility across desktop and mobile with UDP or TCP transport.',
    descFa: 'سازگاری گسترده در دسکتاپ و موبایل با پشتیبانی از UDP و TCP.',
  },
  {
    kind: 'ocserv',
    title: 'OpenConnect',
    badge: 'TCP + DTLS',
    port: '443',
    descEn: 'AnyConnect-compatible HTTPS/TLS tunnel with optional camouflage over port 443.',
    descFa: 'تونل سازگار با AnyConnect روی پورت ۴۴۳ به همراه قابلیت Camouflage.',
  },
  {
    kind: 'wireguard',
    title: 'WireGuard',
    badge: 'UDP · AWG',
    port: '51820',
    descEn: 'Modern kernel-speed UDP VPN with optional AmneziaWG DPI obfuscation.',
    descFa: 'پروتکل سریع و مدرن UDP با امکان فعال‌سازی مبهم‌سازی AmneziaWG.',
  },
  {
    kind: 'ikev2',
    title: 'IKEv2',
    badge: 'IPSEC',
    port: '500 / 4500',
    descEn: 'Native iOS, macOS, and Windows VPN with MOBIKE network roaming.',
    descFa: 'پروتکل بومی iOS، macOS و ویندوز با پشتیبانی از جابجایی شبکه (MOBIKE).',
  },
  {
    kind: 'l2tp',
    title: 'L2TP / IPsec',
    badge: 'PSK',
    port: '500 / 4500',
    descEn: 'Built-in legacy OS and router VPN using a pre-shared key.',
    descFa: 'سازگار با سیستم‌های قدیمی‌تر و روترها با کلید مشترک (PSK).',
  },
];

function startOctetForKind(kind: ProtocolCardKind): number {
  switch (kind) {
    case 'wireguard':
      return 66;
    case 'ocserv':
      return 67;
    case 'ikev2':
      return 68;
    case 'l2tp':
      return 69;
    default:
      return 8;
  }
}

function dnsToString(dns: string | string[] | undefined): string {
  if (Array.isArray(dns)) return dns.join(', ');
  return dns || '1.1.1.1, 8.8.8.8';
}

function routesToString(routes: string | string[] | undefined): string {
  if (Array.isArray(routes)) return routes.join('\n');
  return routes || '';
}

function normalizeRemotes(raw: InboundSettings['remotes']): InboundRemote[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    label: String(r.label || ''),
    host: String(r.host || ''),
    port: String(r.port ?? ''),
  }));
}

export function InboundDetailPage({ inboundId }: { inboundId: number | 'new' }) {
  const { lang } = useUi();
  const isNew = inboundId === 'new';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [certs, setCerts] = useState<CertOption[]>([]);
  const [allInbounds, setAllInbounds] = useState<InboundItem[]>([]);
  const [inbound, setInbound] = useState<InboundItem | null>(null);

  // Wizard state (when isNew)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<ProtocolCardKind>('wireguard');
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [nodePortOverrides, setNodePortOverrides] = useState<Record<number, string>>({});
  const [preflightErrors, setPreflightErrors] = useState<Record<number, string | null>>({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  // Shared editor state (both wizard step 3 and edit mode)
  const [displayName, setDisplayName] = useState('');
  const [transport, setTransport] = useState('udp');
  const [port, setPort] = useState('51820');
  const [subnet, setSubnet] = useState('10.66.0.0/24');
  const [cidrValid, setCidrValid] = useState(true);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [remotes, setRemotes] = useState<InboundRemote[]>([]);
  const [settings, setSettings] = useState<InboundSettings>(() => buildDefaultSettings('wireguard'));

  // Edit mode extras
  const [tab, setTab] = useState<'settings' | 'config' | 'logs'>('settings');
  const [configText, setConfigText] = useState('');
  const [configPath, setConfigPath] = useState('');
  const [logsText, setLogsText] = useState('');
  const [copiedCfg, setCopiedCfg] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const existingSubnets = useMemo(
    () => allInbounds.map((ib) => ib.subnet).filter(Boolean),
    [allInbounds],
  );

  const hydrateFromInbound = useCallback((ib: InboundItem) => {
    setInbound(ib);
    const k = normalizeKind(ib.protocol);
    setKind(k);
    setDisplayName(ib.displayName || ib.settings?.displayName || ib.name);
    setTransport(ib.transport || (k === 'ocserv' ? 'tcp' : 'udp'));
    setPort(String(ib.port));
    setSubnet(ib.subnet || '10.8.0.0/24');
    setCidrValid(validateCidr(ib.subnet || '10.8.0.0/24', k).ok);
    setDescription(ib.description || '');
    setEnabled(!!ib.enabled);
    const merged: InboundSettings = {
      ...buildDefaultSettings(k),
      ...(ib.settings || {}),
    };
    if (ib.protocol.toLowerCase() === 'amneziawg') {
      merged.obfuscation = 'amnezia';
    }
    setSettings(merged);
    setRemotes(normalizeRemotes(merged.remotes));
  }, []);

  const loadConfigAndLogs = useCallback(async (id: number) => {
    try {
      const cfg = await apiFetch<{ path: string; content: string; logs: string }>(`/inbounds/${id}/config`);
      setConfigPath(cfg.path || '');
      setConfigText(cfg.content || '');
      setLogsText(cfg.logs || '');
    } catch {
      // ignore if draft or unavailable
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nRes, iRes, gRes, cRes] = await Promise.all([
        apiFetch<{ nodes: NodeOption[] }>('/nodes').catch(() => ({ nodes: [] })),
        apiFetch<{ inbounds: InboundItem[] }>('/inbounds'),
        apiFetch<{ groups: GroupOption[] }>('/groups').catch(() => ({ groups: [] })),
        apiFetch<{
          certificates: Array<{ id: number; name: string; domainOrIp: string; certType: string; status: string }>;
        }>('/certificates').catch(() => ({ certificates: [] })),
      ]);

      const fetchedNodes = nRes.nodes || [];
      const fetchedInbounds = iRes.inbounds || [];
      setNodes(fetchedNodes);
      setAllInbounds(fetchedInbounds);
      setGroups(gRes.groups || []);
      setCerts(
        (cRes.certificates || []).map((c) => ({
          id: c.id,
          domain: c.domainOrIp || c.name,
          source: c.certType,
          status: c.status,
        })),
      );

      if (isNew) {
        const subs = fetchedInbounds.map((x) => x.subnet).filter(Boolean);
        setSubnet(pickFreeCidr(subs, startOctetForKind(kind)));
        if (fetchedNodes.length === 1 && selectedNodeIds.length === 0) {
          setSelectedNodeIds([fetchedNodes[0].id]);
        }
      } else {
        const found = fetchedInbounds.find((x) => x.id === inboundId) || null;
        if (!found) {
          setError(L(lang, 'Inbound not found.', 'اینباند یافت نشد.'));
        } else {
          hydrateFromInbound(found);
          await loadConfigAndLogs(found.id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inboundId, isNew, lang, hydrateFromInbound, loadConfigAndLogs]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundId]);

  const patchSettings = useCallback((patch: Partial<InboundSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelectKind = (nextKind: ProtocolCardKind) => {
    setKind(nextKind);
    setTransport(nextKind === 'ocserv' ? 'tcp' : 'udp');
    setPort(String(defaultPortForKind(nextKind)));
    setSubnet(pickFreeCidr(existingSubnets, startOctetForKind(nextKind)));
    setSettings(buildDefaultSettings(nextKind));
  };

  const toggleNode = (id: number) => {
    setPreflightErrors((prev) => ({ ...prev, [id]: null }));
    setSelectedNodeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const buildPayloadSettings = (): InboundSettings => {
    const cleanRemotes = remotes
      .filter((r) => r.host.trim())
      .map((r) => ({
        label: r.label.trim() || r.host.trim(),
        host: r.host.trim(),
        port: Number(r.port) || Number(port) || defaultPortForKind(kind),
      }));
    return {
      ...settings,
      displayName: displayName.trim() || undefined,
      description: description.trim() || undefined,
      remotes: cleanRemotes,
    };
  };

  const handleCreateSubmit = async () => {
    setError(null);
    if (!cidrValid) {
      setError(L(lang, 'Fix the tunnel network CIDR before saving.', 'لطفاً بازه شبکه تونل (CIDR) را اصلاح کنید.'));
      return;
    }

    const basePort = Number(port) || defaultPortForKind(kind);
    const portsMap: Record<string, number> = {};
    for (const nid of selectedNodeIds) {
      const ov = Number(nodePortOverrides[nid]);
      if (ov > 0) portsMap[String(nid)] = ov;
    }

    setSaving(true);
    try {
      if (selectedNodeIds.length > 0) {
        const pre = await apiFetch<{ items: Array<{ nodeId: number; error: string | null }> }>('/inbounds/preflight', {
          method: 'POST',
          body: JSON.stringify({
            nodeIds: selectedNodeIds,
            port: basePort,
            ports: portsMap,
            excludeInboundId: null,
          }),
        });
        const errs: Record<number, string | null> = {};
        let hasErr = false;
        for (const item of pre.items || []) {
          if (item.error) {
            errs[item.nodeId] = item.error;
            hasErr = true;
          }
        }
        if (hasErr) {
          setPreflightErrors(errs);
          setStep(2);
          setError(
            L(
              lang,
              'One or more selected nodes reported a port conflict or availability issue.',
              'در یک یا چند نود انتخاب‌شده تداخل پورت یا خطای دسترسی وجود دارد.',
            ),
          );
          return;
        }
      }

      const apiProtocol =
        kind === 'wireguard' && settings.obfuscation === 'amnezia' ? 'amneziawg' : kind;

      const created = await apiFetch<{ id: number; ids?: number[] }>('/inbounds', {
        method: 'POST',
        body: JSON.stringify({
          nodeIds: selectedNodeIds,
          ports: portsMap,
          protocol: apiProtocol,
          displayName: displayName.trim() || undefined,
          transport: kind === 'ikev2' || kind === 'l2tp' ? 'udp' : transport,
          port: basePort,
          subnet: subnet.trim(),
          authMode: settings.authMode || (kind === 'openvpn' ? 'cert' : 'userpass'),
          description: description.trim(),
          enabled,
          settings: buildPayloadSettings(),
          groupIds: selectedGroupIds,
        }),
      });
      navigate(`/inbounds/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!inbound) return;
    setError(null);
    setSaveMsg(null);
    if (!cidrValid) {
      setError(L(lang, 'Fix the tunnel network CIDR before saving.', 'لطفاً بازه شبکه تونل (CIDR) را اصلاح کنید.'));
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/inbounds/${inbound.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim() || inbound.name,
          transport: kind === 'ikev2' || kind === 'l2tp' ? 'udp' : transport,
          port: Number(port) || defaultPortForKind(kind),
          subnet: subnet.trim(),
          authMode: settings.authMode || inbound.authMode,
          description: description.trim(),
          enabled,
          settings: buildPayloadSettings(),
        }),
      });
      setSaveMsg(L(lang, 'Settings saved.', 'تنظیمات ذخیره شد.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!inbound) return;
    setBusyAction(action);
    setError(null);
    try {
      await apiFetch(`/inbounds/${inbound.id}/${action}`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (!inbound) return;
    setDeleting(true);
    try {
      await apiFetch(`/inbounds/${inbound.id}`, { method: 'DELETE' });
      navigate('/inbounds');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const renderTunnelRoutingFold = () => (
    <FoldSection
      title={L(lang, 'Tunnel & routing options', 'تنظیمات تونل و مسیریابی')}
      summaryPrefix={L(lang, 'DNS & gateway defaults. ', 'تنظیمات پیش‌فرض DNS و مسیر. ')}
      summary={dnsToString(settings.dns)}
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'DNS servers pushed to clients', 'سرورهای DNS برای کلاینت‌ها')}
        </span>
        <input
          type="text"
          dir="ltr"
          value={dnsToString(settings.dns)}
          onChange={(e) => patchSettings({ dns: e.target.value })}
          placeholder="1.1.1.1, 8.8.8.8"
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
        />
      </label>

      <div className="checks-inline">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.redirectGateway !== false}
            onChange={(e) => patchSettings({ redirectGateway: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">
            {L(lang, 'Route all client internet traffic through VPN', 'هدایت تمام ترافیک اینترنت کلاینت از طریق VPN')}
          </span>
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={settings.nat !== false}
            onChange={(e) => patchSettings({ nat: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">{L(lang, 'Enable masquerade / NAT', 'فعال‌سازی NAT / Masquerade')}</span>
        </label>

        {kind === 'openvpn' && (
          <>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!settings.clientToClient}
                onChange={(e) => patchSettings({ clientToClient: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">{L(lang, 'Allow client-to-client traffic', 'ارتباط بین کلاینت‌ها')}</span>
            </label>

            <label className="switch">
              <input
                type="checkbox"
                checked={settings.blockOutsideDns !== false}
                onChange={(e) => patchSettings({ blockOutsideDns: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">{L(lang, 'Block outside DNS (anti-leak)', 'جلوگیری از نشت DNS')}</span>
            </label>
          </>
        )}
      </div>

      {kind === 'openvpn' && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Push custom routes (one per line)', 'مسیرهای سفارشی Push Route (هر خط یک مورد)')}
          </span>
          <textarea
            rows={2}
            dir="ltr"
            value={routesToString(settings.pushRoutes)}
            onChange={(e) => patchSettings({ pushRoutes: e.target.value })}
            placeholder="10.20.0.0 255.255.0.0"
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
          />
        </label>
      )}
    </FoldSection>
  );

  const renderOpenVpnSections = () => (
    <>
      <div className="ed-section">
        <h2>{L(lang, 'Authentication & TLS', 'احراز هویت و TLS')}</h2>
        <div className="ed-fields mt-4">
          <div className="form-row">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Client authentication', 'روش احراز هویت کلاینت')}
              </span>
              <select
                value={settings.authMode || 'cert'}
                onChange={(e) => patchSettings({ authMode: e.target.value })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
              >
                <option value="cert">{L(lang, 'Certificate only (fastest connect)', 'فقط گواهینامه (اتصال سریع)')}</option>
                <option value="cert+pass">
                  {L(lang, 'Certificate + username/password', 'گواهینامه + نام کاربری و رمز')}
                </option>
                <option value="pass">{L(lang, 'Username & password only', 'فقط نام کاربری و رمز')}</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'TLS control-channel mode', 'حالت کانال کنترل TLS')}
              </span>
              <select
                value={settings.tlsMode || 'tls-crypt'}
                onChange={(e) => patchSettings({ tlsMode: e.target.value as InboundSettings['tlsMode'] })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
              >
                <option value="tls-crypt">tls-crypt (encrypted & authenticated)</option>
                <option value="tls-auth">tls-auth (HMAC signature)</option>
                <option value="none">{L(lang, 'None', 'بدون رمزنگاری اضافه')}</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <FoldSection
        title={L(lang, 'Encryption & ciphers', 'الگوریتم‌های رمزنگاری')}
        summaryPrefix={L(lang, 'Recommended AEAD ciphers. ', 'رمزنگاری‌های مدرن فعال است. ')}
        summary={(settings.dataCiphers || ['AES-256-GCM']).join(', ')}
      >
        <div className="checks-inline">
          {['AES-256-GCM', 'AES-128-GCM', 'CHACHA20-POLY1305'].map((cipher) => {
            const list = settings.dataCiphers || ['AES-256-GCM', 'AES-128-GCM', 'CHACHA20-POLY1305'];
            const checked = list.includes(cipher);
            return (
              <label key={cipher} className="inline-flex items-center gap-2 text-xs font-mono text-(--text-secondary)">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked ? list.filter((x) => x !== cipher) : [...list, cipher];
                    if (next.length > 0) patchSettings({ dataCiphers: next });
                  }}
                />
                <span>{cipher}</span>
              </label>
            );
          })}
        </div>

        <div className="form-row three">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Fallback cipher', 'رمز جایگزین (Fallback)')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={settings.fallbackCipher || 'AES-256-CBC'}
              onChange={(e) => patchSettings({ fallbackCipher: e.target.value })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Auth digest', 'هش احراز هویت')}
            </span>
            <select
              value={settings.authDigest || 'SHA256'}
              onChange={(e) => patchSettings({ authDigest: e.target.value })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            >
              <option value="SHA256">SHA256</option>
              <option value="SHA384">SHA384</option>
              <option value="SHA512">SHA512</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Min TLS version', 'حداقل نسخه TLS')}
            </span>
            <select
              value={settings.tlsMinVersion || '1.2'}
              onChange={(e) => patchSettings({ tlsMinVersion: e.target.value })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            >
              <option value="1.2">TLS 1.2</option>
              <option value="1.3">TLS 1.3</option>
            </select>
          </label>
        </div>
      </FoldSection>

      {renderTunnelRoutingFold()}

      <FoldSection
        title={L(lang, 'Performance & limits', 'کارایی و محدودیت‌ها')}
        summaryPrefix="Keepalive "
        summary={`${settings.keepaliveInterval ?? 10}s / ${settings.keepaliveTimeout ?? 60}s · MTU ${settings.tunMtu ?? 1500}`}
      >
        <div className="form-row three">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Keepalive interval (s)', 'بازه Keepalive (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.keepaliveInterval ?? 10}
              onChange={(e) => patchSettings({ keepaliveInterval: Number(e.target.value) || 10 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Keepalive timeout (s)', 'مهلت قطع اتصال (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.keepaliveTimeout ?? 60}
              onChange={(e) => patchSettings({ keepaliveTimeout: Number(e.target.value) || 60 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Max concurrent clients', 'حداکثر کلاینت همزمان')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.maxClients ?? 100}
              onChange={(e) => patchSettings({ maxClients: Number(e.target.value) || 100 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
        </div>

        <div className="form-row three">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">TUN MTU</span>
            <input
              type="number"
              dir="ltr"
              value={settings.tunMtu ?? 1500}
              onChange={(e) => patchSettings({ tunMtu: Number(e.target.value) || 1500 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">MSSFix</span>
            <input
              type="number"
              dir="ltr"
              value={settings.mssFix ?? 1450}
              onChange={(e) => patchSettings({ mssFix: Number(e.target.value) || 1450 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Renegotiate seconds', 'تمدید کلید (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.renegSec ?? 3600}
              onChange={(e) => patchSettings({ renegSec: Number(e.target.value) || 3600 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
        </div>
      </FoldSection>

      <FoldSection
        title={L(lang, 'Advanced OpenVPN directives', 'دستورات پیشرفته OpenVPN')}
        summaryPrefix={L(lang, 'Optional overrides. ', 'تنظیمات تکمیلی اختیاری. ')}
        summary={settings.portShare ? `port-share ${settings.portShare}` : L(lang, 'Default', 'پیش‌فرض')}
      >
        <div className="form-row">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'TCP port-share target', 'آدرس اشتراک‌گذاری پورت TCP (port-share)')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={settings.portShare || ''}
              onChange={(e) => patchSettings({ portShare: e.target.value })}
              placeholder="127.0.0.1 8443"
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <div className="flex items-end pb-2">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.exitNotify !== false}
                onChange={(e) => patchSettings({ exitNotify: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">{L(lang, 'Send explicit-exit-notify', 'ارسال explicit-exit-notify')}</span>
            </label>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Extra server directives', 'دستورات اضافه سمت سرور')}
          </span>
          <textarea
            rows={2}
            dir="ltr"
            value={settings.serverCustom || ''}
            onChange={(e) => patchSettings({ serverCustom: e.target.value })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Extra client profile directives', 'دستورات اضافه پروفایل کلاینت')}
          </span>
          <textarea
            rows={2}
            dir="ltr"
            value={settings.clientCustom || ''}
            onChange={(e) => patchSettings({ clientCustom: e.target.value })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
          />
        </label>
      </FoldSection>
    </>
  );

  const renderSharedBasicsSection = () => (
    <div className="ed-section">
      <h2>{L(lang, 'Basics', 'تنظیمات پایه')}</h2>
      <div className="ed-fields mt-4">
        <div className="form-row">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Display name', 'نام نمایشی')}
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={L(lang, 'e.g. Fast WireGuard', 'مثال: WireGuard پرسرعت')}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
            />
          </label>

          <div className="flex flex-col justify-center">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Protocol', 'پروتکل')}
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs font-semibold text-(--text-primary)">
                {formatKindBadge(kind, settings.obfuscation)}
              </span>
              {inbound && (
                <span className="font-mono text-xs text-(--text-muted)" dir="ltr">
                  #{inbound.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {kind === 'ikev2' || kind === 'l2tp' ? (
          <div className="callout">
            <div className="text-xs text-(--text-secondary)">
              {L(
                lang,
                'IPsec listens on standard UDP ports 500 (IKE) and 4500 (NAT-T).',
                'پروتکل IPsec به‌صورت استاندارد روی پورت‌های UDP 500 و 4500 شنود می‌کند.',
              )}
            </div>
          </div>
        ) : (
          <div className="form-row">
            {kind === 'openvpn' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'Transport protocol', 'پروتکل انتقال')}
                </span>
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                >
                  <option value="udp">UDP ({L(lang, 'Recommended', 'پیشنهادی')})</option>
                  <option value="tcp">TCP</option>
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Default listen port', 'پورت پیش‌فرض شنود')}
              </span>
              <input
                type="number"
                dir="ltr"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Description (optional)', 'توضیحات (اختیاری)')}
          </span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={L(lang, 'Shown in admin notes & client info', 'نمایش در یادداشت مدیر و اطلاعات کلاینت')}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
          />
        </label>

        {/* Connect addresses (.ep-table) */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Connect addresses (optional)', 'آدرس‌های اتصال دلخواه (اختیاری)')}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setRemotes((prev) => [...prev, { label: '', host: '', port: String(port || defaultPortForKind(kind)) }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {L(lang, 'Add address', 'افزودن آدرس')}
            </Button>
          </div>
          {remotes.length > 0 && (
            <div className="ep-table">
              <div className="ep-head">
                <span>{L(lang, 'Label', 'برچسب')}</span>
                <span>{L(lang, 'Domain / IP', 'دامنه یا IP')}</span>
                <span>{L(lang, 'Port', 'پورت')}</span>
                <span />
              </div>
              {remotes.map((r, idx) => (
                <div key={idx} className="ep-row">
                  <input
                    type="text"
                    placeholder={L(lang, 'Direct / CDN', 'مستقیم / تانل')}
                    value={r.label}
                    onChange={(e) =>
                      setRemotes((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)),
                      )
                    }
                    className="rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1.5 text-xs text-(--text-primary)"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="vpn.example.com"
                    value={r.host}
                    onChange={(e) =>
                      setRemotes((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, host: e.target.value } : item)),
                      )
                    }
                    className="rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1.5 font-mono text-xs text-(--text-primary)"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    placeholder={port}
                    value={r.port}
                    onChange={(e) =>
                      setRemotes((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, port: e.target.value } : item)),
                      )
                    }
                    className="rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1.5 font-mono text-xs text-(--text-primary)"
                  />
                  <button
                    type="button"
                    onClick={() => setRemotes((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg p-1.5 text-(--text-muted) hover:text-red-400"
                    title={L(lang, 'Remove', 'حذف')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-1">
          <label className="switch">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="track" />
            <span className="sw-text">
              {L(lang, 'Run this inbound (start automatically on attached nodes)', 'اینباند فعال باشد (اجرای خودکار روی نودها)')}
            </span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderTunnelNetworkSection = () => (
    <FoldSection
      title={L(lang, 'Tunnel network', 'شبکه داخلی تونل (CIDR)')}
      summaryPrefix={L(lang, 'IPv4 client pool: ', 'رنج IP کلاینت‌ها: ')}
      summary={
        <span className="font-mono" dir="ltr">
          {subnet}
        </span>
      }
    >
      <TunnelNetworkPicker
        value={subnet}
        kind={kind}
        onChange={setSubnet}
        onValidityChange={setCidrValid}
      />
    </FoldSection>
  );

  const renderProtocolSpecificSections = () => {
    if (kind === 'openvpn') return renderOpenVpnSections();
    if (kind === 'ocserv') {
      return (
        <>
          <OpenConnectSection settings={settings} certs={certs} onPatch={patchSettings} />
          {renderTunnelRoutingFold()}
        </>
      );
    }
    if (kind === 'wireguard') {
      return (
        <>
          <WireGuardSection
            settings={settings}
            serverPublicKey={inbound?.serverPublicKey}
            onPatch={patchSettings}
          />
          {renderTunnelRoutingFold()}
        </>
      );
    }
    return (
      <>
        <IpsecSection kind={kind} settings={settings} certs={certs} onPatch={patchSettings} />
        {renderTunnelRoutingFold()}
      </>
    );
  };

  if (loading && !inbound && !isNew) {
    return <EqLoader label={L(lang, 'Loading inbound…', 'در حال بارگذاری اینباند…')} />;
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      <button
        type="button"
        onClick={() => navigate('/inbounds')}
        className="backlink inline-flex w-fit items-center gap-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) transition"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        <span>{L(lang, 'Inbounds', 'اینباندها')}</span>
      </button>

      <PageHead
        title={
          isNew
            ? L(lang, 'New inbound', 'اینباند جدید')
            : inbound?.displayName || inbound?.settings?.displayName || inbound?.name || `#${inboundId}`
        }
        sub={
          isNew
            ? L(
                lang,
                'Set up a VPN protocol in three steps. Choose deployment nodes now or save as a draft.',
                'پروتکل VPN را در سه مرحله راه‌اندازی کنید. نودهای اجرا را الان انتخاب کنید یا به‌عنوان پیش‌نویس ذخیره کنید.',
              )
            : `${L(lang, 'Shared settings', 'تنظیمات مشترک')} · ${
                inbound?.nodeId != null
                  ? L(lang, 'Deployment nodes: 1', 'نودهای اجرا: ۱')
                  : L(lang, 'Draft · no deployment nodes', 'پیش‌نویس · بدون نود اجرا')
              }`
        }
        actions={
          !isNew && inbound ? (
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {L(lang, 'Delete inbound', 'حذف اینباند')}
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {saveMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {saveMsg}
        </div>
      )}

      {isNew ? (
        <div className="flex flex-col gap-5">
          {/* Stepper */}
          <ol className="inb-wizard">
            <li className={step === 1 ? 'current' : step > 1 ? 'done' : ''}>
              <button type="button" onClick={() => setStep(1)} disabled={step === 1}>
                <span className="font-mono text-xs opacity-70">1.</span>
                <span>{L(lang, 'Protocol & name', 'پروتکل و نام')}</span>
              </button>
            </li>
            <li className={step === 2 ? 'current' : step > 2 ? 'done' : ''}>
              <button type="button" onClick={() => step >= 2 && setStep(2)} disabled={step <= 2}>
                <span className="font-mono text-xs opacity-70">2.</span>
                <span>{L(lang, 'Choose nodes', 'انتخاب نودها')}</span>
              </button>
            </li>
            <li className={step === 3 ? 'current' : ''}>
              <button type="button" disabled={step !== 3}>
                <span className="font-mono text-xs opacity-70">3.</span>
                <span>{L(lang, 'Settings & access', 'تنظیمات و دسترسی')}</span>
              </button>
            </li>
          </ol>

          {step === 1 && (
            <div className="editor inb-settings-body">
              <div className="ed-section inb-create-identity">
                <h2>{L(lang, 'Choose protocol', 'انتخاب پروتکل')}</h2>
                <div className="kind-cards mt-4">
                  {PROTOCOL_CARDS.map((card) => {
                    const selected = kind === card.kind;
                    return (
                      <button
                        key={card.kind}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleSelectKind(card.kind)}
                        className={`kind-card ${selected ? 'selected' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-(--text-primary)">{card.title}</span>
                          <span className="rounded bg-(--bg-elevated) px-1.5 py-0.5 font-mono text-[10px] text-(--text-secondary)">
                            {card.badge}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-(--text-secondary) leading-relaxed">
                          {lang === 'fa' ? card.descFa : card.descEn}
                        </p>
                        <div className="mt-2 font-mono text-[11px] text-(--text-muted)" dir="ltr">
                          {L(lang, 'Default port:', 'پورت پیش‌فرض:')} {card.port}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 max-w-md">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                      {L(lang, 'Display name (optional)', 'نام نمایشی (اختیاری)')}
                    </span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={
                        kind === 'wireguard'
                          ? L(lang, 'e.g. Fast WireGuard', 'مثال: WireGuard پرسرعت')
                          : kind === 'ocserv'
                            ? L(lang, 'e.g. OpenConnect HTTPS', 'مثال: OpenConnect 443')
                            : L(lang, 'e.g. Primary VPN', 'مثال: سرور اصلی')
                      }
                      className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                    />
                    <span className="mt-1.5 block text-xs text-(--text-muted)">
                      {L(
                        lang,
                        'Shown to admins and clients. Leave empty to generate an automatic name like wg51820.',
                        'در پنل و لیست اشتراک نمایش داده می‌شود. اگر خالی بماند به‌صورت خودکار (مانند wg51820) ساخته می‌شود.',
                      )}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="editor inb-settings-body">
              <div className="ed-section">
                <h2>{L(lang, 'Where should this inbound run?', 'این اینباند روی کدام نودها اجرا شود؟')}</h2>
                <div className="mt-4">
                  <NodePickerGrid
                    nodes={nodes}
                    selectedIds={selectedNodeIds}
                    onToggle={toggleNode}
                    errors={preflightErrors}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="editor inb-settings-body flex flex-col gap-4">
              {selectedNodeIds.length > 1 && kind !== 'ikev2' && kind !== 'l2tp' && (
                <FoldSection
                  className="inb-advanced-basics"
                  title={L(lang, 'Per-node port overrides', 'تغییر پورت به‌ازای هر نود')}
                  summaryPrefix={L(lang, 'Selected nodes: ', 'نودهای انتخاب‌شده: ')}
                  summary={String(selectedNodeIds.length)}
                >
                  <div className="form-row">
                    {selectedNodeIds.map((nid) => {
                      const n = nodes.find((x) => x.id === nid);
                      return (
                        <label key={nid} className="block">
                          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                            {n?.isLocal ? L(lang, 'This server', 'همین سرور') : n?.name || `#${nid}`}
                          </span>
                          <input
                            type="number"
                            dir="ltr"
                            min={1}
                            max={65535}
                            value={nodePortOverrides[nid] ?? port}
                            onChange={(e) =>
                              setNodePortOverrides((prev) => ({ ...prev, [nid]: e.target.value }))
                            }
                            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                          />
                        </label>
                      );
                    })}
                  </div>
                </FoldSection>
              )}

              {renderSharedBasicsSection()}
              {renderTunnelNetworkSection()}
              {renderProtocolSpecificSections()}

              {groups.length > 0 && (
                <div className="ed-section">
                  <h2>{L(lang, 'Access groups', 'گروه‌های دسترسی')}</h2>
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {L(
                      lang,
                      'Attach this inbound to existing client groups right away.',
                      'این اینباند را هم‌زمان به گروه‌های کاربری موجود اضافه کنید.',
                    )}
                  </p>
                  <div className="checks-inline mt-3">
                    {groups.map((g) => (
                      <label
                        key={g.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-3 py-1.5 text-xs text-(--text-primary)"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                        />
                        <span>{g.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sticky Savebar */}
          <div className="savebar">
            <div className="flex items-center gap-2">
              {step === 1 ? (
                <Button variant="secondary" onClick={() => navigate('/inbounds')}>
                  {L(lang, 'Cancel', 'انصراف')}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setStep((s) => (s === 3 ? 2 : 1))}>
                  {L(lang, 'Back', 'مرحله قبل')}
                </Button>
              )}
            </div>

            <div className="inb-save-actions">
              {step === 1 && (
                <Button variant="primary" onClick={() => setStep(2)}>
                  {L(lang, 'Continue', 'ادامه')}
                </Button>
              )}
              {step === 2 && (
                <Button variant="primary" onClick={() => setStep(3)}>
                  {selectedNodeIds.length > 0
                    ? L(lang, 'Continue', 'ادامه')
                    : L(lang, 'Continue as draft', 'ادامه به‌عنوان پیش‌نویس')}
                </Button>
              )}
              {step === 3 && (
                <Button variant="primary" disabled={saving || !cidrValid} onClick={() => void handleCreateSubmit()}>
                  {saving
                    ? L(lang, 'Creating…', 'در حال ایجاد…')
                    : selectedNodeIds.length > 0
                      ? lang === 'fa'
                        ? `راه‌اندازی روی ${selectedNodeIds.length} نود`
                        : `Set up selected nodes (${selectedNodeIds.length})`
                      : L(lang, 'Save draft', 'ذخیره پیش‌نویس')}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : inbound ? (
        <div className="flex flex-col gap-5">
          <DeploymentNodesPanel
            inbound={inbound}
            nodes={nodes}
            busyAction={busyAction}
            onAction={handleAction}
            onReload={load}
          />

          <Tabs
            items={[
              { id: 'settings', label: L(lang, 'Settings', 'تنظیمات') },
              { id: 'config', label: L(lang, 'Config file', 'فایل کانفیگ') },
              { id: 'logs', label: L(lang, 'Logs', 'لاگ‌ها') },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next);
              if (next === 'config' || next === 'logs') {
                void loadConfigAndLogs(inbound.id);
              }
            }}
          />

          {tab === 'settings' && (
            <>
              <div className="editor inb-settings-body flex flex-col gap-4">
                {renderSharedBasicsSection()}
                {renderTunnelNetworkSection()}
                {renderProtocolSpecificSections()}
              </div>

              <div className="savebar">
                <Button variant="secondary" onClick={() => hydrateFromInbound(inbound)}>
                  {L(lang, 'Reset changes', 'بازگردانی تغییرات')}
                </Button>
                <div className="inb-save-actions">
                  <Button variant="primary" disabled={saving || !cidrValid} onClick={() => void handleSaveEdit()}>
                    {saving ? L(lang, 'Saving…', 'در حال ذخیره…') : L(lang, 'Save & apply', 'ذخیره و اعمال')}
                  </Button>
                </div>
              </div>
            </>
          )}

          {tab === 'config' && (
            <div className="panel p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-(--text-muted)" dir="ltr">
                  {configPath || L(lang, 'Generated server config', 'کانفیگ تولیدشده سرور')}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void loadConfigAndLogs(inbound.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {L(lang, 'Refresh', 'بروزرسانی')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(configText);
                      setCopiedCfg(true);
                      setTimeout(() => setCopiedCfg(false), 1800);
                    }}
                  >
                    {copiedCfg ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCfg ? L(lang, 'Copied', 'کپی شد') : L(lang, 'Copy', 'کپی')}
                  </Button>
                </div>
              </div>
              <pre className="code-block" dir="ltr">
                {configText || L(lang, '# No config generated yet (draft inbound or stopped)', '# هنوز کانفیگی تولید نشده است')}
              </pre>
            </div>
          )}

          {tab === 'logs' && (
            <div className="panel p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'Runtime service output', 'خروجی لاگ سرویس')}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void loadConfigAndLogs(inbound.id)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {L(lang, 'Refresh logs', 'بروزرسانی لاگ')}
                </Button>
              </div>
              <pre className="code-block" dir="ltr">
                {logsText || L(lang, 'No logs available yet.', 'هنوز لاگی ثبت نشده است.')}
              </pre>
            </div>
          )}

          <Modal
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={L(lang, 'Delete inbound', 'حذف اینباند')}
            subtitle={displayName || inbound.name}
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-(--text-secondary)">
                {L(
                  lang,
                  'This permanently stops the service and deletes the inbound configuration.',
                  'این کار سرویس را متوقف کرده و تنظیمات اینباند را برای همیشه حذف می‌کند.',
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                  {L(lang, 'Cancel', 'لغو')}
                </Button>
                <Button variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? L(lang, 'Deleting…', 'در حال حذف…') : L(lang, 'Delete', 'حذف')}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </div>
  );
}
