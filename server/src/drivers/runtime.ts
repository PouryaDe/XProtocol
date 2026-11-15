import os from 'node:os';
import net from 'node:net';
import fs from 'node:fs';
import type { InboundRow, PeerEntry } from '../generators/configs.js';
import { applyLinuxInbound } from './linuxEngine.js';

export interface HostStats {
  cpuPercent: number;
  memPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskPercent: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  uptimeSeconds: number;
  platform: string;
  arch: string;
  driverMode: 'linux' | 'mock';
}

export function detectDriverMode(configured: 'auto' | 'linux' | 'mock'): 'linux' | 'mock' {
  if (configured === 'linux') return 'linux';
  if (configured === 'mock') return 'mock';
  if (process.platform === 'linux') return 'linux';
  return 'mock';
}

export async function getHostStats(mode: 'linux' | 'mock'): Promise<HostStats> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0;
  const loads = os.loadavg();
  const cpuCount = Math.max(1, os.cpus().length);
  const cpuPercent = Math.min(100, Math.round(((loads[0] || 0.18 * cpuCount) / cpuCount) * 1000) / 10);

  let diskPercent = 24.5;
  let diskUsedBytes = 12 * 1024 ** 3;
  let diskTotalBytes = 50 * 1024 ** 3;
  try {
    const stat = fs.statfsSync(process.cwd());
    const total = stat.blocks * stat.bsize;
    const avail = stat.bavail * stat.bsize;
    if (total > 0) {
      diskTotalBytes = total;
      diskUsedBytes = total - avail;
      diskPercent = Math.round(((total - avail) / total) * 1000) / 10;
    }
  } catch {
    // Fallback
  }

  return {
    cpuPercent,
    memPercent,
    memUsedBytes: usedMem,
    memTotalBytes: totalMem,
    diskPercent,
    diskUsedBytes,
    diskTotalBytes,
    uptimeSeconds: Math.round(os.uptime()),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    driverMode: mode,
  };
}

export async function applyInboundRuntime(
  _mode: 'linux' | 'mock',
  inbound: InboundRow,
  peers: PeerEntry[],
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: boolean; logs: string[] }> {
  return applyLinuxInbound(inbound, peers, action);
}

export async function testTcpLatency(host: string, port: number, timeoutMs = 3500): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error?: string;
}> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: null, error: 'Connection timed out' });
    });
    socket.on('error', (e) => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: null, error: e.message });
    });
  });
}
