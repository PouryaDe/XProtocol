import { getDb } from '../db/database.js';
import type { PeerEntry } from '../generators/configs.js';

export interface ParsedCidr {
  baseInt: number;
  maskInt: number;
  netmask: string;
  networkIp: string;
  gatewayIp: string;
  broadcastInt: number;
  prefix: number;
  totalHosts: number;
}

/** Parse optional positive bandwidth cap in Mbps; empty or <=0 means unlimited (`null`). */
export function parseOptionalMbps(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Convert a dotted-quad IPv4 string into an unsigned 32-bit integer, or 0 if malformed. */
export function ipToInt(ip: string): number {
  const parts = ip.trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return 0;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

/** Format an unsigned 32-bit integer into dotted-quad IPv4 notation. */
export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Parse an IPv4 CIDR block (/16../30), computing network address, mask, gateway (.1), and usable capacity. */
export function parseCidr(subnet: string): ParsedCidr {
  const [rawIp, rawPrefix] = (subnet || '10.66.0.0/24').split('/');
  const parsedPrefix = Number(rawPrefix);
  const prefix = Number.isFinite(parsedPrefix) ? Math.min(30, Math.max(16, Math.trunc(parsedPrefix))) : 24;
  const maskInt = (0xffffffff << (32 - prefix)) >>> 0;
  const ipInt = ipToInt(rawIp) || ipToInt('10.66.0.0');
  const baseInt = (ipInt & maskInt) >>> 0;
  const hostSpace = (1 << (32 - prefix)) >>> 0;
  const broadcastInt = (baseInt + hostSpace - 1) >>> 0;
  return {
    baseInt,
    maskInt,
    netmask: intToIp(maskInt),
    networkIp: intToIp(baseInt),
    gatewayIp: intToIp((baseInt + 1) >>> 0),
    broadcastInt,
    prefix,
    totalHosts: Math.max(1, hostSpace - 3),
  };
}

/**
 * Allocate a deterministic, collision-free client tunnel IP within `subnet`.
 * Honors `fixedIp` only if it lies within usable host addresses (> .1 and < broadcast).
 */
export function allocateTunnelIp(
  subnet: string,
  clientId: number,
  fixedIp: string,
  usedIps: Set<string>,
): string {
  const cidr = parseCidr(subnet);
  if (fixedIp) {
    const fixedInt = ipToInt(fixedIp);
    if (
      fixedInt !== 0 &&
      (fixedInt & cidr.maskInt) >>> 0 === cidr.baseInt &&
      fixedInt > cidr.baseInt + 1 &&
      fixedInt < cidr.broadcastInt &&
      !usedIps.has(fixedIp)
    ) {
      usedIps.add(fixedIp);
      return fixedIp;
    }
  }
  const maxOffset = Math.max(2, cidr.broadcastInt - cidr.baseInt - 1);
  const slotSpan = Math.max(1, maxOffset - 1);
  let offset = (Math.abs(clientId) % slotSpan) + 2;
  for (let probe = 0; probe < slotSpan; probe++) {
    const candidate = intToIp((cidr.baseInt + offset) >>> 0);
    if (!usedIps.has(candidate)) {
      usedIps.add(candidate);
      return candidate;
    }
    offset = offset + 1 > maxOffset ? 2 : offset + 1;
  }
  return intToIp((cidr.baseInt + 2) >>> 0);
}

/** Determine whether a client is enabled and within both expiry and traffic quota. */
export function isClientActiveQuota(
  row: {
    enabled: number | boolean;
    expires_at: string | null;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
  },
  nowMs = Date.now(),
): boolean {
  if (!row.enabled) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) return false;
  if (row.traffic_limit_bytes !== null && row.traffic_used_bytes >= row.traffic_limit_bytes) return false;
  return true;
}

function minPositive(values: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      best = best === null ? v : Math.min(best, v);
    }
  }
  return best;
}

/**
 * Resolve all peers permitted to connect to `inboundId` right now.
 * Enforces client enablement, expiry, traffic quota, direct/group inbound grants,
 * and computes effective download/upload speed caps (client override or tightest active group limit).
 */
export function getEligiblePeersForInbound(inboundId: number, subnet: string): PeerEntry[] {
  const db = getDb();
  const nowMs = Date.now();

  const clientRows = db
    .prepare(
      `SELECT DISTINCT c.id, c.name, c.wg_public_key, c.vpn_password, c.fixed_ip,
              c.enabled, c.expires_at, c.traffic_limit_bytes, c.traffic_used_bytes,
              c.download_mbps, c.upload_mbps
       FROM clients c
       LEFT JOIN client_inbounds ci ON ci.client_id = c.id AND ci.inbound_id = ?
       LEFT JOIN client_groups cg ON cg.client_id = c.id
       LEFT JOIN groups g ON g.id = cg.group_id AND g.enabled = 1
       LEFT JOIN group_inbounds gi ON gi.group_id = g.id AND gi.inbound_id = ?
       WHERE c.enabled = 1
         AND (ci.inbound_id IS NOT NULL OR g.all_inbounds = 1 OR gi.inbound_id IS NOT NULL)
       ORDER BY c.id ASC`,
    )
    .all(inboundId, inboundId) as Array<{
    id: number;
    name: string;
    wg_public_key: string;
    vpn_password: string;
    fixed_ip: string;
    enabled: number;
    expires_at: string | null;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
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

  const groupDlMap = new Map<number, number[]>();
  const groupUlMap = new Map<number, number[]>();
  for (const gs of groupSpeedRows) {
    if (gs.download_mbps) {
      const arr = groupDlMap.get(gs.client_id) || [];
      arr.push(gs.download_mbps);
      groupDlMap.set(gs.client_id, arr);
    }
    if (gs.upload_mbps) {
      const arr = groupUlMap.get(gs.client_id) || [];
      arr.push(gs.upload_mbps);
      groupUlMap.set(gs.client_id, arr);
    }
  }

  const usedIps = new Set<string>();
  const peers: PeerEntry[] = [];

  for (const c of clientRows) {
    if (!isClientActiveQuota(c, nowMs)) continue;
    const tunnelIp = allocateTunnelIp(subnet, c.id, c.fixed_ip || '', usedIps);
    peers.push({
      clientId: c.id,
      name: c.name,
      wgPublicKey: c.wg_public_key,
      vpnPassword: c.vpn_password,
      tunnelIp,
      downloadMbps: c.download_mbps ?? minPositive(groupDlMap.get(c.id) || []),
      uploadMbps: c.upload_mbps ?? minPositive(groupUlMap.get(c.id) || []),
    });
  }

  return peers;
}

/**
 * Resolve a single client's assigned tunnel IP within `inboundId` consistent with server peer allocation.
 */
export function resolveClientTunnelIp(inboundId: number, subnet: string, clientId: number, fixedIp = ''): string {
  const peers = getEligiblePeersForInbound(inboundId, subnet);
  const found = peers.find((p) => p.clientId === clientId);
  if (found) return found.tunnelIp;
  return allocateTunnelIp(subnet, clientId, fixedIp, new Set<string>(peers.map((p) => p.tunnelIp)));
}
