import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatBytes,
  formatBytesParts,
  formatDaysLeft,
  formatDuration,
  formatSpeed,
  formatSpeedParts,
} from '../lib/format';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EqLoader, Odometer, PageHead, Segmented } from '../components/UiPrimitives';
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
    { key: 'active', label: lang === 'fa' ? 'فعال' : 'Active', count: breakdown.active, color: 'var(--good)' },
    { key: 'expired', label: lang === 'fa' ? 'منقضی‌شده' : 'Expired', count: breakdown.expired, color: 'var(--warn)' },
    {
      key: 'limited',
      label: lang === 'fa' ? 'حجم تمام‌شده' : 'Traffic used up',
      count: breakdown.used_up,
      color: 'var(--bad)',
    },
    {
      key: 'disabled',
      label: lang === 'fa' ? 'غیرفعال' : 'Disabled',
      count: breakdown.disabled,
      color: 'var(--ink-3)',
    },
  ];

  const todayParts = formatBytesParts(data.summary.todayDownloadBytes + data.summary.todayUploadBytes, lang);
  const speedParts = formatSpeedParts(data.summary.speedDownBps + data.summary.speedUpBps);

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
            ? `${data.summary.onlineClients} آنلاین · ${data.summary.totalClients} کاربر · ${data.summary.runningOutCount} نیازمند رسیدگی`
            : `${data.summary.onlineClients} online · ${data.summary.totalClients} clients · ${data.summary.runningOutCount} need attention`
        }
        actions={
          <>
            <Button onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'spin' : ''} aria-hidden="true" />
              {t.common.refresh}
            </Button>
            <Button variant="primary" onClick={onOpenNewClient}>
              <Plus aria-hidden="true" />
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
              ? 'به‌روزرسانی نشد · آخرین اطلاعات دریافتی نمایش داده می‌شود'
              : 'Could not refresh · showing the last received data'
            : lang === 'fa'
              ? 'نمای زنده · به‌روزرسانی هر ۵ ثانیه'
              : 'Live overview · refreshes every 5 seconds'}
        </span>
        {updatedAt ? (
          <span>
            {lang === 'fa' ? 'آخرین دریافت ' : 'Updated '}
            {updatedAt.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : null}
      </div>

      {data.notices.needsPublicAddress && (
        <div className="banner">
          <span>{t.overview.publicAddrNotice}</span>{' '}
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
            {lang === 'fa' ? `${data.summary.openTunnels} تونل` : `${data.summary.openTunnels} tunnels`}
          </span>
          <a className="kpi-link" href={toPanelUrl('/connections')} onClick={go('/connections')}>
            {lang === 'fa' ? 'مشاهده فهرست' : 'View list'}
            <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
          </a>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.activeClients}</span>
          <span className="kpi-value num">
            <Odometer value={data.summary.activeClients} />
          </span>
          <span className="kpi-sub">
            {lang === 'fa' ? `از ${data.summary.totalClients}` : `of ${data.summary.totalClients}`}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.trafficToday}</span>
          <span className="kpi-value num">
            <span className="ov-metric-value">
              <span>{todayParts.value}</span>{' '}
              {todayParts.unit ? <small>{todayParts.unit}</small> : null}
            </span>
          </span>
          <span className="kpi-sub">
            {t.overview.traffic30d}: {formatBytes(data.summary.total30dBytes, lang)}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">{t.overview.throughputNow}</span>
          <span className="kpi-value num">
            <span className="ov-metric-value">
              <span>{speedParts.value}</span> <small>{speedParts.unit}</small>
            </span>
          </span>
          <span className="kpi-sub">
            <span>
              <ArrowDown aria-hidden="true" /> {formatSpeed(data.summary.speedDownBps)}
            </span>
            <span>
              <ArrowUp aria-hidden="true" /> {formatSpeed(data.summary.speedUpBps)}
            </span>
          </span>
        </div>
      </section>

      {/* Primary analytics: Traffic overview + Client status */}
      <div className="ov-analytics">
        <section className="panel ov-traffic-panel">
          <header className="panel-head">
            <div>
              <h2>{lang === 'fa' ? 'روند مصرف ترافیک' : 'Traffic overview'}</h2>
              <p className="ov-section-note">
                {lang === 'fa'
                  ? 'ترافیک محاسبه‌شده برای سهمیه · با اعمال ضریب نود'
                  : 'Quota traffic · node multipliers apply'}
              </p>
            </div>
            <Segmented
              label={lang === 'fa' ? 'بازهٔ مصرف' : 'Traffic period'}
              value={chartRange}
              onChange={setChartRange}
              options={[
                { value: '24h', label: lang === 'fa' ? '۲۴ ساعت' : '24 hours' },
                { value: '7d', label: lang === 'fa' ? '۷ روز' : '7 days' },
                { value: '30d', label: lang === 'fa' ? '۳۰ روز' : '30 days' },
              ]}
            />
          </header>

          <div className="ov-traffic-summary">
            <div className="ov-traffic-total">
              <span>{lang === 'fa' ? 'مجموع این بازه' : 'Total in this period'}</span>
              <strong className="num">{formatBytes(periodTotal, lang)}</strong>
            </div>
            <div>
              <span>
                <ArrowDown aria-hidden="true" />
                {t.overview.download}
              </span>
              <strong className="num">{formatBytes(periodDown, lang)}</strong>
            </div>
            <div>
              <span>
                <ArrowUp aria-hidden="true" />
                {t.overview.upload}
              </span>
              <strong className="num">{formatBytes(periodUp, lang)}</strong>
            </div>
          </div>

          <div className="ov-chart-tools">
            <span className="legend">
              <span>
                <i className="sw down" />
                {t.overview.download}
              </span>
              <span>
                <i className="sw up" />
                {t.overview.upload}
              </span>
            </span>
            <div className="ov-chart-mode" role="group" aria-label={lang === 'fa' ? 'نوع نمایش نمودار' : 'Chart display'}>
              <button type="button" aria-pressed={chartMode === 'bars'} onClick={() => setChartMode('bars')}>
                <BarChart3 aria-hidden="true" />
                {lang === 'fa' ? 'ستونی' : 'Bars'}
              </button>
              <button type="button" aria-pressed={chartMode === 'trend'} onClick={() => setChartMode('trend')}>
                <TrendingUp aria-hidden="true" />
                {lang === 'fa' ? 'روند' : 'Trend'}
              </button>
            </div>
          </div>

          <TrafficChart
            data={chartData}
            height={280}
            mode={chartMode}
            showTableToggle
            daily={chartRange !== '24h'}
          />

          <div className="ov-chart-insight">
            <Clock aria-hidden="true" />
            <span>
              {peakPoint && periodTotal > 0
                ? lang === 'fa'
                  ? `بیشترین مصرف: ${peakPoint.ts} · ${formatBytes(peakPoint.download_bytes + peakPoint.upload_bytes, lang)}`
                  : `Highest usage: ${peakPoint.ts} · ${formatBytes(peakPoint.download_bytes + peakPoint.upload_bytes, lang)}`
                : lang === 'fa'
                  ? 'در این بازه ترافیکی ثبت نشده است.'
                  : 'No traffic recorded in this period.'}
            </span>
          </div>
        </section>

        <section className="panel ov-client-panel">
          <header className="panel-head">
            <div>
              <h2>{lang === 'fa' ? 'وضعیت کاربران' : 'Client status'}</h2>
              <p className="ov-section-note">
                {lang === 'fa' ? 'نمایی از وضعیت حساب‌های کاربران' : 'A snapshot of your client accounts'}
              </p>
            </div>
            <Users aria-hidden="true" />
          </header>

          <div className="ov-status-figure">
            <svg viewBox="0 0 180 180" role="img" aria-label={`Client status: ${data.summary.totalClients}`}>
              <circle cx="90" cy="90" r={ringRadius} fill="none" stroke="var(--line-strong)" strokeWidth="14" />
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
              const pct = data.summary.totalClients
                ? ((seg.count / data.summary.totalClients) * 100).toFixed(0)
                : '0';
              return (
                <li key={seg.key}>
                  <a href={toPanelUrl(target)} onClick={go(target)}>
                    <span>
                      <i style={{ background: seg.color }} aria-hidden="true" />
                      {seg.label}
                    </span>
                    <strong className="num">{seg.count}</strong>
                    <span className="num">{pct}%</span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="ov-status-foot">
            <span>
              {lang === 'fa'
                ? `${data.summary.onlineClients} آنلاین از ${data.summary.totalClients} کاربر`
                : `${data.summary.onlineClients} active out of ${data.summary.totalClients} clients`}
            </span>
            <span>
              {lang === 'fa'
                ? `${breakdown.not_started} در انتظار اولین استفاده`
                : `${breakdown.not_started} awaiting first use`}
            </span>
          </div>
        </section>
      </div>

      {/* Secondary row: Needs attention + Heaviest users */}
      <div className="ov-secondary">
        <section className="panel">
          <header className="panel-head">
            <h2>{t.overview.runningOut}</h2>
            {data.summary.runningOutCount > data.runningOut.length && (
              <a
                className="link-sm"
                href={toPanelUrl('/clients')}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('clients');
                }}
              >
                {lang === 'fa' ? 'مشاهده همه' : 'View all'} ({data.summary.runningOutCount})
              </a>
            )}
          </header>

          {data.runningOut.length === 0 ? (
            <div className="ov-all-clear">
              <CheckCircle2 aria-hidden="true" />
              <strong>{t.overview.noRunningOut}</strong>
              <span>
                {lang === 'fa'
                  ? 'هشدار نزدیک شدن انقضا و اتمام حجم اینجا نمایش داده می‌شود.'
                  : 'Upcoming expiry and low-traffic warnings appear here.'}
              </span>
            </div>
          ) : (
            <ul className="rows">
              {data.runningOut.map((c) => (
                <li key={c.id} className="row-item">
                  <div className="ri-main">
                    <a href={toPanelUrl(`/clients/${c.id}`)} onClick={go(`/clients/${c.id}`)} className="ri-title">
                      {c.name}
                    </a>
                    <span className="ri-sub">
                      {c.reason === 'traffic' && c.trafficLimitBytes
                        ? lang === 'fa'
                          ? `${Math.round((c.trafficUsedBytes / c.trafficLimitBytes) * 100)}٪ حجم مصرف شده`
                          : `${Math.round((c.trafficUsedBytes / c.trafficLimitBytes) * 100)}% of traffic used`
                        : formatDaysLeft(c.expiresAt, null, lang)}
                    </span>
                  </div>
                  <Button size="sm" onClick={() => void quickExtend(c.id)}>
                    {t.overview.extend}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{t.overview.heaviestUsers}</h2>
          </header>

          {data.heaviestUsers.length === 0 ? (
            <p className="muted pad">
              {lang === 'fa'
                ? 'با ثبت مصرف کاربران، رتبه‌بندی اینجا نمایش داده می‌شود.'
                : 'Usage rankings will appear as clients transfer traffic.'}
            </p>
          ) : (
            <ol className="rows bars-list">
              {data.heaviestUsers.map((u, idx) => (
                <li key={u.id} className="row-item">
                  <span className="ov-rank num">{idx + 1}</span>
                  <div className="ri-main">
                    <a href={toPanelUrl(`/clients/${u.id}`)} onClick={go(`/clients/${u.id}`)} className="ri-title">
                      {u.name}
                    </a>
                    <span className="hbar" aria-hidden="true">
                      <span style={{ inlineSize: `${Math.round((u.trafficUsedBytes / heaviestMax) * 100)}%` }} />
                    </span>
                  </div>
                  <span className="num ri-fig">{formatBytes(u.trafficUsedBytes, lang)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Bottom row: Inbounds + This server */}
      <div className="ov-secondary ov-infrastructure">
        {data.inbounds.length > 0 && (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.inbounds}</h2>
              <a
                className="link-sm"
                href={toPanelUrl('/inbounds')}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('inbounds');
                }}
              >
                {lang === 'fa' ? 'مشاهده همه' : 'View all'}
              </a>
            </header>
            <ul className="rows">
              {data.inbounds.map((ib) => (
                <li key={ib.id} className="row-item">
                  <span
                    className={`dot ${ib.running ? 'ok' : ib.enabled ? 'bad' : 'off'}`}
                    aria-hidden="true"
                  />
                  <div className="ri-main">
                    <a
                      href={toPanelUrl(`/inbounds/${ib.id}`)}
                      onClick={go(`/inbounds/${ib.id}`)}
                      className="ri-title"
                    >
                      {ib.name}
                    </a>
                    <span className="ri-sub">
                      {ib.protocol.toUpperCase()} {ib.port} ·{' '}
                      {ib.running ? t.inbounds.running : t.inbounds.stopped}
                    </span>
                  </div>
                  <span className="num ri-fig">
                    {lang === 'fa' ? `${ib.onlineCount} آنلاین` : `${ib.onlineCount} online`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.server ? (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.thisServer}</h2>
              <span className="faint small">
                {lang === 'fa'
                  ? `روشن از ${formatDuration(data.server.uptimeSeconds, lang)}`
                  : `Up ${formatDuration(data.server.uptimeSeconds, lang)}`}
              </span>
            </header>

            <dl className="sysgrid">
              <div>
                <dt>CPU</dt>
                <dd className="num">{data.server.cpuPercent}%</dd>
                <div className="meter">
                  <span
                    className={data.server.cpuPercent >= 85 ? 'hot' : ''}
                    style={{ width: `${Math.min(100, data.server.cpuPercent)}%` }}
                  />
                </div>
              </div>
              <div>
                <dt>{lang === 'fa' ? 'حافظه' : 'Memory'}</dt>
                <dd className="num">
                  {formatBytes(data.server.memUsedBytes, lang)}{' '}
                  <span className="faint">/ {formatBytes(data.server.memTotalBytes, lang)}</span>
                </dd>
                <div className="meter">
                  <span
                    className={data.server.memPercent >= 85 ? 'hot' : ''}
                    style={{ width: `${Math.min(100, data.server.memPercent)}%` }}
                  />
                </div>
              </div>
              {data.server.diskTotalBytes ? (
                <div>
                  <dt>{lang === 'fa' ? 'دیسک' : 'Disk'}</dt>
                  <dd className="num">
                    {formatBytes(data.server.diskUsedBytes ?? 0, lang)}{' '}
                    <span className="faint">/ {formatBytes(data.server.diskTotalBytes, lang)}</span>
                  </dd>
                  <div className="meter">
                    <span
                      className={data.server.diskPercent >= 85 ? 'hot' : ''}
                      style={{ width: `${Math.min(100, data.server.diskPercent)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <dt>{lang === 'fa' ? 'سیستم' : 'System'}</dt>
                <dd className="num">
                  {data.server.platform} <span className="faint">· {data.server.driverMode}</span>
                </dd>
              </div>
            </dl>
          </section>
        ) : data.resellerAccount ? (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.overview.yourAccount}</h2>
            </header>
            <dl className="sysgrid">
              <div>
                <dt>{lang === 'fa' ? 'سهمیه ترافیک' : 'Traffic pool'}</dt>
                <dd className="num">
                  {formatBytes(data.resellerAccount.trafficUsedBytes, lang)}{' '}
                  <span className="faint">/ {formatBytes(data.resellerAccount.trafficPoolBytes, lang)}</span>
                </dd>
              </div>
              <div>
                <dt>{lang === 'fa' ? 'کاربران' : 'Clients'}</dt>
                <dd className="num">
                  {data.resellerAccount.clientCount} / {data.resellerAccount.clientLimit ?? '∞'}
                </dd>
              </div>
              <div>
                <dt>{lang === 'fa' ? 'پایان' : 'Ends'}</dt>
                <dd>{formatDaysLeft(data.resellerAccount.expiresAt, null, lang)}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
