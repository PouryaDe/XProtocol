import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/database.js';
import { getAuthDir, getBinDir, getDaemonGateHookPaths } from '../drivers/pki.js';
import { isClientActiveQuota, parseOptionalMbps } from './peerResolver.js';

export interface GateClientPolicy {
  id: number;
  name: string;
  enabled: boolean;
  expiresAtMs: number | null;
  quotaExhausted: boolean;
  deviceLimit: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  allowedInbounds: string[];
}

export interface GateLiveSession {
  sessionId: string;
  clientId: number;
  clientNameLower: string;
  inboundName: string;
  protocol: string;
  isWireGuard: boolean;
  startedAtMs: number;
  lastActiveMs: number;
  reservedAtMs?: number;
}

export interface GateStateFile {
  updatedAtMs: number;
  clientsByNameLower: Record<string, GateClientPolicy>;
  liveSessions: Record<string, GateLiveSession>;
}

const wgSuppressedClients = new Set<number>();

/** Check whether a client's WireGuard peers are currently suppressed due to active non-WG sessions. */
export function isClientWgSuppressed(clientId: number): boolean {
  return wgSuppressedClients.has(clientId);
}

/** Set or clear WireGuard suppression for `clientId`; returns true if state changed. */
export function setClientWgSuppressed(clientId: number, suppressed: boolean): boolean {
  if (suppressed) {
    if (wgSuppressedClients.has(clientId)) return false;
    wgSuppressedClients.add(clientId);
    return true;
  }
  return wgSuppressedClients.delete(clientId);
}

/** Return all client IDs currently marked as suppressed for WireGuard. */
export function listWgSuppressedClients(): number[] {
  return [...wgSuppressedClients];
}

/** Resolve file paths for the atomic admission gate state and its lockfile. */
export function getGatePaths(): { statePath: string; lockPath: string } {
  const dir = getAuthDir();
  return {
    statePath: path.join(dir, 'gate-state.json'),
    lockPath: path.join(dir, 'gate-state.lock'),
  };
}

function acquireGateLock(lockPath: string, timeoutMs = 1500): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeSync(fd, `${process.pid}:${Date.now()}`);
      fs.closeSync(fd);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== 'EEXIST') return false;
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > 2500) {
          fs.rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        // lock released concurrently
      }
      const waitUntil = Date.now() + 15;
      while (Date.now() < waitUntil) {
        // brief spin sleep
      }
    }
  }
  return false;
}

function releaseGateLock(lockPath: string): void {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // ignore
  }
}

export function readGateState(): GateStateFile {
  const { statePath } = getGatePaths();
  try {
    if (fs.existsSync(statePath)) {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<GateStateFile>;
      return {
        updatedAtMs: Number(parsed.updatedAtMs || 0),
        clientsByNameLower: parsed.clientsByNameLower || {},
        liveSessions: parsed.liveSessions || {},
      };
    }
  } catch {
    // ignore corrupted file
  }
  return { updatedAtMs: 0, clientsByNameLower: {}, liveSessions: {} };
}

function writeGateStateAtomic(statePath: string, state: GateStateFile): void {
  const tmp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, statePath);
}

/**
 * Rebuild `gate-state.json` from SQLite while preserving freshly reserved (<12s) daemon hook sessions
 * that may not yet have appeared in daemon status files.
 */
export function syncGateStateFromDb(nowMs = Date.now()): GateStateFile {
  const db = getDb();
  const clients = db
    .prepare(
      `SELECT id, name, enabled, expires_at, traffic_limit_bytes, traffic_used_bytes,
              device_limit, download_mbps, upload_mbps
       FROM clients`,
    )
    .all() as Array<{
    id: number;
    name: string;
    enabled: number;
    expires_at: string | null;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
    device_limit: number | null;
    download_mbps: number | null;
    upload_mbps: number | null;
  }>;

  const groupSpeedRows = db
    .prepare(
      `SELECT cg.client_id, g.download_mbps, g.upload_mbps
       FROM client_groups cg
       JOIN groups g ON g.id = cg.group_id
       WHERE g.enabled = 1 AND (g.download_mbps IS NOT NULL OR g.upload_mbps IS NOT NULL)`,
    )
    .all() as Array<{ client_id: number; download_mbps: number | null; upload_mbps: number | null }>;

  const groupDlMin = new Map<number, number>();
  const groupUlMin = new Map<number, number>();
  for (const gs of groupSpeedRows) {
    if (gs.download_mbps && gs.download_mbps > 0) {
      const cur = groupDlMin.get(gs.client_id);
      if (cur === undefined || gs.download_mbps < cur) groupDlMin.set(gs.client_id, gs.download_mbps);
    }
    if (gs.upload_mbps && gs.upload_mbps > 0) {
      const cur = groupUlMin.get(gs.client_id);
      if (cur === undefined || gs.upload_mbps < cur) groupUlMin.set(gs.client_id, gs.upload_mbps);
    }
  }

  const allInbounds = db.prepare('SELECT id, name FROM inbounds WHERE enabled = 1').all() as Array<{
    id: number;
    name: string;
  }>;
  const inboundNameById = new Map(allInbounds.map((ib) => [ib.id, ib.name]));
  const allInboundNames = allInbounds.map((ib) => ib.name);

  const directRows = db.prepare('SELECT client_id, inbound_id FROM client_inbounds').all() as Array<{
    client_id: number;
    inbound_id: number;
  }>;
  const groupGrantRows = db
    .prepare(
      `SELECT cg.client_id, g.all_inbounds, gi.inbound_id
       FROM client_groups cg
       JOIN groups g ON g.id = cg.group_id AND g.enabled = 1
       LEFT JOIN group_inbounds gi ON gi.group_id = g.id`,
    )
    .all() as Array<{ client_id: number; all_inbounds: number; inbound_id: number | null }>;

  const allowedByClient = new Map<number, Set<string>>();
  for (const r of directRows) {
    const ibName = inboundNameById.get(r.inbound_id);
    if (!ibName) continue;
    const set = allowedByClient.get(r.client_id) || new Set<string>();
    set.add(ibName);
    allowedByClient.set(r.client_id, set);
  }
  for (const r of groupGrantRows) {
    const set = allowedByClient.get(r.client_id) || new Set<string>();
    if (r.all_inbounds) {
      for (const name of allInboundNames) set.add(name);
    } else if (r.inbound_id) {
      const ibName = inboundNameById.get(r.inbound_id);
      if (ibName) set.add(ibName);
    }
    allowedByClient.set(r.client_id, set);
  }

  const clientsByNameLower: Record<string, GateClientPolicy> = {};
  for (const c of clients) {
    const active = isClientActiveQuota(c, nowMs);
    const policy: GateClientPolicy = {
      id: c.id,
      name: c.name,
      enabled: Boolean(c.enabled),
      expiresAtMs: c.expires_at ? Date.parse(c.expires_at) || null : null,
      quotaExhausted: c.traffic_limit_bytes !== null && c.traffic_used_bytes >= c.traffic_limit_bytes,
      deviceLimit: c.device_limit,
      downloadMbps: parseOptionalMbps(c.download_mbps) ?? groupDlMin.get(c.id) ?? null,
      uploadMbps: parseOptionalMbps(c.upload_mbps) ?? groupUlMin.get(c.id) ?? null,
      allowedInbounds: active ? [...(allowedByClient.get(c.id) || [])] : [],
    };
    clientsByNameLower[c.name.toLowerCase()] = policy;
    const safeSanitized = c.name.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').toLowerCase();
    if (safeSanitized && !clientsByNameLower[safeSanitized]) {
      clientsByNameLower[safeSanitized] = policy;
    }
  }

  const liveRows = db
    .prepare(
      `SELECT l.id, l.client_id, c.name AS client_name, i.name AS inbound_name, i.protocol, l.connected_at
       FROM connections_live l
       JOIN clients c ON c.id = l.client_id
       JOIN inbounds i ON i.id = l.inbound_id`,
    )
    .all() as Array<{
    id: string;
    client_id: number;
    client_name: string;
    inbound_name: string;
    protocol: string;
    connected_at: string;
  }>;

  const { statePath, lockPath } = getGatePaths();
  const locked = acquireGateLock(lockPath, 1000);
  try {
    const prev = readGateState();
    const liveSessions: Record<string, GateLiveSession> = {};
    for (const r of liveRows) {
      const started = Date.parse(r.connected_at) || nowMs;
      liveSessions[r.id] = {
        sessionId: r.id,
        clientId: r.client_id,
        clientNameLower: r.client_name.toLowerCase(),
        inboundName: r.inbound_name,
        protocol: r.protocol,
        isWireGuard: r.protocol === 'wireguard' || r.protocol === 'amneziawg',
        startedAtMs: started,
        lastActiveMs: prev.liveSessions[r.id]?.lastActiveMs || nowMs,
      };
    }

    // Pair newly observed collector sessions against pending (<12s) hook reservations
    // so a single connection is never counted twice across `live` and `reserved`.
    const unpairedObservedByKey = new Map<string, number>();
    for (const r of liveRows) {
      const started = Date.parse(r.connected_at) || nowMs;
      if (nowMs - started < 15_000) {
        const pairKey = `${r.client_id}:${r.inbound_name}`;
        unpairedObservedByKey.set(pairKey, (unpairedObservedByKey.get(pairKey) || 0) + 1);
      }
    }

    for (const [sid, s] of Object.entries(prev.liveSessions)) {
      if (!liveSessions[sid] && s.reservedAtMs && nowMs - s.reservedAtMs < 12_000) {
        const pairKey = `${s.clientId}:${s.inboundName}`;
        const observedAvail = unpairedObservedByKey.get(pairKey) || 0;
        if (observedAvail > 0) {
          unpairedObservedByKey.set(pairKey, observedAvail - 1);
          continue;
        }
        const pol = Object.prototype.hasOwnProperty.call(clientsByNameLower, s.clientNameLower)
          ? clientsByNameLower[s.clientNameLower]
          : undefined;
        if (pol && pol.enabled && (!pol.expiresAtMs || pol.expiresAtMs > nowMs) && !pol.quotaExhausted) {
          liveSessions[sid] = s;
        }
      }
    }

    const nextState: GateStateFile = {
      updatedAtMs: nowMs,
      clientsByNameLower,
      liveSessions,
    };
    writeGateStateAtomic(statePath, nextState);
    return nextState;
  } finally {
    if (locked) releaseGateLock(lockPath);
  }
}

/**
 * Atomically admit or reject a VPN tunnel session at connect time against `gate-state.json`.
 * Rejects disabled, expired, quota-exhausted, ungranted-inbound, or over-device-limit logins.
 */
export function admitGateSession(params: {
  clientName: string;
  inboundName: string;
  protocol: string;
  sessionId: string;
  nowMs?: number;
}): { ok: boolean; reason?: string; downloadMbps: number | null; uploadMbps: number | null } {
  const nowMs = params.nowMs ?? Date.now();
  const { statePath, lockPath } = getGatePaths();
  const locked = acquireGateLock(lockPath, 1500);
  try {
    const state = readGateState();
    const key = params.clientName.trim().toLowerCase();
    const policy = Object.prototype.hasOwnProperty.call(state.clientsByNameLower, key)
      ? state.clientsByNameLower[key]
      : undefined;
    if (!policy) {
      return { ok: false, reason: 'unknown_client', downloadMbps: null, uploadMbps: null };
    }
    if (!policy.enabled) {
      return { ok: false, reason: 'disabled', downloadMbps: null, uploadMbps: null };
    }
    if (policy.expiresAtMs !== null && policy.expiresAtMs <= nowMs) {
      return { ok: false, reason: 'expired', downloadMbps: null, uploadMbps: null };
    }
    if (policy.quotaExhausted) {
      return { ok: false, reason: 'quota_exhausted', downloadMbps: null, uploadMbps: null };
    }
    if (params.inboundName && !policy.allowedInbounds.includes(params.inboundName)) {
      return { ok: false, reason: 'inbound_not_granted', downloadMbps: null, uploadMbps: null };
    }

    // Reap stale reservations (>120s unconfirmed) and stale WG sessions (>45s) when checking capacity
    const activeEntries = Object.entries(state.liveSessions).filter(([, s]) => {
      if (s.clientId !== policy.id && s.clientNameLower !== key) return false;
      if (s.reservedAtMs && nowMs - s.reservedAtMs > 120_000) return false;
      return true;
    });

    const limit = policy.deviceLimit;
    if (limit !== null && limit > 0 && !state.liveSessions[params.sessionId]) {
      const freshSessions = activeEntries.filter(([, s]) => !(s.isWireGuard && nowMs - s.lastActiveMs > 45_000));
      if (freshSessions.length >= limit) {
        return { ok: false, reason: 'device_limit', downloadMbps: null, uploadMbps: null };
      }
      // Drop stale WG entries from gate state so the slot cleanly hands off
      if (activeEntries.length > freshSessions.length) {
        for (const [sid, s] of activeEntries) {
          if (s.isWireGuard && nowMs - s.lastActiveMs > 45_000) {
            delete state.liveSessions[sid];
          }
        }
      }
    }

    state.liveSessions[params.sessionId] = {
      sessionId: params.sessionId,
      clientId: policy.id,
      clientNameLower: policy.name.toLowerCase(),
      inboundName: params.inboundName,
      protocol: params.protocol,
      isWireGuard: false,
      startedAtMs: nowMs,
      lastActiveMs: nowMs,
      reservedAtMs: nowMs,
    };
    state.updatedAtMs = nowMs;
    writeGateStateAtomic(statePath, state);
    return { ok: true, downloadMbps: policy.downloadMbps, uploadMbps: policy.uploadMbps };
  } finally {
    if (locked) releaseGateLock(lockPath);
  }
}

/** Release a session reservation (or matching live session) from `gate-state.json`. */
export function releaseGateSession(
  sessionId: string,
  fallbackMatch?: { clientName?: string; inboundName?: string; protocol?: string },
): void {
  const { statePath, lockPath } = getGatePaths();
  const locked = acquireGateLock(lockPath, 1000);
  try {
    const state = readGateState();
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(state.liveSessions, sessionId)) {
      delete state.liveSessions[sessionId];
      changed = true;
    } else if (fallbackMatch?.clientName) {
      const lower = fallbackMatch.clientName.trim().toLowerCase();
      for (const [sid, s] of Object.entries(state.liveSessions)) {
        if (
          s.clientNameLower === lower &&
          (!fallbackMatch.inboundName || s.inboundName === fallbackMatch.inboundName) &&
          (!fallbackMatch.protocol || s.protocol === fallbackMatch.protocol)
        ) {
          delete state.liveSessions[sid];
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      state.updatedAtMs = Date.now();
      writeGateStateAtomic(statePath, state);
    }
  } finally {
    if (locked) releaseGateLock(lockPath);
  }
}

/**
 * Write the standalone `xp-gate.mjs` helper script used by OpenVPN (`client-connect`/`client-disconnect`),
 * OpenConnect (`connect-script`/`disconnect-script`), L2TP (`ip-pre-up`/`ip-up`/`ip-down`),
 * and strongSwan IKEv2 (`updown`) on Ubuntu Linux.
 */
export function ensureSessionGateScript(): string {
  const { statePath, lockPath } = getGatePaths();
  const binDir = getBinDir();
  const scriptPath = path.join(binDir, 'xp-gate.mjs');
  const script = `#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATE_PATH = ${JSON.stringify(statePath)};
const LOCK_PATH = ${JSON.stringify(lockPath)};
const mode = process.argv[2] || '';
const argInbound = process.argv[3] || '';

function acquireLock() {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx', 0o600);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e && e.code !== 'EEXIST') return false;
      try {
        const st = fs.statSync(LOCK_PATH);
        if (Date.now() - st.mtimeMs > 2500) {
          fs.rmSync(LOCK_PATH, { force: true });
          continue;
        }
      } catch {}
      const until = Date.now() + 15;
      while (Date.now() < until) {}
    }
  }
  return false;
}

function releaseLock() {
  try { fs.rmSync(LOCK_PATH, { force: true }); } catch {}
}

function readState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const p = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      return { updatedAtMs: Number(p.updatedAtMs || 0), clientsByNameLower: p.clientsByNameLower || {}, liveSessions: p.liveSessions || {} };
    }
  } catch {}
  return null;
}

function writeState(st) {
  const tmp = STATE_PATH + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(st), { mode: 0o600 });
  fs.renameSync(tmp, STATE_PATH);
}

function applyDedicatedTc(dev, dlMbps, ulMbps) {
  if (process.platform !== 'linux' || !dev) return;
  const calc = (m) => {
    const kbps = Math.max(100, Math.round(m * 1000));
    const burst = Math.max(16384, Math.round((kbps * 1024) / 8));
    return { rate: kbps + 'kbit', burst: String(burst) };
  };
  try {
    if (dlMbps && dlMbps > 0) {
      const { rate, burst } = calc(dlMbps);
      execFileSync('tc', ['qdisc', 'replace', 'dev', dev, 'root', 'tbf', 'rate', rate, 'burst', burst, 'latency', '100ms'], { timeout: 3000 });
    } else {
      try { execFileSync('tc', ['qdisc', 'del', 'dev', dev, 'root'], { timeout: 3000 }); } catch {}
    }
    try { execFileSync('tc', ['qdisc', 'del', 'dev', dev, 'ingress'], { timeout: 3000 }); } catch {}
    if (ulMbps && ulMbps > 0) {
      const { rate, burst } = calc(ulMbps);
      execFileSync('tc', ['qdisc', 'add', 'dev', dev, 'handle', 'ffff:', 'ingress'], { timeout: 3000 });
      execFileSync('tc', ['filter', 'replace', 'dev', dev, 'parent', 'ffff:', 'protocol', 'all', 'prio', '1', 'u32', 'match', 'u32', '0', '0', 'police', 'rate', rate, 'burst', burst, 'drop', 'flowid', ':1'], { timeout: 3000 });
    }
  } catch {}
}

function admit(clientName, inboundName, protocol, sessionId, devForTc) {
  if (!clientName) process.exit(1);
  const locked = acquireLock();
  try {
    const state = readState();
    if (!state) return; // allow if state file not yet initialized
    const now = Date.now();
    const key = clientName.trim().toLowerCase();
    const pol = Object.prototype.hasOwnProperty.call(state.clientsByNameLower, key)
      ? state.clientsByNameLower[key]
      : null;
    if (!pol || !pol.enabled) process.exit(1);
    if (pol.expiresAtMs !== null && pol.expiresAtMs <= now) process.exit(1);
    if (pol.quotaExhausted) process.exit(1);
    if (inboundName && Array.isArray(pol.allowedInbounds) && !pol.allowedInbounds.includes(inboundName)) process.exit(1);

    const active = Object.entries(state.liveSessions).filter(([, s]) => {
      if (s.clientId !== pol.id && s.clientNameLower !== key) return false;
      if (s.reservedAtMs && now - s.reservedAtMs > 120000) return false;
      return true;
    });
    const limit = pol.deviceLimit;
    if (limit !== null && limit > 0 && !Object.prototype.hasOwnProperty.call(state.liveSessions, sessionId)) {
      const fresh = active.filter(([, s]) => !(s.isWireGuard && now - s.lastActiveMs > 45000));
      if (fresh.length >= limit) process.exit(1);
      for (const [sid, s] of active) {
        if (s.isWireGuard && now - s.lastActiveMs > 45000) delete state.liveSessions[sid];
      }
    }
    state.liveSessions[sessionId] = {
      sessionId,
      clientId: pol.id,
      clientNameLower: String(pol.name).toLowerCase(),
      inboundName,
      protocol,
      isWireGuard: false,
      startedAtMs: now,
      lastActiveMs: now,
      reservedAtMs: now,
    };
    state.updatedAtMs = now;
    writeState(state);
    if (devForTc && (pol.downloadMbps || pol.uploadMbps)) {
      applyDedicatedTc(devForTc, pol.downloadMbps, pol.uploadMbps);
    }
  } finally {
    if (locked) releaseLock();
  }
}

function release(sessionId, fallbackUser, fallbackInbound, fallbackProtocol) {
  const locked = acquireLock();
  try {
    const state = readState();
    if (!state) return;
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(state.liveSessions, sessionId)) {
      delete state.liveSessions[sessionId];
      changed = true;
    } else if (fallbackUser) {
      const key = fallbackUser.trim().toLowerCase();
      for (const [sid, s] of Object.entries(state.liveSessions)) {
        if (
          s.clientNameLower === key &&
          (!fallbackInbound || s.inboundName === fallbackInbound) &&
          (!fallbackProtocol || s.protocol === fallbackProtocol)
        ) {
          delete state.liveSessions[sid];
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      state.updatedAtMs = Date.now();
      writeState(state);
    }
  } finally {
    if (locked) releaseLock();
  }
}

if (mode === 'openvpn-connect') {
  const user = (process.env.username || process.env.common_name || '').trim();
  const sid = 'ovpn-hook-' + (argInbound || 'default') + '-' + (process.env.untrusted_ip || '0') + ':' + (process.env.untrusted_port || '0');
  admit(user, argInbound, 'openvpn', sid, '');
} else if (mode === 'openvpn-disconnect') {
  const user = (process.env.username || process.env.common_name || '').trim();
  const sid = 'ovpn-hook-' + (argInbound || 'default') + '-' + (process.env.untrusted_ip || '0') + ':' + (process.env.untrusted_port || '0');
  release(sid, user, argInbound, 'openvpn');
} else if (mode === 'ocserv') {
  const reason = (process.env.REASON || '').trim();
  const user = (process.env.USERNAME || '').trim();
  const id = (process.env.ID || user || '').trim();
  const dev = (process.env.DEVICE || '').trim();
  const sid = 'oc-hook-' + (argInbound || 'default') + '-' + id;
  if (reason === 'disconnect') release(sid, user, argInbound, 'openconnect');
  else admit(user, argInbound, 'openconnect', sid, dev);
} else if (mode === 'ppp-pre-up') {
  const iface = process.argv[3] || process.env.IFNAME || '';
  const inbound = process.argv[4] || process.env.IPPARAM || '';
  const user = (process.env.PEERNAME || '').trim();
  if (user) admit(user, inbound, 'l2tp', 'l2tp-hook-' + iface, '');
} else if (mode === 'ppp-up') {
  const iface = process.argv[3] || process.env.IFNAME || '';
  const user = (process.env.PEERNAME || '').trim();
  const st = readState();
  const key = user ? user.toLowerCase() : '';
  const pol = st && key && Object.prototype.hasOwnProperty.call(st.clientsByNameLower, key) ? st.clientsByNameLower[key] : null;
  if (pol && (pol.downloadMbps || pol.uploadMbps)) applyDedicatedTc(iface, pol.downloadMbps, pol.uploadMbps);
} else if (mode === 'ppp-down') {
  const iface = process.argv[3] || process.env.IFNAME || '';
  const user = (process.env.PEERNAME || '').trim();
  const inbound = process.argv[4] || process.env.IPPARAM || '';
  release('l2tp-hook-' + iface, user, inbound, 'l2tp');
} else if (mode === 'ikev2') {
  const verb = (process.env.PLUTO_VERB || '').trim();
  const conn = (process.env.PLUTO_CONNECTION || '').trim();
  const uid = (process.env.PLUTO_UNIQUEID || '').trim();
  const user = (process.env.PLUTO_XAUTH_ID || process.env.PLUTO_PEER_ID || '').trim();
  const sid = 'ikev2-hook-' + conn + '-' + uid;
  if (verb === 'down-client' || verb === 'down-host') {
    release(sid, user, conn, 'ikev2');
  } else if (verb === 'up-client' || verb === 'up-host') {
    const st = readState();
    const key = user ? user.toLowerCase() : '';
    // Only enforce if PLUTO identity maps to a known panel client (e.g. EAP/Remote ID)
    if (st && key && Object.prototype.hasOwnProperty.call(st.clientsByNameLower, key)) {
      admit(user, conn, 'ikev2', sid, '');
    }
  }
}
process.exit(0);
`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

export { getDaemonGateHookPaths };

export function ensureDaemonGateHooks(inboundName: string): ReturnType<typeof getDaemonGateHookPaths> {
  const gateScript = ensureSessionGateScript();
  const paths = getDaemonGateHookPaths(inboundName);
  const safeName = inboundName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nodeBin = process.execPath;

  fs.writeFileSync(
    paths.ovpnConnectPath,
    `#!/bin/sh\nexec ${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} openvpn-connect ${JSON.stringify(safeName)}\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    paths.ovpnDisconnectPath,
    `#!/bin/sh\nexec ${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} openvpn-disconnect ${JSON.stringify(safeName)}\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    paths.ocservHookPath,
    `#!/bin/sh\nexec ${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} ocserv ${JSON.stringify(safeName)}\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    paths.ikev2UpdownPath,
    `#!/bin/sh\nexec ${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} ikev2\n`,
    { mode: 0o755 },
  );
  return paths;
}
