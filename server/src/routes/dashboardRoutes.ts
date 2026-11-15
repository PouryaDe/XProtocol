import { Router } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { getHostStats } from '../drivers/runtime.js';
import { computeClientState, type AuthedRequest } from './context.js';
import { getAccountStatus, getEffectiveLimits } from '../security/rbac.js';

export function createDashboardRouter(driverMode: 'linux' | 'mock'): Router {
  const router = Router();

  router.get('/overview', async (req: AuthedRequest, res) => {
    const db = getDb();
    const acc = req.auth!.account;
    const ownOnly = !acc.isOwner && acc.permissions.clients.view === 'own';
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);

    const clients = (
      ownOnly
        ? db.prepare('SELECT * FROM clients WHERE owner_id = ?').all(acc.id)
        : db.prepare('SELECT * FROM clients').all()
    ) as Array<{
      id: number;
      name: string;
      owner_id: number;
      enabled: number;
      traffic_limit_bytes: number | null;
      traffic_used_bytes: number;
      upload_bytes: number;
      download_bytes: number;
      expires_at: string | null;
      first_connect_days: number | null;
      first_connected_at: string | null;
    }>;

    const liveRows = (
      ownOnly
        ? db
            .prepare(
              `SELECT l.* FROM connections_live l
               JOIN clients c ON c.id = l.client_id
               WHERE c.owner_id = ?`,
            )
            .all(acc.id)
        : db.prepare('SELECT * FROM connections_live').all()
    ) as Array<{
      client_id: number;
      inbound_id: number;
      speed_in_bps: number;
      speed_out_bps: number;
    }>;

    const liveByClient = new Map<number, number>();
    const liveByInbound = new Map<number, number>();
    let speedDown = 0;
    let speedUp = 0;
    for (const l of liveRows) {
      liveByClient.set(l.client_id, (liveByClient.get(l.client_id) || 0) + 1);
      liveByInbound.set(l.inbound_id, (liveByInbound.get(l.inbound_id) || 0) + 1);
      speedDown += l.speed_out_bps;
      speedUp += l.speed_in_bps;
    }

    let activeClients = 0;
    const statusBreakdown = {
      active: 0,
      expired: 0,
      used_up: 0,
      disabled: 0,
      not_started: 0,
    };
    const runningOut: Array<{
      id: number;
      name: string;
      reason: string;
      expiresAt: string | null;
      trafficUsedBytes: number;
      trafficLimitBytes: number | null;
    }> = [];

    for (const c of clients) {
      const onlineCount = liveByClient.get(c.id) || 0;
      const st = computeClientState(c, onlineCount);
      if (st.status === 'active' || st.status === 'online' || st.status === 'not_started') {
        activeClients++;
      }
      if (st.status === 'online' || st.status === 'active') statusBreakdown.active++;
      else if (st.status === 'expired') statusBreakdown.expired++;
      else if (st.status === 'used_up') statusBreakdown.used_up++;
      else if (st.status === 'disabled') statusBreakdown.disabled++;
      else if (st.status === 'not_started') statusBreakdown.not_started++;
      if (st.runningOutReason || st.status === 'expired' || st.status === 'used_up') {
        runningOut.push({
          id: c.id,
          name: c.name,
          reason: st.status === 'expired' ? 'expired' : st.status === 'used_up' ? 'used_up' : st.runningOutReason!,
          expiresAt: c.expires_at,
          trafficUsedBytes: c.traffic_used_bytes,
          trafficLimitBytes: c.traffic_limit_bytes,
        });
      }
    }

    const hourly = db
      .prepare("SELECT ts, download_bytes, upload_bytes FROM traffic_samples WHERE granularity = 'hour' ORDER BY ts DESC LIMIT 24")
      .all()
      .reverse() as Array<{ ts: string; download_bytes: number; upload_bytes: number }>;

    const daily = db
      .prepare("SELECT ts, download_bytes, upload_bytes FROM traffic_samples WHERE granularity = 'day' ORDER BY ts DESC LIMIT 30")
      .all()
      .reverse() as Array<{ ts: string; download_bytes: number; upload_bytes: number }>;

    const todayTraffic = daily.length > 0 ? daily[daily.length - 1] : { download_bytes: 0, upload_bytes: 0 };
    const total30dBytes = daily.reduce((sum, d) => sum + d.download_bytes + d.upload_bytes, 0);

    const heaviest = [...clients]
      .sort((a, b) => b.traffic_used_bytes - a.traffic_used_bytes)
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        name: c.name,
        trafficUsedBytes: c.traffic_used_bytes,
        downloadBytes: c.download_bytes,
        uploadBytes: c.upload_bytes,
      }));

    const showServerBlocks = acc.isOwner || acc.permissions.clients.view === 'all';
    const inbounds = showServerBlocks
      ? (db
          .prepare('SELECT id, name, protocol, transport, port, enabled, running, node_id FROM inbounds ORDER BY id')
          .all() as Array<{
          id: number;
          name: string;
          protocol: string;
          transport: string;
          port: number;
          enabled: number;
          running: number;
          node_id: number | null;
        }>)
      : [];

    const host = showServerBlocks ? await getHostStats(driverMode) : null;

    res.json({
      notices: {
        needsPublicAddress:
          acc.isOwner && (!general.publicAddress || general.publicAddress === '127.0.0.1' || general.publicAddress === 'localhost'),
      },
      summary: {
        onlineClients: liveByClient.size,
        openTunnels: liveRows.length,
        activeClients,
        totalClients: clients.length,
        runningOutCount: runningOut.length,
        todayDownloadBytes: todayTraffic.download_bytes,
        todayUploadBytes: todayTraffic.upload_bytes,
        total30dBytes,
        speedDownBps: speedDown,
        speedUpBps: speedUp,
      },
      charts: {
        hourly24: hourly,
        daily7: daily.slice(-7),
        daily30: daily,
      },
      statusBreakdown,
      runningOut: runningOut.slice(0, 8),
      heaviestUsers: heaviest,
      inbounds: inbounds.map((ib) => ({
        ...ib,
        enabled: Boolean(ib.enabled),
        running: Boolean(ib.running),
        onlineCount: liveByInbound.get(ib.id) || 0,
      })),
      server: host,
      resellerAccount: ownOnly
        ? {
            status: getAccountStatus(acc),
            trafficPoolBytes: acc.trafficPoolBytes,
            trafficUsedBytes: acc.trafficUsedBytes,
            expiresAt: acc.expiresAt,
            clientCount: clients.length,
            clientLimit: getEffectiveLimits(acc).clientLimit,
          }
        : null,
    });
  });

  return router;
}
