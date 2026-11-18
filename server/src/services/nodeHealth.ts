import os from 'node:os';
import fs from 'node:fs';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { emitEvent } from './events.js';

let lastSampleBucket = 0;

function readLocalHostMetrics(): {
  cpu: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
} {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = Math.max(0, memTotal - memFree);
  const cpus = Math.max(1, os.cpus().length);
  const cpu = Math.min(1, Math.max(0, (os.loadavg()[0] || 0) / cpus));

  let diskTotal = 50 * 1024 ** 3;
  let diskUsed = 12 * 1024 ** 3;
  try {
    const stat = fs.statfsSync(process.platform === 'linux' ? '/' : process.cwd());
    if (stat && stat.blocks > 0) {
      diskTotal = stat.blocks * stat.bsize;
      diskUsed = Math.max(0, (stat.blocks - stat.bfree) * stat.bsize);
    }
  } catch {
    // fallback if statfsSync not supported
  }
  return { cpu, memUsed, memTotal, diskUsed, diskTotal };
}

export function recordNodeHealthSample(force = false): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / 300) * 300;
  if (!force && bucket === lastSampleBucket) return;
  lastSampleBucket = bucket;

  const db = getDb();
  const nodes = db.prepare('SELECT id, name, is_local, enabled, status, cpu_pct, mem_pct, disk_pct FROM nodes').all() as Array<{
    id: number;
    name: string;
    is_local: number;
    enabled: number;
    status: string;
    cpu_pct: number;
    mem_pct: number;
    disk_pct: number;
  }>;

  const liveCounts = db.prepare('SELECT node_id, COUNT(*) as cnt FROM connections_live GROUP BY node_id').all() as Array<{
    node_id: number;
    cnt: number;
  }>;
  const liveMap = new Map(liveCounts.map((l) => [l.node_id, Number(l.cnt)]));

  const localStats = readLocalHostMetrics();
  const insert = db.prepare(
    `INSERT INTO node_health_samples (node_id, ts, granularity, online, cpu, mem_used, mem_total, disk_used, disk_total, upload, download, clients)
     VALUES (?, ?, 'raw', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const n of nodes) {
    if (!n.enabled) continue;
    const online = n.is_local || n.status === 'connected' ? 1 : 0;
    const cpu = n.is_local ? localStats.cpu : Math.min(1, Math.max(0, Number(n.cpu_pct || 0) / 100));
    const memTotal = n.is_local ? localStats.memTotal : 4 * 1024 ** 3;
    const memUsed = n.is_local ? localStats.memUsed : Math.round((Number(n.mem_pct || 0) / 100) * memTotal);
    const diskTotal = n.is_local ? localStats.diskTotal : 50 * 1024 ** 3;
    const diskUsed = n.is_local ? localStats.diskUsed : Math.round((Number(n.disk_pct || 0) / 100) * diskTotal);

    if (n.is_local) {
      db.prepare('UPDATE nodes SET cpu_pct = ?, mem_pct = ?, disk_pct = ?, uptime_sec = ? WHERE id = ?').run(
        Math.round(cpu * 1000) / 10,
        Math.round((memUsed / Math.max(1, memTotal)) * 1000) / 10,
        Math.round((diskUsed / Math.max(1, diskTotal)) * 1000) / 10,
        Math.floor(os.uptime()),
        n.id,
      );
    }

    insert.run(n.id, bucket, online, cpu, memUsed, memTotal, diskUsed, diskTotal, 0, 0, liveMap.get(n.id) || 0);

    // Threshold alerts (disk >= 90%, mem >= 92%)
    const diskRatio = diskUsed / Math.max(1, diskTotal);
    const memRatio = memUsed / Math.max(1, memTotal);
    if (diskRatio >= 0.9) {
      const recent = db
        .prepare("SELECT 1 FROM events WHERE type = 'node.disk_high' AND subject = ? AND at > ? LIMIT 1")
        .get(`node:${n.id}`, nowSec - 6 * 3600);
      if (!recent) {
        emitEvent({
          type: 'node.disk_high',
          ownerId: 0,
          subject: `node:${n.id}`,
          data: { nodeId: n.id, name: n.name, pct: Math.round(diskRatio * 100) },
        });
      }
    }
    if (memRatio >= 0.92) {
      const recent = db
        .prepare("SELECT 1 FROM events WHERE type = 'node.memory_high' AND subject = ? AND at > ? LIMIT 1")
        .get(`node:${n.id}`, nowSec - 6 * 3600);
      if (!recent) {
        emitEvent({
          type: 'node.memory_high',
          ownerId: 0,
          subject: `node:${n.id}`,
          data: { nodeId: n.id, name: n.name, pct: Math.round(memRatio * 100) },
        });
      }
    }
  }

  rollupAndPruneNodeHealth(nowSec);
}

export function rollupAndPruneNodeHealth(nowSec = Math.floor(Date.now() / 1000)): void {
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const rawDays = Math.max(1, Math.min(30, general.nodeSampleRawDays || 7));
  const keepDays = Math.max(7, Math.min(730, general.nodeSampleKeepDays || 90));
  const rawCutoff = nowSec - rawDays * 86400;
  const keepCutoff = nowSec - keepDays * 86400;
  const db = getDb();

  // Fold raw samples older than rawCutoff into hourly buckets
  const oldRaw = db
    .prepare(
      `SELECT node_id, (ts / 3600) * 3600 AS hour_ts,
              AVG(online) AS up, AVG(cpu) AS cpu, AVG(mem_used) AS mem_used, MAX(mem_total) AS mem_total,
              AVG(disk_used) AS disk_used, MAX(disk_total) AS disk_total,
              SUM(upload) AS upload, SUM(download) AS download, AVG(clients) AS clients
       FROM node_health_samples
       WHERE granularity = 'raw' AND ts < ?
       GROUP BY node_id, hour_ts`,
    )
    .all(rawCutoff) as Array<Record<string, number>>;

  if (oldRaw.length > 0) {
    const insHour = db.prepare(
      `INSERT INTO node_health_samples (node_id, ts, granularity, online, cpu, mem_used, mem_total, disk_used, disk_total, upload, download, clients)
       VALUES (?, ?, 'hour', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of oldRaw) {
      insHour.run(
        r.node_id,
        r.hour_ts,
        r.up >= 0.5 ? 1 : 0,
        r.cpu,
        Math.round(r.mem_used || 0),
        Math.round(r.mem_total || 0),
        Math.round(r.disk_used || 0),
        Math.round(r.disk_total || 0),
        Math.round(r.upload || 0),
        Math.round(r.download || 0),
        Math.round(r.clients || 0),
      );
    }
    db.prepare("DELETE FROM node_health_samples WHERE granularity = 'raw' AND ts < ?").run(rawCutoff);
  }

  db.prepare('DELETE FROM node_health_samples WHERE ts < ?').run(keepCutoff);
}

export function buildNodeUptimeSummary(nodeId: number, daysCount = 90) {
  const db = getDb();
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const tz = general.timezone || 'UTC';
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - daysCount * 86400;

  const rows = db
    .prepare('SELECT ts, online FROM node_health_samples WHERE node_id = ? AND ts >= ? ORDER BY ts ASC')
    .all(nodeId, startSec) as Array<{ ts: number; online: number }>;

  const formatDay = (tsSec: number) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
        new Date(tsSec * 1000),
      );
    } catch {
      return new Date(tsSec * 1000).toISOString().slice(0, 10);
    }
  };

  const buckets = new Map<string, { up: number; down: number }>();
  for (const r of rows) {
    const day = formatDay(r.ts);
    const cur = buckets.get(day) || { up: 0, down: 0 };
    if (r.online) cur.up += 1;
    else cur.down += 1;
    buckets.set(day, cur);
  }

  const days: Array<{ day: string; up: number; down: number; unknown: number; pct: number | null }> = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const day = formatDay(nowSec - i * 86400);
    const b = buckets.get(day);
    if (!b || b.up + b.down === 0) {
      days.push({ day, up: i === 0 ? 1 : 0, down: 0, unknown: i === 0 ? 0 : 1, pct: i === 0 ? 100 : null });
    } else {
      const total = b.up + b.down;
      days.push({
        day,
        up: b.up / total,
        down: b.down / total,
        unknown: 0,
        pct: Math.round((b.up / total) * 1000) / 10,
      });
    }
  }

  const calcPct = (sinceSec: number): number | null => {
    const sub = rows.filter((r) => r.ts >= sinceSec);
    if (sub.length === 0) return 100;
    const up = sub.filter((r) => r.online).length;
    return Math.round((up / sub.length) * 1000) / 10;
  };

  return {
    days,
    pct: calcPct(startSec),
    pct24: calcPct(nowSec - 86400),
    pct30: calcPct(nowSec - 30 * 86400),
  };
}

export function getNodeHealthSeries(nodeId: number, range = '24h') {
  const nowSec = Math.floor(Date.now() / 1000);
  const rangeMap: Record<string, { dur: number; step: number }> = {
    '24h': { dur: 86400, step: 300 },
    '7d': { dur: 7 * 86400, step: 3600 },
    '30d': { dur: 30 * 86400, step: 3600 },
    '90d': { dur: 90 * 86400, step: 3600 * 6 },
  };
  const cfg = rangeMap[range] || rangeMap['24h'];
  const from = nowSec - cfg.dur;
  const db = getDb();

  const rows = db
    .prepare('SELECT * FROM node_health_samples WHERE node_id = ? AND ts >= ? ORDER BY ts ASC')
    .all(nodeId, from) as Array<Record<string, number>>;

  const points = rows.map((r) => ({
    t: Number(r.ts),
    up: Number(r.online ? 1 : 0),
    cpu: r.cpu ?? null,
    memUsed: r.mem_used ?? null,
    memTotal: r.mem_total ?? null,
    diskUsed: r.disk_used ?? null,
    diskTotal: r.disk_total ?? null,
    upload: Number(r.upload || 0),
    download: Number(r.download || 0),
    clients: Number(r.clients || 0),
  }));

  if (points.length === 0) {
    const node = db.prepare('SELECT is_local, status, cpu_pct, mem_pct, disk_pct FROM nodes WHERE id = ?').get(nodeId) as
      | { is_local: number; status: string; cpu_pct: number; mem_pct: number; disk_pct: number }
      | undefined;
    const local = readLocalHostMetrics();
    const memT = node?.is_local ? local.memTotal : 4 * 1024 ** 3;
    const diskT = node?.is_local ? local.diskTotal : 50 * 1024 ** 3;
    points.push({
      t: nowSec,
      up: node?.is_local || node?.status === 'connected' ? 1 : 0,
      cpu: node?.is_local ? local.cpu : Number(node?.cpu_pct || 0) / 100,
      memUsed: node?.is_local ? local.memUsed : Math.round((Number(node?.mem_pct || 0) / 100) * memT),
      memTotal: memT,
      diskUsed: node?.is_local ? local.diskUsed : Math.round((Number(node?.disk_pct || 0) / 100) * diskT),
      diskTotal: diskT,
      upload: 0,
      download: 0,
      clients: 0,
    });
  }

  return {
    range,
    from,
    to: nowSec,
    step: cfg.step,
    points,
    uptime: buildNodeUptimeSummary(nodeId, 90),
  };
}
