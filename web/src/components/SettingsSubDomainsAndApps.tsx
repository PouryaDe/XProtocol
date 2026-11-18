import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Plus, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Button, Input, StatusPill } from './UiPrimitives';

export interface SubOriginItem {
  url: string;
  note?: string;
  primary: boolean;
  behindCdn?: boolean;
  createdAt?: number;
}

export interface ProxyAppsConfig {
  updateHours: number;
  titlePattern: string;
  supportUrl: string;
  announce: string;
  expiredEntry: boolean;
  providerId?: string;
  providerIdSet?: boolean;
  happ?: {
    routingEnable?: boolean;
    hideSettings?: boolean;
    showTraffic?: boolean;
    showExpire?: boolean;
    renewUrl?: string;
  };
}

export function SettingsSubAppsSection({
  isOwner,
  onNotice,
}: {
  isOwner: boolean;
  onNotice: (msg: string) => void;
}) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const [cfg, setCfg] = useState<ProxyAppsConfig>({
    updateHours: 6,
    titlePattern: '{brand} · {user}',
    supportUrl: '',
    announce: '',
    expiredEntry: true,
    providerId: '',
    providerIdSet: false,
    happ: { routingEnable: false, hideSettings: false, showTraffic: true, showExpire: true, renewUrl: '' },
  });
  const [resellerApps, setResellerApps] = useState({ title: '', supportUrl: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOwner) {
      apiFetch<ProxyAppsConfig>('/settings/sub-apps')
        .then((r) => setCfg({ ...r, providerId: '' }))
        .catch(() => undefined);
    } else {
      apiFetch<{ title: string; supportUrl: string }>('/account/sub-apps')
        .then((r) => setResellerApps(r))
        .catch(() => undefined);
    }
  }, [isOwner]);

  if (!isOwner) {
    return (
      <section className="ed-section">
        <div>
          <h2>{isFa ? 'برند در اپلیکیشن‌های پروکسی' : 'Proxy app profile overrides'}</h2>
          <p className="ed-lede">
            {isFa
              ? 'عنوان پروفایل و لینک پشتیبانی که در Happ و v2rayNG برای کاربران شما نمایش داده می‌شود.'
              : 'Override profile title and support button shown in Happ and v2rayNG for your clients.'}
          </p>
        </div>
        <div className="ed-fields">
          <div className="form-row">
            <Input
              label={isFa ? 'نام برند / پروفایل' : 'Profile title'}
              value={resellerApps.title}
              onChange={(e) => setResellerApps({ ...resellerApps, title: e.target.value })}
            />
            <Input
              label={isFa ? 'لینک پشتیبانی' : 'Support URL'}
              dir="ltr"
              value={resellerApps.supportUrl}
              onChange={(e) => setResellerApps({ ...resellerApps, supportUrl: e.target.value })}
              placeholder="https://t.me/your_support"
            />
          </div>
          <div>
            <Button
              type="button"
              variant="primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await apiFetch('/account/sub-apps', {
                    method: 'PUT',
                    body: JSON.stringify(resellerApps),
                  });
                  onNotice(isFa ? 'ذخیره شد.' : 'Proxy app settings saved.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {isFa ? 'ذخیره' : 'Save'}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ed-section">
      <div>
        <h2>{isFa ? 'اپلیکیشن‌های پروکسی (Happ / v2rayNG / Hiddify)' : 'Proxy apps & Happ integration'}</h2>
        <p className="ed-lede">
          {isFa
            ? 'هدرهای استاندارد سابسکریپشن (ترافیک، انقضا، بازه آپدیت خودکار، اطلاعیه و Provider ID اختصاصی Happ).'
            : 'Subscription headers sent to Happ, v2rayNG, Hiddify & Karing (profile-title, update interval, support URL and Happ provider ID).'}
        </p>
      </div>
      <div className="ed-fields">
        <div className="form-row">
          <Input
            label={isFa ? 'الگوی نام پروفایل ({brand}, {user})' : 'Profile title pattern ({brand}, {user})'}
            value={cfg.titlePattern}
            onChange={(e) => setCfg({ ...cfg, titlePattern: e.target.value })}
          />
          <Input
            label={isFa ? 'بازه آپدیت خودکار (ساعت)' : 'Update interval (hours)'}
            type="number"
            min={1}
            max={720}
            dir="ltr"
            value={String(cfg.updateHours)}
            onChange={(e) => setCfg({ ...cfg, updateHours: Number(e.target.value) })}
          />
        </div>
        <div className="form-row">
          <Input
            label={isFa ? 'لینک پشتیبانی (support-url)' : 'Support URL (support-url)'}
            dir="ltr"
            value={cfg.supportUrl}
            onChange={(e) => setCfg({ ...cfg, supportUrl: e.target.value })}
            placeholder="https://t.me/support"
          />
          <Input
            label={isFa ? 'Happ Provider ID' : 'Happ Provider ID'}
            type="password"
            dir="ltr"
            value={cfg.providerId || ''}
            onChange={(e) => setCfg({ ...cfg, providerId: e.target.value })}
            placeholder={cfg.providerIdSet ? '(saved — leave blank to keep)' : 'Optional Happ Provider ID'}
          />
        </div>
        <Input
          label={isFa ? 'متن اطلاعیه بالای لیست سرورها (announce)' : 'In-app announcement banner (announce)'}
          value={cfg.announce}
          onChange={(e) => setCfg({ ...cfg, announce: e.target.value })}
          placeholder={isFa ? 'مثال: تمدید از ربات تلگرام @mybot' : 'Optional banner message shown inside proxy apps'}
        />
        <label className="switch">
          <input
            type="checkbox"
            checked={cfg.expiredEntry}
            onChange={(e) => setCfg({ ...cfg, expiredEntry: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">
            <span>
              {isFa
                ? 'نمایش ردیف راهنمای «منقضی/تمام‌شده» در اپلیکیشن وقتی سرویس بسته است'
                : 'Show placeholder status entry in proxy apps when client is expired/depleted'}
            </span>
          </span>
        </label>
        <div>
          <Button
            type="button"
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const payload: Record<string, unknown> = {
                  updateHours: cfg.updateHours,
                  titlePattern: cfg.titlePattern,
                  supportUrl: cfg.supportUrl,
                  announce: cfg.announce,
                  expiredEntry: cfg.expiredEntry,
                  happ: cfg.happ,
                };
                if (cfg.providerId?.trim()) payload.providerId = cfg.providerId.trim();
                const saved = await apiFetch<ProxyAppsConfig>('/settings/sub-apps', {
                  method: 'PUT',
                  body: JSON.stringify(payload),
                });
                setCfg({ ...saved, providerId: '' });
                onNotice(isFa ? 'تنظیمات اپ‌های پروکسی ذخیره شد.' : 'Proxy app settings saved.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {isFa ? 'ذخیره تنظیمات اپ‌ها' : 'Save proxy app settings'}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SettingsSubOriginsSection({
  isOwner,
  onNotice,
}: {
  isOwner: boolean;
  onNotice: (msg: string) => void;
}) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const baseEndpoint = isOwner ? '/settings/sub-origins' : '/account/sub-origins';
  const [origins, setOrigins] = useState<SubOriginItem[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newNote, setNewNote] = useState('');
  const [behindCdn, setBehindCdn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ origins: SubOriginItem[] }>(baseEndpoint);
      setOrigins(res.origins || []);
    } catch {
      setOrigins([]);
    }
  }, [baseEndpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const checkDns = async () => {
    if (!newUrl.trim()) return;
    setCheckMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; ips?: string[]; error?: string }>(`${baseEndpoint}/check`, {
        method: 'POST',
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      setCheckMsg(
        res.ok
          ? `DNS OK${res.ips?.length ? ` -> ${res.ips.join(', ')}` : ''}`
          : res.error || 'DNS check failed',
      );
    } catch (e) {
      setCheckMsg(e instanceof Error ? e.message : 'Check failed');
    }
  };

  return (
    <section className="ed-section">
      <div>
        <h2>{isFa ? 'دامنه‌های اشتراک (چند دامنه‌ای)' : 'Subscription domains'}</h2>
        <p className="ed-lede">
          {isFa
            ? 'چند دامنه برای لینک‌های اشتراک تعریف کنید و یکی را به‌عنوان دامنه اصلی انتخاب کنید تا اگر دامنه‌ای فیلتر شد سریع جابجا شوید.'
            : 'Configure up to 10 subscription origins and switch the primary domain seamlessly.'}
        </p>
      </div>
      <div className="ed-fields">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <Input
              label={isFa ? 'آدرس دامنه اشتراک' : 'Origin URL'}
              dir="ltr"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://sub.example.com"
            />
          </div>
          <div className="w-40">
            <Input
              label={isFa ? 'یادداشت (اختیاری)' : 'Note'}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={isFa ? 'دامنه پشت کلودفلر' : 'CDN mirror'}
            />
          </div>
          <Button type="button" variant="secondary" onClick={checkDns}>
            <ShieldCheck className="h-4 w-4" />
            {isFa ? 'بررسی DNS' : 'Check DNS'}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !newUrl.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await apiFetch<{ warning?: string; origins: SubOriginItem[] }>(baseEndpoint, {
                  method: 'POST',
                  body: JSON.stringify({ url: newUrl.trim(), note: newNote.trim(), behindCdn }),
                });
                setOrigins(res.origins || []);
                setNewUrl('');
                setNewNote('');
                onNotice(res.warning || (isFa ? 'دامنه اشتراک اضافه شد.' : 'Domain added.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            {isFa ? 'افزودن' : 'Add'}
          </Button>
        </div>

        <label className="switch">
          <input type="checkbox" checked={behindCdn} onChange={(e) => setBehindCdn(e.target.checked)} />
          <span className="track" />
          <span className="sw-text">
            <span>{isFa ? 'این دامنه پشت CDN (مثل Cloudflare) قرار دارد' : 'Domain is proxied behind a CDN'}</span>
          </span>
        </label>

        {checkMsg && <div className="text-xs text-(--text-secondary)" dir="ltr">{checkMsg}</div>}

        <div className="stack-sm">
          {origins.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--border-subtle) px-4 py-4 text-center text-xs text-(--text-muted)">
              {isFa ? 'هنوز دامنه جداگانه‌ای ثبت نشده؛ از آدرس پایه پنل استفاده می‌شود.' : 'No custom domains added; falling back to default base URL.'}
            </div>
          ) : (
            origins.map((o) => (
              <div
                key={o.url}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-(--accent)" />
                  <span className="truncate font-mono text-(--ink)" dir="ltr">{o.url}</span>
                  {o.primary && <StatusPill tone="good" label={isFa ? 'اصلی' : 'Primary'} />}
                  {o.behindCdn && <StatusPill tone="blue" label="CDN" />}
                  {o.note && <span className="text-(--text-muted)">· {o.note}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {!o.primary && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const res = await apiFetch<{ origins: SubOriginItem[] }>(baseEndpoint, {
                          method: 'PUT',
                          body: JSON.stringify({ url: o.url, primary: true }),
                        });
                        setOrigins(res.origins || []);
                        onNotice(isFa ? 'دامنه اصلی تغییر کرد.' : 'Primary domain updated.');
                      }}
                    >
                      <Star className="h-3.5 w-3.5" />
                      {isFa ? 'انتخاب به‌عنوان اصلی' : 'Set primary'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      const res = await apiFetch<{ origins: SubOriginItem[] }>(
                        `${baseEndpoint}?url=${encodeURIComponent(o.url)}`,
                        { method: 'DELETE' },
                      );
                      setOrigins(res.origins || []);
                      onNotice(isFa ? 'دامنه حذف شد.' : 'Domain removed.');
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
