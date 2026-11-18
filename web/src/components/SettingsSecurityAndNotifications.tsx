import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ExternalLink, Plus, Send, ShieldAlert, Trash2, Unlink } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Input, Select, StatusPill } from './UiPrimitives';

interface BanItem {
  key: string;
  kind: 'ip' | 'user';
  target: string;
  level: number;
  until: number;
  lastFail: number;
  active: boolean;
}

export function SettingsSignInProtection({
  loginAllowCidrs,
  loginOnlyAllowCidrs,
  onChange,
  onSaveSecurity,
  onNotice,
}: {
  loginAllowCidrs: string[];
  loginOnlyAllowCidrs: boolean;
  onChange: (next: { loginAllowCidrs: string[]; loginOnlyAllowCidrs: boolean }) => void;
  onSaveSecurity: (next: { loginAllowCidrs: string[]; loginOnlyAllowCidrs: boolean }) => Promise<void>;
  onNotice: (msg: string) => void;
}) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const [bans, setBans] = useState<BanItem[]>([]);
  const [yourIp, setYourIp] = useState('');
  const [exempt, setExempt] = useState(false);
  const [cidrInput, setCidrInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBans = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: BanItem[]; yourIp: string; exempt: boolean }>('/settings/security/bans');
      setBans(res.items || []);
      setYourIp(res.yourIp || '');
      setExempt(Boolean(res.exempt));
    } catch {
      setBans([]);
    }
  }, []);

  useEffect(() => {
    void loadBans();
  }, [loadBans]);

  const addCidr = (cidr: string) => {
    const clean = cidr.trim();
    if (!clean || loginAllowCidrs.includes(clean)) return;
    onChange({ loginAllowCidrs: [...loginAllowCidrs, clean], loginOnlyAllowCidrs });
  };

  return (
    <section className="ed-section">
      <div>
        <h2>{isFa ? 'محافظت از صفحه ورود و بن‌های پله‌ای' : 'Sign-in protection & bans'}</h2>
        <p className="ed-lede">
          {isFa
            ? '۵ تلاش ناموفق در ۱۰ دقیقه باعث مسدود شدن پله‌ای (۱۰ دقیقه ← ۱ ساعت ← ۲۴ ساعت ← ۷ روز) می‌شود. شبکه مجاز همیشه معاف است.'
            : 'Five failed sign-ins trigger escalating bans (10m -> 1h -> 24h -> 7d). Allowed CIDRs can optionally lock down login completely.'}
        </p>
      </div>

      <div className="ed-fields">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-(--text-muted)">{isFa ? 'IP فعلی شما:' : 'Your IP:'}</span>
          <code className="font-mono font-semibold text-(--ink)" dir="ltr">{yourIp || '—'}</code>
          {exempt && <StatusPill tone="good" label={isFa ? 'در لیست مجاز' : 'Exempt'} />}
          {yourIp && !loginAllowCidrs.includes(yourIp) && !loginAllowCidrs.includes(`${yourIp}/32`) && (
            <Button type="button" size="sm" variant="secondary" onClick={() => addCidr(yourIp)}>
              <Plus className="h-3.5 w-3.5" />
              {isFa ? 'افزودن IP خودم' : 'Add my address'}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Input
              label={isFa ? 'افزودن IP یا رنج CIDR مجاز' : 'Allow IP or CIDR range'}
              dir="ltr"
              value={cidrInput}
              onChange={(e) => setCidrInput(e.target.value)}
              placeholder="203.0.113.10 or 10.0.0.0/24"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              addCidr(cidrInput);
              setCidrInput('');
            }}
          >
            {isFa ? 'افزودن به لیست' : 'Add CIDR'}
          </Button>
        </div>

        {loginAllowCidrs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {loginAllowCidrs.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1 font-mono text-xs text-(--ink)"
                dir="ltr"
              >
                {c}
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300"
                  onClick={() =>
                    onChange({
                      loginAllowCidrs: loginAllowCidrs.filter((x) => x !== c),
                      loginOnlyAllowCidrs,
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <label className="switch">
          <input
            type="checkbox"
            checked={loginOnlyAllowCidrs}
            onChange={(e) =>
              onChange({
                loginAllowCidrs,
                loginOnlyAllowCidrs: e.target.checked,
              })
            }
          />
          <span className="track" />
          <span className="sw-text">
            <span>
              {isFa
                ? 'محدود کردن ورود فقط به IP/CIDRهای بالا (لازم است IP فعلی خودتان در لیست باشد)'
                : 'Restrict panel sign-in strictly to the allowed CIDRs above'}
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
                await onSaveSecurity({ loginAllowCidrs, loginOnlyAllowCidrs });
                onNotice(isFa ? 'تنظیمات محافظت از ورود ذخیره شد.' : 'Sign-in protection saved.');
                await loadBans();
              } finally {
                setSaving(false);
              }
            }}
          >
            <ShieldAlert className="h-4 w-4" />
            {isFa ? 'ذخیره محدودیت ورود (نیاز به تأیید 2FA در صورت فعال بودن)' : 'Save sign-in protection'}
          </Button>
        </div>

        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold text-(--text-secondary)">
            {isFa ? 'مسدودی‌های ورود فعال' : 'Active & recent sign-in bans'}
          </div>
          {bans.length === 0 ? (
            <div className="text-xs text-(--text-muted)">{isFa ? 'مسدودی فعالی ثبت نشده است.' : 'No sign-in bans recorded.'}</div>
          ) : (
            <div className="stack-sm">
              {bans.map((b) => (
                <div
                  key={b.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <StatusPill tone={b.active ? 'bad' : 'neutral'} label={`L${b.level}`} />
                    <span className="font-mono text-(--ink)" dir="ltr">{b.kind}: {b.target}</span>
                    {b.until > 0 && (
                      <span className="text-[11px] text-(--text-muted)">
                        {isFa ? 'تا' : 'until'} {formatDateTime(new Date(b.until * 1000).toISOString(), lang)}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await apiFetch(`/settings/security/bans/${encodeURIComponent(b.key)}`, { method: 'DELETE' });
                      onNotice(isFa ? 'مسدودی برداشته شد.' : 'Ban lifted.');
                      await loadBans();
                    }}
                  >
                    {isFa ? 'رفع مسدودی' : 'Lift ban'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function SettingsAccountTelegramNotifications({ onNotice }: { onNotice: (msg: string) => void }) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const [linked, setLinked] = useState(false);
  const [chatId, setChatId] = useState('');
  const [chatName, setChatName] = useState('');
  const [prefs, setPrefs] = useState<{ off: string[]; locale: '' | 'en' | 'fa'; scope: 'all' | 'mine' }>({
    off: [],
    locale: '',
    scope: 'all',
  });
  const [types, setTypes] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [manualChatId, setManualChatId] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{
        linked: boolean;
        chatId: string;
        chatName: string;
        prefs: { off: string[]; locale: '' | 'en' | 'fa'; scope: 'all' | 'mine' };
        types: string[];
        owner: boolean;
      }>('/account/notifications');
      setLinked(r.linked);
      setChatId(r.chatId || '');
      setChatName(r.chatName || '');
      setPrefs(r.prefs || { off: [], locale: '', scope: 'all' });
      setTypes(r.types || []);
      setIsOwner(Boolean(r.owner));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleOff = (type: string) => {
    setPrefs((prev) => ({
      ...prev,
      off: prev.off.includes(type) ? prev.off.filter((x) => x !== type) : [...prev.off, type],
    }));
  };

  return (
    <section className="ed-section">
      <div>
        <h2>{isFa ? 'اعلان‌های تلگرام حساب کاربری' : 'Telegram notifications'}</h2>
        <p className="ed-lede">
          {isFa
            ? 'چت تلگرام خود را به حساب پنل متصل کنید تا هشدارهای حجم، انقضا، نودها و ورودها ارسال شود.'
            : 'Link your personal Telegram chat to receive real-time alerts for traffic, expiry, node drops and security.'}
        </p>
      </div>
      <div className="ed-fields">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={linked ? 'good' : 'neutral'}
            label={linked ? `${isFa ? 'متصل' : 'Linked'}: ${chatName || chatId}` : isFa ? 'متصل نیست' : 'Not linked'}
          />
          {linked && (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await apiFetch('/account/telegram/test', { method: 'POST' });
                  onNotice(isFa ? 'پیام تست به تلگرام ارسال شد.' : 'Test notification sent.');
                }}
              >
                <Send className="h-3.5 w-3.5" />
                {isFa ? 'ارسال پیام تست' : 'Send test'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={async () => {
                  await apiFetch('/account/telegram', { method: 'DELETE' });
                  onNotice(isFa ? 'اتصال تلگرام قطع شد.' : 'Telegram unlinked.');
                  await load();
                }}
              >
                <Unlink className="h-3.5 w-3.5" />
                {isFa ? 'قطع اتصال' : 'Unlink'}
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-44 flex-1">
            <Input
              label={isFa ? 'شناسه چت تلگرام (Chat ID)' : 'Telegram Chat ID'}
              dir="ltr"
              value={manualChatId}
              onChange={(e) => setManualChatId(e.target.value)}
              placeholder="123456789 or -100..."
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const res = await apiFetch<{ linked?: boolean; token?: string; deepLink?: string }>('/account/telegram/link', {
                method: 'POST',
                body: JSON.stringify({ chatId: manualChatId.trim() || undefined }),
              });
              if (res.token) {
                setLinkToken(res.token);
                setDeepLink(res.deepLink || '');
              } else {
                setManualChatId('');
                onNotice(isFa ? 'چت تلگرام متصل شد.' : 'Telegram chat linked.');
                await load();
              }
            }}
          >
            <Bell className="h-3.5 w-3.5" />
            {manualChatId.trim() ? (isFa ? 'اتصال با Chat ID' : 'Link Chat ID') : isFa ? 'تولید لینک اتصال ربات' : 'Generate bot link'}
          </Button>
        </div>

        {linkToken && (
          <div className="callout text-xs">
            <div>
              {isFa ? 'کد اتصال:' : 'Start token:'} <code className="font-mono" dir="ltr">{linkToken}</code>
            </div>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-(--accent-text) hover:underline"
              >
                {deepLink}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        <div className="form-row">
          <Select
            label={isFa ? 'زبان اعلان‌های تلگرام' : 'Notification language'}
            value={prefs.locale}
            onChange={(e) => setPrefs({ ...prefs, locale: e.target.value as '' | 'en' | 'fa' })}
          >
            <option value="">{isFa ? 'پیش‌فرض پنل' : 'Panel default'}</option>
            <option value="en">English</option>
            <option value="fa">فارسی</option>
          </Select>
          {isOwner && (
            <Select
              label={isFa ? 'دامنه رویدادها' : 'Event scope'}
              value={prefs.scope}
              onChange={(e) => setPrefs({ ...prefs, scope: e.target.value as 'all' | 'mine' })}
            >
              <option value="all">{isFa ? 'کل پنل (همه ادمین‌ها)' : 'Whole panel'}</option>
              <option value="mine">{isFa ? 'فقط کاربران خودم' : 'Only my own clients'}</option>
            </Select>
          )}
        </div>

        <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-2.5 sm:grid-cols-2">
          {types.map((tp) => {
            const on = !prefs.off.includes(tp);
            return (
              <label key={tp} className="flex cursor-pointer items-center gap-2 text-xs text-(--ink)" dir="ltr">
                <input type="checkbox" checked={on} onChange={() => toggleOff(tp)} />
                <span className="font-mono text-[11px]">{tp}</span>
              </label>
            );
          })}
        </div>

        <div>
          <Button
            type="button"
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await apiFetch('/account/notifications', {
                  method: 'PUT',
                  body: JSON.stringify(prefs),
                });
                onNotice(isFa ? 'ترجیحات اعلان ذخیره شد.' : 'Notification preferences saved.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {isFa ? 'ذخیره ترجیحات اعلان' : 'Save notification preferences'}
          </Button>
        </div>
      </div>
    </section>
  );
}
