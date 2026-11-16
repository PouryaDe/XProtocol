import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Download, DownloadCloud, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, EqLoader, PageHead, Select, StatusPill, useSlidingIndicator } from '../components/UiPrimitives';

interface ReleaseEntry {
  tag: string;
  name: string;
  prerelease: boolean;
  published: string;
  notes: string;
  url: string;
}

interface UpdateSettings {
  channel: 'stable' | 'beta';
  autoUpdate: 'off' | 'notify' | 'auto';
  autoUpdateHour: number;
  updateNodes: boolean;
}

interface UpdateState {
  installedVersion: string;
  currentCommit: string;
  settings: UpdateSettings;
  timezone: string;
  checking: boolean;
  installing: string | null;
  step: '' | 'downloading' | 'installing' | 'nodes' | 'restarting' | 'done';
  checkedAt: string | null;
  source: 'github' | 'git';
  checkError: string | null;
  lastError: string | null;
  latest: ReleaseEntry | null;
  newer: ReleaseEntry[];
  recent: ReleaseEntry[];
}

function formatCheckedAgo(iso: string | null, lang: 'en' | 'fa'): string {
  if (!iso) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 45) return lang === 'fa' ? 'چند لحظه پیش' : 'just now';
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return lang === 'fa' ? `${mins} دقیقه پیش` : `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return lang === 'fa' ? `${hrs} ساعت پیش` : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return lang === 'fa' ? `${days} روز پیش` : `${days} days ago`;
}

export function UpdatesPage() {
  const { lang } = useUi();
  const [state, setState] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [updatingTarget, setUpdatingTarget] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [arrivedVersion, setArrivedVersion] = useState<string | null>(null);
  const installStartedAtRef = useRef(0);
  const sawRestartRef = useRef(false);
  const channelSegRef = useRef<HTMLDivElement | null>(null);
  const autoSegRef = useRef<HTMLDivElement | null>(null);

  useSlidingIndicator(
    channelSegRef,
    '[aria-pressed="true"]',
    `${Boolean(state)}:${state?.settings.channel || 'stable'}`,
  );
  useSlidingIndicator(
    autoSegRef,
    '[aria-pressed="true"]',
    `${Boolean(state)}:${state?.settings.autoUpdate || 'notify'}`,
  );

  const load = useCallback(async () => {
    const res = await apiFetch<UpdateState>('/updates');
    setState(res);
    return res;
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiFetch<UpdateState>('/updates/check', { method: 'POST' });
      setState(res);
      window.dispatchEvent(new Event('xp-updates-changed'));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .then((res) => {
        if (alive && !res.checkedAt) {
          void checkNow();
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [load, checkNow]);

  useEffect(() => {
    if (state?.installing) {
      setUpdatingTarget(state.installing);
      if (state.step === 'restarting' || state.step === 'done') {
        sawRestartRef.current = true;
      }
    }
  }, [state?.installing, state?.step]);

  useEffect(() => {
    if (!updatingTarget || arrivedVersion) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await apiFetch<UpdateState>('/updates');
        if (cancelled) return;
        setState(next);
        if (next.installing) {
          if (next.step === 'restarting' || next.step === 'done') {
            sawRestartRef.current = true;
          }
          setServerDown(false);
        } else if (serverDown || sawRestartRef.current || Date.now() - installStartedAtRef.current > 4000) {
          if (next.lastError) {
            setUpdatingTarget(null);
            setServerDown(false);
            sawRestartRef.current = false;
          } else {
            setServerDown(false);
            setArrivedVersion(next.installedVersion || updatingTarget.replace(/^v/i, ''));
            window.dispatchEvent(new Event('xp-updates-changed'));
            setTimeout(() => window.location.reload(), 950);
          }
        }
      } catch {
        if (!cancelled) {
          setServerDown(true);
          sawRestartRef.current = true;
        }
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [updatingTarget, arrivedVersion, serverDown]);

  const updateSettings = async (patch: Partial<UpdateSettings>) => {
    if (!state || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const res = await apiFetch<UpdateState>('/updates/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setState(res);
      setNotice(lang === 'fa' ? 'تنظیمات بروزرسانی ذخیره شد.' : 'Update settings saved.');
      setTimeout(() => setNotice(''), 2500);
    } finally {
      setSaving(false);
    }
  };

  const installNow = async () => {
    if (!state?.latest) return;
    const msg =
      lang === 'fa'
        ? `بروزرسانی به ${state.latest.tag} نصب و سرویس پنل ریستارت شود؟`
        : `Install ${state.latest.tag} from GitHub and restart the panel service?`;
    if (!confirm(msg)) return;
    const targetTag = state.latest.tag;
    installStartedAtRef.current = Date.now();
    sawRestartRef.current = false;
    setServerDown(false);
    setArrivedVersion(null);
    setUpdatingTarget(targetTag);
    try {
      const res = await apiFetch<{ ok: boolean; state: UpdateState }>('/updates/install', {
        method: 'POST',
        body: JSON.stringify({ tag: targetTag }),
      });
      setState(res.state);
    } catch {
      setUpdatingTarget(null);
    }
  };

  if (!state) {
    return <EqLoader />;
  }

  const busyInstalling = Boolean(state.installing);
  const stepText: Record<UpdateState['step'], string> = {
    '': '',
    downloading: lang === 'fa' ? `در حال دریافت ${state.installing}…` : `Downloading ${state.installing}…`,
    installing: lang === 'fa' ? `در حال بیلد و نصب ${state.installing}…` : `Installing ${state.installing}…`,
    nodes: lang === 'fa' ? 'در حال هماهنگ‌سازی نودها…' : 'Updating nodes…',
    restarting:
      lang === 'fa'
        ? 'در حال راه‌اندازی مجدد سرویس؛ صفحه به‌صورت خودکار بازگذاری می‌شود…'
        : 'Restarting panel service; this page reloads automatically…',
    done: lang === 'fa' ? 'بروزرسانی تکمیل شد.' : 'Update complete.',
  };

  return (
    <div className="page narrow">
      <PageHead
        title={lang === 'fa' ? 'بروزرسانی‌ها' : 'Updates'}
        sub={
          lang === 'fa'
            ? 'نسخه‌های جدید مستقیماً از مخزن گیت‌هاب XProtocol دریافت و بیلد می‌شوند.'
            : 'New versions arrive directly from GitHub (PouryaDe/XProtocol) and build cleanly from source.'
        }
        actions={notice ? <StatusPill tone="green" label={notice} /> : undefined}
      />

      {/* Hero Status Card */}
      <section className={`update-hero ${state.latest ? 'has-update' : ''}`}>
        <div className="uh-icon" aria-hidden="true">
          {state.latest ? <DownloadCloud /> : <CheckCircle2 />}
        </div>

        <div className="uh-text">
          <span className="text-xs text-(--text-muted)">
            {lang === 'fa' ? 'نسخه نصب‌شده' : 'Installed'}
          </span>
          <strong className="num" dir="ltr">
            XProtocol {state.installedVersion}
            {state.currentCommit ? ` (${state.currentCommit})` : ''}
          </strong>
          <span className="text-xs text-(--text-secondary)">
            {busyInstalling
              ? stepText[state.step || 'downloading']
              : state.latest
                ? lang === 'fa'
                  ? `نسخه جدید ${state.latest.tag} آماده نصب است`
                  : `${state.latest.tag} is available`
                : state.checkedAt && !state.checkError
                  ? lang === 'fa'
                    ? 'شما از آخرین نسخه استفاده می‌کنید'
                    : 'You are on the latest version'
                  : lang === 'fa'
                    ? 'در حال بررسی…'
                    : 'Checking…'}
          </span>
          {state.checkError ? (
            <span className="text-xs text-red-400">
              {lang === 'fa' ? `خطا در بررسی: ${state.checkError}` : `Could not check for updates: ${state.checkError}`}
            </span>
          ) : null}
          {state.lastError ? (
            <span className="text-xs text-amber-400">
              {lang === 'fa' ? `پیام آخرین بروزرسانی: ${state.lastError}` : `Last update note: ${state.lastError}`}
            </span>
          ) : null}
        </div>

        <div className="uh-actions">
          <Button onClick={() => void checkNow()} disabled={checking || busyInstalling}>
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {lang === 'fa' ? 'بررسی بروزرسانی' : 'Check for updates'}
          </Button>
          {state.latest && !busyInstalling && (
            <Button variant="primary" onClick={() => void installNow()}>
              <Download className="h-4 w-4" />
              {lang === 'fa' ? `نصب ${state.latest.tag}` : `Install ${state.latest.tag}`}
            </Button>
          )}
        </div>

        {state.checkedAt ? (
          <span className="uh-foot">
            {lang === 'fa'
              ? `بررسی‌شده در ${formatCheckedAgo(state.checkedAt, lang)} از طریق GitHub`
              : `Checked ${formatCheckedAgo(state.checkedAt, lang)} via GitHub`}
          </span>
        ) : null}
      </section>

      {/* What's new (when updates exist) */}
      {state.newer.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <h2>{lang === 'fa' ? 'تغییرات جدید' : "What's new"}</h2>
          </header>
          <div className="pad">
            <ol className="release-list">
              {state.newer.map((r) => (
                <li key={r.tag}>
                  <div className="rl-head">
                    <strong dir="ltr" className="text-sm text-(--text-primary)">
                      {r.name || r.tag}
                    </strong>
                    {r.prerelease && <span className="tag tag-pending">{lang === 'fa' ? 'بتا' : 'Beta'}</span>}
                    <span className="text-xs text-(--text-muted)">{formatDateTime(r.published, lang)}</span>
                  </div>
                  <p className="text-xs whitespace-pre-line text-(--text-secondary)">
                    {r.notes || (lang === 'fa' ? 'توضیحاتی ثبت نشده است.' : 'No release notes.')}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Update Settings Card */}
      <section className="panel">
        <header className="panel-head">
          <h2>{lang === 'fa' ? 'تنظیمات بروزرسانی' : 'Update settings'}</h2>
        </header>
        <div className="pad stack">
          <div className="field">
            <span className="label">{lang === 'fa' ? 'کانال دریافت' : 'Channel'}</span>
            <div ref={channelSegRef} className="segmented" role="group" aria-label="Channel">
              <button
                type="button"
                aria-pressed={state.settings.channel === 'stable'}
                onClick={() => void updateSettings({ channel: 'stable' })}
              >
                {lang === 'fa' ? 'پایدار (Stable)' : 'Stable'}
              </button>
              <button
                type="button"
                aria-pressed={state.settings.channel === 'beta'}
                onClick={() => void updateSettings({ channel: 'beta' })}
              >
                {lang === 'fa' ? 'آزمایشی (Beta)' : 'Beta'}
              </button>
            </div>
            <span className="hint">
              {state.settings.channel === 'beta'
                ? lang === 'fa'
                  ? 'دریافت زودتر قابلیت‌های جدید و نسخه‌های آزمایشی.'
                  : 'Get new features first. Betas are tested less; you can switch back to stable at any time.'
                : lang === 'fa'
                  ? 'فقط نسخه‌های پایدار و آزمایش‌شده.'
                  : 'Tested releases only.'}
            </span>
          </div>

          <div className="field">
            <span className="label">{lang === 'fa' ? 'بروزرسانی خودکار' : 'Automatic updates'}</span>
            <div ref={autoSegRef} className="segmented" role="group" aria-label="Automatic updates">
              <button
                type="button"
                aria-pressed={state.settings.autoUpdate === 'off'}
                onClick={() => void updateSettings({ autoUpdate: 'off' })}
              >
                {lang === 'fa' ? 'خاموش' : 'Off'}
              </button>
              <button
                type="button"
                aria-pressed={state.settings.autoUpdate === 'notify'}
                onClick={() => void updateSettings({ autoUpdate: 'notify' })}
              >
                {lang === 'fa' ? 'اطلاع‌رسانی' : 'Notify me'}
              </button>
              <button
                type="button"
                aria-pressed={state.settings.autoUpdate === 'auto'}
                onClick={() => void updateSettings({ autoUpdate: 'auto' })}
              >
                {lang === 'fa' ? 'نصب خودکار' : 'Install automatically'}
              </button>
            </div>

            {state.settings.autoUpdate === 'auto' && (
              <>
                <label className="inline-select">
                  <span>{lang === 'fa' ? 'ساعت نصب:' : 'Install at'}</span>
                  <Select
                    value={String(state.settings.autoUpdateHour)}
                    onChange={(e) => void updateSettings({ autoUpdateHour: Number(e.target.value) })}
                    className="w-28"
                  >
                    {Array.from({ length: 24 }, (_, hr) => (
                      <option key={hr} value={String(hr)}>
                        {String(hr).padStart(2, '0')}:00
                      </option>
                    ))}
                  </Select>
                </label>
                <span className="hint">
                  {lang === 'fa'
                    ? `منطقه زمانی سرور: ${state.timezone}`
                    : `Server time zone: ${state.timezone}`}
                </span>
              </>
            )}
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={state.settings.updateNodes}
              onChange={(e) => void updateSettings({ updateNodes: e.target.checked })}
            />
            <span className="track" aria-hidden="true" />
            <span className="sw-text">
              <span>{lang === 'fa' ? 'بروزرسانی نودها هم‌زمان با پنل' : 'Update nodes together with the panel'}</span>
              <small>
                {lang === 'fa'
                  ? 'نودها پس از بررسی سلامت ابتدایی پنل هماهنگ می‌شوند و سرویس‌های فعال بدون وقفه می‌مانند.'
                  : 'Nodes follow the panel after its startup health check. Active tunnels stay running cleanly.'}
              </small>
            </span>
          </label>
        </div>
      </section>

      {/* Recent Releases Accordion */}
      <details className="panel history">
        <summary className="panel-head">
          <h2>{lang === 'fa' ? 'نسخه‌ها و تغییرات اخیر' : 'Recent releases'}</h2>
          <ChevronDown className="h-4 w-4 text-(--text-muted)" />
        </summary>
        <div className="pad">
          {state.recent.length === 0 ? (
            <p className="py-2 text-xs text-(--text-muted)">
              {lang === 'fa' ? 'هنوز موردی دریافت نشده است.' : 'No releases or commits loaded yet.'}
            </p>
          ) : (
            <ol className="release-list">
              {state.recent.map((r) => {
                const isInstalled =
                  r.tag.replace(/^v/, '') === state.installedVersion ||
                  (state.currentCommit && r.tag === state.currentCommit);
                return (
                  <li key={r.tag}>
                    <div className="rl-head">
                      <strong dir="ltr" className="text-sm text-(--text-primary)">
                        {r.name || r.tag}
                      </strong>
                      <span className="tag" dir="ltr">
                        {r.tag}
                      </span>
                      {r.prerelease && <span className="tag tag-pending">{lang === 'fa' ? 'بتا' : 'Beta'}</span>}
                      {isInstalled && <span className="tag tag-active">{lang === 'fa' ? 'نصب‌شده' : 'Installed'}</span>}
                      <span className="text-xs text-(--text-muted)">{formatDateTime(r.published, lang)}</span>
                    </div>
                    {r.notes ? (
                      <p className="text-xs whitespace-pre-line text-(--text-secondary)">{r.notes}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </details>

      {(updatingTarget || arrivedVersion) && (() => {
        const uoStages: { key: 'downloading' | 'installing' | 'restarting'; label: string }[] = [
          { key: 'downloading', label: lang === 'fa' ? 'دریافت و بررسی' : 'Download and verify' },
          { key: 'installing', label: lang === 'fa' ? 'نصب' : 'Install' },
          { key: 'restarting', label: lang === 'fa' ? 'راه‌اندازی دوباره' : 'Restart' },
        ];
        const stageIdx = arrivedVersion
          ? uoStages.length
          : serverDown || state.step === 'restarting' || state.step === 'done'
            ? 2
            : state.step === 'installing' || state.step === 'nodes'
              ? 1
              : 0;
        const targetLabel = updatingTarget || arrivedVersion || '';
        return (
          <div className="update-overlay" role="alertdialog" aria-modal="true" aria-live="polite" aria-labelledby="uo-title">
            <div className="uo-card">
              <div className="uo-icon" aria-hidden="true">
                {arrivedVersion ? (
                  <Check />
                ) : (
                  <div className="xp-loader">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>
              <h2 id="uo-title" dir="auto">
                {arrivedVersion
                  ? lang === 'fa'
                    ? `به ${arrivedVersion} به‌روز شد`
                    : `Updated to ${arrivedVersion}`
                  : lang === 'fa'
                    ? `در حال به‌روزرسانی به ${targetLabel}`
                    : `Updating to ${targetLabel}`}
              </h2>
              <p>
                {arrivedVersion
                  ? lang === 'fa'
                    ? 'در حال بارگذاری دوبارهٔ پنل…'
                    : 'Reloading the panel…'
                  : lang === 'fa'
                    ? 'این صفحه را باز نگه دارید. پنل چند ثانیه دوباره راه می‌افتد و این صفحه خودش بارگذاری می‌شود. اتصال‌های فعال بدون وقفه می‌مانند.'
                    : 'Keep this page open. The panel restarts in a few seconds and this page reloads by itself. Active VPN tunnels stay up.'}
              </p>
              <ol className="uo-steps">
                {uoStages.map((s, idx) => (
                  <li key={s.key} className={idx < stageIdx ? 'done' : idx === stageIdx ? 'now' : ''}>
                    <span className="uo-dot" aria-hidden="true">
                      {idx < stageIdx ? <Check /> : null}
                    </span>
                    {s.label}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
