import { getDb } from '../db/database.js';
import type { PeerEntry } from '../generators/configs.js';
import { generateWireGuardKeypair } from '../security/auth.js';

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

const MAX_WG_DEVICE_SLOTS = 10;

/**
 * Ensure `client_device_slots` contains WireGuard keypairs for slots `2..min(deviceLimit, 10)`.
 * Slot 1 always remains the client's primary `clients.wg_private_key` / `wg_public_key`.
 */
export function ensureClientDeviceSlots(
  clientId: number,
  deviceLimit: number | null | undefined,
): Array<{ slotIndex: number; wgPrivateKey: string; wgPublicKey: string }> {
  const db = getDb();
  const primary = db
    .prepare('SELECT wg_private_key, wg_public_key FROM clients WHERE id = ?')
    .get(clientId) as { wg_private_key: string; wg_public_key: string } | undefined;
  if (!primary) return [];

  const result: Array<{ slotIndex: number; wgPrivateKey: string; wgPublicKey: string }> = [
    { slotIndex: 1, wgPrivateKey: primary.wg_private_key, wgPublicKey: primary.wg_public_key },
  ];
  const targetSlots = deviceLimit && deviceLimit > 1 ? Math.min(MAX_WG_DEVICE_SLOTS, Math.trunc(deviceLimit)) : 1;
  if (targetSlots <= 1) return result;

  const existingRows = db
    .prepare('SELECT slot_index, wg_private_key, wg_public_key FROM client_device_slots WHERE client_id = ? ORDER BY slot_index ASC')
    .all(clientId) as Array<{ slot_index: number; wg_private_key: string; wg_public_key: string }>;
  const bySlot = new Map(existingRows.map((r) => [r.slot_index, r]));
  const now = new Date().toISOString();

  for (let slot = 2; slot <= targetSlots; slot += 1) {
    let row = bySlot.get(slot);
    if (!row) {
      const kp = generateWireGuardKeypair();
      db.prepare(
        `INSERT OR IGNORE INTO client_device_slots (client_id, slot_index, wg_private_key, wg_public_key, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(clientId, slot, kp.privateKey, kp.publicKey, now);
      row = db
        .prepare('SELECT slot_index, wg_private_key, wg_public_key FROM client_device_slots WHERE client_id = ? AND slot_index = ?')
        .get(clientId, slot) as { slot_index: number; wg_private_key: string; wg_public_key: string };
    }
    if (row) {
      result.push({ slotIndex: row.slot_index, wgPrivateKey: row.wg_private_key, wgPublicKey: row.wg_public_key });
    }
  }
  return result;
}

/** Build a lookup map from every WireGuard public key (primary + device slots) to its client name. */
export function getAllClientWgKeyMap(): Map<string, string> {
  const db = getDb();
  const map = new Map<string, string>();
  const primaryRows = db.prepare('SELECT name, wg_public_key FROM clients').all() as Array<{ name: string; wg_public_key: string }>;
  for (const r of primaryRows) {
    if (r.wg_public_key) map.set(r.wg_public_key, r.name);
  }
  const slotRows = db
    .prepare(
      `SELECT c.name, s.wg_public_key
       FROM client_device_slots s
       JOIN clients c ON c.id = s.client_id`,
    )
    .all() as Array<{ name: string; wg_public_key: string }>;
  for (const r of slotRows) {
    if (r.wg_public_key) map.set(r.wg_public_key, r.name);
  }
  return map;
}

/**
 * Resolve all peers permitted to connect to `inboundId` right now.
 * Enforces client enablement, expiry, traffic quota, direct/group inbound grants,
 * and computes effective download/upload speed caps (client override or tightest active group limit).
 */
export function getEligiblePeersForInbound(inboundId: number, subnet: string): PeerEntry[] {
  const db = getDb();
  const nowMs = Date.now();
  const inboundRow = db.prepare('SELECT protocol FROM inbounds WHERE id = ?').get(inboundId) as { protocol: string } | undefined;
  const isWgInbound = inboundRow?.protocol === 'wireguard' || inboundRow?.protocol === 'amneziawg';

  const clientRows = db
    .prepare(
      `SELECT DISTINCT c.id, c.name, c.wg_public_key, c.vpn_password, c.xray_uuid, c.ss_password, c.fixed_ip,
              c.enabled, c.expires_at, c.traffic_limit_bytes, c.traffic_used_bytes,
              c.download_mbps, c.upload_mbps, c.device_limit
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
    xray_uuid: string;
    ss_password: string;
    fixed_ip: string;
    enabled: number;
    expires_at: string | null;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
    download_mbps: number | null;
    upload_mbps: number | null;
    device_limit: number | null;
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
  const activeClients: Array<(typeof clientRows)[number] & { dl: number | null; ul: number | null }> = [];

  for (const c of clientRows) {
    if (!isClientActiveQuota(c, nowMs)) continue;
    const dl = c.download_mbps ?? minPositive(groupDlMap.get(c.id) || []);
    const ul = c.upload_mbps ?? minPositive(groupUlMap.get(c.id) || []);
    activeClients.push({ ...c, dl, ul });
    const tunnelIp = allocateTunnelIp(subnet, c.id, c.fixed_ip || '', usedIps);
    peers.push({
      clientId: c.id,
      name: c.name,
      wgPublicKey: c.wg_public_key,
      vpnPassword: c.vpn_password,
      xrayUuid: c.xray_uuid,
      ssPassword: c.ss_password,
      tunnelIp,
      downloadMbps: dl,
      uploadMbps: ul,
      deviceLimit: c.device_limit,
      slotIndex: 1,
    });
  }

  // Pass 2: allocate secondary WireGuard/AmneziaWG device slots after all slot-1 IPs are fixed
  if (isWgInbound) {
    for (const c of activeClients) {
      if (!c.device_limit || c.device_limit <= 1) continue;
      const slots = ensureClientDeviceSlots(c.id, c.device_limit);
      for (const s of slots) {
        if (s.slotIndex <= 1) continue;
        const slotIp = allocateTunnelIp(subnet, c.id * 100 + s.slotIndex, '', usedIps);
        peers.push({
          clientId: c.id,
          name: c.name,
          wgPublicKey: s.wgPublicKey,
          vpnPassword: c.vpn_password,
          xrayUuid: c.xray_uuid,
          ssPassword: c.ss_password,
          tunnelIp: slotIp,
          downloadMbps: c.dl,
          uploadMbps: c.ul,
          deviceLimit: c.device_limit,
          slotIndex: s.slotIndex,
        });
      }
    }
  }

  return peers;
}

/**
 * Resolve a single client's assigned tunnel IP within `inboundId` consistent with server peer allocation.
 */
export function resolveClientTunnelIp(
  inboundId: number,
  subnet: string,
  clientId: number,
  fixedIp = '',
  slotIndex = 1,
): string {
  const peers = getEligiblePeersForInbound(inboundId, subnet);
  const found = peers.find((p) => p.clientId === clientId && (p.slotIndex ?? 1) === slotIndex);
  if (found) return found.tunnelIp;
  const seed = slotIndex > 1 ? clientId * 100 + slotIndex : clientId;
  return allocateTunnelIp(subnet, seed, slotIndex === 1 ? fixedIp : '', new Set<string>(peers.map((p) => p.tunnelIp)));
}
