import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Key,
  Layers,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { toPanelUrl } from '../lib/router';
import { ACCENT_PALETTES, useUi, type AccentName } from '../i18n/context';
import { Button, EmptySonar, Input, PageHead, Select, StatusPill, Tabs, type TabItem } from '../components/UiPrimitives';
import { QrCode } from '../components/QrCode';
import { SettingsWebhooksTab } from '../components/SettingsWebhooksTab';
import { SettingsBackupDestinations } from '../components/SettingsBackupDestinations';
import { SettingsSubAppsSection, SettingsSubOriginsSection } from '../components/SettingsSubDomainsAndApps';
import { SettingsAccountTelegramNotifications, SettingsSignInProtection } from '../components/SettingsSecurityAndNotifications';
import type { CurrentAccount } from '../components/Layout';

type SettingsTab = 'general' | 'subscription' | 'panelAccess' | 'myAccount' | 'webhooks' | 'api' | 'backup' | 'audit';
type SubBuilderTab = 'look' | 'shop' | 'proto' | 'apps' | 'domains';
type BackupSubTab = 'telegram' | 's3' | 'sftp';

const TIMEZONES = (() => {
  try {
    const sup = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sup === 'function') return sup('timeZone');
  } catch {
    // fallback
  }
  return ['Asia/Tehran', 'UTC', 'Europe/Berlin', 'Europe/London', 'Europe/Istanbul', 'America/New_York', 'Asia/Dubai', 'Asia/Tokyo'];
})();

const ACCENTS: AccentName[] = ['lime', 'cyan', 'mint', 'amber', 'coral', 'rose', 'violet', 'sky'];
const SUB_SWATCHES = ['#34d399', '#22d3ee', '#c4f82a', '#fbbf24', '#fb7185', '#a78bfa', '#38bdf8'];

const LOOKS = [
  { id: 'night_shift', mockClass: 'tc-night', defaultHex: '#34d399', name: 'Night shift', faName: 'شیفت شب', desc: 'Dark control room with glowing lamps', faDesc: 'حالت تیره با نشانگرهای نئونی' },
  { id: 'aurora', mockClass: 'tc-aurora', defaultHex: '#6366f1', name: 'Aurora', faName: 'شفق', desc: 'Soft colour glow & frosted-glass cards', faDesc: 'گرادیان نرم و کارت‌های شیشه‌ای' },
  { id: 'pop', mockClass: 'tc-pop', defaultHex: '#ec4899', name: 'Pop', faName: 'پاپ', desc: 'Playful cards with bold outlines', faDesc: 'کارت‌های شاد با حاشیه ضخیم' },
  { id: 'ticket', mockClass: 'tc-ticket', defaultHex: '#0ea5e9', name: 'Ticket', faName: 'بلیط', desc: 'Clean paper boarding pass', faDesc: 'کارت کاغذی تمیز و خوانا' },
  { id: 'orbit', mockClass: 'tc-orbit', defaultHex: '#818cf8', name: 'Orbit', faName: 'مدار', desc: 'Deep space with glowing accent ring', faDesc: 'فضای عمیق با حلقه درخشان' },
  { id: 'mono', mockClass: 'tc-mono', defaultHex: '#111110', name: 'Mono', faName: 'مونو', desc: 'Quiet editorial layout with crisp typography', faDesc: 'چیدمان مینیمال و تایپوگرافی کلاسیک' },
] as const;

export function SettingsPage({ account }: { account: CurrentAccount }) {
  const { t, lang, accent, setAccent, setBrandName, setSupportTelegram } = useUi();
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<SettingsTab>(account.isOwner ? 'general' : 'myAccount');
  const [subTab, setSubTab] = useState<SubBuilderTab>(account.isOwner ? 'look' : 'apps');
  const [backupSubTab, setBackupSubTab] = useState<BackupSubTab>('telegram');
  const [tzQuery, setTzQuery] = useState('');
  const [openProto, setOpenProto] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  // General
  const [general, setGeneral] = useState({
    brandName: 'XProtocol',
    publicAddress: '127.0.0.1',
    panelUrl: '',
    subscriptionLinkAddress: '',
    supportTelegram: '',
    defaultSubLanguage: 'en',
    timezone: 'Asia/Tehran',
    panelColor: 'mint' as AccentName,
    warnExpiresWithinDays: 5,
    warnTrafficPercent: 85,
    inactivityTimeoutHours: 72,
    eventRetainDays: 30,
    nodeSampleRawDays: 7,
    nodeSampleKeepDays: 90,
    metricsRoot: false,
    loginAllowCidrs: [] as string[],
    loginOnlyAllowCidrs: false,
  });
  const [sysInfo, setSysInfo] = useState({ version: '2.0.0-beta.3', platform: '', machineId: '' });

  // Telegram Backup
  const [tgBackup, setTgBackup] = useState({
    enabled: false,
    botToken: '',
    chatId: '',
    intervalHours: 24,
    proxyUrl: '',
    lastSentAt: null as string | null,
  });
  const [hasTgToken, setHasTgToken] = useState(false);
  const [foundChats, setFoundChats] = useState<{ chatId: string; title: string }[]>([]);
  const [tgBusy, setTgBusy] = useState(false);

  // Subscription page settings
  const [subSettings, setSubSettings] = useState<{
    look: string;
    accentColor: string;
    shopName: string;
    supportLink: string;
    supportButtonText: string;
    channelLink: string;
    protocols: { id: string; shown: boolean; tabName: string; guideNote: string; useRecommendedApps: boolean }[];
  } | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  // Panel access
  const [panelAccess, setPanelAccess] = useState({
    port: 2053,
    bindAddress: '',
    subPort: '' as string | number,
    secretPath: '',
    subPath: 'sub',
    tlsCertFile: '',
    tlsKeyFile: '',
    trustProxy: false,
  });

  // API Tokens
  const [tokens, setTokens] = useState<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // My Account (password, 2FA, sessions)
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<{ id: string; ip: string; userAgent: string; lastSeenAt: string; current: boolean }[]>([]);

  // Audit
  const [auditEntries, setAuditEntries] = useState<{ id: number; ts: string; username: string; action: string; target: string; ip: string }[]>([]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  useEffect(() => {
    if (account.isOwner) {
      apiFetch<{ general: typeof general; system: typeof sysInfo }>('/settings/general')
        .then((r) => {
          setGeneral((prev) => ({
            ...prev,
            ...r.general,
            panelUrl: r.general.panelUrl || '',
            timezone: r.general.timezone || 'Asia/Tehran',
            supportTelegram: r.general.supportTelegram || '',
            loginAllowCidrs: Array.isArray(r.general.loginAllowCidrs) ? r.general.loginAllowCidrs : [],
            loginOnlyAllowCidrs: Boolean(r.general.loginOnlyAllowCidrs),
          }));
          setSysInfo(r.system);
        })
        .catch(() => undefined);
      apiFetch<{ telegram: typeof tgBackup; hasToken: boolean }>('/settings/telegram-backup')
        .then((r) => {
          setTgBackup(r.telegram);
          setHasTgToken(r.hasToken);
        })
        .catch(() => undefined);
      apiFetch<{ settings: typeof subSettings; previewToken: string | null }>('/settings/subscription-page')
        .then((r) => {
          setSubSettings(r.settings);
          setPreviewToken(r.previewToken);
        })
        .catch(() => undefined);
      apiFetch<{ panelAccess: typeof panelAccess }>('/settings/panel-access')
        .then((r) => setPanelAccess({ ...r.panelAccess, subPort: r.panelAccess.subPort ?? '' }))
        .catch(() => undefined);
      apiFetch<{ entries: typeof auditEntries }>('/settings/audit-log')
        .then((r) => setAuditEntries(r.entries))
        .catch(() => undefined);
    }
    apiFetch<{ tokens: typeof tokens }>('/settings/api-tokens').then((r) => setTokens(r.tokens)).catch(() => undefined);
    apiFetch<{ account: { totpEnabled: boolean }; sessions: typeof sessions }>('/auth/me')
      .then((r) => {
        setTotpEnabled(r.account.totpEnabled);
        setSessions(r.sessions);
      })
      .catch(() => undefined);
  }, [account.isOwner]);

  const availableTabs: TabItem<SettingsTab>[] = [
    ...(account.isOwner
      ? [
          { id: 'general' as const, label: t.settings.tabs.general },
          { id: 'subscription' as const, label: t.settings.tabs.subscription },
          { id: 'panelAccess' as const, label: t.settings.tabs.panelAccess },
        ]
      : account.permissions.ownSubOrigins
        ? [{ id: 'subscription' as const, label: t.settings.tabs.subscription }]
        : []),
    { id: 'myAccount' as const, label: t.settings.tabs.myAccount },
    ...(account.isOwner || account.permissions.webhooks ? [{ id: 'webhooks' as const, label: t.settings.tabs.webhooks }] : []),
    { id: 'api' as const, label: t.settings.tabs.api },
    ...(account.isOwner ? [{ id: 'backup' as const, label: t.settings.tabs.backup }] : []),
    ...(account.isOwner || account.permissions.clients.view === 'all'
      ? [{ id: 'audit' as const, label: t.settings.tabs.audit }]
      : []),
  ];

  const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64Db = btoa(binary);
    const res = await apiFetch<{ message: string }>('/settings/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ base64Db }),
    });
    flash(res.message);
  };

  const cleanSubPath = (panelAccess.subPath || 'sub').replace(/^\/+|\/+$/g, '') || 'sub';
  const previewUrl = previewToken ? `/${cleanSubPath}/${previewToken}` : '';
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const win = previewFrameRef.current?.contentWindow;
    if (!win || !subSettings) return;
    win.postMessage({ type: 'xp-preview', settings: subSettings }, window.location.origin);
  }, [subSettings]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'xp-preview-ready' && subSettings) {
        previewFrameRef.current?.contentWindow?.postMessage(
          { type: 'xp-preview', settings: subSettings },
          window.location.origin,
        );
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [subSettings]);

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/settings/general', { method: 'PUT', body: JSON.stringify(general) });
      flash(isFa ? 'تنظیمات عمومی ذخیره شد.' : 'General settings saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveSubSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subSettings) return;
    setSaving(true);
    try {
      await apiFetch('/settings/subscription-page', { method: 'PUT', body: JSON.stringify(subSettings) });
      flash(isFa ? 'تنظیمات صفحه اشتراک ذخیره شد.' : 'Subscription page settings saved.');
    } finally {
      setSaving(false);
    }
  };

  const savePanelAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/settings/panel-access', { method: 'PUT', body: JSON.stringify(panelAccess) });
      flash(isFa ? 'ذخیره شد. برای اعمال تغییرات پورت/مسیر سرویس را ریستارت کنید.' : 'Saved. Restart panel process to apply port/path changes.');
    } finally {
      setSaving(false);
    }
  };

  const cleanSecretPath = (panelAccess.secretPath || '').replace(/^\/+|\/+$/g, '');
  const computedPanelUrl = `${panelAccess.tlsCertFile ? 'https' : 'http'}://${general.publicAddress || window.location.hostname}:${panelAccess.port || 2053}${cleanSecretPath ? `/${cleanSecretPath}/` : '/'}`;
  const selectedLook = LOOKS.find((l) => l.id === subSettings?.look) || LOOKS[0];
  const isAutoSubAccent = !subSettings?.accentColor || subSettings.accentColor === 'theme';
  const panelThemeHex = ACCENT_PALETTES[general.panelColor || accent]?.dark.accent || ACCENT_PALETTES[accent].dark.accent;
  const effectiveSubAccent = !isAutoSubAccent
    ? subSettings.accentColor
    : selectedLook.id === 'night_shift'
      ? panelThemeHex
      : selectedLook.defaultHex || panelThemeHex;

  return (
    <div className="page">
      <PageHead
        title={t.settings.title}
        sub={isFa ? 'پیکربندی پنل، صفحه اشتراک، امنیت و پشتیبان‌گیری' : 'Panel configuration, client portal, access security and backups'}
        actions={notice ? <StatusPill tone="green" label={notice} /> : undefined}
      />

      <Tabs items={availableTabs} value={tab} onChange={setTab} />

      {tab === 'general' && (
        <form className="editor" onSubmit={saveGeneral}>
          <section className="ed-section">
            <div>
              <h2>{isFa ? 'آدرس عمومی و برند' : 'Public address & branding'}</h2>
              <p className="ed-lede">
                {isFa ? 'نام برند و دامنه‌ای که در لینک‌های اتصال کاربران قرار می‌گیرد.' : 'Brand identity and public host placed in exported links.'}
              </p>
            </div>
            <div className="ed-fields">
              <Input
                label={isFa ? 'نام برند پنل' : 'Brand name'}
                value={general.brandName}
                onChange={(e) => {
                  setGeneral({ ...general, brandName: e.target.value });
                  setBrandName(e.target.value);
                }}
              />
              <Input
                label={isFa ? 'آدرس عمومی (IP یا دامنه)' : 'Public address (IP or domain)'}
                dir="ltr"
                value={general.publicAddress}
                onChange={(e) => setGeneral({ ...general, publicAddress: e.target.value })}
              />
              <Input
                label={isFa ? 'آدرس پنل (اختیاری)' : 'Panel URL (optional)'}
                dir="ltr"
                value={general.panelUrl}
                onChange={(e) => setGeneral({ ...general, panelUrl: e.target.value })}
                placeholder={computedPanelUrl}
              />
              <Input
                label={isFa ? 'آدرس پایه لینک اشتراک (اختیاری)' : 'Subscription base URL (optional)'}
                dir="ltr"
                value={general.subscriptionLinkAddress}
                onChange={(e) => setGeneral({ ...general, subscriptionLinkAddress: e.target.value })}
                placeholder="https://sub.example.com"
              />
              <Input
                label={isFa ? 'پشتیبانی تلگرام (@handle یا لینک)' : 'Support Telegram (@handle or URL)'}
                dir="ltr"
                value={general.supportTelegram}
                onChange={(e) => {
                  setGeneral({ ...general, supportTelegram: e.target.value });
                  setSupportTelegram(e.target.value);
                }}
                placeholder="@xprotocol_support"
              />
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'زبان و منطقه زمانی پنل' : 'Default client language & timezone'}</h2>
              <p className="ed-lede">
                {isFa
                  ? 'زبان اولیه صفحه اشتراک و منطقه زمانی برای محاسبه ریست ترافیک (مانند Asia/Tehran برای تقویم شمسی) و بکاپ‌های روزانه.'
                  : 'Initial client page language and IANA timezone used for reset schedules (including Persian calendar) and daily backups.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="form-row">
                <Select
                  label={isFa ? 'زبان صفحه اشتراک' : 'Client page language'}
                  value={general.defaultSubLanguage}
                  onChange={(e) => setGeneral({ ...general, defaultSubLanguage: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="fa">فارسی (Persian)</option>
                </Select>
                <Input
                  label={isFa ? 'جستجوی منطقه زمانی' : 'Filter timezone'}
                  dir="ltr"
                  value={tzQuery}
                  onChange={(e) => setTzQuery(e.target.value)}
                  placeholder="Asia/Tehran, Europe/..."
                />
              </div>
              <Select
                label={isFa ? 'منطقه زمانی (IANA)' : 'Timezone (IANA)'}
                dir="ltr"
                value={general.timezone}
                onChange={(e) => setGeneral({ ...general, timezone: e.target.value })}
              >
                {TIMEZONES.filter((z) => !tzQuery.trim() || z.toLowerCase().includes(tzQuery.trim().toLowerCase())).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'رنگ اصلی پنل' : 'Panel accent colour'}</h2>
              <p className="ed-lede">
                {isFa ? 'رنگ شاخص دکمه‌ها، نمودارها و نورپردازی محیط پنل.' : 'Highlight colour used across charts, buttons and active indicators.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="accent-picker" role="radiogroup" aria-label="Panel accent">
                {ACCENTS.map((c) => {
                  const swatch = ACCENT_PALETTES[c].dark.accent;
                  return (
                    <label key={c} className="accent-opt">
                      <input
                        type="radio"
                        name="panelAccent"
                        value={c}
                        checked={general.panelColor === c}
                        onChange={() => {
                          setGeneral({ ...general, panelColor: c });
                          setAccent(c);
                        }}
                      />
                      <span className="swatch" style={{ background: swatch }} aria-hidden="true" />
                      <span className="capitalize">{c}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'آستانه‌های هشدار' : 'Needs attention thresholds'}</h2>
              <p className="ed-lede">
                {isFa ? 'معیارهایی که اشتراک‌های در حال اتمام را در داشبورد علامت‌گذاری می‌کنند.' : 'When clients surface in the Needs attention list.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="field">
                <label className="label">
                  {isFa ? 'هشدار نزدیک شدن به انقضا' : 'Warn when a plan ends within'}
                </label>
                <div className="input-group">
                  <input
                    type="number"
                    className="input"
                    dir="ltr"
                    value={general.warnExpiresWithinDays}
                    onChange={(e) => setGeneral({ ...general, warnExpiresWithinDays: Number(e.target.value) })}
                  />
                  <span className="suffix">{isFa ? 'روز' : 'days'}</span>
                </div>
              </div>

              <div className="field">
                <label className="label">
                  {isFa ? 'هشدار مصرف حجم' : 'Warn when traffic used reaches'}
                </label>
                <div className="input-group">
                  <input
                    type="number"
                    className="input"
                    dir="ltr"
                    value={general.warnTrafficPercent}
                    onChange={(e) => setGeneral({ ...general, warnTrafficPercent: Number(e.target.value) })}
                  />
                  <span className="suffix">%</span>
                </div>
              </div>

              <div className="field">
                <label className="label">
                  {isFa ? 'زمان بیکاری نشست مدیر' : 'Sign out after inactivity'}
                </label>
                <div className="input-group">
                  <input
                    type="number"
                    className="input"
                    dir="ltr"
                    value={general.inactivityTimeoutHours}
                    onChange={(e) => setGeneral({ ...general, inactivityTimeoutHours: Number(e.target.value) })}
                  />
                  <span className="suffix">{isFa ? 'ساعت' : 'hours'}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'نگهداری تاریخچه و متریک‌های Prometheus' : 'History retention & Prometheus /metrics'}</h2>
              <p className="ed-lede">
                {isFa
                  ? 'مدت نگهداری اعلان‌ها، نمونه‌های سلامت نودها و فعال‌سازی خروجی متریک‌های Prometheus.'
                  : 'Retention windows for events/node health telemetry and optional unauthenticated root /metrics exposure.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label={isFa ? 'نگهداری رویدادها (روز)' : 'Events retention (days)'}
                  type="number"
                  min={1}
                  max={365}
                  dir="ltr"
                  value={String(general.eventRetainDays)}
                  onChange={(e) => setGeneral({ ...general, eventRetainDays: Number(e.target.value) })}
                />
                <Input
                  label={isFa ? 'نمونه‌های خام نود (روز)' : 'Raw 5m health samples (days)'}
                  type="number"
                  min={1}
                  max={90}
                  dir="ltr"
                  value={String(general.nodeSampleRawDays)}
                  onChange={(e) => setGeneral({ ...general, nodeSampleRawDays: Number(e.target.value) })}
                />
                <Input
                  label={isFa ? 'نگهداری خلاصه سلامت نود (روز)' : 'Hourly health rollup (days)'}
                  type="number"
                  min={7}
                  max={730}
                  dir="ltr"
                  value={String(general.nodeSampleKeepDays)}
                  onChange={(e) => setGeneral({ ...general, nodeSampleKeepDays: Number(e.target.value) })}
                />
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={general.metricsRoot}
                  onChange={(e) => setGeneral({ ...general, metricsRoot: e.target.checked })}
                />
                <span className="track" />
                <span className="sw-text">
                  <span>
                    {isFa
                      ? 'ارائه متریک‌های Prometheus در مسیر /metrics (نیاز به تأیید 2FA در صورت فعال بودن)'
                      : 'Expose Prometheus metrics at root /metrics (authenticated /api/metrics is always active)'}
                  </span>
                </span>
              </label>

              <div className="callout text-xs">
                <div className="mb-1.5 font-semibold">Prometheus scrape_configs</div>
                <pre className="overflow-x-auto font-mono text-[11px] text-(--ink)" dir="ltr">{`scrape_configs:
  - job_name: 'xprotocol'
    metrics_path: '${general.metricsRoot ? '/metrics' : cleanSecretPath ? `/${cleanSecretPath}/api/metrics` : '/api/metrics'}'
    scheme: '${panelAccess.tlsCertFile ? 'https' : 'http'}'${!general.metricsRoot ? `\n    authorization:\n      credentials: '<YOUR_API_TOKEN>'` : ''}
    static_configs:
      - targets: ['${general.publicAddress || window.location.hostname}:${panelAccess.port || 2053}']`}</pre>
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'نسخه و سیستم' : 'Version & system'}</h2>
            </div>
            <div className="ed-fields">
              <dl className="kv">
                <div>
                  <dt>{isFa ? 'نسخه نصب‌شده' : 'Version'}</dt>
                  <dd className="num" dir="ltr">
                    XProtocol v{sysInfo.version} {sysInfo.platform ? `· ${sysInfo.platform}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>{isFa ? 'شناسه سرور' : 'Machine ID'}</dt>
                  <dd className="num" dir="ltr">
                    <code>{sysInfo.machineId || '—'}</code>
                    {sysInfo.machineId && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => copyText('mid', sysInfo.machineId)}>
                        {copiedKey === 'mid' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="savebar">
            <span className="text-xs text-(--text-muted)">
              {notice || (isFa ? 'تغییرات بلافاصله اعمال می‌شوند.' : 'Changes apply immediately after saving.')}
            </span>
            <Button type="submit" variant="primary" disabled={saving}>
              {t.common.save}
            </Button>
          </div>
        </form>
      )}

      {tab === 'subscription' && (subSettings || !account.isOwner) && (
        <div className={account.isOwner ? 'sp-layout' : ''}>
          <form className="editor" onSubmit={saveSubSettings}>
            <div className="ed-tabs">
              <Tabs<SubBuilderTab>
                value={subTab}
                onChange={setSubTab}
                items={[
                  ...(account.isOwner && subSettings
                    ? [
                        { id: 'look' as const, label: isFa ? 'ظاهر صفحه' : 'Appearance' },
                        { id: 'shop' as const, label: isFa ? 'برند و پشتیبانی' : 'Brand & support' },
                        {
                          id: 'proto' as const,
                          label: isFa ? 'پروتکل‌ها' : 'Protocols',
                          count: subSettings.protocols.filter((p) => p.shown).length,
                        },
                      ]
                    : []),
                  { id: 'apps' as const, label: isFa ? 'اپ‌های پروکسی (Happ)' : 'Proxy apps' },
                  { id: 'domains' as const, label: isFa ? 'دامنه‌های اشتراک' : 'Addresses' },
                ]}
              />
            </div>

            {subTab === 'look' && subSettings && (
              <>
                <section className="ed-section">
                  <div>
                    <h2>{isFa ? 'قالب صفحه اشتراک' : 'Theme'}</h2>
                    <p className="ed-lede">
                      {isFa ? 'ظاهری که کاربر هنگام باز کردن لینک اشتراک می‌بیند.' : 'Visual style clients see when opening their subscription URL.'}
                    </p>
                  </div>
                  <div className="ed-fields">
                    <div className="theme-picks" role="radiogroup" aria-label="Subscription theme">
                      {LOOKS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          role="radio"
                          aria-checked={subSettings.look === l.id}
                          onClick={() => setSubSettings({ ...subSettings, look: l.id })}
                          className={`theme-card ${subSettings.look === l.id ? 'on' : ''}`}
                        >
                          <span
                            className={`tc-mock ${l.mockClass}`}
                            style={{ '--mock': (!isAutoSubAccent ? subSettings.accentColor : null) || panelThemeHex || l.defaultHex } as React.CSSProperties}
                            aria-hidden="true"
                          >
                            <b>36.4</b>
                            <i />
                            <i />
                          </span>
                          <strong>{isFa ? l.faName : l.name}</strong>
                          <span className="muted small">{isFa ? l.faDesc : l.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="ed-section">
                  <div>
                    <h2>{isFa ? 'رنگ شاخص قالب' : 'Theme accent'}</h2>
                    <p className="ed-lede">
                      {isFa ? 'رنگ پیش‌فرض قالب را با رنگ دلخواه بازنویسی کنید.' : 'Override the default template accent colour.'}
                    </p>
                  </div>
                  <div className="ed-fields">
                    <div className="swatches" role="group" aria-label="Subscription accent">
                      <button
                        type="button"
                        className={`swatch auto ${isAutoSubAccent ? 'on' : ''}`}
                        style={{ '--c': panelThemeHex } as React.CSSProperties}
                        onClick={() => setSubSettings({ ...subSettings, accentColor: 'theme' })}
                        title={isFa ? 'پیروی از تم پنل' : 'Follow panel theme'}
                      />
                      {SUB_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className={`swatch ${subSettings.accentColor.toLowerCase() === hex ? 'on' : ''}`}
                          style={{ '--c': hex } as React.CSSProperties}
                          onClick={() => setSubSettings({ ...subSettings, accentColor: hex })}
                          aria-label={hex}
                        />
                      ))}
                    </div>
                    <div className="accent-row">
                      <label className="color-pick">
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(effectiveSubAccent) ? effectiveSubAccent : '#34d399'}
                          onChange={(e) => setSubSettings({ ...subSettings, accentColor: e.target.value })}
                        />
                        <span>{isFa ? 'رنگ دلخواه' : 'Custom colour'}</span>
                      </label>
                      <input
                        className="input accent-hex"
                        dir="ltr"
                        maxLength={7}
                        placeholder={panelThemeHex}
                        value={isAutoSubAccent ? '' : subSettings.accentColor}
                        onChange={(e) => setSubSettings({ ...subSettings, accentColor: e.target.value.trim() || 'theme' })}
                      />
                    </div>
                  </div>
                </section>
              </>
            )}

            {subTab === 'shop' && subSettings && (
              <section className="ed-section">
                <div>
                  <h2>{isFa ? 'اطلاعات فروشگاه و پشتیبانی' : 'Storefront & support'}</h2>
                  <p className="ed-lede">
                    {isFa ? 'نام نمایشی، دکمه پشتیبانی و لینک کانال در صفحه اشتراک.' : 'Display name, support link and channel link on the subscription page.'}
                  </p>
                </div>
                <div className="ed-fields">
                  <Input
                    label={isFa ? 'نام فروشگاه / برند' : 'Shop / Brand name'}
                    value={subSettings.shopName}
                    onChange={(e) => setSubSettings({ ...subSettings, shopName: e.target.value })}
                  />
                  <Input
                    label={isFa ? 'لینک پشتیبانی (t.me/... یا https://...)' : 'Support link (t.me/..., https://..., tel:+98...)'}
                    dir="ltr"
                    value={subSettings.supportLink}
                    onChange={(e) => setSubSettings({ ...subSettings, supportLink: e.target.value })}
                  />
                  <Input
                    label={isFa ? 'متن دکمه پشتیبانی' : 'Support button text'}
                    value={subSettings.supportButtonText}
                    onChange={(e) => setSubSettings({ ...subSettings, supportButtonText: e.target.value })}
                  />
                  <Input
                    label={isFa ? 'لینک کانال / اطلاع‌رسانی' : 'Channel link'}
                    dir="ltr"
                    value={subSettings.channelLink}
                    onChange={(e) => setSubSettings({ ...subSettings, channelLink: e.target.value })}
                  />
                </div>
              </section>
            )}

            {subTab === 'proto' && subSettings && (
              <section className="ed-section">
                <div>
                  <h2>{isFa ? 'پروتکل‌ها و راهنمای اتصال' : 'Protocols & client apps'}</h2>
                  <p className="ed-lede">
                    {isFa ? 'انتخاب کنید کدام پروتکل‌ها و با چه نام و راهنمایی نمایش داده شوند.' : 'Choose which protocols appear and customize their tab name and setup note.'}
                  </p>
                </div>
                <div className="ed-fields">
                  <ul className="proto-list">
                    {subSettings.protocols.map((p, idx) => {
                      const isOpen = openProto === p.id;
                      return (
                        <li key={p.id} className={`proto-card ${isOpen ? 'open' : ''} ${p.shown ? '' : 'off'}`}>
                          <div className="proto-head">
                            <button
                              type="button"
                              className="proto-toggle"
                              onClick={() => setOpenProto(isOpen ? null : p.id)}
                            >
                              <span className="proto-ico" aria-hidden="true">
                                <Layers className="h-4 w-4" />
                              </span>
                              <span className="proto-title">
                                <span className="proto-name">{p.tabName || p.id.toUpperCase()}</span>
                                <span className="proto-badge">{p.id.toUpperCase()}</span>
                              </span>
                              <ChevronDown className="proto-chev" />
                            </button>
                          </div>

                          {isOpen && (
                            <div className="proto-body">
                              <label className="switch">
                                <input
                                  type="checkbox"
                                  checked={p.shown}
                                  onChange={(e) => {
                                    const next = [...subSettings.protocols];
                                    next[idx] = { ...p, shown: e.target.checked };
                                    setSubSettings({ ...subSettings, protocols: next });
                                  }}
                                />
                                <span className="track" />
                                <span className="sw-text">
                                  <span>{isFa ? 'نمایش این پروتکل در صفحه اشتراک' : 'Show on subscription page'}</span>
                                </span>
                              </label>
                              <div className="form-row">
                                <Input
                                  label={isFa ? 'نام دلخواه تب' : 'Custom tab name'}
                                  value={p.tabName}
                                  onChange={(e) => {
                                    const next = [...subSettings.protocols];
                                    next[idx] = { ...p, tabName: e.target.value };
                                    setSubSettings({ ...subSettings, protocols: next });
                                  }}
                                />
                                <Input
                                  label={isFa ? 'متن راهنما' : 'Guide note'}
                                  value={p.guideNote}
                                  onChange={(e) => {
                                    const next = [...subSettings.protocols];
                                    next[idx] = { ...p, guideNote: e.target.value };
                                    setSubSettings({ ...subSettings, protocols: next });
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            )}

            {subTab === 'apps' && <SettingsSubAppsSection isOwner={account.isOwner} onNotice={flash} />}
            {subTab === 'domains' && <SettingsSubOriginsSection isOwner={account.isOwner} onNotice={flash} />}

            {account.isOwner && subTab !== 'apps' && subTab !== 'domains' && (
              <div className="savebar">
                <span className="text-xs text-(--text-muted)">
                  {notice || (isFa ? 'پس از ذخیره، پیش‌نمایش سمت چپ/راست را بررسی کنید.' : 'Save changes to refresh live subscription pages.')}
                </span>
                <Button type="submit" variant="primary" disabled={saving}>
                  {t.common.save}
                </Button>
              </div>
            )}
          </form>

          {account.isOwner && (
          <aside className="sp-preview">
            <div className="phone">
              {previewUrl ? (
                <iframe
                  ref={previewFrameRef}
                  title="Subscription page live preview"
                  src={previewUrl}
                  onLoad={() => {
                    if (subSettings) {
                      previewFrameRef.current?.contentWindow?.postMessage(
                        { type: 'xp-preview', settings: subSettings },
                        window.location.origin,
                      );
                    }
                  }}
                />
              ) : (
                <div className="phone-empty">
                  {isFa
                    ? 'برای پیش‌نمایش زنده، ابتدا حداقل یک کاربر بسازید.'
                    : 'Create at least one client to preview the live subscription page.'}
                </div>
              )}
            </div>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="link-sm inline-flex items-center gap-1.5 text-xs font-medium text-(--accent-text) hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isFa ? 'باز کردن در تب جدید' : 'Open live preview in tab'}
              </a>
            )}
          </aside>
          )}
        </div>
      )}

      {tab === 'panelAccess' && (
        <div className="stack">
          <section className="editor">
            <div className="ed-section">
              <div>
                <h2>HTTPS</h2>
                <p className="ed-lede">
                  {isFa ? 'وضعیت گواهی SSL پنل وب و ساب‌لینک‌ها.' : 'TLS status for the panel and subscription endpoint.'}
                </p>
              </div>
              <div className="ed-fields">
                <div className="ssl-status">
                  <span className={`dot ${panelAccess.tlsCertFile ? 'ok' : 'off'}`} aria-hidden="true" />
                  <span>
                    {panelAccess.tlsCertFile
                      ? isFa
                        ? `گواهی فعال: ${panelAccess.tlsCertFile}`
                        : `Active TLS certificate: ${panelAccess.tlsCertFile}`
                      : isFa
                        ? 'HTTPS غیرفعال است (HTTP ساده)'
                        : 'HTTPS is off (plain HTTP)'}
                  </span>
                </div>
                <div className="form-row">
                  <Input
                    label={isFa ? 'مسیر فایل Certificate (PEM)' : 'TLS Certificate path'}
                    dir="ltr"
                    value={panelAccess.tlsCertFile}
                    onChange={(e) => setPanelAccess({ ...panelAccess, tlsCertFile: e.target.value })}
                    placeholder="/etc/letsencrypt/live/.../fullchain.pem"
                  />
                  <Input
                    label={isFa ? 'مسیر کلید خصوصی (Key)' : 'TLS Private Key path'}
                    dir="ltr"
                    value={panelAccess.tlsKeyFile}
                    onChange={(e) => setPanelAccess({ ...panelAccess, tlsKeyFile: e.target.value })}
                    placeholder="/etc/letsencrypt/live/.../privkey.pem"
                  />
                </div>
              </div>
            </div>
          </section>

          <form className="editor" onSubmit={savePanelAccess}>
            <section className="ed-section">
              <div>
                <h2>{t.settings.tabs.panelAccess}</h2>
                <p className="ed-lede">
                  {isFa ? 'پورت، مسیر مخفی پنل و مسیر لینک‌های اشتراک.' : 'Listening port, secret path prefix, and subscription path.'}
                </p>
              </div>
              <div className="ed-fields">
                <div className="form-row">
                  <Input
                    label={isFa ? 'پورت پنل' : 'Panel port'}
                    type="number"
                    dir="ltr"
                    value={panelAccess.port}
                    onChange={(e) => setPanelAccess({ ...panelAccess, port: Number(e.target.value) })}
                  />
                  <Input
                    label={isFa ? 'آدرس بایند (خالی = همه اینترفیس‌ها)' : 'Bind address (empty = all)'}
                    dir="ltr"
                    value={panelAccess.bindAddress}
                    onChange={(e) => setPanelAccess({ ...panelAccess, bindAddress: e.target.value })}
                    placeholder="0.0.0.0"
                  />
                  <Input
                    label={isFa ? 'پورت جداگانه ساب (اختیاری)' : 'Separate sub port (optional)'}
                    type="number"
                    dir="ltr"
                    value={panelAccess.subPort}
                    onChange={(e) => setPanelAccess({ ...panelAccess, subPort: e.target.value })}
                    placeholder={String(panelAccess.port)}
                  />
                  <Input
                    label={isFa ? 'مسیر مخفی پنل' : 'Secret panel path'}
                    dir="ltr"
                    value={panelAccess.secretPath}
                    onChange={(e) => setPanelAccess({ ...panelAccess, secretPath: e.target.value })}
                    placeholder="/my-secret-panel"
                  />
                </div>

                <Input
                  label={isFa ? 'پیشوند مسیر اشتراک' : 'Subscription path prefix'}
                  dir="ltr"
                  value={panelAccess.subPath}
                  onChange={(e) => setPanelAccess({ ...panelAccess, subPath: e.target.value })}
                  placeholder="sub"
                />

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={panelAccess.trustProxy}
                    onChange={(e) => setPanelAccess({ ...panelAccess, trustProxy: e.target.checked })}
                  />
                  <span className="track" />
                  <span className="sw-text">
                    <span>{isFa ? 'پشت Reverse Proxy (اعتماد به X-Forwarded-For)' : 'Behind a reverse proxy (trust X-Forwarded-For)'}</span>
                  </span>
                </label>

                <div className="callout">
                  <div className="text-xs text-(--text-muted)">{isFa ? 'آدرس دسترسی پنل:' : 'Panel access URL:'}</div>
                  <code className="mt-1 block font-mono text-xs text-(--ink)" dir="ltr">
                    {computedPanelUrl}
                  </code>
                </div>
              </div>
            </section>

            <div className="savebar">
              <span className="text-xs text-(--text-muted)">
                {notice || (isFa ? 'پس از تغییر پورت یا مسیر، سرویس را ریستارت کنید.' : 'Restart service to apply port or path changes.')}
              </span>
              <Button type="submit" variant="primary" disabled={saving}>
                {t.common.save}
              </Button>
            </div>
          </form>
        </div>
      )}

      {tab === 'myAccount' && (
        <div className="editor">
          <section className="ed-section">
            <div>
              <h2>{isFa ? 'تغییر رمز عبور' : 'Change password'}</h2>
              <p className="ed-lede">
                {isFa ? 'رمز فعلی را وارد و یک رمز جدید حداقل ۱۰ کاراکتری انتخاب کنید.' : 'Minimum 10 characters. Invalidates older sessions cleanly.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="form-row">
                <Input
                  label={isFa ? 'رمز فعلی' : 'Current password'}
                  type="password"
                  dir="ltr"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                />
                <Input
                  label={isFa ? 'رمز جدید (حداقل ۱۰ کاراکتر)' : 'New password (min 10 chars)'}
                  type="password"
                  dir="ltr"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
              <div>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!curPass || !newPass}
                  onClick={async () => {
                    await apiFetch('/auth/me/password', {
                      method: 'POST',
                      body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
                    });
                    setCurPass('');
                    setNewPass('');
                    flash(isFa ? 'رمز عبور تغییر کرد.' : 'Password updated.');
                  }}
                >
                  {isFa ? 'به‌روزرسانی رمز عبور' : 'Update password'}
                </Button>
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'احراز هویت دومرحله‌ای (2FA)' : 'Two-factor authentication'}</h2>
              <p className="ed-lede">
                {totpEnabled
                  ? isFa
                    ? 'TOTP روی این حساب فعال است.'
                    : 'TOTP is enabled on this account.'
                  : isFa
                    ? 'یک لایه امنیتی اضافه هنگام ورود با اپلیکیشن Authenticator.'
                    : 'Protect logins with a 6-digit authenticator code.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="flex items-center gap-3">
                <StatusPill tone={totpEnabled ? 'green' : 'gray'} label={totpEnabled ? (isFa ? 'فعال' : 'Enabled') : (isFa ? 'غیرفعال' : 'Off')} />
                {!totpEnabled && !totpSetup && (
                  <Button
                    type="button"
                    onClick={async () => {
                      const res = await apiFetch<{ secret: string; uri: string }>('/auth/me/2fa/setup', { method: 'POST' });
                      setTotpSetup(res);
                    }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {isFa ? 'فعال‌سازی 2FA' : 'Turn on 2FA'}
                  </Button>
                )}
              </div>

              {totpSetup && (
                <div className="twofa-setup">
                  <QrCode value={totpSetup.uri} size={172} />
                  <div className="stack">
                    <div className="callout">
                      <span className="text-xs text-(--text-muted)">Secret:</span>{' '}
                      <code className="font-mono text-xs text-(--ink)" dir="ltr">{totpSetup.secret}</code>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        label={isFa ? 'کد ۶ رقمی' : '6-digit code'}
                        dir="ltr"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        onClick={async () => {
                          const res = await apiFetch<{ recoveryCodes: string[] }>('/auth/me/2fa/enable', {
                            method: 'POST',
                            body: JSON.stringify({ secret: totpSetup.secret, code: totpCode }),
                          });
                          setRecoveryCodes(res.recoveryCodes);
                          setTotpSetup(null);
                          setTotpEnabled(true);
                          flash(isFa ? '2FA فعال شد.' : '2FA enabled.');
                        }}
                      >
                        {isFa ? 'تأیید و فعال‌سازی' : 'Confirm'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {recoveryCodes.length > 0 && (
                <div className="callout warn">
                  <div className="mb-2 font-semibold">{isFa ? 'کدهای بازیابی را ذخیره کنید:' : 'Save your recovery codes:'}</div>
                  <ol className="codes" dir="ltr">
                    {recoveryCodes.map((rc) => (
                      <li key={rc}>{rc}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'نشست‌های فعال' : 'Signed-in devices'}</h2>
              <p className="ed-lede">
                {isFa ? 'دستگاه‌هایی که با این حساب وارد شده‌اند.' : 'Browsers and devices currently holding an active session.'}
              </p>
            </div>
            <div className="ed-fields">
              <div className="stack-sm">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-mono font-semibold text-(--ink)" dir="ltr">{s.ip}</span>
                      {s.current && (
                        <span className="ms-2 text-(--accent-text) font-semibold">
                          {isFa ? '(همین دستگاه)' : '(this device)'}
                        </span>
                      )}
                      <div className="mt-0.5 text-[11px] text-(--ink-3)">{formatDateTime(s.lastSeenAt, lang)}</div>
                    </div>
                    {!s.current && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          await apiFetch(`/auth/me/sessions/${s.id}`, { method: 'DELETE' });
                          setSessions((prev) => prev.filter((x) => x.id !== s.id));
                        }}
                      >
                        {isFa ? 'خروج' : 'Sign out'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <SettingsAccountTelegramNotifications onNotice={flash} />

          {account.isOwner && (
            <SettingsSignInProtection
              loginAllowCidrs={general.loginAllowCidrs}
              loginOnlyAllowCidrs={general.loginOnlyAllowCidrs}
              onChange={(next) => setGeneral((prev) => ({ ...prev, ...next }))}
              onSaveSecurity={async (next) => {
                await apiFetch('/settings/general', {
                  method: 'PUT',
                  body: JSON.stringify(next),
                });
                setGeneral((prev) => ({ ...prev, ...next }));
              }}
              onNotice={flash}
            />
          )}
        </div>
      )}

      {tab === 'webhooks' && <SettingsWebhooksTab onNotice={flash} />}

      {tab === 'api' && (
        <div className="stack">
          <section className="editor">
            <div className="ed-section">
              <div>
                <h2>{isFa ? 'مستندات و آدرس API' : 'REST API & OpenAPI'}</h2>
                <p className="ed-lede">
                  {isFa ? 'برای اتصال ربات تلگرام یا سیستم‌های خارجی استفاده کنید.' : 'Connect Telegram bots or external automation using bearer tokens.'}
                </p>
              </div>
              <div className="ed-fields">
                <div className="share-link">
                  <span className="text-xs text-(--ink-2)">Base URL</span>
                  <code dir="ltr">{`${window.location.origin}${toPanelUrl('/api')}`}</code>
                  <Button type="button" size="sm" variant="ghost" onClick={() => copyText('api', `${window.location.origin}${toPanelUrl('/api')}`)}>
                    {copiedKey === 'api' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <div>
                  <a
                    href={toPanelUrl('/api/settings/openapi.json')}
                    target="_blank"
                    rel="noreferrer"
                    className="link-sm inline-flex items-center gap-1.5 text-xs font-semibold text-(--accent-text) hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    OpenAPI 3.0 Document
                  </a>
                </div>
              </div>
            </div>

            <div className="ed-section">
              <div>
                <h2>{isFa ? 'توکن‌های API' : 'API Tokens'}</h2>
                <p className="ed-lede">
                  {isFa ? 'هر توکن را می‌توان به‌صورت مستقل باطل کرد.' : 'Create scoped tokens and revoke them any time.'}
                </p>
              </div>
              <div className="ed-fields">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-56 flex-1">
                    <Input
                      placeholder={isFa ? 'نام توکن (مثلاً Telegram Bot)' : 'Token name (e.g. Telegram shop bot)'}
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={async () => {
                      if (!newTokenName.trim()) return;
                      const res = await apiFetch<{ secret: string }>('/settings/api-tokens', {
                        method: 'POST',
                        body: JSON.stringify({ name: newTokenName }),
                      });
                      setCreatedSecret(res.secret);
                      setNewTokenName('');
                      const list = await apiFetch<{ tokens: typeof tokens }>('/settings/api-tokens');
                      setTokens(list.tokens);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {isFa ? 'ساخت توکن' : 'Create token'}
                  </Button>
                </div>

                {createdSecret && (
                  <div className="callout good">
                    <div className="font-semibold">
                      {isFa ? 'این توکن را همین الان کپی کنید — مجدد نمایش داده نمی‌شود:' : 'Copy this secret now — it will not be shown again:'}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs text-(--ink)" dir="ltr">{createdSecret}</code>
                      <Button type="button" size="sm" onClick={() => copyText('secret', createdSecret)}>
                        {copiedKey === 'secret' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="stack-sm">
                  {tokens.map((tok) => (
                    <div
                      key={tok.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Key className="h-3.5 w-3.5 text-(--accent-text)" />
                        <span className="font-semibold text-(--ink)">{tok.name}</span>
                        <code className="font-mono text-(--ink-3)" dir="ltr">{tok.prefix}…</code>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await apiFetch(`/settings/api-tokens/${tok.id}`, { method: 'DELETE' });
                          setTokens((prev) => prev.filter((x) => x.id !== tok.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {tokens.length === 0 && (
                    <p className="text-xs text-(--ink-3)">{isFa ? 'هنوز توکنی ساخته نشده است.' : 'No API tokens created yet.'}</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'backup' && (
        <div className="stack">
          <Tabs<BackupSubTab>
            value={backupSubTab}
            onChange={setBackupSubTab}
            items={[
              { id: 'telegram', label: isFa ? 'تلگرام و فایل .db' : 'Telegram & Local (.db)' },
              { id: 's3', label: 'S3 / R2 / MinIO' },
              { id: 'sftp', label: 'SFTP' },
            ]}
          />

          {backupSubTab === 'telegram' && (
        <div className="editor">
          <section className="ed-section">
            <div>
              <h2>{isFa ? 'دریافت فایل پشتیبان' : 'Download backup'}</h2>
              <p className="ed-lede">
                {isFa
                  ? 'دریافت فایل دیتابیس SQLite شامل کاربران، گروه‌ها، اینباندها، نودها و تنظیمات.'
                  : 'Download a hot snapshot of your SQLite database containing all clients, inbounds, nodes and settings.'}
              </p>
            </div>
            <div className="ed-fields">
              <div>
                <a
                  href={toPanelUrl('/api/settings/backup/download')}
                  className="xp-btn xp-btn-primary inline-flex h-9 items-center gap-2 px-4 text-sm font-medium no-underline"
                >
                  <Download className="h-4 w-4" />
                  {isFa ? 'دانلود بکاپ (.db)' : 'Download backup (.db)'}
                </a>
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'بازیابی از فایل پشتیبان' : 'Restore from backup'}</h2>
              <p className="ed-lede">
                {isFa ? 'آپلود فایل .db و ریستارت سرویس برای بازگردانی.' : 'Upload a .db backup snapshot to stage a database restore.'}
              </p>
            </div>
            <div className="ed-fields">
              <div>
                <label className="xp-btn inline-flex h-9 cursor-pointer items-center gap-2 border border-(--border-strong) bg-(--bg-elevated) px-4 text-sm font-medium text-(--ink) hover:bg-(--bg-hover)">
                  <Upload className="h-4 w-4" />
                  <span>{isFa ? 'انتخاب فایل .db' : 'Choose .db file'}</span>
                  <input type="file" accept=".db" className="hidden" onChange={handleRestoreUpload} />
                </label>
              </div>
            </div>
          </section>

          <section className="ed-section">
            <div>
              <h2>{isFa ? 'پشتیبان‌گیری خودکار تلگرام' : 'Backups over Telegram'}</h2>
              <p className="ed-lede">
                {isFa ? 'ارسال دوره‌ای فایل بکاپ به چت یا کانال تلگرام شما.' : 'Send periodic SQLite snapshots straight to your Telegram bot.'}
              </p>
            </div>
            <div className="ed-fields tg-backup">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={tgBackup.enabled}
                    onChange={(e) => setTgBackup({ ...tgBackup, enabled: e.target.checked })}
                  />
                  <span className="track" />
                  <span className="sw-text">
                    <span>{isFa ? 'فعال‌سازی ارسال زمان‌بندی‌شده به تلگرام' : 'Enable scheduled Telegram backups'}</span>
                  </span>
                </label>
                <StatusPill tone={tgBackup.enabled ? 'green' : 'gray'} label={tgBackup.enabled ? (isFa ? 'فعال' : 'Active') : (isFa ? 'خاموش' : 'Off')} />
              </div>

              <Input
                label={isFa ? 'توکن ربات تلگرام (Bot Token)' : 'Bot token'}
                type="password"
                dir="ltr"
                value={tgBackup.botToken}
                onChange={(e) => setTgBackup({ ...tgBackup, botToken: e.target.value })}
                placeholder={hasTgToken ? 'Token configured (leave blank to keep)' : '123456:ABC-DEF...'}
              />

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-44 flex-1">
                  <Input
                    label={isFa ? 'شناسه چت (Chat ID)' : 'Chat ID'}
                    dir="ltr"
                    value={tgBackup.chatId}
                    onChange={(e) => setTgBackup({ ...tgBackup, chatId: e.target.value })}
                    placeholder="-100123456789"
                  />
                </div>
                <Button
                  type="button"
                  disabled={tgBusy}
                  onClick={async () => {
                    setTgBusy(true);
                    try {
                      const res = await apiFetch<{ chats: { chatId: string; title: string }[] }>(
                        '/settings/telegram-backup/find-chat',
                        {
                          method: 'POST',
                          body: JSON.stringify({ botToken: tgBackup.botToken || undefined }),
                        },
                      );
                      setFoundChats(res.chats);
                      if (res.chats.length > 0 && !tgBackup.chatId) {
                        setTgBackup((prev) => ({ ...prev, chatId: res.chats[0].chatId }));
                      }
                      flash(res.chats.length > 0 ? `Found ${res.chats.length} chat(s).` : 'No recent messages found; send /start to your bot first.');
                    } catch (err) {
                      flash(err instanceof Error ? err.message : 'Failed to inspect bot updates');
                    } finally {
                      setTgBusy(false);
                    }
                  }}
                >
                  <Search className="h-3.5 w-3.5" />
                  {isFa ? 'جستجوی چت' : 'Find chat'}
                </Button>
              </div>

              {foundChats.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {foundChats.map((c) => (
                    <button
                      key={c.chatId}
                      type="button"
                      onClick={() => setTgBackup({ ...tgBackup, chatId: c.chatId })}
                      className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1 text-[11px] text-(--ink) hover:border-(--accent)"
                    >
                      {c.title} ({c.chatId})
                    </button>
                  ))}
                </div>
              )}

              <div className="form-row">
                <Select
                  label={isFa ? 'بازه ارسال' : 'Send every'}
                  value={String(tgBackup.intervalHours)}
                  onChange={(e) => setTgBackup({ ...tgBackup, intervalHours: Number(e.target.value) })}
                >
                  <option value="1">{isFa ? 'هر ۱ ساعت' : '1 hour'}</option>
                  <option value="6">{isFa ? 'هر ۶ ساعت' : '6 hours'}</option>
                  <option value="12">{isFa ? 'هر ۱۲ ساعت' : '12 hours'}</option>
                  <option value="24">{isFa ? 'هر ۲۴ ساعت' : '24 hours'}</option>
                  <option value="72">{isFa ? 'هر ۳ روز' : '3 days'}</option>
                  <option value="168">{isFa ? 'هر ۷ روز' : '7 days'}</option>
                </Select>
                <Input
                  label={isFa ? 'پروکسی (اختیاری)' : 'Proxy URL (optional)'}
                  dir="ltr"
                  value={tgBackup.proxyUrl}
                  onChange={(e) => setTgBackup({ ...tgBackup, proxyUrl: e.target.value })}
                  placeholder="socks5://127.0.0.1:1080"
                />
              </div>

              {tgBackup.lastSentAt && (
                <div className="text-xs text-(--ink-3)">
                  {isFa ? 'آخرین ارسال:' : 'Last sent:'} {formatDateTime(tgBackup.lastSentAt, lang)}
                </div>
              )}

              <div className="tg-actions">
                <Button
                  type="button"
                  disabled={tgBusy}
                  onClick={async () => {
                    setTgBusy(true);
                    try {
                      await apiFetch('/settings/telegram-backup/send-now', {
                        method: 'POST',
                        body: JSON.stringify({
                          botToken: tgBackup.botToken || undefined,
                          chatId: tgBackup.chatId || undefined,
                        }),
                      });
                      flash(isFa ? 'بکاپ به تلگرام ارسال شد.' : 'Telegram backup sent.');
                    } catch (err) {
                      flash(err instanceof Error ? err.message : 'Telegram send failed');
                    } finally {
                      setTgBusy(false);
                    }
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {isFa ? 'ارسال همین الان' : 'Send now'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={async () => {
                    await apiFetch('/settings/telegram-backup', {
                      method: 'PUT',
                      body: JSON.stringify(tgBackup),
                    });
                    flash(isFa ? 'تنظیمات بکاپ تلگرام ذخیره شد.' : 'Telegram backup settings saved.');
                  }}
                >
                  {t.common.save}
                </Button>
              </div>
            </div>
          </section>
        </div>
          )}

          {backupSubTab === 's3' && <SettingsBackupDestinations kind="s3" onNotice={flash} />}
          {backupSubTab === 'sftp' && <SettingsBackupDestinations kind="sftp" onNotice={flash} />}
        </div>
      )}

      {tab === 'audit' && (
        auditEntries.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{isFa ? 'زمان' : 'When'}</th>
                  <th>{isFa ? 'کاربر' : 'Who'}</th>
                  <th>{isFa ? 'عملیات' : 'Action'}</th>
                  <th>{isFa ? 'هدف' : 'Target'}</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e, idx) => (
                  <tr key={e.id} style={{ '--r': idx } as React.CSSProperties}>
                    <td className="num">{formatDateTime(e.ts, lang)}</td>
                    <td dir="ltr">{e.username || '—'}</td>
                    <td>
                      <code className={e.action.includes('failed') ? 'text-red-400' : 'text-(--accent-text)'}>{e.action}</code>
                    </td>
                    <td dir="ltr">{e.target}</td>
                    <td className="num text-(--ink-3)" dir="ltr">{e.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptySonar text={isFa ? 'هنوز رویدادی ثبت نشده است.' : 'No audit entries yet.'} />
        )
      )}
    </div>
  );
}
