import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface RuntimeConfig {
  port: number;
  bindAddress: string;
  subPort: number | null;
  secretPath: string;
  subPath: string;
  tlsCertFile: string;
  tlsKeyFile: string;
  trustProxy: boolean;
  driverMode: 'auto' | 'linux' | 'mock';
  machineId: string;
}

const DATA_DIR = path.resolve(process.env.OVIRA_DATA_DIR || path.join(process.cwd(), 'data'));
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

function formatMachineId(): string {
  const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeSecretPath(p: string): string {
  const trimmed = p.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

export function normalizeSubPath(p: string): string {
  const trimmed = p.trim().replace(/^\/+|\/+$/g, '');
  return trimmed || 'sub';
}

export function getDataDir(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'ovira.db');
}

export function loadRuntimeConfig(): RuntimeConfig {
  getDataDir();
  const defaults: RuntimeConfig = {
    port: Number(process.env.OVIRA_PORT || 2053),
    bindAddress: process.env.OVIRA_BIND || '',
    subPort: process.env.OVIRA_SUB_PORT ? Number(process.env.OVIRA_SUB_PORT) : null,
    secretPath: normalizeSecretPath(process.env.OVIRA_SECRET_PATH || ''),
    subPath: normalizeSubPath(process.env.OVIRA_SUB_PATH || 'sub'),
    tlsCertFile: '',
    tlsKeyFile: '',
    trustProxy: false,
    driverMode: (process.env.OVIRA_DRIVER as RuntimeConfig['driverMode']) || 'auto',
    machineId: formatMachineId(),
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<RuntimeConfig>;
    const merged: RuntimeConfig = {
      ...defaults,
      ...parsed,
      secretPath: normalizeSecretPath(parsed.secretPath ?? defaults.secretPath),
      subPath: normalizeSubPath(parsed.subPath ?? defaults.subPath),
      machineId: parsed.machineId || defaults.machineId,
    };
    return merged;
  } catch {
    return defaults;
  }
}

export function saveRuntimeConfig(cfg: RuntimeConfig): RuntimeConfig {
  getDataDir();
  const next: RuntimeConfig = {
    ...cfg,
    secretPath: normalizeSecretPath(cfg.secretPath),
    subPath: normalizeSubPath(cfg.subPath),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}
