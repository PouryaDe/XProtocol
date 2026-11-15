import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Unplug } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDateTime, formatDuration, formatSpeed } from '../lib/format';
import { navigate, toPanelUrl, updateSearchParams, useLocationState } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, Card, EmptySonar, PageHead, Select, StatusPill, Tabs } from '../components/UiPrimitives';

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
  const { searchParams } = useLocationState();
  const tab = (searchParams.get('tab') === 'history' ? 'history' : 'live') as 'live' | 'history';
  const viewMode = searchParams.get('view') === 'client' ? 'by_client' : 'sessions';
  const protoFilter = searchParams.get('kind') || 'all';
  const nodeFilter = searchParams.get('node') || 'all';
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const [live, setLive] = useState<LiveConn[]>([]);
  const [history, setHistory] = useState<HistConn[]>([]);

  const load = async () => {
    const [lRes, hRes] = await Promise.all([
      apiFetch<{ connections: LiveConn[] }>('/connections/live'),
      apiFetch<{ history: HistConn[] }>('/connections/history'),
    ]);
    setLive(lRes.connections);
    setHistory(hRes.history);
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);

  const setTab = (next: 'live' | 'history') => {
    updateSearchParams((p) => {
      if (next === 'live') p.delete('tab');
      else p.set('tab', next);
    }, { replace: true });
  };

  const setViewMode = (next: 'sessions' | 'by_client') => {
    updateSearchParams((p) => {
      if (next === 'sessions') p.delete('view');
      else p.set('view', 'client');
    }, { replace: true });
  };

  const setProtoFilter = (next: string) => {
    updateSearchParams((p) => {
      if (next === 'all') p.delete('kind');
      else p.set('kind', next);
    }, { replace: true });
  };

  const setNodeFilter = (next: string) => {
    updateSearchParams((p) => {
      if (next === 'all') p.delete('node');
      else p.set('node', next);
    }, { replace: true });
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    updateSearchParams((p) => {
      if (val.trim()) p.set('q', val);
      else p.delete('q');
    }, { replace: true });
  };

  const nodeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of live) if (c.nodeName) names.add(c.nodeName);
    for (const h of history) if (h.nodeName) names.add(h.nodeName);
    return [...names];
  }, [live, history]);

  const filteredLive = useMemo(() => {
    return live.filter((c) => {
      if (protoFilter !== 'all' && c.protocol !== protoFilter) return false;
      if (nodeFilter !== 'all' && c.nodeName !== nodeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.clientName.toLowerCase().includes(q) ||
          c.remoteIp.includes(q) ||
          c.tunnelIp.includes(q) ||
          c.inboundName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [live, protoFilter, nodeFilter, search]);

  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (protoFilter !== 'all' && h.protocol !== protoFilter) return false;
      if (nodeFilter !== 'all' && h.nodeName !== nodeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          h.clientName.toLowerCase().includes(q) ||
          h.remoteIp.includes(q) ||
          h.inboundName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [history, protoFilter, nodeFilter, search]);

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
    void load();
  };

  return (
    <div className="page">
      <PageHead
        title={t.connections.title}
        sub={`${live.length} ${lang === 'fa' ? 'تانل باز' : 'open tunnels'}`}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'live', label: t.connections.live, count: live.length },
          { id: 'history', label: t.connections.history, count: history.length },
        ]}
      />

      <div className="toolbar">
        <label className="search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t.common.search}
            className="input"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={protoFilter} onChange={(e) => setProtoFilter(e.target.value)} className="w-40">
            <option value="all">{t.common.all}</option>
            <option value="wireguard">WireGuard</option>
            <option value="amneziawg">AmneziaWG</option>
            <option value="openvpn">OpenVPN</option>
            <option value="openconnect">OpenConnect</option>
            <option value="ikev2">IKEv2</option>
            <option value="l2tp">L2TP</option>
          </Select>

          {nodeOptions.length > 0 && (
            <Select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="w-40">
              <option value="all">{lang === 'fa' ? 'همه نودها' : 'All nodes'}</option>
              {nodeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}

          {tab === 'live' && (
            <div className="flex gap-1 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-1">
              <button
                type="button"
                onClick={() => setViewMode('sessions')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'sessions' ? 'bg-(--accent) text-(--accent-fg)' : 'text-(--text-secondary)'
                }`}
              >
                {t.connections.sessionsView}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_client')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'by_client' ? 'bg-(--accent) text-(--accent-fg)' : 'text-(--text-secondary)'
                }`}
              >
                {t.connections.byClientView}
              </button>
            </div>
          )}
        </div>
      </div>

      {tab === 'live' && viewMode === 'sessions' && (
        filteredLive.length === 0 ? (
          <div className="panel py-8">
            <EmptySonar text={lang === 'fa' ? 'هیچ اتصال فعالی وجود ندارد' : 'No open tunnels match these filters.'} />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.clients.columns.client}</th>
                  <th>{t.nav.inbounds}</th>
                  <th>{t.connections.fromIp}</th>
                  <th>{t.connections.tunnelIp}</th>
                  <th>{t.connections.device}</th>
                  <th>{t.clients.columns.traffic}</th>
                  <th>{t.connections.speed}</th>
                  <th className="col-actions text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLive.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a
                        href={toPanelUrl(`/clients/${c.clientId}`)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          navigate(`/clients/${c.clientId}`);
                        }}
                        className="strong-link"
                        dir="ltr"
                      >
                        {c.clientName}
                      </a>
                    </td>
                    <td className="text-xs text-(--text-secondary)">
                      {c.inboundName} · {c.nodeName}
                    </td>
                    <td className="font-mono text-xs text-(--text-secondary)" dir="ltr">
                      {c.remoteIp}
                    </td>
                    <td className="font-mono text-xs text-(--text-secondary)" dir="ltr">
                      {c.tunnelIp}
                    </td>
                    <td className="text-xs text-(--text-secondary)">{c.device}</td>
                    <td className="font-mono text-xs text-(--text-primary)">
                      {formatBytes(c.bytesIn + c.bytesOut, lang)}
                    </td>
                    <td className="font-mono text-xs text-(--text-secondary)">↓ {formatSpeed(c.speedOutBps)}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <Button size="sm" variant="danger" onClick={() => void disconnect(c.id)}>
                          <Unplug className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'live' && viewMode === 'by_client' && (
        <div className="space-y-3">
          {groupedByClient.map(([clientId, g]) => {
            const overLimit =
              g.deviceLimit !== null && (g.items.length > g.deviceLimit || g.uniqueIps.size > g.deviceLimit);
            return (
              <Card key={clientId} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={toPanelUrl(`/clients/${clientId}`)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        navigate(`/clients/${clientId}`);
                      }}
                      className="strong-link"
                      dir="ltr"
                    >
                      {g.clientName}
                    </a>
                    {overLimit && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> {t.connections.overLimitFlag}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-(--text-secondary)">
                    Devices: {g.items.length} · IPs: {g.uniqueIps.size} · Allowed: {g.deviceLimit ?? '∞'}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-(--bg-elevated) px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-mono text-(--text-primary)" dir="ltr">
                          {item.remoteIp} → {item.tunnelIp}
                        </div>
                        <div className="text-(--text-muted)">
                          {item.inboundName} · {item.device}
                        </div>
                      </div>
                      <Button size="sm" variant="danger" onClick={() => void disconnect(item.id)}>
                        <Unplug className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {groupedByClient.length === 0 && (
            <div className="panel py-8">
              <EmptySonar text={lang === 'fa' ? 'هیچ اتصال فعالی وجود ندارد' : 'No open tunnels match these filters.'} />
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        filteredHistory.length === 0 ? (
          <div className="panel py-8">
            <EmptySonar text={lang === 'fa' ? 'تاریخچه‌ای یافت نشد' : 'No connection history found.'} />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.clients.columns.client}</th>
                  <th>{t.nav.inbounds}</th>
                  <th>{t.connections.fromIp}</th>
                  <th>{t.connections.connectedFor}</th>
                  <th>{t.clients.columns.traffic}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="font-semibold text-(--text-primary)" dir="ltr">
                      {h.clientName}
                    </td>
                    <td className="text-xs text-(--text-secondary)">
                      {h.inboundName} · {h.nodeName}
                    </td>
                    <td className="font-mono text-xs text-(--text-secondary)" dir="ltr">
                      {h.remoteIp}
                    </td>
                    <td className="text-xs text-(--text-secondary)">
                      {formatDateTime(h.connectedAt, lang)} · {formatDuration(h.durationSec, lang)}
                    </td>
                    <td className="font-mono text-xs text-(--text-primary)">{formatBytes(h.bytesTotal, lang)}</td>
                    <td>
                      <StatusPill tone="gray" label={h.reason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
