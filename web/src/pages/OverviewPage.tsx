import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownUp, ArrowRight, Cpu, Plus, Radio, Server, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDaysLeft, formatDuration, formatSpeed } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Card, EmptySonar, EqLoader, Odometer, SplitHeading, StatusPill } from '../components/UiPrimitives';
import { TrafficChart } from '../components/TrafficChart';
import { DonutChart } from '../components/DonutChart';
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
  const [chartRange, setChartRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [chartMode, setChartMode] = useState<'bars' | 'trend'>('bars');

  const load = () => {
    apiFetch<OverviewResponse>('/dashboard/overview').then(setData).catch(() => undefined);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const quickExtend = async (clientId: number) => {
    await apiFetch(`/clients/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ addDays: 30 }),
    });
    load();
  };

  if (!data) {
    return <EqLoader label={t.common.loading} />;
  }

  const chartData =
    chartRange === '24h'
      ? data.charts.hourly24
      : chartRange === '7d'
        ? data.charts.daily7 ?? data.charts.daily30.slice(-7)
        : data.charts.daily30;

  const breakdown = data.statusBreakdown ?? {
    active: data.summary.activeClients,
    expired: 0,
    used_up: 0,
    disabled: Math.max(0, data.summary.totalClients - data.summary.activeClients),
    not_started: 0,
  };

  const donutSegments = [
    { label: lang === 'fa' ? 'فعال' : 'Active', value: breakdown.active, color: 'var(--accent)' },
    { label: lang === 'fa' ? 'شروع‌نشده' : 'Not started', value: breakdown.not_started, color: '#38bdf8' },
    { label: lang === 'fa' ? 'اتمام حجم' : 'Used up', value: breakdown.used_up, color: '#f59e0b' },
    { label: lang === 'fa' ? 'منقضی' : 'Expired', value: breakdown.expired, color: '#ef4444' },
    { label: lang === 'fa' ? 'غیرفعال' : 'Disabled', value: breakdown.disabled, color: '#6b7280' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SplitHeading text={t.overview.title} className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)" />
          <p className="mt-0.5 text-xs text-(--text-secondary)">
            {lang === 'fa'
              ? `${data.summary.onlineClients} کاربر آنلاین · ${data.summary.runningOutCount} اشتراک رو به اتمام`
              : `${data.summary.onlineClients} online now · ${data.summary.runningOutCount} plans run out soon`}
          </p>
        </div>
        <Button variant="primary" onClick={onOpenNewClient}>
          <Plus className="h-4 w-4" />
          {t.overview.newClient}
        </Button>
      </div>

      {data.notices.needsPublicAddress && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{t.overview.publicAddrNotice}</span>
          </div>
          <Button size="sm" onClick={() => onNavigate('settings')}>
            {t.overview.setIt}
          </Button>
        </div>
      )}

      {/* Unified 4-KPI Strip */}
      <Card className="grid divide-y divide-(--border-subtle) sm:grid-cols-2 sm:divide-y-0 sm:divide-x xl:grid-cols-4 rtl:sm:divide-x-reverse">
        <div className="xp-kpi p-4">
          <div className="flex items-center justify-between text-xs text-(--text-secondary)">
            <span>{t.overview.onlineNow}</span>
            <Activity className="h-4 w-4 text-(--accent)" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="font-display text-2xl font-bold tracking-tight text-(--text-primary)">
              <Odometer value={data.summary.onlineClients} />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('connections')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-(--accent) hover:underline"
            >
              {lang === 'fa' ? 'مشاهده لیست' : 'View list'}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            {data.summary.openTunnels} {lang === 'fa' ? 'تانل باز' : 'open tunnels'}
          </div>
        </div>

        <div className="xp-kpi p-4">
          <div className="flex items-center justify-between text-xs text-(--text-secondary)">
            <span>{t.overview.activeClients}</span>
            <Users className="h-4 w-4 text-(--info)" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-(--text-primary)">
            <Odometer value={data.summary.activeClients} />
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            {lang === 'fa' ? `از ${data.summary.totalClients} کاربر` : `out of ${data.summary.totalClients} clients`}
          </div>
        </div>

        <div className="xp-kpi p-4">
          <div className="flex items-center justify-between text-xs text-(--text-secondary)">
            <span>{t.overview.trafficToday}</span>
            <ArrowDownUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-(--text-primary)">
            <Odometer value={formatBytes(data.summary.todayDownloadBytes + data.summary.todayUploadBytes, lang)} />
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            30d: {formatBytes(data.summary.total30dBytes, lang)}
          </div>
        </div>

        <div className="xp-kpi p-4">
          <div className="flex items-center justify-between text-xs text-(--text-secondary)">
            <span>{t.overview.throughputNow}</span>
            <Radio className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 font-display text-lg font-bold tracking-tight text-(--text-primary)">
            ↓ {formatSpeed(data.summary.speedDownBps)}
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            ↑ {formatSpeed(data.summary.speedUpBps)}
          </div>
        </div>
      </Card>

      {/* Traffic Overview + Client Status Donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-(--text-primary)">
              {lang === 'fa' ? 'نمای کلی ترافیک' : 'Traffic overview'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-0.5 text-[11px]">
                {([
                  { id: '24h', label: lang === 'fa' ? '۲۴ ساعت' : '24 hours' },
                  { id: '7d', label: lang === 'fa' ? '۷ روز' : '7 days' },
                  { id: '30d', label: lang === 'fa' ? '۳۰ روز' : '30 days' },
                ] as const).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setChartRange(r.id)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      chartRange === r.id
                        ? 'bg-(--accent-soft) text-(--accent)'
                        : 'text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-0.5 text-[11px]">
                {([
                  { id: 'bars', label: lang === 'fa' ? 'میله‌ای' : 'Bars' },
                  { id: 'trend', label: lang === 'fa' ? 'روند' : 'Trend' },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setChartMode(m.id)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      chartMode === m.id
                        ? 'bg-(--accent-soft) text-(--accent)'
                        : 'text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <TrafficChart data={chartData} height={165} mode={chartMode} showTableToggle />
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-(--text-primary)">
                {lang === 'fa' ? 'وضعیت کاربران' : 'Client status'}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('clients')}
                className="text-xs font-medium text-(--accent) hover:underline"
              >
                {t.common.all}
              </button>
            </div>
            <DonutChart
              total={data.summary.totalClients}
              totalLabel={lang === 'fa' ? 'کل کاربران' : 'Total clients'}
              segments={donutSegments}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1.5 text-[11px]">
            {donutSegments.map((seg) => (
              <button
                key={seg.label}
                type="button"
                onClick={() => onNavigate('clients')}
                className="flex items-center justify-between rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1.5 hover:border-(--accent)/40"
              >
                <span className="flex items-center gap-1.5 text-(--text-secondary)">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                  {seg.label}
                </span>
                <span className="font-mono font-semibold text-(--text-primary)">{seg.value}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Needs attention + Heaviest users + Inbounds + This server */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-(--text-primary)">
              {lang === 'fa' ? 'نیازمند توجه' : 'Needs attention'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('clients')}
              className="text-xs font-medium text-(--accent) hover:underline"
            >
              {t.common.all}
            </button>
          </div>
          {data.runningOut.length === 0 ? (
            <EmptySonar text={t.overview.noRunningOut} />
          ) : (
            <div className="space-y-2">
              {data.runningOut.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-(--text-primary)">{c.name}</div>
                    <div className="text-[11px] text-amber-400">
                      {c.reason === 'traffic' && c.trafficLimitBytes
                        ? `${Math.round((c.trafficUsedBytes / c.trafficLimitBytes) * 100)}% used`
                        : formatDaysLeft(c.expiresAt, null, lang)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => quickExtend(c.id)}>
                    +30d
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
        {data.inbounds.length > 0 && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-(--text-primary)">{t.overview.inbounds}</h2>
              <button
                type="button"
                onClick={() => onNavigate('inbounds')}
                className="text-xs font-medium text-(--accent) hover:underline"
              >
                {t.common.all}
              </button>
            </div>
            <div className="space-y-2">
              {data.inbounds.map((ib) => (
                <div
                  key={ib.id}
                  className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-(--text-primary)">{ib.name}</div>
                    <div className="text-[11px] text-(--text-muted)">
                      {ib.protocol.toUpperCase()} · {ib.transport.toUpperCase()}/{ib.port}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-(--text-secondary)">{ib.onlineCount} online</span>
                    <StatusPill
                      tone={ib.running ? 'green' : ib.enabled ? 'amber' : 'gray'}
                      label={ib.running ? t.inbounds.running : t.inbounds.stopped}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">{t.overview.heaviestUsers}</h2>
          <div className="space-y-2">
            {data.heaviestUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
              >
                <span className="font-medium text-(--text-primary)">{u.name}</span>
                <span className="font-mono text-(--text-secondary)">{formatBytes(u.trafficUsedBytes, lang)}</span>
              </div>
            ))}
          </div>
        </Card>

        {data.server ? (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-(--text-primary)">{t.overview.thisServer}</h2>
              <span className="inline-flex items-center gap-1 text-[11px] text-(--text-muted)">
                <Server className="h-3.5 w-3.5" />
                {data.server.driverMode}
              </span>
            </div>
            <div className="space-y-3 text-xs">
              {[
                {
                  label: 'CPU',
                  pct: data.server.cpuPercent,
                  sub: '',
                },
                {
                  label: 'Memory',
                  pct: data.server.memPercent,
                  sub: `${formatBytes(data.server.memUsedBytes, lang)} / ${formatBytes(data.server.memTotalBytes, lang)}`,
                },
                {
                  label: 'Disk',
                  pct: data.server.diskPercent,
                  sub: data.server.diskTotalBytes
                    ? `${formatBytes(data.server.diskUsedBytes ?? 0, lang)} / ${formatBytes(data.server.diskTotalBytes, lang)}`
                    : '',
                },
              ].map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-(--text-secondary)">
                    <span className="inline-flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> {m.label}
                    </span>
                    <span className="font-mono">
                      {m.pct}%{m.sub ? ` · ${m.sub}` : ''}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-(--bg-elevated)">
                    <div
                      className="h-full rounded-full bg-(--accent) transition-all"
                      style={{ width: `${Math.min(100, m.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-(--text-muted)">
                Uptime: {formatDuration(data.server.uptimeSeconds, lang)} · {data.server.platform}
              </div>
            </div>
          </Card>
        ) : data.resellerAccount ? (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">{t.overview.yourAccount}</h2>
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
          </Card>
        ) : null}
      </div>
    </div>
  );
}
