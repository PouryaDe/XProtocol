import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { generateRealityKeypair, generateShortId, generateSs2022Key } from '../security/auth.js';
import { getEligiblePeersForInbound } from '../services/peerResolver.js';
import {
  renderXrayRoutingConfig,
  type InboundRow,
  type InboundRouteOverride,
  type PeerEntry,
  type RoutingRule,
} from '../generators/configs.js';

const execFileAsync = promisify(execFile);

export type XrayProtocol = 'vless' | 'vmess' | 'trojan' | 'shadowsocks';
export type XrayTransport = 'raw' | 'ws' | 'httpupgrade' | 'xhttp' | 'grpc' | 'kcp';
export type XraySecurity = 'none' | 'tls' | 'reality';
export type XrayPresetId = 'direct' | 'cdn' | 'relay' | 'vmess-classic' | 'trojan' | 'shadowsocks' | 'manual';

export interface XrayPreset {
  id: XrayPresetId;
  titleEn: string;
  titleFa: string;
  summaryEn: string;
  summaryFa: string;
  needs: string[];
  recommended?: boolean;
}

export interface XrayCombo {
  protocol: XrayProtocol;
  transport: XrayTransport;
  security: XraySecurity;
  flows: string[];
  headers: string[];
  modes: string[];
  proxyProtocol: boolean;
  xff: boolean;
  fallbacks: boolean;
  deprecated: string[];
}

export interface XraySniResult {
  domain: string;
  tag: string;
  grade: 'green' | 'yellow' | 'red';
  reasons: string[];
  tcpMs: number;
  tlsMs: number;
  checkedAt: number;
}

export interface XrayServerView {
  key: string;
  name: string;
  instanceId: number;
  instance: string;
  node: string;
  label: string;
  host: string;
  port: number;
  protocol: XrayProtocol;
  transport: XrayTransport;
  security: XraySecurity;
  id: string;
  params: Record<string, string>;
  links: string[];
}

export const XRAY_PRESETS: XrayPreset[] = [
  {
    id: 'direct',
    titleEn: 'Direct connection',
    titleFa: 'اتصال مستقیم',
    summaryEn: 'VLESS + Reality over TCP with Vision flow and automatic camouflage SNI.',
    summaryFa: 'VLESS + Reality روی TCP با جریان Vision و انتخاب خودکار دامنه استتار.',
    needs: [],
    recommended: true,
  },
  {
    id: 'cdn',
    titleEn: 'Behind a CDN (Cloudflare)',
    titleFa: 'پشت CDN (کلادفلر)',
    summaryEn: 'VLESS over WebSocket + TLS for domains proxied through Cloudflare.',
    summaryFa: 'VLESS روی WebSocket و TLS برای دامنه‌های پشت ابر کلادفلر.',
    needs: ['cdnHost', 'certFile', 'keyFile'],
  },
  {
    id: 'relay',
    titleEn: 'Behind a relay or tunnel server',
    titleFa: 'پشت سرور رله یا تانل',
    summaryEn: 'VLESS over TCP with PROXY protocol enabled and firewall restricted to relay IPs.',
    summaryFa: 'VLESS روی TCP با پروتکل PROXY و محدودیت فایروال به آی‌پی سرورهای رله.',
    needs: ['relayIPs'],
  },
  {
    id: 'vmess-classic',
    titleEn: 'Classic VMess',
    titleFa: 'VMess کلاسیک',
    summaryEn: 'VMess over TCP with HTTP header obfuscation for legacy compatibility.',
    summaryFa: 'VMess روی TCP با هدر HTTP برای سازگاری با کلاینت‌های قدیمی.',
    needs: [],
  },
  {
    id: 'trojan',
    titleEn: 'Trojan',
    titleFa: 'تروجان (Trojan)',
    summaryEn: 'Trojan over TCP with TLS or Reality.',
    summaryFa: 'پروتکل Trojan روی TCP با رمزنگاری TLS یا Reality.',
    needs: [],
  },
  {
    id: 'shadowsocks',
    titleEn: 'Shadowsocks',
    titleFa: 'شادوساکس (Shadowsocks)',
    summaryEn: 'Shadowsocks 2022 AEAD with per-client keys.',
    summaryFa: 'شادوساکس ۲۰۲۲ با کلید اختصاصی برای هر کاربر.',
    needs: [],
  },
  {
    id: 'manual',
    titleEn: 'Manual (advanced)',
    titleFa: 'تنظیم دستی (پیشرفته)',
    summaryEn: 'Full control over protocol, transport, security, sniffing, and fallbacks.',
    summaryFa: 'کنترل کامل روی پروتکل، ترنسپورت، امنیت، اسنیفینگ و فال‌بک‌ها.',
    needs: [],
  },
];

export const KCP_HEADERS = ['none', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard'];
export const XHTTP_MODES = ['auto', 'packet-up', 'stream-up'];
export const SS_METHODS = [
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  'aes-128-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
];

export const XRAY_COMBOS: XrayCombo[] = [
  // VLESS
  { protocol: 'vless', transport: 'raw', security: 'reality', flows: ['', 'xtls-rprx-vision'], headers: ['none', 'http'], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: [] },
  { protocol: 'vless', transport: 'raw', security: 'tls', flows: ['', 'xtls-rprx-vision'], headers: ['none', 'http'], modes: [], proxyProtocol: true, xff: false, fallbacks: true, deprecated: [] },
  { protocol: 'vless', transport: 'raw', security: 'none', flows: [''], headers: ['none', 'http'], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: [] },
  { protocol: 'vless', transport: 'xhttp', security: 'reality', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: [] },
  { protocol: 'vless', transport: 'xhttp', security: 'tls', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: [] },
  { protocol: 'vless', transport: 'xhttp', security: 'none', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: [] },
  { protocol: 'vless', transport: 'ws', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['ws'] },
  { protocol: 'vless', transport: 'ws', security: 'none', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['ws'] },
  { protocol: 'vless', transport: 'httpupgrade', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['httpupgrade'] },
  { protocol: 'vless', transport: 'httpupgrade', security: 'none', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['httpupgrade'] },
  { protocol: 'vless', transport: 'grpc', security: 'reality', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['grpc'] },
  { protocol: 'vless', transport: 'grpc', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['grpc'] },
  { protocol: 'vless', transport: 'grpc', security: 'none', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['grpc'] },
  { protocol: 'vless', transport: 'kcp', security: 'none', flows: [''], headers: KCP_HEADERS, modes: [], proxyProtocol: false, xff: false, fallbacks: false, deprecated: [] },

  // VMess
  { protocol: 'vmess', transport: 'raw', security: 'none', flows: [''], headers: ['none', 'http'], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['vmess'] },
  { protocol: 'vmess', transport: 'raw', security: 'tls', flows: [''], headers: ['none', 'http'], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['vmess'] },
  { protocol: 'vmess', transport: 'ws', security: 'none', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess', 'ws'] },
  { protocol: 'vmess', transport: 'ws', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess', 'ws'] },
  { protocol: 'vmess', transport: 'httpupgrade', security: 'none', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess', 'httpupgrade'] },
  { protocol: 'vmess', transport: 'httpupgrade', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess', 'httpupgrade'] },
  { protocol: 'vmess', transport: 'xhttp', security: 'none', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess'] },
  { protocol: 'vmess', transport: 'xhttp', security: 'tls', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['vmess'] },
  { protocol: 'vmess', transport: 'grpc', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['vmess', 'grpc'] },
  { protocol: 'vmess', transport: 'kcp', security: 'none', flows: [''], headers: KCP_HEADERS, modes: [], proxyProtocol: false, xff: false, fallbacks: false, deprecated: ['vmess'] },

  // Trojan
  { protocol: 'trojan', transport: 'raw', security: 'tls', flows: [''], headers: ['none'], modes: [], proxyProtocol: true, xff: false, fallbacks: true, deprecated: ['trojan'] },
  { protocol: 'trojan', transport: 'raw', security: 'reality', flows: [''], headers: ['none'], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['trojan'] },
  { protocol: 'trojan', transport: 'ws', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['trojan', 'ws'] },
  { protocol: 'trojan', transport: 'httpupgrade', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['trojan', 'httpupgrade'] },
  { protocol: 'trojan', transport: 'xhttp', security: 'tls', flows: [''], headers: [], modes: XHTTP_MODES, proxyProtocol: true, xff: true, fallbacks: false, deprecated: ['trojan'] },
  { protocol: 'trojan', transport: 'grpc', security: 'tls', flows: [''], headers: [], modes: [], proxyProtocol: true, xff: false, fallbacks: false, deprecated: ['trojan', 'grpc'] },

  // Shadowsocks
  { protocol: 'shadowsocks', transport: 'raw', security: 'none', flows: [''], headers: ['none'], modes: [], proxyProtocol: false, xff: false, fallbacks: false, deprecated: ['shadowsocks'] },
];

export const CURATED_SNI_DOMAINS: Array<{ domain: string; tag: string }> = [
  { domain: 'www.microsoft.com', tag: 'azure' },
  { domain: 'www.amd.com', tag: 'general' },
  { domain: 'www.apple.com', tag: 'general' },
  { domain: 'www.nvidia.com', tag: 'general' },
  { domain: 'www.cloudflare.com', tag: 'general' },
  { domain: 'www.hetzner.com', tag: 'hetzner' },
  { domain: 'console.hetzner.cloud', tag: 'hetzner' },
  { domain: 'www.ovhcloud.com', tag: 'ovh' },
  { domain: 'www.digitalocean.com', tag: 'digitalocean' },
  { domain: 'aws.amazon.com', tag: 'aws' },
  { domain: 'cloud.google.com', tag: 'gcp' },
  { domain: 'www.oracle.com', tag: 'oracle' },
  { domain: 'www.vultr.com', tag: 'vultr' },
  { domain: 'www.scaleway.com', tag: 'scaleway' },
  { domain: 'contabo.com', tag: 'contabo' },
  { domain: 'dl.google.com', tag: 'gcp' },
  { domain: 'fonts.googleapis.com', tag: 'gcp' },
  { domain: 'azure.microsoft.com', tag: 'azure' },
  { domain: 'cdn.jsdelivr.net', tag: 'general' },
  { domain: 'unpkg.com', tag: 'general' },
  { domain: 'github.com', tag: 'azure' },
  { domain: 'www.samsung.com', tag: 'general' },
  { domain: 'www.sony.com', tag: 'general' },
  { domain: 'www.logitech.com', tag: 'general' },
  { domain: 'www.asus.com', tag: 'general' },
  { domain: 'www.intel.com', tag: 'general' },
  { domain: 'www.cisco.com', tag: 'general' },
  { domain: 'www.dell.com', tag: 'general' },
  { domain: 'www.hp.com', tag: 'general' },
  { domain: 'www.ibm.com', tag: 'general' },
  { domain: 'www.oraclecloud.com', tag: 'oracle' },
  { domain: 'www.docker.com', tag: 'aws' },
  { domain: 'www.python.org', tag: 'general' },
  { domain: 'nodejs.org', tag: 'general' },
  { domain: 'www.mozilla.org', tag: 'gcp' },
  { domain: 'www.kernel.org', tag: 'general' },
  { domain: 'www.debian.org', tag: 'general' },
  { domain: 'ubuntu.com', tag: 'general' },
  { domain: 'www.nginx.com', tag: 'general' },
  { domain: 'www.postgresql.org', tag: 'general' },
  { domain: 'www.bing.com', tag: 'azure' },
  { domain: 'www.yahoo.com', tag: 'general' },
];

export function findXrayCombo(protocol: string, transport: string, security: string): XrayCombo | undefined {
  return XRAY_COMBOS.find((c) => c.protocol === protocol && c.transport === transport && c.security === security);
}

export function validateXraySettings(settings: Record<string, unknown>): string | null {
  const protocol = String(settings.protocol || 'vless');
  const transport = String(settings.transport || 'raw');
  const security = String(settings.security || 'reality');
  const combo = findXrayCombo(protocol, transport, security);
  if (!combo) {
    return `Unsupported combination: ${protocol} + ${transport} + ${security}`;
  }
  const flow = String(settings.flow || '');
  if (flow && !combo.flows.includes(flow)) {
    return `Flow ${flow} is not supported for ${protocol} + ${transport} + ${security}`;
  }
  if (settings.proxyProtocol && !combo.proxyProtocol) {
    return `PROXY protocol is not supported on ${transport}`;
  }
  if (protocol === 'shadowsocks') {
    const method = String(settings.ssMethod || '2022-blake3-aes-128-gcm');
    if (!SS_METHODS.includes(method)) {
      return `Unsupported Shadowsocks method: ${method}`;
    }
  }
  return null;
}

export async function probeRealitySni(domain: string, tag = 'general'): Promise<XraySniResult> {
  const checkedAt = Math.floor(Date.now() / 1000);
  const clean = domain.trim().toLowerCase();
  if (!clean || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) {
    return { domain: clean, tag, grade: 'red', reasons: ['bad_name'], tcpMs: 0, tlsMs: 0, checkedAt };
  }

  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { domain: clean, tag, grade: 'green', reasons: [], tcpMs: 4, tlsMs: 9, checkedAt };
  }

  const reasons: string[] = [];
  let tcpMs = 0;
  let tlsMs = 0;
  const start = Date.now();

  let rawSocket: net.Socket | null = null;
  try {
    const tcpStart = Date.now();
    const sock = await new Promise<net.Socket>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        s.destroy();
        reject(err);
      };
      const s = net.connect({ host: clean, port: 443 });
      s.setTimeout(3500);
      s.once('connect', () => {
        if (settled) return;
        settled = true;
        resolve(s);
      });
      s.once('timeout', () => fail(new Error('timeout')));
      s.on('error', fail);
    });
    rawSocket = sock;
    tcpMs = Math.max(1, Date.now() - tcpStart);

    const tlsStart = Date.now();
    const tlsSock = await new Promise<tls.TLSSocket>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        ts.destroy();
        sock.destroy();
        reject(err);
      };
      const ts = tls.connect({
        socket: sock,
        servername: clean,
        ALPNProtocols: ['h2', 'http/1.1'],
        ecdhCurve: 'X25519',
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      });
      ts.setTimeout(4000);
      sock.on('error', fail);
      ts.once('secureConnect', () => {
        if (settled) return;
        settled = true;
        resolve(ts);
      });
      ts.once('timeout', () => fail(new Error('tls_timeout')));
      ts.on('error', fail);
    });
    tlsMs = Math.max(1, Date.now() - tlsStart);

    const proto = tlsSock.getProtocol();
    if (proto !== 'TLSv1.3') reasons.push('no_tls13');
    if (tlsSock.alpnProtocol !== 'h2') reasons.push('no_h2');
    const eph = tlsSock.getEphemeralKeyInfo?.() as { name?: string; type?: string } | undefined;
    if (eph && eph.name && !String(eph.name).toLowerCase().includes('x25519')) {
      reasons.push('no_x25519');
    }
    if (!tlsSock.authorized) reasons.push('bad_cert');
    tlsSock.destroy();
    rawSocket.destroy();

    if (tlsMs >= 300 && reasons.length === 0) {
      reasons.push('slow');
    }
    const hardFail = reasons.some((r) => ['no_tls13', 'no_h2', 'bad_cert', 'unreachable', 'tls_failed'].includes(r));
    const grade: 'green' | 'yellow' | 'red' = hardFail ? 'red' : reasons.length > 0 ? 'yellow' : 'green';
    return { domain: clean, tag, grade, reasons, tcpMs, tlsMs, checkedAt };
  } catch (err) {
    const elapsed = Math.max(1, Date.now() - start);
    const msg = String(err);
    const reason = msg.includes('CERT') || msg.includes('certificate') ? 'bad_cert' : tcpMs > 0 ? 'tls_failed' : 'unreachable';
    return {
      domain: clean,
      tag,
      grade: 'red',
      reasons: [reason],
      tcpMs: tcpMs || elapsed,
      tlsMs,
      checkedAt,
    };
  }
}

export function saveSniResult(nodeId: number, res: XraySniResult): void {
  getDb()
    .prepare(
      `INSERT INTO xray_sni_results (node_id, domain, tag, grade, reasons_json, tcp_ms, tls_ms, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id, domain) DO UPDATE SET
         tag = excluded.tag,
         grade = excluded.grade,
         reasons_json = excluded.reasons_json,
         tcp_ms = excluded.tcp_ms,
         tls_ms = excluded.tls_ms,
         checked_at = excluded.checked_at`,
    )
    .run(nodeId, res.domain, res.tag, res.grade, JSON.stringify(res.reasons), res.tcpMs, res.tlsMs, res.checkedAt);
}

export function getSniListForNode(nodeId: number): {
  node: number;
  curated: Array<{ domain: string; tag: string; last?: XraySniResult }>;
  found: Array<{ domain: string; tag: string; last?: XraySniResult }>;
  available: boolean;
} {
  const rows = getDb()
    .prepare('SELECT * FROM xray_sni_results WHERE node_id = ?')
    .all(nodeId) as Array<Record<string, unknown>>;
  const byDomain = new Map<string, XraySniResult>();
  for (const r of rows) {
    byDomain.set(String(r.domain), {
      domain: String(r.domain),
      tag: String(r.tag),
      grade: String(r.grade) as 'green' | 'yellow' | 'red',
      reasons: JSON.parse(String(r.reasons_json || '[]')) as string[],
      tcpMs: Number(r.tcp_ms || 0),
      tlsMs: Number(r.tls_ms || 0),
      checkedAt: Number(r.checked_at || 0),
    });
  }
  const curatedSet = new Set(CURATED_SNI_DOMAINS.map((c) => c.domain));
  const curated = CURATED_SNI_DOMAINS.map((c) => ({
    domain: c.domain,
    tag: c.tag,
    last: byDomain.get(c.domain),
  }));
  const found = [...byDomain.values()]
    .filter((v) => !curatedSet.has(v.domain))
    .sort((a, b) => {
      const rank = { green: 0, yellow: 1, red: 2 };
      if (rank[a.grade] !== rank[b.grade]) return rank[a.grade] - rank[b.grade];
      return a.tlsMs - b.tlsMs;
    })
    .map((v) => ({ domain: v.domain, tag: 'found', last: v }));
  return { node: nodeId, curated, found, available: true };
}

interface SniJobState {
  id: string;
  state: 'running' | 'done' | 'error';
  total: number;
  done: number;
  results: XraySniResult[];
  error?: string;
}

const sniJobs = new Map<string, SniJobState>();

export function startSniTestJob(nodeId: number, domains: string[]): SniJobState {
  const clean = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
  const id = `sni-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const job: SniJobState = { id, state: 'running', total: clean.length, done: 0, results: [] };
  sniJobs.set(id, job);

  (async () => {
    const tagMap = new Map(CURATED_SNI_DOMAINS.map((c) => [c.domain, c.tag]));
    for (const d of clean) {
      const r = await probeRealitySni(d, tagMap.get(d) || 'found');
      saveSniResult(nodeId, r);
      job.results.push(r);
      job.done += 1;
    }
    job.state = 'done';
  })().catch((err) => {
    job.state = 'error';
    job.error = String(err);
  });

  return job;
}

export function startSniScanJob(nodeId: number, force = false): SniJobState {
  const existing = getSniListForNode(nodeId);
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  if (!force && existing.found.some((f) => (f.last?.checkedAt || 0) > cutoff)) {
    const id = `scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const job: SniJobState = {
      id,
      state: 'done',
      total: existing.found.length,
      done: existing.found.length,
      results: existing.found.map((f) => f.last!).filter(Boolean),
    };
    sniJobs.set(id, job);
    return job;
  }

  // Test top curated domains + neighbour TLS certs on node's /24 if on Linux
  const id = `scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sampleTargets = CURATED_SNI_DOMAINS.slice(0, 12).map((c) => c.domain);
  const job: SniJobState = { id, state: 'running', total: sampleTargets.length, done: 0, results: [] };
  sniJobs.set(id, job);

  (async () => {
    for (const d of sampleTargets) {
      const tag = CURATED_SNI_DOMAINS.find((c) => c.domain === d)?.tag || 'found';
      const r = await probeRealitySni(d, tag);
      saveSniResult(nodeId, r);
      job.results.push(r);
      job.done += 1;
    }
    job.state = 'done';
  })().catch((err) => {
    job.state = 'error';
    job.error = String(err);
  });
  return job;
}

export function getSniJob(jobId: string): SniJobState | undefined {
  return sniJobs.get(jobId);
}

export function buildXrayPresetDefaults(preset: XrayPresetId, nodeId = 0) {
  const realityKeys = generateRealityKeypair();
  const shortId = generateShortId(4);
  const sniList = getSniListForNode(nodeId);
  const bestGreen =
    sniList.curated.find((c) => c.domain === 'www.microsoft.com' && c.last?.grade !== 'red')?.domain ||
    sniList.curated.find((c) => c.last?.grade === 'green')?.domain ||
    CURATED_SNI_DOMAINS[0].domain;
  const cachedBest = sniList.curated.find((c) => c.domain === bestGreen)?.last;

  const baseSettings: Record<string, unknown> = {
    preset,
    protocol: 'vless',
    transport: 'raw',
    security: 'reality',
    flow: 'xtls-rprx-vision',
    ssMethod: '2022-blake3-aes-128-gcm',
    ssNetwork: 'tcp,udp',
    rawHeader: 'none',
    rawHttpHosts: [],
    rawHttpPath: '/',
    host: '',
    path: '/',
    wsHeartbeat: '',
    xhttpMode: 'auto',
    xPaddingBytes: '',
    scMaxBufferedPosts: '',
    scMaxEachPostBytes: '',
    scStreamUpServerSecs: '',
    noSSEHeader: false,
    serviceName: '',
    grpcAuthority: '',
    kcpHeader: 'none',
    kcpSeed: '',
    kcpMtu: '',
    kcpTti: '',
    kcpUplinkCapacity: '',
    kcpDownlinkCapacity: '',
    kcpCongestion: false,
    fingerprint: 'chrome',
    speedMode: 'device',
    proxyProtocol: false,
    allowFrom: [],
    behindCdn: false,
    cdnExtraRanges: [],
    cdn: false,
    cdnHost: '',
    trustedXff: [],
    tlsHost: '',
    connectAddress: '',
    sniOverride: '',
    hostOverride: '',
    remotes: [],
    tcpCongestion: '',
    domainStrategy: '',
    tcpKeepAliveIdle: '',
    tcpKeepAliveInterval: '',
    tcpFastOpen: false,
    tcpMptcp: false,
    v6only: false,
    tls: {
      alpn: ['h2', 'http/1.1'],
      minVersion: '1.2',
      maxVersion: '',
      cipherSuites: '',
      rejectUnknownSni: false,
      allowInsecure: false,
      sni: '',
      certFile: '',
      keyFile: '',
    },
    reality: {
      target: `${bestGreen}:443`,
      serverNames: [bestGreen],
      shortIds: [shortId],
      xver: 0,
      spiderX: '/',
      maxTimeDiff: '',
      minClientVer: '',
      maxClientVer: '',
    },
    realityPublicKey: realityKeys.publicKey,
    _realityPrivateKey: realityKeys.privateKey,
    sniffing: {
      enabled: true,
      destOverride: ['http', 'tls', 'quic'],
      routeOnly: false,
      metadataOnly: false,
      domainsExcluded: [],
    },
    fallbacks: [],
  };

  let port = 443;
  const proto: 'tcp' | 'udp' = 'tcp';
  let needs: string[] = [];

  if (preset === 'cdn') {
    baseSettings.transport = 'ws';
    baseSettings.security = 'tls';
    baseSettings.flow = '';
    baseSettings.path = `/${generateShortId(4)}`;
    baseSettings.cdn = true;
    baseSettings.behindCdn = true;
    baseSettings.speedMode = 'client';
    baseSettings.trustedXff = ['CF-Connecting-IP', 'X-Forwarded-For'];
    needs = ['cdnHost'];
  } else if (preset === 'relay') {
    baseSettings.security = 'none';
    baseSettings.flow = '';
    baseSettings.proxyProtocol = true;
    baseSettings.speedMode = 'device';
    needs = ['relayIPs'];
  } else if (preset === 'vmess-classic') {
    baseSettings.protocol = 'vmess';
    baseSettings.transport = 'raw';
    baseSettings.security = 'none';
    baseSettings.flow = '';
    baseSettings.rawHeader = 'http';
    baseSettings.rawHttpPath = '/';
  } else if (preset === 'trojan') {
    baseSettings.protocol = 'trojan';
    baseSettings.transport = 'raw';
    baseSettings.security = 'reality';
    baseSettings.flow = '';
  } else if (preset === 'shadowsocks') {
    baseSettings.protocol = 'shadowsocks';
    baseSettings.transport = 'raw';
    baseSettings.security = 'none';
    baseSettings.flow = '';
    baseSettings.ssMethod = '2022-blake3-aes-128-gcm';
    baseSettings.ssNetwork = 'tcp,udp';
    baseSettings._ssServerKey = generateSs2022Key('2022-blake3-aes-128-gcm');
    port = 8388;
  } else if (preset === 'manual') {
    baseSettings.protocol = 'vless';
    baseSettings.transport = 'raw';
    baseSettings.security = 'none';
    baseSettings.flow = '';
  }

  return {
    preset,
    port,
    proto,
    settings: baseSettings,
    needs,
    errors: [],
    sniTested: Boolean(cachedBest),
    sniGrade: cachedBest?.grade || 'green',
    sniReasons: cachedBest?.reasons || [],
    sniMillis: cachedBest?.tlsMs || 12,
    warnings: [],
  };
}

/** Sanitize Xray settings before sending to API clients (strips private keys). */
export function sanitizeXraySettingsForClient(settings: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...settings };
  delete copy._realityPrivateKey;
  delete copy._ssServerKey;
  if (copy.reality && typeof copy.reality === 'object') {
    const r = { ...(copy.reality as Record<string, unknown>) };
    delete r.privateKey;
    copy.reality = r;
  }
  return copy;
}

export function renderXrayInboundObject(inbound: InboundRow, peers: PeerEntry[]): Record<string, unknown> {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(inbound.settings_json || '{}');
  } catch {
    settings = {};
  }

  const protocol = String(settings.protocol || 'vless');
  const transport = String(settings.transport || 'raw');
  const security = String(settings.security || 'reality');
  const flow = String(settings.flow || '');

  let protoSettings: Record<string, unknown> = {};
  if (protocol === 'vless') {
    protoSettings = {
      clients: peers.map((p) => ({
        id: p.xrayUuid || crypto.randomUUID(),
        email: p.name,
        ...(flow ? { flow } : {}),
      })),
      decryption: 'none',
      ...(Array.isArray(settings.fallbacks) && settings.fallbacks.length > 0 ? { fallbacks: settings.fallbacks } : {}),
    };
  } else if (protocol === 'vmess') {
    protoSettings = {
      clients: peers.map((p) => ({
        id: p.xrayUuid || crypto.randomUUID(),
        email: p.name,
      })),
    };
  } else if (protocol === 'trojan') {
    protoSettings = {
      clients: peers.map((p) => ({
        password: p.vpnPassword || p.xrayUuid || p.name,
        email: p.name,
      })),
      ...(Array.isArray(settings.fallbacks) && settings.fallbacks.length > 0 ? { fallbacks: settings.fallbacks } : {}),
    };
  } else if (protocol === 'shadowsocks') {
    const method = String(settings.ssMethod || '2022-blake3-aes-128-gcm');
    const ssNet = String(settings.ssNetwork || 'tcp,udp');
    if (method.startsWith('2022-')) {
      protoSettings = {
        method,
        password: inbound.server_private_key || String(settings._ssServerKey || generateSs2022Key(method)),
        network: ssNet,
        clients: peers.map((p) => ({
          password: p.ssPassword || generateSs2022Key(method),
          email: p.name,
        })),
      };
    } else {
      protoSettings = {
        method,
        network: ssNet,
        clients: peers.map((p) => ({
          password: p.vpnPassword || p.xrayUuid || p.name,
          email: p.name,
        })),
      };
    }
  }

  const network = transport === 'raw' ? 'tcp' : transport;
  const streamSettings: Record<string, unknown> = { network, security };
  const effectiveRawHeader = String(settings.headerType || settings.rawHeader || 'none');
  const effectiveHttpHosts = Array.isArray(settings.httpHosts)
    ? settings.httpHosts
    : Array.isArray(settings.rawHttpHosts)
      ? settings.rawHttpHosts
      : [];
  const effectiveRawPath = String(settings.rawHttpPath || settings.path || '/');

  if (transport === 'raw' && effectiveRawHeader === 'http') {
    streamSettings.tcpSettings = {
      header: {
        type: 'http',
        request: {
          path: [effectiveRawPath],
          headers: effectiveHttpHosts.length > 0 ? { Host: effectiveHttpHosts } : {},
        },
      },
    };
  } else if (transport === 'ws') {
    streamSettings.wsSettings = {
      path: String(settings.path || '/'),
      ...(settings.host ? { host: String(settings.host) } : {}),
      ...(Number(settings.wsHeartbeat) > 0 ? { heartbeatPeriod: Number(settings.wsHeartbeat) } : {}),
    };
  } else if (transport === 'httpupgrade') {
    streamSettings.httpupgradeSettings = {
      path: String(settings.path || '/'),
      ...(settings.host ? { host: String(settings.host) } : {}),
    };
  } else if (transport === 'xhttp') {
    streamSettings.xhttpSettings = {
      path: String(settings.path || '/'),
      mode: String(settings.xhttpMode || 'auto'),
      ...(settings.host ? { host: String(settings.host) } : {}),
      ...(settings.xPaddingBytes ? { xPaddingBytes: String(settings.xPaddingBytes) } : {}),
      ...(settings.scMaxBufferedPosts ? { scMaxBufferedPosts: Number(settings.scMaxBufferedPosts) } : {}),
      ...(settings.scMaxEachPostBytes ? { scMaxEachPostBytes: String(settings.scMaxEachPostBytes) } : {}),
      ...(settings.scStreamUpServerSecs ? { scStreamUpServerSecs: String(settings.scStreamUpServerSecs) } : {}),
      ...(settings.noSSEHeader ? { noSSEHeader: true } : {}),
    };
  } else if (transport === 'grpc') {
    streamSettings.grpcSettings = {
      serviceName: String(settings.grpcServiceName || settings.serviceName || 'grpc'),
      ...(settings.grpcAuthority ? { authority: String(settings.grpcAuthority) } : {}),
      multiMode: Boolean(settings.grpcMultiMode),
    };
  } else if (transport === 'kcp') {
    streamSettings.kcpSettings = {
      header: { type: String(settings.kcpHeader || 'none') },
      ...(settings.kcpSeed ? { seed: String(settings.kcpSeed) } : {}),
      ...(Number(settings.kcpMtu) > 0 ? { mtu: Number(settings.kcpMtu) } : {}),
      ...(Number(settings.kcpTti) > 0 ? { tti: Number(settings.kcpTti) } : {}),
      ...(Number(settings.kcpUplinkCapacity) > 0 ? { uplinkCapacity: Number(settings.kcpUplinkCapacity) } : {}),
      ...(Number(settings.kcpDownlinkCapacity) > 0 ? { downlinkCapacity: Number(settings.kcpDownlinkCapacity) } : {}),
      ...(settings.kcpCongestion ? { congestion: true } : {}),
    };
  }

  if (security === 'reality') {
    const r = (settings.reality && typeof settings.reality === 'object' ? settings.reality : {}) as Record<string, unknown>;
    const rawNames = Array.isArray(r.serverNames) ? r.serverNames.map(String).map((x) => x.trim()).filter(Boolean) : [];
    const fallbackName = String(settings.realitySni || '').trim() || 'www.microsoft.com';
    const serverNames = rawNames.length > 0 ? rawNames : [fallbackName];
    const dest = String(r.dest || r.target || '').trim() || `${serverNames[0]}:443`;
    const rawShortIds = Array.isArray(r.shortIds) ? r.shortIds.map(String).map((x) => x.trim()).filter(Boolean) : [];
    streamSettings.realitySettings = {
      show: false,
      dest: dest.includes(':') ? dest : `${dest}:443`,
      xver: Number(r.xver || 0),
      serverNames,
      privateKey: inbound.server_private_key || String(settings._realityPrivateKey || ''),
      shortIds: rawShortIds.length > 0 ? rawShortIds : [''],
      ...(Number(r.maxTimeDiff) > 0 ? { maxTimeDiff: Number(r.maxTimeDiff) } : {}),
      ...(r.minClientVer ? { minClientVer: String(r.minClientVer) } : {}),
      ...(r.maxClientVer ? { maxClientVer: String(r.maxClientVer) } : {}),
    };
  } else if (security === 'tls') {
    const t = (settings.tls && typeof settings.tls === 'object' ? settings.tls : {}) as Record<string, unknown>;
    const hostForCert = String(t.certHost || t.sni || settings.tlsHost || settings.cdnDomain || settings.cdnHost || 'localhost').trim() || 'localhost';
    const certFile = String(t.certFile || `/etc/letsencrypt/live/${hostForCert}/fullchain.pem`);
    const keyFile = String(t.keyFile || `/etc/letsencrypt/live/${hostForCert}/privkey.pem`);
    streamSettings.tlsSettings = {
      alpn: Array.isArray(t.alpn) && t.alpn.length > 0 ? t.alpn : ['h2', 'http/1.1'],
      ...(t.sni || t.serverName ? { serverName: String(t.sni || t.serverName) } : {}),
      ...(t.minVersion ? { minVersion: String(t.minVersion) } : {}),
      ...(t.maxVersion ? { maxVersion: String(t.maxVersion) } : {}),
      ...(t.cipherSuites ? { cipherSuites: String(t.cipherSuites) } : {}),
      ...(t.rejectUnknownSni ? { rejectUnknownSni: true } : {}),
      certificates: [{ certificateFile: certFile, keyFile }],
    };
  }

  const sockopt: Record<string, unknown> = {};
  if (settings.proxyProtocol) sockopt.acceptProxyProtocol = true;
  if (settings.tcpCongestion) sockopt.tcpcongestion = String(settings.tcpCongestion);
  if (Number(settings.tcpKeepAliveIdle) > 0) sockopt.tcpKeepAliveIdle = Number(settings.tcpKeepAliveIdle);
  if (Number(settings.tcpKeepAliveInterval) > 0) sockopt.tcpKeepAliveInterval = Number(settings.tcpKeepAliveInterval);
  if (settings.tcpFastOpen) sockopt.tcpFastOpen = true;
  if (settings.tcpMptcp) sockopt.tcpMptcp = true;
  if (settings.v6only) sockopt.V6Only = true;
  if (settings.domainStrategy) sockopt.domainStrategy = String(settings.domainStrategy);
  if (Object.keys(sockopt).length > 0) {
    streamSettings.sockopt = sockopt;
  }

  const sniff = (settings.sniffing && typeof settings.sniffing === 'object' ? settings.sniffing : {}) as Record<string, unknown>;
  return {
    tag: `xr-${inbound.name}`,
    listen: '0.0.0.0',
    port: inbound.port,
    protocol,
    settings: protoSettings,
    streamSettings,
    sniffing: {
      enabled: sniff.enabled !== false,
      destOverride: Array.isArray(sniff.destOverride) ? sniff.destOverride : ['http', 'tls', 'quic'],
      routeOnly: Boolean(sniff.routeOnly),
      ...(sniff.metadataOnly ? { metadataOnly: true } : {}),
      ...(Array.isArray(sniff.domainsExcluded) && sniff.domainsExcluded.length > 0
        ? { domainsExcluded: sniff.domainsExcluded }
        : {}),
    },
  };
}

/** Build the unified Xray config combining all running local Xray inbounds + routing policy + stats API. */
export function buildUnifiedXrayConfig(): { configJson: string; hasActiveXray: boolean } {
  const db = getDb();
  const localNode = db.prepare('SELECT id FROM nodes WHERE is_local = 1 ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  const localNodeId = localNode?.id ?? 1;

  const xrayInbounds = db
    .prepare("SELECT * FROM inbounds WHERE protocol = 'xray' AND running = 1 AND enabled = 1 AND (node_id = ? OR node_id IS NULL)")
    .all(localNodeId) as unknown as InboundRow[];

  const policy = db.prepare('SELECT * FROM routing_policies WHERE node_id = ?').get(localNodeId) as
    | Record<string, unknown>
    | undefined;
  const routingEnabled = Boolean(policy?.enabled);

  if (xrayInbounds.length === 0 && !routingEnabled) {
    return { configJson: JSON.stringify({ log: { loglevel: 'warning' }, inbounds: [], outbounds: [{ tag: 'direct', protocol: 'freedom' }] }, null, 2), hasActiveXray: false };
  }

  const outbounds = db.prepare('SELECT id, name, type, config_json FROM outbounds ORDER BY id ASC').all() as Array<{
    id: number;
    name: string;
    type: string;
    config_json: string;
  }>;
  const allInbounds = db.prepare('SELECT id, name, protocol FROM inbounds').all() as Array<{
    id: number;
    name: string;
    protocol: string;
  }>;
  const inboundNamesById: Record<number, string> = {};
  for (const ib of allInbounds) {
    inboundNamesById[ib.id] = ib.protocol === 'xray' ? `xr-${ib.name}` : ib.name;
  }

  const rules = policy ? (JSON.parse(String(policy.rules_json || '[]')) as RoutingRule[]) : [];
  const inboundRoutes = policy ? (JSON.parse(String(policy.inbound_routes_json || '[]')) as InboundRouteOverride[]) : [];
  const defaultAction = (policy?.default_action ? String(policy.default_action) : 'direct') as 'direct' | 'outbound' | 'block';
  const defaultOb = policy?.default_outbound_id
    ? outbounds.find((o) => o.id === Number(policy.default_outbound_id))?.name
    : undefined;

  const baseRouting = JSON.parse(
    renderXrayRoutingConfig({
      outbounds,
      defaultAction: routingEnabled ? defaultAction : 'direct',
      defaultOutboundName: defaultOb,
      rules: routingEnabled ? rules : [],
      inboundRoutes: routingEnabled ? inboundRoutes : [],
      inboundNamesById,
    }),
  ) as Record<string, unknown>;

  const renderedInbounds: Record<string, unknown>[] = [
    {
      tag: 'api',
      listen: '127.0.0.1',
      port: 10085,
      protocol: 'dokodemo-door',
      settings: { address: '127.0.0.1' },
    },
  ];
  for (const ib of xrayInbounds) {
    const peers = getEligiblePeersForInbound(ib.id, ib.subnet);
    renderedInbounds.push(renderXrayInboundObject(ib, peers));
  }

  const routingObj = (baseRouting.routing || { domainStrategy: 'IPIfNonMatch', rules: [] }) as {
    domainStrategy: string;
    rules: Record<string, unknown>[];
  };
  routingObj.rules.unshift({ type: 'field', inboundTag: ['api'], outboundTag: 'api' });

  const logDir = process.platform === 'linux' ? '/var/log/xprotocol' : path.join(os.tmpdir(), 'xprotocol-xray');
  const unified = {
    log: {
      loglevel: 'warning',
      ...(process.platform === 'linux'
        ? { access: path.join(logDir, 'xray-access.log'), error: path.join(logDir, 'xray-error.log') }
        : {}),
    },
    stats: {},
    api: {
      tag: 'api',
      services: ['HandlerService', 'StatsService'],
    },
    policy: {
      levels: {
        '0': {
          statsUserUplink: true,
          statsUserDownlink: true,
          statsUserOnline: true,
        },
      },
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
        statsOutboundUplink: true,
        statsOutboundDownlink: true,
      },
    },
    inbounds: renderedInbounds,
    outbounds: baseRouting.outbounds,
    routing: routingObj,
  };

  return { configJson: JSON.stringify(unified, null, 2), hasActiveXray: true };
}

const XRAY_CANDIDATE_PATHS = ['/usr/local/bin/xray', '/usr/bin/xray', '/usr/local/lib/xprotocol/xray/xray'];

async function findXrayBinary(): Promise<string | null> {
  for (const p of XRAY_CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  const whichXray = await execFileAsync('which', ['xray'], { timeout: 3000 }).catch(() => null);
  const found = whichXray?.stdout?.trim();
  return found || null;
}

/** Auto-install official Xray-core binary on Ubuntu Linux if missing when an Xray inbound is activated. */
async function ensureXrayBinary(assetDir: string): Promise<{ bin: string | null; error?: string }> {
  const existing = await findXrayBinary();
  if (existing) return { bin: existing };
  if (process.platform !== 'linux' || process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { bin: null, error: 'xray binary not installed on host' };
  }

  const arch = process.arch === 'arm64' ? 'arm64-v8a' : '64';
  const zipUrl = `https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${arch}.zip`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-xray-inst-'));
  const zipPath = path.join(tmpDir, 'xray.zip');

  try {
    const res = await fetch(zipUrl, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading Xray-linux-${arch}.zip`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

    // Prefer existing unzip or python3 zipfile before invoking apt-get (avoids dpkg locks & hangs)
    const hasUnzip = await execFileAsync('which', ['unzip'], { timeout: 2000 }).catch(() => null);
    const hasPy3 = await execFileAsync('which', ['python3'], { timeout: 2000 }).catch(() => null);
    if (hasUnzip?.stdout?.trim()) {
      await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', tmpDir], { timeout: 15_000 });
    } else if (hasPy3?.stdout?.trim()) {
      await execFileAsync('python3', ['-m', 'zipfile', '-e', zipPath, tmpDir], { timeout: 15_000 });
    } else {
      await execFileAsync('apt-get', ['install', '-y', '-qq', 'unzip'], {
        timeout: 15_000,
        env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
      }).catch(() => undefined);
      const unzipAfter = await execFileAsync('which', ['unzip'], { timeout: 2000 }).catch(() => null);
      if (unzipAfter?.stdout?.trim()) {
        await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', tmpDir], { timeout: 15_000 });
      } else {
        throw new Error('Neither unzip nor python3 is installed to extract Xray archive');
      }
    }

    const extractedBin = path.join(tmpDir, 'xray');
    if (!fs.existsSync(extractedBin)) throw new Error('Extracted archive did not contain xray binary');
    fs.mkdirSync('/usr/local/bin', { recursive: true });
    fs.copyFileSync(extractedBin, '/usr/local/bin/xray');
    fs.chmodSync('/usr/local/bin/xray', 0o755);

    fs.mkdirSync(assetDir, { recursive: true });
    for (const asset of ['geoip.dat', 'geosite.dat']) {
      const src = path.join(tmpDir, asset);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assetDir, asset));
    }
    return { bin: '/usr/local/bin/xray' };
  } catch (err) {
    // Fallback to official XTLS install-release.sh (bounded so HTTP proxies never time out)
    try {
      const scriptRes = await fetch('https://github.com/XTLS/Xray-install/raw/main/install-release.sh', {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (scriptRes.ok) {
        const scriptFile = path.join(tmpDir, 'install-release.sh');
        fs.writeFileSync(scriptFile, await scriptRes.text(), { mode: 0o700 });
        await execFileAsync('bash', [scriptFile, 'install'], { timeout: 25_000 });
        const installed = await findXrayBinary();
        if (installed) return { bin: installed };
      }
    } catch {
      // fall through
    }
    return {
      bin: null,
      error: `xray binary not installed and auto-install failed (${err instanceof Error ? err.message : String(err)}). Run: bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install`,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function ensureXrayAssets(assetDir: string): void {
  fs.mkdirSync(assetDir, { recursive: true });
  const searchDirs = ['/usr/local/share/xray', '/usr/share/xray', '/usr/local/bin', '/etc/xray'];
  for (const file of ['geoip.dat', 'geosite.dat']) {
    const dst = path.join(assetDir, file);
    if (fs.existsSync(dst) && fs.statSync(dst).size > 0) continue;
    for (const srcDir of searchDirs) {
      const src = path.join(srcDir, file);
      if (fs.existsSync(src) && fs.statSync(src).size > 0) {
        fs.copyFileSync(src, dst);
        break;
      }
    }
  }
}

export function writeUnifiedXrayConfigFile(): {
  configJson: string;
  hasActiveXray: boolean;
  dir: string;
  cfgPath: string;
} {
  const { configJson, hasActiveXray } = buildUnifiedXrayConfig();
  const dir = process.platform === 'linux' ? '/usr/local/lib/xprotocol/xray' : path.join(os.tmpdir(), 'xprotocol-xray');
  fs.mkdirSync(dir, { recursive: true });
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(cfgPath, configJson, { mode: 0o600 });
  return { configJson, hasActiveXray, dir, cfgPath };
}

let xraySyncInFlight: Promise<{ ok: boolean; statusMessage: string }> | null = null;
let xraySyncPending = false;

async function syncAndApplyXrayEngineOnce(): Promise<{ ok: boolean; statusMessage: string }> {
  const { hasActiveXray, dir, cfgPath } = writeUnifiedXrayConfigFile();

  if (process.platform !== 'linux') {
    return {
      ok: true,
      statusMessage: hasActiveXray ? `Saved Xray config (${cfgPath}); live execution runs on Ubuntu Linux` : 'Xray idle',
    };
  }

  fs.mkdirSync('/var/log/xprotocol', { recursive: true });
  const unitPath = '/etc/systemd/system/xprotocol-xray.service';

  if (!hasActiveXray) {
    if (fs.existsSync(unitPath)) {
      await execFileAsync('systemctl', ['stop', 'xprotocol-xray'], { timeout: 5000 }).catch(() => undefined);
    }
    return { ok: true, statusMessage: 'Stopped' };
  }

  const ensured = await ensureXrayBinary(dir);
  if (!ensured.bin) {
    return { ok: false, statusMessage: ensured.error || 'xray binary not installed on host' };
  }
  ensureXrayAssets(dir);

  // Pre-validate config with xray -test before restarting systemd
  try {
    await execFileAsync(ensured.bin, ['run', '-test', '-c', cfgPath], {
      timeout: 6000,
      env: { ...process.env, XRAY_LOCATION_ASSET: dir },
    });
  } catch (testErr: unknown) {
    const te = testErr as { stderr?: string; stdout?: string; message?: string };
    return {
      ok: false,
      statusMessage: `Xray config test failed: ${(te.stderr || te.stdout || te.message || String(testErr)).trim()}`,
    };
  }

  const desiredUnit = `[Unit]
Description=XProtocol Xray Core Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=XRAY_LOCATION_ASSET=${dir}
ExecStart=${ensured.bin} run -c ${cfgPath}
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
`;
  const existingUnit = fs.existsSync(unitPath) ? fs.readFileSync(unitPath, 'utf8') : '';
  if (existingUnit !== desiredUnit) {
    fs.writeFileSync(unitPath, desiredUnit);
    await execFileAsync('systemctl', ['daemon-reload'], { timeout: 5000 }).catch(() => undefined);
  }

  try {
    await execFileAsync('systemctl', ['enable', 'xprotocol-xray'], { timeout: 5000 }).catch(() => undefined);
    await execFileAsync('systemctl', ['restart', 'xprotocol-xray'], { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 450));
    const active = await execFileAsync('systemctl', ['is-active', 'xprotocol-xray'], { timeout: 3000 }).catch((e) => e as { stdout?: string });
    if (String(active?.stdout || '').trim() !== 'active') {
      const j = await execFileAsync('journalctl', ['-u', 'xprotocol-xray', '-n', '15', '--no-pager'], { timeout: 3000 }).catch(() => null);
      return {
        ok: false,
        statusMessage: `xprotocol-xray exited after start: ${(j?.stdout || 'check journalctl -u xprotocol-xray').trim()}`,
      };
    }
    return { ok: true, statusMessage: `Xray engine running (${ensured.bin})` };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, statusMessage: (e.stderr || e.message || String(err)).trim() };
  }
}

export async function syncAndApplyXrayEngine(): Promise<{ ok: boolean; statusMessage: string }> {
  if (xraySyncInFlight) {
    xraySyncPending = true;
    const prev = await xraySyncInFlight;
    if (xraySyncPending && !xraySyncInFlight) {
      return syncAndApplyXrayEngine();
    }
    return prev;
  }

  const runner = (async () => {
    let lastResult: { ok: boolean; statusMessage: string } = { ok: true, statusMessage: 'Idle' };
    do {
      xraySyncPending = false;
      lastResult = await syncAndApplyXrayEngineOnce();
    } while (xraySyncPending);
    return lastResult;
  })();

  xraySyncInFlight = runner;
  try {
    return await runner;
  } finally {
    if (xraySyncInFlight === runner) {
      xraySyncInFlight = null;
    }
  }
}

export interface XrayUserStatSample {
  clientName: string;
  uplink: number;
  downlink: number;
  remoteIp: string;
}

/** Collect live per-user byte deltas from Xray StatsService API on 127.0.0.1:10085. */
export async function collectXrayLiveStats(): Promise<XrayUserStatSample[]> {
  if (process.platform !== 'linux') return [];
  const xrayBin = await findXrayBinary();
  if (!xrayBin) return [];
  try {
    const res = await execFileAsync(xrayBin, ['api', 'statsquery', '--server=127.0.0.1:10085', '-reset'], { timeout: 3500 });
    const parsed = JSON.parse(res.stdout || '{}') as { stat?: Array<{ name?: string; value?: number | string }> };
    const byUser = new Map<string, { up: number; down: number }>();
    for (const item of parsed.stat || []) {
      const m = String(item.name || '').match(/^user>>>(.+?)>>>traffic>>>(uplink|downlink)$/);
      if (!m) continue;
      const user = m[1];
      const val = Number(item.value || 0);
      const cur = byUser.get(user) || { up: 0, down: 0 };
      if (m[2] === 'uplink') cur.up += val;
      else cur.down += val;
      byUser.set(user, cur);
    }

    // Read tail of access log to associate recent remote IPs
    const ipByUser = new Map<string, string>();
    const accessLog = '/var/log/xprotocol/xray-access.log';
    if (fs.existsSync(accessLog)) {
      const stat = fs.statSync(accessLog);
      const readSize = Math.min(stat.size, 32768);
      if (readSize > 0) {
        const fd = fs.openSync(accessLog, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
        fs.closeSync(fd);
        for (const line of buf.toString('utf8').split('\n')) {
          const emailMatch = line.match(/email:\s*([^\s]+)/);
          const ipMatch = line.match(/from\s+(?:tcp:|udp:)?(\d{1,3}(?:\.\d{1,3}){3}):\d+/);
          if (emailMatch && ipMatch) {
            ipByUser.set(emailMatch[1], ipMatch[1]);
          }
        }
      }
    }

    const out: XrayUserStatSample[] = [];
    for (const [clientName, v] of byUser.entries()) {
      if (v.up > 0 || v.down > 0) {
        out.push({
          clientName,
          uplink: v.up,
          downlink: v.down,
          remoteIp: ipByUser.get(clientName) || '0.0.0.0',
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function kickXrayClient(inboundName: string, clientName: string): Promise<boolean> {
  if (process.platform !== 'linux') return true;
  const xrayBin = await findXrayBinary();
  if (!xrayBin) return false;
  try {
    await execFileAsync(xrayBin, ['api', 'rmu', '--server=127.0.0.1:10085', `-tag=xr-${inboundName}`, clientName], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Build share URIs (`vless://`, `vmess://`, `trojan://`, `ss://`) and parameter summaries for one client. */
export function buildClientXrayServerViews(
  client: { id: number; name: string; xrayUuid: string; vpnPassword: string; ssPassword: string },
  inbounds: Array<{
    id: number;
    name: string;
    port: number;
    public_address_override: string;
    server_public_key: string;
    settings_json: string;
    node_name: string;
    node_address: string;
    connect_addresses_json: string;
  }>,
  fallbackHost: string,
): XrayServerView[] {
  const servers: XrayServerView[] = [];
  for (const ib of inbounds) {
    let s: Record<string, unknown> = {};
    try {
      s = JSON.parse(ib.settings_json || '{}');
    } catch {
      s = {};
    }
    const protocol = (String(s.protocol || 'vless') as XrayProtocol);
    const transport = (String(s.transport || 'raw') as XrayTransport);
    const security = (String(s.security || 'reality') as XraySecurity);

    const connectAddrs = JSON.parse(ib.connect_addresses_json || '[]') as string[];
    const customRemotes = Array.isArray(s.remotes)
      ? (s.remotes as Array<{ flag?: string; label?: string; host?: string; port?: string | number; sni?: string; hostHeader?: string }>).filter(
          (rm) => rm && String(rm.host || '').trim(),
        )
      : [];

    const endpoints: Array<{ host: string; port: number; label?: string; flag?: string; sni?: string; hostHeader?: string }> = [];
    if (customRemotes.length > 0) {
      for (const rm of customRemotes) {
        endpoints.push({
          host: String(rm.host).trim(),
          port: Number(rm.port) > 0 ? Number(rm.port) : ib.port,
          label: rm.label ? String(rm.label).trim() : undefined,
          flag: rm.flag ? String(rm.flag).trim() : undefined,
          sni: rm.sni ? String(rm.sni).trim() : undefined,
          hostHeader: rm.hostHeader ? String(rm.hostHeader).trim() : undefined,
        });
      }
    } else if (s.connectAddress && String(s.connectAddress).trim()) {
      endpoints.push({ host: String(s.connectAddress).trim(), port: ib.port });
    } else if ((s.cdn || s.behindCdn) && (s.cdnDomain || s.cdnHost)) {
      endpoints.push({ host: String(s.cdnDomain || s.cdnHost).trim(), port: ib.port });
    } else if (ib.public_address_override) {
      endpoints.push({ host: ib.public_address_override.trim(), port: ib.port });
    } else if (connectAddrs.length > 0) {
      for (const h of connectAddrs) endpoints.push({ host: h, port: ib.port });
    } else {
      endpoints.push({ host: ib.node_address !== '127.0.0.1' ? ib.node_address : fallbackHost || '127.0.0.1', port: ib.port });
    }

    const primaryHost = endpoints[0]?.host || fallbackHost || '127.0.0.1';
    const label = String(s.displayName || ib.name);
    const remark = `${label} · ${ib.node_name}`;
    const credId =
      protocol === 'vless' || protocol === 'vmess'
        ? client.xrayUuid
        : protocol === 'trojan'
          ? client.vpnPassword || client.xrayUuid
          : client.ssPassword;

    const r = (s.reality && typeof s.reality === 'object' ? s.reality : {}) as Record<string, unknown>;
    const t = (s.tls && typeof s.tls === 'object' ? s.tls : {}) as Record<string, unknown>;
    const defaultSni = String(
      s.linkSni ||
        s.sniOverride ||
        (security === 'reality'
          ? (Array.isArray(r.serverNames) ? r.serverNames[0] : '') || s.realitySni || 'www.microsoft.com'
          : t.sni || t.serverName || t.certHost || s.cdnDomain || s.cdnHost || s.tlsHost || primaryHost),
    );
    const pbk = String(s.realityPublicKey || ib.server_public_key || '');
    const sid = Array.isArray(r.shortIds) && r.shortIds.length > 0 ? String(r.shortIds[0]) : '';
    const fp = String(s.fingerprint || 'chrome');
    const netType = transport === 'raw' ? 'tcp' : transport;
    const defaultHostHdr = String(
      s.linkHost || s.hostOverride || s.host || (s.cdn || s.behindCdn ? s.cdnDomain || s.cdnHost || '' : ''),
    );

    const params: Record<string, string> = {
      security,
      type: netType,
    };
    if (protocol === 'vless') params.encryption = 'none';
    if (s.flow) params.flow = String(s.flow);
    if (security === 'reality') {
      params.sni = defaultSni;
      params.fp = fp;
      if (pbk) params.pbk = pbk;
      if (sid) params.sid = sid;
      if (r.spiderX) params.spx = String(r.spiderX);
    } else if (security === 'tls') {
      params.sni = defaultSni;
      params.fp = fp;
      if (Array.isArray(t.alpn) && t.alpn.length > 0) params.alpn = t.alpn.join(',');
      if (t.allowInsecure) params.allowInsecure = '1';
    }

    if (transport === 'raw' && (s.headerType === 'http' || s.rawHeader === 'http')) {
      params.headerType = 'http';
      const hosts = Array.isArray(s.httpHosts) ? s.httpHosts : Array.isArray(s.rawHttpHosts) ? s.rawHttpHosts : [];
      if (hosts.length > 0) params.host = hosts.join(',');
      if (s.rawHttpPath || s.path) params.path = String(s.rawHttpPath || s.path);
    } else if (transport === 'ws' || transport === 'httpupgrade' || transport === 'xhttp') {
      params.path = String(s.path || '/');
      if (defaultHostHdr) params.host = defaultHostHdr;
      if (transport === 'xhttp' && s.xhttpMode) params.mode = String(s.xhttpMode);
    } else if (transport === 'grpc') {
      params.serviceName = String(s.grpcServiceName || s.serviceName || 'grpc');
      if (s.grpcMultiMode) params.mode = 'multi';
    } else if (transport === 'kcp') {
      params.headerType = String(s.kcpHeader || 'none');
      if (s.kcpSeed) params.seed = String(s.kcpSeed);
    }

    const links: string[] = endpoints.map((ep, idx) => {
      const h = ep.host;
      const p = ep.port;
      const epParams: Record<string, string> = {
        ...params,
        ...(ep.sni && (security === 'reality' || security === 'tls') ? { sni: ep.sni } : {}),
        ...(ep.hostHeader && (transport === 'ws' || transport === 'httpupgrade' || transport === 'xhttp')
          ? { host: ep.hostHeader }
          : {}),
      };
      const baseTag = ep.label ? `${ep.flag ? `${ep.flag} ` : ''}${ep.label}` : endpoints.length > 1 ? `${remark} #${idx + 1}` : remark;
      if (protocol === 'vless' || protocol === 'trojan') {
        const qs = new URLSearchParams(epParams).toString();
        const scheme = protocol === 'vless' ? 'vless' : 'trojan';
        const hostFmt = h.includes(':') && !h.startsWith('[') ? `[${h}]` : h;
        return `${scheme}://${encodeURIComponent(credId)}@${hostFmt}:${p}?${qs}#${encodeURIComponent(baseTag)}`;
      }
      if (protocol === 'vmess') {
        const vmessJson = {
          v: '2',
          ps: baseTag,
          add: h,
          port: String(p),
          id: credId,
          aid: '0',
          scy: 'auto',
          net: netType,
          type: epParams.headerType || 'none',
          host: ep.hostHeader || defaultHostHdr,
          path: epParams.path || '',
          tls: security === 'tls' ? 'tls' : '',
          sni: security === 'tls' ? epParams.sni || defaultSni : '',
          fp,
        };
        return `vmess://${Buffer.from(JSON.stringify(vmessJson), 'utf8').toString('base64')}`;
      }
      // Shadowsocks
      const method = String(s.ssMethod || '2022-blake3-aes-128-gcm');
      const userInfo = method.startsWith('2022-')
        ? `${method}:${ib.server_public_key || ''}:${credId}`
        : `${method}:${credId}`;
      const b64 = Buffer.from(userInfo, 'utf8').toString('base64');
      const hostFmt = h.includes(':') && !h.startsWith('[') ? `[${h}]` : h;
      return `ss://${b64}@${hostFmt}:${p}#${encodeURIComponent(baseTag)}`;
    });

    servers.push({
      key: `xr-${ib.name}-${ib.id}`,
      name: remark,
      instanceId: ib.id,
      instance: ib.name,
      node: ib.node_name,
      label,
      host: primaryHost,
      port: ib.port,
      protocol,
      transport,
      security,
      id: credId,
      params,
      links,
    });
  }
  return servers;
}
