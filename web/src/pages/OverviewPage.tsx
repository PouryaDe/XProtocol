import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Plus,
  RefreshCw,
  Server,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDaysLeft, formatDuration, formatSpeed } from '../lib/format';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, Odometer, PageHead, StatusPill, EqLoader } from '../components/UiPrimitives';
import { TrafficChart } from '../components/TrafficChart';
import type { NavKey } from '../components/Layout';

interface OverviewResponse {
  notices: { needsPublicAddress: boolean };
  summary: {
    onlineClients: number;
    openTunnels: number;
    activeClients: number;
    totalClients: number;
    runningOutCount: number;
    todayDownloadBytes: number;
    todayUploadBytes: number;
    total30dBytes: number;
    speedDownBps: number;
    speedUpBps: number;
  };
  charts: {
    hourly24: { ts: string; download_bytes: number; upload_bytes: number }[];
    daily7?: { ts: string; download_bytes: number; upload_bytes: number }[];
    daily30: { ts: string; download_bytes: number; upload_bytes: number }[];
  };
  statusBreakdown?: {
    active: number;
    expired: number;
    used_up: number;
    disabled: number;
    not_started: number;
  };
  runningOut: {
    id: number;
    name: string;
    reason: string;
    expiresAt: string | null;
    trafficUsedBytes: number;
    trafficLimitBytes: number | null;
  }[];
  heaviestUsers: {
    id: number;
    name: string;
    trafficUsedBytes: number;
    downloadBytes: number;
    uploadBytes: number;
  }[];
  inbounds: {
    id: number;
    name: string;
    protocol: string;
    transport: string;
    port: number;
    enabled: boolean;
    running: boolean;
    onlineCount: number;
  }[];
  server: {
    cpuPercent: number;
    memPercent: number;
    memUsedBytes: number;
    memTotalBytes: number;
    diskPercent: number;
    diskUsedBytes?: number;
    diskTotalBytes?: number;
    uptimeSeconds: number;
    platform: string;
    driverMode: string;
  } | null;
  resellerAccount: {
    status: string;
    trafficPoolBytes: number | null;
    trafficUsedBytes: number;
    expiresAt: string | null;
    clientCount: number;
    clientLimit: number | null;
  } | null;
}

export function OverviewPage({
  onNavigate,
  onOpenNewClient,
}: {
  onNavigate: (k: NavKey) => void;
  onOpenNewClient: () => void;
}) {
  const { t, lang } = useUi();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [chartMode, setChartMode] = useState<'bars' | 'trend'>('bars');

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiFetch<OverviewResponse>('/dashboard/overview');
      setData(res);
      setStale(false);
      setUpdatedAt(new Date());
    } catch {
      setStale(true);
    } finally {
      if (manual) setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    const timer = setInterval(() => void load(false), 5000);
    return () => clearInterval(timer);
  }, []);

  const quickExtend = async (clientId: number) => {
    await apiFetch(`/clients/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ addDays: 30 }),
    });
    void load(false);
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    return chartRange === '24h'
      ? data.charts.hourly24
      : chartRange === '7d'
        ? data.charts.daily7 ?? data.charts.daily30.slice(-7)
        : data.charts.daily30;
  }, [data, chartRange]);

  if (!data) {
    return <EqLoader label={t.common.loading} />;
  }

  const breakdown = data.statusBreakdown ?? {
    active: data.summary.activeClients,
    expired: 0,
    used_up: 0,
    disabled: Math.max(0, data.summary.totalClients - data.summary.activeClients),
    not_started: 0,
  };

  const periodDown = chartData.reduce((acc, p) => acc + (p.download_bytes || 0), 0);
  const periodUp = chartData.reduce((acc, p) => acc + (p.upload_bytes || 0), 0);
  const periodTotal = periodDown + periodUp;
  const peakPoint = chartData.reduce<(typeof chartData)[number] | null>(
    (best, cur) =>
      !best || cur.download_bytes + cur.upload_bytes > best.download_bytes + best.upload_bytes ? cur : best,
    null,
  );

  const statusItems = [
    { key: 'active', label: lang === 'fa' ? 'فعال' : 'Active', count: breakdown.active, color: 'var(--accent)' },
    {
      key: 'not_started',
      label: lang === 'fa' ? 'شروع‌نشده' : 'Not started',
      count: breakdown.not_started,
      color: '#38bdf8',
    },
    { key: 'limited', label: lang === 'fa' ? 'اتمام حجم' : 'Used up', count: breakdown.used_up, color: '#f59e0b' },
    { key: 'expired', label: lang === 'fa' ? 'منقضی' : 'Expired', count: breakdown.expired, color: '#ef4444' },
    {
      key: 'disabled',
      label: lang === 'fa' ? 'غیرفعال' : 'Disabled',
      count: breakdown.disabled,
      color: 'var(--text-muted)',
    },
  ];

  const ringRadius = 66;
  const ringCirc = 2 * Math.PI * ringRadius;
  let ringOffset = 0;

  const heaviestMax = Math.max(1, ...data.heaviestUsers.map((u) => u.trafficUsedBytes));

  const go = (to: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };

  return (
    <div className="page overview-page">
      <PageHead
        title={t.overview.title}
        sub={
          lang === 'fa'
            ? `${data.summary.onlineClients} کاربر آنلاین · ${data.summary.totalClients} کل · ${data.summary.runningOutCount} نیازمند توجه`
            : `${data.summary.onlineClients} online · ${data.summary.totalClients} total · ${data.summary.runningOutCount} need attention`
        }
        actions={
          <>
            <Button size="sm" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {lang === 'fa' ? 'به‌روزرسانی' : 'Refresh'}
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenNewClient}>
              <Plus className="h-3.5 w-3.5" />
              {t.overview.newClient}
            </Button>
          </>
        }
      />

      <div className={`ov-freshness ${stale ? 'stale' : ''}`}>
        <span className={`dot ${stale ? 'warn' : 'ok'}`} aria-hidden="true" />
        <span>
          {stale
            ? lang === 'fa'
              ? 'اتصال زنده موقتاً قطع شد'
              : 'Live updates paused — retrying'
            : lang === 'fa'
              ? 'پایش زنده هر ۵ ثانیه'
              : 'Live · polling every 5s'}
        </span>
        {updatedAt ? (
          <span>
            ·{' '}
            {updatedAt.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        ) : null}
      </div>

      {data.notices.needsPublicAddress && (
        <div className="banner">
          <span>{t.overview.publicAddrNotice}</span>
          <a href={toPanelUrl('/settings')} onClick={go('/settings')}>
            {t.overview.setIt}
          </a>
        </div>
      )}

      {/* 4-cell KPI strip */}
      <section className="kpis" aria-label={t.overview.title}>
        <div className="kpi">
          <span className="kpi-label">{t.overview.onlineNow}</span>
          <span className="kpi-value num">
            <Odometer value={data.summary.onlineClients} />
          </span>
          <span className="kpi-sub">
            {data.summary.openTunnels} {lang === 'fa' ? 'تانل باز' : 'open tunnels'}
          </span>
          <a className="kpi-link" href={toPanelUrl('/connections')} onClick={go('/connections')}>
            {lang === 'fa' ? 'مشاهده لیست' : 'View list'}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </a>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.activeClients}</span>
          <span className="kpi-value num">
            <Odometer value={data.summary.activeClients} />
          </span>
          <span className="kpi-sub">
            {lang === 'fa' ? `از ${data.summary.totalClients} کاربر` : `out of ${data.summary.totalClients} clients`}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.trafficToday}</span>
          <span className="kpi-value num">
            <Odometer value={formatBytes(data.summary.todayDownloadBytes + data.summary.todayUploadBytes, lang)} />
          </span>
          <span className="kpi-sub">30d: {formatBytes(data.summary.total30dBytes, lang)}</span>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.throughputNow}</span>
          <span className="kpi-value num">
            {formatSpeed(data.summary.speedDownBps + data.summary.speedUpBps)}
          </span>
          <span className="kpi-sub flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowDown className="h-3 w-3 text-(--accent-text)" />
              {formatSpeed(data.summary.speedDownBps)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="h-3 w-3 text-sky-400" />
              {formatSpeed(data.summary.speedUpBps)}
            </span>
          </span>
        </div>
      </section>

      {/* Primary analytics: Traffic Explorer + Client Health */}
      <div className="ov-analytics">
        <section className="panel ov-traffic-panel">
          <header className="panel-head">
            <div>
              <h2>{lang === 'fa' ? 'تحلیلگر ترافیک' : 'Traffic explorer'}</h2>
              <p className="ov-section-note">
                {lang === 'fa' ? 'مصرف ثبت‌شده کاربران در بازه انتخابی' : 'Counted client traffic for the selected window'}
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-0.5 text-xs">
              {(['24h', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setChartRange(r)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    chartRange === r
                      ? 'bg-(--accent-soft) text-(--accent-text)'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  {r === '24h'
                    ? lang === 'fa'
                      ? '۲۴ ساعت'
                      : '24h'
                    : r === '7d'
                      ? lang === 'fa'
                        ? '۷ روز'
                        : '7d'
                      : lang === 'fa'
                        ? '۳۰ روز'
                        : '30d'}
                </button>
              ))}
            </div>
          </header>

          <div className="ov-traffic-summary">
            <div className="ov-traffic-total">
              <span>{lang === 'fa' ? 'مجموع بازه' : 'Period total'}</span>
              <strong className="num">{formatBytes(periodTotal, lang)}</strong>
            </div>
            <div>
              <span>
                <ArrowDown className="h-3.5 w-3.5 text-(--accent-text)" />
                {lang === 'fa' ? 'دانلود' : 'Download'}
              </span>
              <strong className="num">{formatBytes(periodDown, lang)}</strong>
            </div>
            <div>
              <span>
                <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                {lang === 'fa' ? 'آپلود' : 'Upload'}
              </span>
              <strong className="num">{formatBytes(periodUp, lang)}</strong>
            </div>
          </div>

          <div className="ov-chart-tools">
            <div className="text-xs text-(--text-muted)">
              {chartRange === '24h'
                ? lang === 'fa'
                  ? 'نمای ساعتی ۲۴ ساعت گذشته'
                  : 'Hourly buckets over last 24 hours'
                : chartRange === '7d'
                  ? lang === 'fa'
                    ? 'نمای روزانه ۷ روز گذشته'
                    : 'Daily buckets over last 7 days'
                  : lang === 'fa'
                    ? 'نمای روزانه ۳۰ روز گذشته'
                    : 'Daily buckets over last 30 days'}
            </div>
            <div className="ov-chart-mode" role="group">
              <button type="button" aria-pressed={chartMode === 'bars'} onClick={() => setChartMode('bars')}>
                <BarChart3 className="h-3.5 w-3.5" />
                {lang === 'fa' ? 'ستونی' : 'Bars'}
              </button>
              <button type="button" aria-pressed={chartMode === 'trend'} onClick={() => setChartMode('trend')}>
                <TrendingUp className="h-3.5 w-3.5" />
                {lang === 'fa' ? 'روند' : 'Trend'}
              </button>
            </div>
          </div>

          <TrafficChart data={chartData} height={240} mode={chartMode} showTableToggle />

          <div className="ov-chart-insight">
            <TrendingUp className="h-3.5 w-3.5 text-(--accent-text)" />
            <span>
              {peakPoint && periodTotal > 0
                ? lang === 'fa'
                  ? `بیشترین مصرف در ${peakPoint.ts}: ${formatBytes(peakPoint.download_bytes + peakPoint.upload_bytes, lang)}`
                  : `Peak bucket (${peakPoint.ts}): ${formatBytes(peakPoint.download_bytes + peakPoint.upload_bytes, lang)}`
                : lang === 'fa'
                  ? 'در این بازه ترافیکی ثبت نشده است'
                  : 'No recorded traffic in this window'}
            </span>
          </div>
        </section>

        <section className="panel ov-client-panel">
          <header className="panel-head">
            <div>
              <h2>{lang === 'fa' ? 'سلامت کاربران' : 'Client health'}</h2>
              <p className="ov-section-note">
                {lang === 'fa' ? 'توزیع وضعیت اشتراک‌ها' : 'Status breakdown across all clients'}
              </p>
            </div>
            <Users className="h-4 w-4 text-(--text-muted)" />
          </header>

          <div className="ov-status-figure">
            <svg viewBox="0 0 180 180" role="img" aria-label="Client health">
              <circle cx="90" cy="90" r={ringRadius} fill="none" stroke="var(--border-subtle)" strokeWidth="14" />
              {statusItems.map((seg) => {
                const len = (seg.count / Math.max(1, data.summary.totalClients)) * ringCirc;
                const dashOffset = -ringOffset;
                ringOffset += len;
                if (len <= 0) return null;
                return (
                  <circle
                    key={seg.key}
                    cx="90"
                    cy="90"
                    r={ringRadius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={`${len} ${ringCirc}`}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 90 90)"
                  />
                );
              })}
            </svg>
            <div>
              <strong className="num">{data.summary.totalClients}</strong>
              <span>{lang === 'fa' ? 'کل کاربران' : 'Total clients'}</span>
            </div>
          </div>

          <ul className="ov-status-list">
            {statusItems.map((seg) => {
              const target = `/clients?status=${seg.key}`;
              return (
                <li key={seg.key}>
                  <a href={toPanelUrl(target)} onClick={go(target)}>
                    <span>
                      <i style={{ background: seg.color }} aria-hidden="true" />
                      {seg.label}
                    </span>
                    <strong className="num">{seg.count}</strong>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Secondary row: Needs attention + Heaviest users */}
      <div className="ov-secondary">
        <section className="panel">
          <header className="panel-head">
            <h2>{lang === 'fa' ? 'نیازمند توجه' : 'Needs attention'}</h2>
            <a
              className="head-action"
              href={toPanelUrl('/clients')}
              onClick={(e) => {
                e.preventDefault();
                onNavigate('clients');
              }}
            >
              {t.common.all}
            </a>
          </header>

          {data.runningOut.length === 0 ? (
            <div className="ov-all-clear">
              <CheckCircle2 />
              <span>{t.overview.noRunningOut}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {data.runningOut.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2"
                >
                  <div className="min-w-0">
                    <a
                      href={toPanelUrl(`/clients/${c.id}`)}
                      onClick={go(`/clients/${c.id}`)}
                      className="strong-link block truncate text-xs"
                    >
                      {c.name}
                    </a>
                    <div className="text-[11px] text-amber-400">
                      {c.reason === 'traffic' && c.trafficLimitBytes
                        ? `${Math.round((c.trafficUsedBytes / c.trafficLimitBytes) * 100)}% used`
                        : formatDaysLeft(c.expiresAt, null, lang)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void quickExtend(c.id)}>
                    +30d
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{t.overview.heaviestUsers}</h2>
            <a className="head-action" href={toPanelUrl('/clients')} onClick={go('/clients')}>
              {t.common.all}
            </a>
          </header>

          {data.heaviestUsers.length === 0 ? (
            <div className="ov-all-clear">
              <span>{lang === 'fa' ? 'هنوز مصرفی ثبت نشده' : 'No usage recorded yet'}</span>
            </div>
          ) : (
            <div className="ov-rank">
              {data.heaviestUsers.map((u, idx) => (
                <div key={u.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-(--text-muted)">#{idx + 1}</span>
                      <a
                        href={toPanelUrl(`/clients/${u.id}`)}
                        onClick={go(`/clients/${u.id}`)}
                        className="strong-link truncate"
                      >
                        {u.name}
                      </a>
                    </div>
                    <span className="font-mono text-(--text-secondary)">{formatBytes(u.trafficUsedBytes, lang)}</span>
                  </div>
                  <div className="hbar">
                    <div style={{ width: `${Math.round((u.trafficUsedBytes / heaviestMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Bottom row: Inbounds + This server */}
      <div className="ov-secondary">
        {data.inbounds.length > 0 && (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.inbounds}</h2>
              <a
                className="head-action"
                href={toPanelUrl('/inbounds')}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('inbounds');
                }}
              >
                {t.common.all}
              </a>
            </header>
            <div className="space-y-2">
              {data.inbounds.map((ib) => (
                <div
                  key={ib.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <a
                      href={toPanelUrl(`/inbounds/${ib.id}`)}
                      onClick={go(`/inbounds/${ib.id}`)}
                      className="strong-link block truncate"
                    >
                      {ib.name}
                    </a>
                    <div className="text-[11px] text-(--text-muted)">
                      {ib.protocol.toUpperCase()} · {ib.transport.toUpperCase()}/{ib.port}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-(--text-secondary)">{ib.onlineCount} online</span>
                    <StatusPill
                      tone={ib.running ? 'green' : ib.enabled ? 'amber' : 'gray'}
                      label={ib.running ? t.inbounds.running : t.inbounds.stopped}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.server ? (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.thisServer}</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-(--text-muted)">
                <Server className="h-3.5 w-3.5" />
                {data.server.driverMode}
              </span>
            </header>

            <div className="sysgrid">
              {[
                { label: 'CPU', pct: data.server.cpuPercent, sub: '' },
                {
                  label: lang === 'fa' ? 'حافظه' : 'Memory',
                  pct: data.server.memPercent,
                  sub: `${formatBytes(data.server.memUsedBytes, lang)} / ${formatBytes(data.server.memTotalBytes, lang)}`,
                },
                {
                  label: lang === 'fa' ? 'دیسک' : 'Disk',
                  pct: data.server.diskPercent,
                  sub: data.server.diskTotalBytes
                    ? `${formatBytes(data.server.diskUsedBytes ?? 0, lang)} / ${formatBytes(data.server.diskTotalBytes, lang)}`
                    : '',
                },
              ].map((m) => (
                <div key={m.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-(--text-secondary)">{m.label}</span>
                    <span className="font-mono text-(--text-primary)">
                      {m.pct}%{m.sub ? ` · ${m.sub}` : ''}
                    </span>
                  </div>
                  <div className="meter">
                    <span
                      style={{
                        width: `${Math.min(100, m.pct)}%`,
                        background: m.pct >= 85 ? '#ef4444' : m.pct >= 65 ? '#f59e0b' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-xs text-(--text-muted)">
              Uptime: {formatDuration(data.server.uptimeSeconds, lang)} · {data.server.platform}
            </div>
          </section>
        ) : data.resellerAccount ? (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.yourAccount}</h2>
            </header>
            <div className="space-y-2 text-xs text-(--text-secondary)">
              <div className="flex justify-between">
                <span>Traffic pool</span>
                <span className="font-mono text-(--text-primary)">
                  {formatBytes(data.resellerAccount.trafficUsedBytes, lang)} /{' '}
                  {formatBytes(data.resellerAccount.trafficPoolBytes, lang)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Clients</span>
                <span className="font-mono text-(--text-primary)">
                  {data.resellerAccount.clientCount} / {data.resellerAccount.clientLimit ?? '∞'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Ends</span>
                <span>{formatDaysLeft(data.resellerAccount.expiresAt, null, lang)}</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
