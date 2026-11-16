import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getDb, getSetting, setSetting } from '../db/database.js';
import { recordAudit } from './audit.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const REPO_OWNER = 'PouryaDe';
const REPO_NAME = 'XProtocol';
const REPO_BRANCH = process.env.XPROTOCOL_BRANCH || 'main';

export interface UpdateSettings {
  channel: 'stable' | 'beta';
  autoUpdate: 'off' | 'notify' | 'auto';
  autoUpdateHour: number;
  updateNodes: boolean;
}

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  channel: 'stable',
  autoUpdate: 'notify',
  autoUpdateHour: 4,
  updateNodes: true,
};

export interface ReleaseEntry {
  tag: string;
  name: string;
  prerelease: boolean;
  published: string;
  notes: string;
  url: string;
}

export type UpdateStep = '' | 'downloading' | 'installing' | 'nodes' | 'restarting' | 'done';

export interface UpdateState {
  installedVersion: string;
  currentCommit: string;
  settings: UpdateSettings;
  timezone: string;
  checking: boolean;
  installing: string | null;
  step: UpdateStep;
  checkedAt: string | null;
  source: 'github' | 'git';
  checkError: string | null;
  lastError: string | null;
  latest: ReleaseEntry | null;
  newer: ReleaseEntry[];
  recent: ReleaseEntry[];
}

interface PersistedUpdateMeta {
  checkedAt: string | null;
  source: 'github' | 'git';
  checkError: string | null;
  lastError: string | null;
  latest: ReleaseEntry | null;
  newer: ReleaseEntry[];
  recent: ReleaseEntry[];
  lastAutoAttemptKey?: string;
}

const DEFAULT_META: PersistedUpdateMeta = {
  checkedAt: null,
  source: 'github',
  checkError: null,
  lastError: null,
  latest: null,
  newer: [],
  recent: [],
};

let checkingNow = false;
let installingTag: string | null = null;
let currentStep: UpdateStep = '';

export function getInstalledVersion(): string {
  for (const rel of ['package.json', 'server/package.json']) {
    try {
      const p = path.join(PROJECT_ROOT, rel);
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { version?: string };
        if (pkg.version) return pkg.version;
      }
    } catch {
      // ignore read errors
    }
  }
  return '1.0.4';
}

export async function getCurrentCommit(): Promise<string> {
  try {
    const marker = path.join(PROJECT_ROOT, '.xprotocol-commit');
    if (fs.existsSync(path.join(PROJECT_ROOT, '.git'))) {
      const { stdout } = await execFileAsync('git', ['-C', PROJECT_ROOT, 'rev-parse', '--short', 'HEAD'], {
        timeout: 3000,
      });
      const sha = stdout.trim();
      if (sha) return sha;
    }
    if (fs.existsSync(marker)) {
      return fs.readFileSync(marker, 'utf-8').trim().slice(0, 12);
    }
  } catch {
    // ignore
  }
  return '';
}

function parseSemver(tag: string): [number, number, number] | null {
  const m = tag.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

export function getUpdateSettings(): UpdateSettings {
  const saved = getSetting<Partial<UpdateSettings>>('updates', {});
  return {
    channel: saved.channel === 'beta' ? 'beta' : 'stable',
    autoUpdate:
      saved.autoUpdate === 'off' || saved.autoUpdate === 'auto' || saved.autoUpdate === 'notify'
        ? saved.autoUpdate
        : DEFAULT_UPDATE_SETTINGS.autoUpdate,
    autoUpdateHour:
      typeof saved.autoUpdateHour === 'number' && saved.autoUpdateHour >= 0 && saved.autoUpdateHour <= 23
        ? Math.floor(saved.autoUpdateHour)
        : DEFAULT_UPDATE_SETTINGS.autoUpdateHour,
    updateNodes: saved.updateNodes !== undefined ? Boolean(saved.updateNodes) : DEFAULT_UPDATE_SETTINGS.updateNodes,
  };
}

export function saveUpdateSettings(partial: Partial<UpdateSettings>): UpdateSettings {
  const current = getUpdateSettings();
  const next: UpdateSettings = {
    channel: partial.channel === 'beta' ? 'beta' : partial.channel === 'stable' ? 'stable' : current.channel,
    autoUpdate:
      partial.autoUpdate === 'off' || partial.autoUpdate === 'notify' || partial.autoUpdate === 'auto'
        ? partial.autoUpdate
        : current.autoUpdate,
    autoUpdateHour:
      typeof partial.autoUpdateHour === 'number' && partial.autoUpdateHour >= 0 && partial.autoUpdateHour <= 23
        ? Math.floor(partial.autoUpdateHour)
        : current.autoUpdateHour,
    updateNodes: partial.updateNodes !== undefined ? Boolean(partial.updateNodes) : current.updateNodes,
  };
  setSetting('updates', next);
  return next;
}

function getMeta(): PersistedUpdateMeta {
  try {
    return { ...DEFAULT_META, ...getSetting<Partial<PersistedUpdateMeta>>('updates_meta', {}) };
  } catch {
    return { ...DEFAULT_META };
  }
}

function saveMeta(partial: Partial<PersistedUpdateMeta>): PersistedUpdateMeta {
  const next = { ...getMeta(), ...partial };
  try {
    setSetting('updates_meta', next);
  } catch {
    // db may be unavailable during shutdown
  }
  return next;
}

export async function getUpdateState(): Promise<UpdateState> {
  const meta = getMeta();
  const installedVersion = getInstalledVersion();
  const currentCommit = await getCurrentCommit();
  return {
    installedVersion,
    currentCommit,
    settings: getUpdateSettings(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    checking: checkingNow,
    installing: installingTag,
    step: currentStep,
    checkedAt: meta.checkedAt,
    source: meta.source,
    checkError: meta.checkError,
    lastError: meta.lastError,
    latest: meta.latest,
    newer: meta.newer,
    recent: meta.recent,
  };
}

/**
 * Trigger a non-blocking background GitHub update check only if cached metadata is missing
 * or older than `maxAgeMs`. Always returns immediately without stalling the caller.
 */
export function triggerBackgroundUpdateCheckIfStale(maxAgeMs = 3 * 60_000): boolean {
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') return false;
  if (checkingNow || installingTag) return false;
  const settings = getUpdateSettings();
  if (settings.autoUpdate === 'off') return false;

  const meta = getMeta();
  const checkedMs = meta.checkedAt ? Date.parse(meta.checkedAt) : 0;
  if (checkedMs > 0 && Date.now() - checkedMs < maxAgeMs) {
    return false;
  }

  setImmediate(() => {
    checkForUpdates().catch(() => undefined);
  });
  return true;
}

async function fetchGithubJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'XProtocol-Panel/1.0',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`GitHub HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (checkingNow) return getUpdateState();
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    saveMeta({ checkedAt: new Date().toISOString(), checkError: null });
    return getUpdateState();
  }
  checkingNow = true;
  const installedVersion = getInstalledVersion();
  const currentCommit = await getCurrentCommit();
  const settings = getUpdateSettings();

  try {
    const releasesRaw = await fetchGithubJson<
      Array<{
        tag_name: string;
        name?: string;
        prerelease?: boolean;
        draft?: boolean;
        published_at?: string;
        created_at?: string;
        body?: string;
        html_url?: string;
      }>
    >(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=15`);

    const filteredReleases: ReleaseEntry[] = releasesRaw
      .filter((r) => !r.draft && (settings.channel === 'beta' || !r.prerelease))
      .map((r) => ({
        tag: r.tag_name,
        name: r.name || r.tag_name,
        prerelease: Boolean(r.prerelease),
        published: r.published_at || r.created_at || new Date().toISOString(),
        notes: (r.body || '').trim(),
        url: r.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
      }));

    let latest: ReleaseEntry | null = null;
    let newer: ReleaseEntry[] = [];
    let recent: ReleaseEntry[] = filteredReleases.slice(0, 10);

    if (filteredReleases.length > 0) {
      newer = filteredReleases.filter((r) => compareSemver(r.tag, installedVersion) > 0);
      latest = newer[0] || null;
    } else {
      // Repository uses rolling main commits rather than GitHub Releases: surface recent commits cleanly
      const commitsRaw = await fetchGithubJson<
        Array<{
          sha: string;
          html_url?: string;
          commit?: {
            message?: string;
            author?: { date?: string };
          };
        }>
      >(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${REPO_BRANCH}&per_page=8`);

      recent = commitsRaw.map((c) => {
        const shortSha = c.sha.slice(0, 7);
        const msg = (c.commit?.message || '').trim();
        const title = msg.split('\n')[0] || shortSha;
        return {
          tag: shortSha,
          name: title,
          prerelease: false,
          published: c.commit?.author?.date || new Date().toISOString(),
          notes: msg,
          url: c.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`,
        };
      });

      const head = recent[0];
      if (head && currentCommit && head.tag !== currentCommit) {
        latest = {
          ...head,
          tag: `${REPO_BRANCH}@${head.tag}`,
        };
        newer = [latest];
      }
    }

    saveMeta({
      checkedAt: new Date().toISOString(),
      source: 'github',
      checkError: null,
      latest,
      newer,
      recent,
    });
  } catch (err) {
    saveMeta({
      checkedAt: new Date().toISOString(),
      source: 'github',
      checkError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    checkingNow = false;
  }

  return getUpdateState();
}

export async function startUpdateInstall(targetTag?: string, initiator = 'system'): Promise<{ started: boolean; message?: string }> {
  if (installingTag) {
    return { started: false, message: `Update already in progress (${installingTag})` };
  }
  const state = await getUpdateState();
  const tag = targetTag || state.latest?.tag || `${REPO_BRANCH}@latest`;
  installingTag = tag;
  currentStep = 'downloading';
  saveMeta({ lastError: null });

  recordAudit({
    username: initiator,
    action: 'system.update',
    target: tag,
  });

  setImmediate(async () => {
    try {
      const deployScript = path.join(PROJECT_ROOT, 'deploy/xprotocol-cli.sh');
      if (process.platform === 'linux' && fs.existsSync(deployScript)) {
        currentStep = 'installing';
        await execFileAsync('bash', [deployScript, 'update', '--yes', '--no-restart'], {
          timeout: 300_000,
          env: {
            ...process.env,
            XPROTOCOL_INSTALL_DIR: PROJECT_ROOT,
          },
        });

        const settings = getUpdateSettings();
        if (settings.updateNodes) {
          currentStep = 'nodes';
          try {
            const db = getDb();
            db.prepare("UPDATE nodes SET xprotocol_version = ? WHERE is_local = 1").run(getInstalledVersion());
          } catch {
            // ignore
          }
        }

        currentStep = 'restarting';
        // Trigger clean systemd restart after a short delay so UI receives 'restarting' status
        setTimeout(() => {
          execFile('systemctl', ['restart', 'xprotocol.service'], () => undefined);
        }, 1200);
      } else {
        // Non-Linux or local development checkout without systemd unit
        currentStep = 'done';
        saveMeta({
          lastError:
            process.platform !== 'linux'
              ? 'Self-update requires Linux systemd deployment (/opt/xprotocol). Pull and rebuild manually on local dev.'
              : null,
        });
      }
    } catch (err) {
      saveMeta({
        lastError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTimeout(() => {
        installingTag = null;
        currentStep = '';
      }, 4000);
    }
  });

  return { started: true };
}

export function startAutoUpdateScheduler(): void {
  const tick = async () => {
    try {
      const settings = getUpdateSettings();
      if (settings.autoUpdate === 'off') return;
      const state = await checkForUpdates();
      if (settings.autoUpdate === 'auto' && state.latest && !installingTag) {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}:${state.latest.tag}`;
        const meta = getMeta();
        if (now.getHours() === settings.autoUpdateHour && meta.lastAutoAttemptKey !== todayKey) {
          saveMeta({ lastAutoAttemptKey: todayKey });
          await startUpdateInstall(state.latest.tag, 'auto-updater');
        }
      }
    } catch {
      // background scheduler best-effort
    }
  };

  setTimeout(() => {
    void tick();
  }, 60_000).unref();

  setInterval(() => {
    void tick();
  }, 30 * 60_000).unref();
}
