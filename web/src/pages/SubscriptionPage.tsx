import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Globe, MessageCircle, Send } from 'lucide-react';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { QrCode } from '../components/QrCode';
import { TrafficChart } from '../components/TrafficChart';

interface SubPayload {
  client: {
    name: string;
    status: string;
    trafficLimitBytes: number | null;
    trafficUsedBytes: number;
    downloadBytes: number;
    uploadBytes: number;
    expiresAt: string | null;
    firstConnectDays: number | null;
    deviceLimit: number | null;
    onlineCount: number;
    resetPeriod: string;
  };
  appearance: {
    look: 'night_shift' | 'aurora' | 'pop' | 'ticket' | 'orbit' | 'mono';
    accentColor: string;
    shopName: string;
    supportLink: string;
    supportButtonText: string;
    channelLink: string;
    defaultLanguage: 'en' | 'fa';
  };
  protocolTabs: {
    id: string;
    tabName: string;
    guideNote: string;
    apps: {
      android: { name: string; url: string }[];
      ios: { name: string; url: string }[];
      desktop: { name: string; url: string }[];
    };
    profiles: {
      inboundId: number;
      inboundName: string;
      protocol: string;
      nodeName: string;
      description: string;
      filename: string;
      configText: string;
      connectInfo: Record<string, string | number>;
    }[];
  }[];
  usageChart: { ts: string; download_bytes: number; upload_bytes: number }[];
}

const LOOK_STYLES: Record<string, string> = {
  night_shift: 'bg-[#080c12] text-slate-100',
  aurora: 'bg-gradient-to-br from-slate-950 via-indigo-950/60 to-emerald-950/40 text-slate-100',
  pop: 'bg-amber-50 text-slate-900',
  ticket: 'bg-stone-100 text-stone-900',
  orbit: 'bg-[#04060e] text-slate-100',
  mono: 'bg-neutral-50 text-neutral-900',
};

const CARD_STYLES: Record<string, string> = {
  night_shift: 'border border-white/10 bg-[#0f1621]',
  aurora: 'border border-white/15 bg-white/5 backdrop-blur-md',
  pop: 'border-2 border-slate-900 bg-white shadow-[4px_4px_0_#0f172a]',
  ticket: 'border border-dashed border-stone-400 bg-white',
  orbit: 'border border-cyan-500/20 bg-slate-950/80',
  mono: 'border border-neutral-300 bg-white',
};

interface PreviewSettingsOverride {
  look?: string;
  accentColor?: string;
  shopName?: string;
  supportLink?: string;
  supportButtonText?: string;
  channelLink?: string;
  protocols?: { id: string; shown: boolean; tabName: string; guideNote: string }[];
}

export function SubscriptionPage({ token }: { token: string }) {
  const [rawData, setRawData] = useState<SubPayload | null>(null);
  const [previewOverride, setPreviewOverride] = useState<PreviewSettingsOverride | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'en' | 'fa'>('en');
  const [activeTab, setActiveTab] = useState(0);
  const [osTab, setOsTab] = useState<'android' | 'ios' | 'desktop'>('android');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const subBase = window.location.pathname.replace(/\/+$/, '');

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'xp-preview' && e.data.settings) {
        setPreviewOverride(e.data.settings as PreviewSettingsOverride);
      }
    };
    window.addEventListener('message', onMsg);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'xp-preview-ready' }, window.location.origin);
    }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    fetch(`${subBase}/data`)
      .then(async (res) => {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || 'This link is not valid. Ask for a new one.');
        }
        return res.json() as Promise<SubPayload>;
      })
      .then((payload) => {
        setRawData(payload);
        setLang(payload.appearance.defaultLanguage || 'en');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid link'));
  }, [token]);

  const data: SubPayload | null = rawData
    ? previewOverride
      ? {
          ...rawData,
          appearance: {
            ...rawData.appearance,
            look: (previewOverride.look as SubPayload['appearance']['look']) || rawData.appearance.look,
            accentColor:
              previewOverride.accentColor !== undefined
                ? previewOverride.accentColor
                : rawData.appearance.accentColor,
            shopName: previewOverride.shopName ?? rawData.appearance.shopName,
            supportLink: previewOverride.supportLink ?? rawData.appearance.supportLink,
            supportButtonText: previewOverride.supportButtonText ?? rawData.appearance.supportButtonText,
            channelLink: previewOverride.channelLink ?? rawData.appearance.channelLink,
          },
          protocolTabs: previewOverride.protocols
            ? rawData.protocolTabs
                .filter((pt) => {
                  const ov = previewOverride.protocols?.find((x) => x.id === pt.id);
                  return ov ? ov.shown : true;
                })
                .map((pt) => {
                  const ov = previewOverride.protocols?.find((x) => x.id === pt.id);
                  return ov ? { ...pt, tabName: ov.tabName || pt.tabName, guideNote: ov.guideNote } : pt;
                })
            : rawData.protocolTabs,
        }
      : rawData
    : null;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d11] p-6 text-center text-sm text-slate-300">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#0f151c] p-6">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d11] text-sm text-slate-400">
        Loading subscription…
      </div>
    );
  }

  const look = data.appearance.look || 'night_shift';
  const isFa = lang === 'fa';
  const remainingBytes =
    data.client.trafficLimitBytes === null
      ? null
      : Math.max(0, data.client.trafficLimitBytes - data.client.trafficUsedBytes);
  const currentTab = data.protocolTabs[activeTab] || data.protocolTabs[0];

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      style={
        data.appearance.accentColor
          ? ({ '--accent': data.appearance.accentColor } as React.CSSProperties)
          : undefined
      }
      className={`min-h-screen p-4 sm:p-8 ${LOOK_STYLES[look] || LOOK_STYLES.night_shift}`}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {data.appearance.shopName && (
              <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{data.appearance.shopName}</div>
            )}
            <h1 className="text-2xl font-bold">{data.client.name}</h1>
          </div>
          <button
            type="button"
            onClick={() => setLang(isFa ? 'en' : 'fa')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-current/20 px-3 py-1.5 text-xs font-medium"
          >
            <Globe className="h-3.5 w-3.5" />
            {isFa ? 'English' : 'فارسی'}
          </button>
        </div>

        {/* Status warning when expired/used up/disabled */}
        {['disabled', 'expired', 'used_up'].includes(data.client.status) && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/15 p-4 text-sm text-red-400">
            {isFa
              ? 'اشتراک شما غیرفعال یا منقضی شده است. لطفاً برای تمدید با پشتیبانی تماس بگیرید.'
              : 'Your plan has ended or is paused. Please contact support to renew.'}
          </div>
        )}

        {/* Quota Cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`rounded-2xl p-4 ${CARD_STYLES[look]}`}>
            <div className="text-xs opacity-70">{isFa ? 'حجم باقیمانده' : 'Traffic left'}</div>
            <div className="mt-1 text-xl font-bold">{formatBytes(remainingBytes, lang)}</div>
            {data.client.trafficLimitBytes && (
              <div className="mt-0.5 text-xs opacity-60">
                {formatBytes(data.client.trafficUsedBytes, lang)} / {formatBytes(data.client.trafficLimitBytes, lang)}
              </div>
            )}
          </div>
          <div className={`rounded-2xl p-4 ${CARD_STYLES[look]}`}>
            <div className="text-xs opacity-70">{isFa ? 'زمان باقیمانده' : 'Days left'}</div>
            <div className="mt-1 text-xl font-bold">
              {formatDaysLeft(data.client.expiresAt, data.client.firstConnectDays, lang)}
            </div>
          </div>
          <div className={`rounded-2xl p-4 ${CARD_STYLES[look]}`}>
            <div className="text-xs opacity-70">{isFa ? 'دستگاه‌های متصل' : 'Devices'}</div>
            <div className="mt-1 text-xl font-bold">
              {data.client.onlineCount} / {data.client.deviceLimit ?? '∞'}
            </div>
          </div>
        </div>

        {/* Protocol Tabs & Profiles */}
        {data.protocolTabs.length > 0 && currentTab && (
          <div className={`rounded-2xl p-5 space-y-4 ${CARD_STYLES[look]}`}>
            <div className="flex flex-wrap gap-2">
              {data.protocolTabs.map((tabItem, i) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    i === activeTab
                      ? 'bg-(--accent) text-(--accent-fg)'
                      : 'border border-current/15 opacity-75 hover:opacity-100'
                  }`}
                >
                  {tabItem.tabName || tabItem.id.toUpperCase()} ({tabItem.profiles.length})
                </button>
              ))}
            </div>

            {currentTab.guideNote && (
              <div className="rounded-xl border border-current/15 p-3 text-xs opacity-85">{currentTab.guideNote}</div>
            )}

            {/* Recommended Apps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold opacity-80">
                  {isFa ? '۱. نصب اپلیکیشن' : '1. Install the app'}
                </span>
                <div className="flex gap-1 text-[11px]">
                  {(['android', 'ios', 'desktop'] as const).map((os) => (
                    <button
                      key={os}
                      type="button"
                      onClick={() => setOsTab(os)}
                      className={`rounded-lg px-2 py-0.5 uppercase ${
                        osTab === os ? 'bg-(--accent) text-(--accent-fg) font-bold' : 'opacity-65'
                      }`}
                    >
                      {os}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(currentTab.apps[osTab] || []).map((app) => (
                  <a
                    key={app.name}
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-current/20 px-3 py-1.5 text-xs font-medium hover:opacity-80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {app.name}
                  </a>
                ))}
              </div>
            </div>

            {/* Server Profiles */}
            <div className="space-y-2.5 pt-2">
              <div className="text-xs font-semibold opacity-80">
                {isFa ? '۲. افزودن کانفیگ اتصال' : '2. Add your configuration'}
              </div>
              {currentTab.profiles.map((prof, idx) => (
                <div key={prof.inboundId} className="rounded-xl border border-current/15 p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold">
                        {prof.nodeName} · {prof.inboundName}
                      </div>
                      {prof.description && <div className="text-xs opacity-65">{prof.description}</div>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(prof.configText);
                          setCopiedIdx(idx);
                          setTimeout(() => setCopiedIdx(null), 1500);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-current/20 px-2.5 py-1.5 text-xs font-medium"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedIdx === idx ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی' : 'Copy'}
                      </button>
                      <a
                        href={`${subBase}/profile/${prof.inboundId}`}
                        className="inline-flex items-center gap-1 rounded-xl bg-(--accent) px-3 py-1.5 text-xs font-semibold text-(--accent-fg)"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {isFa ? 'دانلود' : 'Download'}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Usage Chart + QR */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={`rounded-2xl p-5 sm:col-span-2 ${CARD_STYLES[look]}`}>
            <div className="mb-2 text-xs font-semibold opacity-80">{isFa ? 'مصرف ۷ روز اخیر' : 'Your usage'}</div>
            <TrafficChart data={data.usageChart} height={110} />
          </div>
          <div className={`flex flex-col items-center justify-center rounded-2xl p-5 text-center ${CARD_STYLES[look]}`}>
            <div className="mb-2 text-xs font-semibold opacity-80">
              {isFa ? 'باز کردن در دستگاه دیگر' : 'Open on another device'}
            </div>
            <QrCode value={window.location.href} size={130} />
          </div>
        </div>

        {/* Support & Channel */}
        {(data.appearance.supportLink || data.appearance.channelLink) && (
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {data.appearance.supportLink && (
              <a
                href={data.appearance.supportLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-fg)"
              >
                <MessageCircle className="h-4 w-4" />
                {data.appearance.supportButtonText || (isFa ? 'پشتیبانی' : 'Contact support')}
              </a>
            )}
            {data.appearance.channelLink && (
              <a
                href={data.appearance.channelLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-current/20 px-4 py-2 text-xs font-medium"
              >
                <Send className="h-4 w-4" />
                {isFa ? 'کانال اطلاع‌رسانی' : 'Telegram channel'}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
