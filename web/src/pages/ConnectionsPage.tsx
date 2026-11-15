import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Unplug } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDateTime, formatDuration, formatSpeed } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Card, Select, StatusPill } from '../components/UiPrimitives';

interface LiveConn {
  id: string;
  clientId: number;
  clientName: string;
  deviceLimit: number | null;
  inboundName: string;
  protocol: string;
  nodeName: string;
  remoteIp: string;
  tunnelIp: string;
  device: string;
  connectedAt: string;
  bytesIn: number;
  bytesOut: number;
  speedInBps: number;
  speedOutBps: number;
}

interface HistConn {
  id: string;
  clientName: string;
  inboundName: string;
  protocol: string;
  nodeName: string;
  remoteIp: string;
  device: string;
  connectedAt: string;
  durationSec: number;
  bytesTotal: number;
  reason: string;
}

export function ConnectionsPage() {
  const { t, lang } = useUi();
  const [tab, setTab] = useState<'live' | 'history'>('live');
  const [viewMode, setViewMode] = useState<'sessions' | 'by_client'>('sessions');
  const [live, setLive] = useState<LiveConn[]>([]);
  const [history, setHistory] = useState<HistConn[]>([]);
  const [search, setSearch] = useState('');
  const [protoFilter, setProtoFilter] = useState('all');

  const load = async () => {
    const [lRes, hRes] = await Promise.all([
      apiFetch<{ connections: LiveConn[] }>('/connections/live'),
      apiFetch<{ history: HistConn[] }>('/connections/history'),
    ]);
    setLive(lRes.connections);
    setHistory(hRes.history);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const filteredLive = useMemo(() => {
    return live.filter((c) => {
      if (protoFilter !== 'all' && c.protocol !== protoFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return c.clientName.toLowerCase().includes(q) || c.remoteIp.includes(q) || c.tunnelIp.includes(q);
      }
      return true;
    });
  }, [live, protoFilter, search]);

  const groupedByClient = useMemo(() => {
    const map = new Map<
      number,
      { clientName: string; deviceLimit: number | null; items: LiveConn[]; uniqueIps: Set<string> }
    >();
    for (const c of filteredLive) {
      const entry = map.get(c.clientId) || {
        clientName: c.clientName,
        deviceLimit: c.deviceLimit,
        items: [],
        uniqueIps: new Set<string>(),
      };
      entry.items.push(c);
      entry.uniqueIps.add(c.remoteIp);
      map.set(c.clientId, entry);
    }
    return [...map.entries()];
  }, [filteredLive]);

  const disconnect = async (id: string) => {
    await apiFetch(`/connections/${id}/disconnect`, { method: 'POST' });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t.connections.title}</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {live.length} {lang === 'fa' ? 'تانل باز' : 'open tunnels'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={tab === 'live' ? 'primary' : 'secondary'} onClick={() => setTab('live')}>
            {t.connections.live}
          </Button>
          <Button variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => setTab('history')}>
            {t.connections.history}
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.common.search}
          className="min-w-48 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <Select value={protoFilter} onChange={(e) => setProtoFilter(e.target.value)} className="w-40">
          <option value="all">{t.common.all}</option>
          <option value="wireguard">WireGuard</option>
          <option value="amneziawg">AmneziaWG</option>
          <option value="openvpn">OpenVPN</option>
          <option value="openconnect">OpenConnect</option>
        </Select>
        {tab === 'live' && (
          <div className="flex gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => setViewMode('sessions')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                viewMode === 'sessions' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {t.connections.sessionsView}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_client')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                viewMode === 'by_client' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {t.connections.byClientView}
            </button>
          </div>
        )}
      </Card>

      {tab === 'live' && viewMode === 'sessions' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-start">{t.clients.columns.client}</th>
                  <th className="px-4 py-3 text-start">{t.nav.inbounds}</th>
                  <th className="px-4 py-3 text-start">{t.connections.fromIp}</th>
                  <th className="px-4 py-3 text-start">{t.connections.tunnelIp}</th>
                  <th className="px-4 py-3 text-start">{t.connections.device}</th>
                  <th className="px-4 py-3 text-start">{t.clients.columns.traffic}</th>
                  <th className="px-4 py-3 text-start">{t.connections.speed}</th>
                  <th className="px-4 py-3 text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {filteredLive.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{c.clientName}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {c.inboundName} · {c.nodeName}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{c.remoteIp}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{c.tunnelIp}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{c.device}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)]">
                      {formatBytes(c.bytesIn + c.bytesOut, lang)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                      ↓ {formatSpeed(c.speedOutBps)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button size="sm" variant="danger" onClick={() => disconnect(c.id)}>
                        <Unplug className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredLive.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                      No open tunnels match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'live' && viewMode === 'by_client' && (
        <div className="space-y-3">
          {groupedByClient.map(([clientId, g]) => {
            const overLimit = g.deviceLimit !== null && (g.items.length > g.deviceLimit || g.uniqueIps.size > g.deviceLimit);
            return (
              <Card key={clientId} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{g.clientName}</span>
                    {overLimit && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> {t.connections.overLimitFlag}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-[var(--text-secondary)]">
                    Devices: {g.items.length} · IPs: {g.uniqueIps.size} · Allowed: {g.deviceLimit ?? '∞'}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-mono text-[var(--text-primary)]">
                          {item.remoteIp} → {item.tunnelIp}
                        </div>
                        <div className="text-[var(--text-muted)]">
                          {item.inboundName} · {item.device}
                        </div>
                      </div>
                      <Button size="sm" variant="danger" onClick={() => disconnect(item.id)}>
                        <Unplug className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-start">{t.clients.columns.client}</th>
                  <th className="px-4 py-3 text-start">{t.nav.inbounds}</th>
                  <th className="px-4 py-3 text-start">{t.connections.fromIp}</th>
                  <th className="px-4 py-3 text-start">{t.connections.connectedFor}</th>
                  <th className="px-4 py-3 text-start">{t.clients.columns.traffic}</th>
                  <th className="px-4 py-3 text-start">{t.common.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{h.clientName}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{h.inboundName}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{h.remoteIp}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDateTime(h.connectedAt, lang)} · {formatDuration(h.durationSec, lang)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)]">{formatBytes(h.bytesTotal, lang)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone="gray" label={h.reason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
