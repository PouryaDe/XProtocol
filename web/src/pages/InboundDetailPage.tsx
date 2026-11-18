import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, RefreshCw } from 'lucide-react';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { navigate, useLocationState } from '../lib/router';
import {
  buildDefaultSettings,
  defaultPortForKind,
  formatKindBadge,
  normalizeKind,
  validateCidr,
  type InboundItem,
  type InboundRemote,
  type InboundSettings,
  type NodeOption,
} from '../lib/inboundTypes';
import { Button, EqLoader, PageHead, Tabs } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import { XrayWizard } from '../components/XrayWizard';
import { XrayAdvancedSection, type XrayCombosResponse } from '../components/XrayInboundEditor';
import { ConnectAddressesField } from '../components/ConnectAddressesField';
import {
  DeploymentNodesPanel,
  FoldSection,
  IpsecSection,
  L,
  NodePickerGrid,
  OpenConnectSection,
  SmartDnsSection,
  TelegramProxySection,
  TunnelNetworkPicker,
  WireGuardSection,
  type CertOption,
} from '../components/InboundSubforms';

interface GroupOption {
  id: number;
  name: string;
  allInbounds?: boolean;
  clientCount?: number;
}

type ProtocolCardKind = 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp' | 'smartdns' | 'telegram';

const PROTOCOL_CARDS: Array<{
  kind: ProtocolCardKind;
  title: string;
  defaultPlaceholder: string;
  descEn: string;
  descFa: string;
}> = [
  {
    kind: 'openvpn',
    title: 'OpenVPN',
    defaultPlaceholder: 'udp1194',
    descEn: 'Profile file for any OpenVPN app',
    descFa: 'فایل پروفایل برای تمام برنامه‌های OpenVPN',
  },
  {
    kind: 'ocserv',
    title: 'OpenConnect',
    defaultPlaceholder: 'oc443',
    descEn: 'Cisco Secure Client and OpenConnect apps',
    descFa: 'اپلیکیشن‌های Cisco Secure Client و OpenConnect',
  },
  {
    kind: 'wireguard',
    title: 'WireGuard',
    defaultPlaceholder: 'wg51820',
    descEn: 'Fast, one configuration per device',
    descFa: 'سریع، یک کانفیگ اختصاصی به ازای هر دستگاه',
  },
  {
    kind: 'ikev2',
    title: 'IKEv2',
    defaultPlaceholder: 'ikev2500',
    descEn: 'Native IKEv2 with certificate trust and username/password',
    descFa: 'IKEv2 بومی با گواهینامه معتبر و نام کاربری/رمز عبور',
  },
  {
    kind: 'l2tp',
    title: 'L2TP/IPsec',
    defaultPlaceholder: 'l2tp500',
    descEn: 'L2TP with IPsec and a pre-shared key for compatible clients',
    descFa: 'L2TP همراه با IPsec و کلید مشترک برای کلاینت‌های سازگار',
  },
  {
    kind: 'smartdns',
    title: 'Smart DNS',
    defaultPlaceholder: 'dns53',
    descEn: 'DNS for sanctioned services, no app needed',
    descFa: 'DNS هوشمند برای سرویس‌های تحریمی، بدون نیاز به اپلیکیشن',
  },
  {
    kind: 'telegram',
    title: 'Telegram proxy',
    defaultPlaceholder: 'tg443',
    descEn: 'Proxy for Telegram, no app needed',
    descFa: 'پروکسی اختصاصی تلگرام، بدون نیاز به اپلیکیشن',
  },
];

function dnsToLines(dns: string | string[] | undefined): string {
  if (Array.isArray(dns)) return dns.join('\n');
  if (typeof dns === 'string') {
    return dns
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }
  return '1.1.1.1\n8.8.8.8';
}

function routesToLines(routes: string | string[] | undefined): string {
  if (Array.isArray(routes)) return routes.join('\n');
  return routes || '';
}

function normalizeRemotes(raw: InboundSettings['remotes']): InboundRemote[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    flag: r.flag ? String(r.flag) : '',
    label: String(r.label || ''),
    host: String(r.host || ''),
    port: String(r.port ?? ''),
    ...(r.sni ? { sni: String(r.sni) } : {}),
    ...(r.hostHeader ? { hostHeader: String(r.hostHeader) } : {}),
  }));
}

export function InboundDetailPage({ inboundId }: { inboundId: number | 'new' }) {
  const { lang } = useUi();
  const { search } = useLocationState();
  const isNew = inboundId === 'new';
  const isXrayWizard = isNew && new URLSearchParams(search).get('kind') === 'xray';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [certs, setCerts] = useState<CertOption[]>([]);
  const [inbound, setInbound] = useState<InboundItem | null>(null);
  const [xrayCombos, setXrayCombos] = useState<XrayCombosResponse | null>(null);

  // Wizard state (when isNew)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<ProtocolCardKind>('openvpn');
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [nodePortOverrides, setNodePortOverrides] = useState<Record<number, string>>({});
  const [preflightErrors, setPreflightErrors] = useState<Record<number, string | null>>({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  // Shared editor state (both wizard Step 3 and edit mode)
  const [displayName, setDisplayName] = useState('');
  const [transport, setTransport] = useState('udp');
  const [port, setPort] = useState('1194');
  const [subnet, setSubnet] = useState('');
  const [cidrValid, setCidrValid] = useState(true);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [remotes, setRemotes] = useState<InboundRemote[]>([]);
  const [settings, setSettings] = useState<InboundSettings>(() => buildDefaultSettings('openvpn'));

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

  const activeCardMeta = useMemo(
    () => PROTOCOL_CARDS.find((c) => c.kind === kind) || PROTOCOL_CARDS[0],
    [kind],
  );

  const hydrateFromInbound = useCallback((ib: InboundItem) => {
    setInbound(ib);
    const k = normalizeKind(ib.protocol);
    setKind(k);
    setDisplayName(ib.displayName || ib.settings?.displayName || ib.name);
    setTransport(ib.transport || (k === 'ocserv' ? 'tcp' : 'udp'));
    setPort(String(ib.port));
    setSubnet(ib.subnet || '');
    setCidrValid(validateCidr(ib.subnet || '', k).ok);
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
      setGroups(gRes.groups || []);
      setCerts(
        (cRes.certificates || []).map((c) => ({
          id: c.id,
          domain: c.domainOrIp || c.name,
          source: c.certType,
          status: c.status,
        })),
      );

      if (!isNew) {
        const found = fetchedInbounds.find((x) => x.id === inboundId) || null;
        if (!found) {
          setError(L(lang, 'Inbound not found.', 'اینباند یافت نشد.'));
        } else {
          hydrateFromInbound(found);
          if (found.protocol === 'xray') {
            apiFetch<XrayCombosResponse>('/xray/combos').then(setXrayCombos).catch(() => undefined);
          }
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
    setTransport(nextKind === 'ocserv' || nextKind === 'telegram' ? 'tcp' : 'udp');
    setPort(String(defaultPortForKind(nextKind)));
    setSubnet('');
    setCidrValid(true);
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
        ...(r.flag ? { flag: r.flag } : {}),
        label: r.label.trim() || r.host.trim(),
        host: r.host.trim(),
        port: Number(r.port) || Number(port) || defaultPortForKind(kind),
        ...(r.sni ? { sni: r.sni.trim() } : {}),
        ...(r.hostHeader ? { hostHeader: r.hostHeader.trim() } : {}),
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
          subnet: subnet.trim() || inbound.subnet,
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

  const renderNetworkAndDnsSection = () => (
    <FoldSection
      title={L(lang, 'Network and DNS', 'شبکه و DNS')}
      summary={L(lang, 'Recommended defaults are in use.', 'تنظیمات پیش‌فرض پیشنهادی فعال است.')}
    >
      <div className="flex flex-col gap-1">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.redirectGateway !== false}
            onChange={(e) => patchSettings({ redirectGateway: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">
            {L(lang, 'Send all traffic through the VPN', 'ارسال تمام ترافیک از طریق VPN')}
          </span>
        </label>
        <span className="text-xs text-(--text-muted)">
          {L(
            lang,
            'Off = split tunnel: only the routes below go through the VPN.',
            'خاموش = split tunnel: فقط مسیرهای زیر از طریق VPN عبور می‌کنند.',
          )}
        </span>
      </div>

      {settings.redirectGateway === false && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Routes to push', 'مسیرهای ارسالی (Push Routes)')}
          </span>
          <textarea
            rows={3}
            dir="ltr"
            value={routesToLines(settings.pushRoutes)}
            onChange={(e) => patchSettings({ pushRoutes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            placeholder="192.168.0.0/16"
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
          />
          <span className="mt-1 block text-xs text-(--text-muted)">
            {L(lang, 'One CIDR per line, for example 192.168.0.0/16.', 'هر CIDR در یک خط، مثلاً 192.168.0.0/16.')}
          </span>
        </label>
      )}

      <label className="switch">
        <input
          type="checkbox"
          checked={settings.nat !== false}
          onChange={(e) => patchSettings({ nat: e.target.checked })}
        />
        <span className="track" />
        <span className="sw-text">{L(lang, 'NAT client traffic to the internet', 'NAT ترافیک کلاینت به اینترنت')}</span>
      </label>

      <label className="switch">
        <input
          type="checkbox"
          checked={!!settings.ipv6}
          onChange={(e) => patchSettings({ ipv6: e.target.checked })}
        />
        <span className="track" />
        <span className="sw-text">{L(lang, 'IPv6 inside the tunnel', 'پشتیبانی از IPv6 داخل تونل')}</span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'Max connected clients', 'حداکثر کلاینت متصل همزمان')}
        </span>
        <input
          type="number"
          dir="ltr"
          min={1}
          value={settings.maxClients ?? (kind === 'wireguard' ? 1024 : 253)}
          onChange={(e) => patchSettings({ maxClients: Number(e.target.value) || 1024 })}
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'DNS servers', 'سرورهای DNS')}
        </span>
        <textarea
          rows={3}
          dir="ltr"
          value={dnsToLines(settings.dns)}
          onChange={(e) => patchSettings({ dns: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
          placeholder={'1.1.1.1\n8.8.8.8'}
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
        />
        <span className="mt-1 block text-xs text-(--text-muted)">
          {L(lang, 'One per line, up to four.', 'هر کدام در یک خط، حداکثر چهار مورد.')}
        </span>
      </label>
    </FoldSection>
  );

  const renderOpenVpnSections = () => (
    <>
      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Authentication & TLS', 'احراز هویت و TLS')}</h2>
        </div>
        <div className="ed-fields">
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
                <option value="tls-crypt">tls-crypt</option>
                <option value="tls-auth">tls-auth</option>
                <option value="none">{L(lang, 'None', 'بدون رمزنگاری اضافه')}</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <FoldSection
        title={L(lang, 'Encryption & ciphers', 'الگوریتم‌های رمزنگاری')}
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
              {L(lang, 'Fallback cipher', 'رمز جایگزین')}
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

      <FoldSection
        title={L(lang, 'Advanced OpenVPN directives', 'دستورات پیشرفته OpenVPN')}
        summary={settings.portShare ? `port-share ${settings.portShare}` : L(lang, 'Recommended defaults are in use.', 'تنظیمات پیش‌فرض فعال است.')}
      >
        <div className="form-row">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'TCP port-share target', 'آدرس اشتراک‌گذاری پورت TCP')}
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
      </FoldSection>
    </>
  );

  const renderBasicsSection = (showDisplayNameField: boolean) => (
    <div className="ed-section">
      <div>
        <h2>{L(lang, 'Basics', 'تنظیمات پایه')}</h2>
      </div>
      <div className="ed-fields">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Protocol', 'پروتکل')}
          </span>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center rounded-md border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1 text-xs font-medium text-(--text-primary)">
              {formatKindBadge(kind, settings.obfuscation)}
            </span>
            {!isNew && (
              <span className="text-xs text-(--text-muted)">
                {L(lang, 'Fixed when the inbound was created.', 'هنگام ساخت اینباند ثابت شده است.')}
              </span>
            )}
          </div>
        </div>

        {showDisplayNameField && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Display name', 'نام نمایشی')}
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={activeCardMeta.defaultPlaceholder}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
            />
            <span className="mt-1.5 block text-xs text-(--text-muted)">
              {L(
                lang,
                'A readable name for this inbound; the server identifier is generated automatically.',
                'یک نام خوانا برای این اینباند؛ شناسه سرور به‌صورت خودکار ساخته می‌شود.',
              )}
            </span>
          </label>
        )}

        {inbound?.protocol === 'xray' ? null : kind === 'smartdns' ? (
          <div className="callout">
            <div className="text-xs text-(--text-secondary)">
              {L(
                lang,
                'Smart DNS listens on port 53 plus web traffic on ports 80 and 443.',
                'سرویس Smart DNS روی پورت ۵۳ و ترافیک وب روی پورت‌های ۸۰ و ۴۴۳ شنود می‌کند.',
              )}
            </div>
          </div>
        ) : kind === 'telegram' ? (
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Port', 'پورت')}
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
        ) : kind === 'ikev2' || kind === 'l2tp' ? (
          <div className="callout space-y-1">
            <div className="text-xs text-(--text-secondary)">
              {kind === 'l2tp'
                ? L(
                    lang,
                    'IPsec listens on standard UDP ports 500, 4500, and 1701.',
                    'پروتکل L2TP/IPsec روی پورت‌های UDP 500، 4500 و 1701 شنود می‌کند.',
                  )
                : L(
                    lang,
                    'IPsec listens on standard UDP ports 500 and 4500; L2TP also uses UDP 1701.',
                    'پروتکل IPsec روی پورت‌های UDP 500 و 4500 شنود می‌کند.',
                  )}
            </div>
            {kind === 'l2tp' && (
              <div className="text-xs text-amber-300">
                {L(
                  lang,
                  'Only one L2TP/IPsec inbound may run on a node.',
                  'تنها یک اینباند L2TP/IPsec روی هر نود می‌تواند فعال باشد.',
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="form-row">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Protocol', 'پروتکل انتقال')}
              </span>
              {kind === 'wireguard' ? (
                <select
                  value={settings.ipv6 ? 'udp6' : 'udp'}
                  onChange={(e) => {
                    setTransport('udp');
                    patchSettings({ ipv6: e.target.value === 'udp6' });
                  }}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                >
                  <option value="udp">UDP</option>
                  <option value="udp6">UDP (IPv4 + IPv6)</option>
                </select>
              ) : kind === 'ocserv' ? (
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                >
                  <option value="tcp">TCP</option>
                  <option value="tcp6">TCP (IPv4 + IPv6)</option>
                </select>
              ) : (
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                >
                  <option value="udp">UDP</option>
                  <option value="tcp">TCP</option>
                  <option value="udp6">UDP (IPv4 + IPv6)</option>
                  <option value="tcp6">TCP (IPv4 + IPv6)</option>
                </select>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Port', 'پورت')}
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

        {inbound?.protocol !== 'xray' && kind !== 'smartdns' && kind !== 'telegram' && (
          <details className="inb-advanced-basics">
            <summary>{L(lang, 'Tunnel network', 'شبکه تونل')}</summary>
            <div className="pt-1">
              <TunnelNetworkPicker
                value={subnet}
                kind={kind}
                onChange={setSubnet}
                onValidityChange={setCidrValid}
              />
            </div>
          </details>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Description', 'توضیحات')}
          </span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
          />
          <span className="mt-1.5 block text-xs text-(--text-muted)">
            {L(
              lang,
              'Shown to clients on their page, e.g. "Use this on mobile data".',
              'در صفحه اشتراک به کاربران نمایش داده می‌شود، مثلاً «مناسب برای اینترنت همراه».',
            )}
          </span>
        </label>

        {kind === 'wireguard' && (
          <div className="flex flex-col gap-1.5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Client filename', 'نام فایل کلاینت')}
              </span>
              <input
                type="text"
                dir="ltr"
                value={settings.filenameTemplate || ''}
                onChange={(e) => patchSettings({ filenameTemplate: e.target.value })}
                placeholder="{username}-{device}"
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
            </label>
            <span className="text-xs text-(--text-muted)">
              {L(
                lang,
                'Use a fixed name or a template. Leave empty for the default name.',
                'یک نام ثابت یا الگو وارد کنید. برای نام پیش‌فرض خالی بگذارید.',
              )}
            </span>
            <details className="wg-filename-help">
              <summary>{L(lang, 'Filename options', 'گزینه‌های نام فایل')}</summary>
              <p className="text-xs text-(--text-muted)">
                {L(
                  lang,
                  'Leave empty for username plus code. Use a fixed name, or {username}, {device} and {inbound}. Example: VPN-{username}. Short Latin names are used as entered; long or unsupported names get a safe code to meet WireGuard’s 15-character limit. Add {device} for distinct device names.',
                  'در صورت خالی بودن از نام کاربری به‌همراه کد استفاده می‌شود. می‌توانید از نام ثابت یا متغیرهای {username}، {device} و {inbound} استفاده کنید.',
                )}
              </p>
            </details>
          </div>
        )}

        {/* Connect addresses */}
        {inbound?.protocol !== 'xray' && kind !== 'smartdns' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Connect addresses', 'آدرس‌های اتصال')}
            </span>
            <p className="text-xs text-(--text-muted)">
              {remotes.length > 0
                ? L(
                    lang,
                    'Each address becomes its own config for clients, plus a remote line in the all-in-one OpenVPN profile. Use it for relay servers or tunnels in front of this inbound.',
                    'هر آدرس یک کانفیگ جداگانه برای کلاینت‌ها می‌سازد. در صورت افزودن آدرس، کانفیگ‌ها از این آدرس‌ها استفاده می‌کنند.',
                  )
                : L(
                    lang,
                    "Clients connect to this server's own address directly. Add addresses to offer relays or tunnels in front of this inbound.",
                    'کلاینت‌ها مستقیماً به آدرس همین سرور متصل می‌شوند. برای ارائه تانل یا سرور واسط، آدرس اضافه کنید.',
                  )}
            </p>
            <ConnectAddressesField lang={lang} remotes={remotes} onChange={setRemotes} />
          </div>
        )}

        <label className="switch pt-1">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="track" />
          <span className="sw-text">{L(lang, 'Run this inbound', 'اجرای این اینباند')}</span>
        </label>
      </div>
    </div>
  );

  const renderProtocolSpecificSections = () => {
    if (inbound?.protocol === 'xray') {
      return (
        <div className="panel editor">
          <div className="p-5">
            <XrayAdvancedSection
              settings={settings as Record<string, unknown>}
              onChange={(next) => setSettings(next as InboundSettings)}
              combos={xrayCombos}
              nodeId={inbound.nodeId ?? 0}
              inboundId={inbound.id}
              port={Number(port) || inbound.port || 443}
              onPortChange={(p) => setPort(String(p))}
              remotes={remotes}
              onRemotesChange={setRemotes}
              onRefreshInbound={() => {
                void load();
              }}
            />
          </div>
        </div>
      );
    }
    if (kind === 'smartdns') {
      return <SmartDnsSection settings={settings} onPatch={patchSettings} />;
    }
    if (kind === 'telegram') {
      return <TelegramProxySection settings={settings} onPatch={patchSettings} />;
    }
    if (kind === 'openvpn') {
      return (
        <>
          {renderOpenVpnSections()}
          {renderNetworkAndDnsSection()}
        </>
      );
    }
    if (kind === 'ocserv') {
      return (
        <>
          <OpenConnectSection settings={settings} certs={certs} onPatch={patchSettings} />
          {renderNetworkAndDnsSection()}
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
          {renderNetworkAndDnsSection()}
        </>
      );
    }
    return (
      <>
        <IpsecSection kind={kind} settings={settings} certs={certs} onPatch={patchSettings} />
        {renderNetworkAndDnsSection()}
      </>
    );
  };

  if (isXrayWizard) {
    return <XrayWizard onBackOtherProtocols={() => navigate('/inbounds/new')} />;
  }

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
          !isNew
            ? `${L(lang, 'Shared settings', 'تنظیمات مشترک')} · ${
                inbound?.nodeId != null
                  ? L(lang, 'deployment nodes: 1', 'نودهای اجرا: ۱')
                  : L(lang, 'draft · no deployment nodes', 'پیش‌نویس · بدون نود اجرا')
              }`
            : undefined
        }
        actions={
          !isNew && inbound ? (
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              {L(lang, 'Delete', 'حذف')}
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
          {/* 3-step stepper matching Ovira (.inb-wizard) */}
          <ol className="inb-wizard">
            <li
              className={step === 1 ? 'current' : 'done cursor-pointer'}
              onClick={() => step > 1 && setStep(1)}
            >
              <span>{step > 1 ? <Check /> : 1}</span>
              <strong>{L(lang, 'Protocol & name', 'پروتکل و نام')}</strong>
            </li>
            <li
              className={step === 2 ? 'current' : step > 2 ? 'done cursor-pointer' : ''}
              onClick={() => step > 2 && setStep(2)}
            >
              <span>{step > 2 ? <Check /> : 2}</span>
              <strong>{L(lang, 'Choose nodes', 'انتخاب نودها')}</strong>
            </li>
            <li className={step === 3 ? 'current' : ''}>
              <span>3</span>
              <strong>{L(lang, 'Settings & access', 'تنظیمات و دسترسی')}</strong>
            </li>
          </ol>

          {step === 1 && (
            <div className="panel editor">
              <div className="ed-section inb-create-identity">
                <div className="flex flex-col justify-between gap-8">
                  <h2>{L(lang, 'Protocol & name', 'پروتکل و نام')}</h2>
                  <label className="field block">
                    <span className="mb-1.5 block text-xs font-medium text-(--text-primary)">
                      {L(lang, 'Display name', 'نام نمایشی')}
                    </span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={activeCardMeta.defaultPlaceholder}
                      className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                    />
                    <span className="mt-1.5 block text-xs text-(--text-muted)">
                      {L(
                        lang,
                        'A readable name for this inbound; the server identifier is generated automatically.',
                        'یک نام خوانا برای این اینباند؛ شناسه سرور به‌صورت خودکار ساخته می‌شود.',
                      )}
                    </span>
                  </label>
                </div>

                <div className="kind-cards self-start">
                  <label className="kind-card">
                    <input
                      type="radio"
                      name="inb-protocol-kind"
                      checked={false}
                      onChange={() => navigate('/inbounds/new?kind=xray')}
                    />
                    <strong>Xray</strong>
                    <span className="text-xs text-(--text-secondary) leading-relaxed">
                      {lang === 'fa'
                        ? 'VLESS، VMess، Trojan یا Shadowsocks با تمام تنظیمات Xray مانند 3x-ui. در صورت تمایل از یک قالب شروع کنید.'
                        : 'VLESS, VMess, Trojan or Shadowsocks with every Xray setting, like 3x-ui. Start from a template if you like.'}
                    </span>
                  </label>
                  {PROTOCOL_CARDS.map((card) => {
                    const selected = kind === card.kind;
                    return (
                      <label key={card.kind} className="kind-card">
                        <input
                          type="radio"
                          name="inb-protocol-kind"
                          checked={selected}
                          onChange={() => handleSelectKind(card.kind)}
                        />
                        <strong>{card.title}</strong>
                        <span className="text-xs text-(--text-secondary) leading-relaxed">
                          {lang === 'fa' ? card.descFa : card.descEn}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="savebar justify-end">
                <div className="inb-save-actions">
                  <Button variant="primary" onClick={() => setStep(2)}>
                    {L(lang, 'Continue', 'ادامه')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="panel editor">
              <div className="ed-section">
                <div className="flex flex-col justify-between gap-6">
                  <h2>{L(lang, 'Choose nodes', 'انتخاب نودها')}</h2>
                  <p className="ed-lede">
                    {L(
                      lang,
                      'Select no nodes to save this inbound as a draft. You can deploy it later.',
                      'اگر هیچ نودی را انتخاب نکنید، اینباند به‌عنوان پیش‌نویس ذخیره می‌شود و بعداً قابل اجراست.',
                    )}
                  </p>
                </div>
                <NodePickerGrid
                  nodes={nodes}
                  selectedIds={selectedNodeIds}
                  onToggle={toggleNode}
                  errors={preflightErrors}
                  needsInstall={kind === 'ikev2' || kind === 'l2tp' || kind === 'telegram'}
                  notice={
                    kind === 'ikev2' || kind === 'l2tp'
                      ? L(
                          lang,
                          'Automatic IPsec installation supports Debian and Ubuntu. Other distributions require compatible dependencies to be installed beforehand.',
                          'نصب خودکار IPsec از دبیان و اوبونتو پشتیبانی می‌کند. سایر توزیع‌ها نیاز به نصب پیش‌نیازها دارند.',
                        )
                      : undefined
                  }
                />
              </div>

              <div className="savebar justify-end">
                <div className="inb-save-actions">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    {L(lang, 'Back', 'مرحله قبل')}
                  </Button>
                  <Button variant="primary" onClick={() => setStep(3)}>
                    {L(lang, 'Continue', 'ادامه')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <>
              <p className="inb-shared-note">
                {selectedNodeIds.length > 0
                  ? `${L(lang, 'Selected nodes', 'نودهای انتخاب‌شده')}: ${selectedNodeIds.length} · ${displayName.trim() || activeCardMeta.defaultPlaceholder}`
                  : L(lang, 'Saving as a draft · no deployment nodes', 'ذخیره به‌عنوان پیش‌نویس · بدون نود اجرا')}
              </p>

              <div className="panel editor">
                {selectedNodeIds.length > 0 && kind !== 'ikev2' && kind !== 'l2tp' && (
                  <details className="inb-advanced-basics mx-5.5 mt-4.5">
                    <summary>{L(lang, 'Node-specific settings', 'تنظیمات اختصاصی نود')}</summary>
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-(--text-muted)">
                        {L(
                          lang,
                          'Leave a field empty to inherit the shared setting. A changed field only affects this node.',
                          'برای ارث‌بری از تنظیمات مشترک، فیلد را خالی بگذارید. تغییر هر فیلد فقط روی همان نود اعمال می‌شود.',
                        )}
                      </p>
                      <div className="form-row">
                        {selectedNodeIds.map((nid) => {
                          const n = nodes.find((x) => x.id === nid);
                          const nodeLabel = n?.isLocal ? L(lang, 'This server', 'همین سرور') : n?.name || `#${nid}`;
                          return (
                            <label key={nid} className="block">
                              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                                {L(lang, 'Custom port', 'پورت سفارشی')} · {nodeLabel}
                              </span>
                              <input
                                type="number"
                                dir="ltr"
                                min={1}
                                max={65535}
                                placeholder={port}
                                value={nodePortOverrides[nid] ?? ''}
                                onChange={(e) =>
                                  setNodePortOverrides((prev) => ({ ...prev, [nid]: e.target.value }))
                                }
                                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                )}

                {renderBasicsSection(false)}

                {groups.length > 0 && (
                  <div className="ed-section">
                    <div>
                      <h2>{L(lang, 'Access', 'دسترسی')}</h2>
                    </div>
                    <div className="ed-fields">
                      <div className="flex flex-col gap-2">
                        {groups.map((g) =>
                          g.allInbounds ? (
                            <span key={g.id} className="text-xs text-(--text-secondary)">
                              {g.name} · {L(lang, 'Already included (all inbounds)', 'شامل دسترسی همه اینباندها')}
                            </span>
                          ) : (
                            <label
                              key={g.id}
                              className="inline-flex w-fit items-center gap-2 text-xs text-(--text-primary)"
                            >
                              <input
                                type="checkbox"
                                checked={selectedGroupIds.includes(g.id)}
                                onChange={() => toggleGroup(g.id)}
                              />
                              <span>{g.name}</span>
                            </label>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {renderProtocolSpecificSections()}

                <div className="savebar justify-end">
                  <div className="inb-save-actions">
                    <Button variant="secondary" disabled={saving} onClick={() => setStep(2)}>
                      {L(lang, 'Back', 'مرحله قبل')}
                    </Button>
                    <Button variant="primary" disabled={saving || !cidrValid} onClick={() => void handleCreateSubmit()}>
                      {saving
                        ? L(lang, 'Setting up…', 'در حال راه‌اندازی…')
                        : selectedNodeIds.length > 0
                          ? lang === 'fa'
                            ? `راه‌اندازی نودهای انتخاب‌شده (${selectedNodeIds.length})`
                            : `Set up selected nodes (${selectedNodeIds.length})`
                          : L(lang, 'Save draft', 'ذخیره پیش‌نویس')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
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
              <p className="inb-shared-note">
                {L(
                  lang,
                  'Shared settings apply to all deployment nodes. Node-specific settings are preserved.',
                  'تنظیمات مشترک روی تمام نودهای اجرا اعمال می‌شود و تنظیمات اختصاصی هر نود حفظ می‌گردد.',
                )}
              </p>

              <div className="panel editor">
                {renderBasicsSection(true)}
                {renderProtocolSpecificSections()}

                <div className="savebar justify-end">
                  <div className="inb-save-actions">
                    <Button variant="primary" disabled={saving || !cidrValid} onClick={() => void handleSaveEdit()}>
                      {saving ? L(lang, 'Saving…', 'در حال ذخیره…') : L(lang, 'Save', 'ذخیره')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'config' && (
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <h2 className="text-sm font-semibold text-(--text-primary)">
                  {L(lang, 'Written to', 'مسیر فایل')}{' '}
                  <span className="font-mono text-xs text-(--text-secondary)" dir="ltr">
                    {configPath || '/etc/wireguard/'}
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void loadConfigAndLogs(inbound.id)}>
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
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <h2 className="text-sm font-semibold text-(--text-primary)">{L(lang, 'Logs', 'لاگ‌ها')}</h2>
                <Button size="sm" variant="secondary" onClick={() => void loadConfigAndLogs(inbound.id)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {L(lang, 'Refresh', 'بروزرسانی')}
                </Button>
              </div>
              <pre className="code-block" dir="ltr">
                {logsText || L(lang, 'No log lines yet.', 'هنوز لاگی ثبت نشده است.')}
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
                  'Delete this inbound and all its deployments? Connected clients will disconnect on every deployment node.',
                  'این اینباند و تمام استقرارهای آن حذف شود؟ کلاینت‌های متصل روی همه نودها قطع خواهند شد.',
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
