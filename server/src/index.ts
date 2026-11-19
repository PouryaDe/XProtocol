import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig, getDbPath, type RuntimeConfig } from './config.js';
import { initDatabase, getDb, getSetting, setSetting, DEFAULT_GENERAL_SETTINGS } from './db/database.js';
import { detectDriverMode } from './drivers/runtime.js';
import { requireAuth, type AuthedRequest } from './routes/context.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createDashboardRouter } from './routes/dashboardRoutes.js';
import { createClientRouter } from './routes/clientRoutes.js';
import { createGroupRouter } from './routes/groupRoutes.js';
import { createInboundRouter } from './routes/inboundRoutes.js';
import { createNodeRouter } from './routes/nodeRoutes.js';
import { createConnectionRouter } from './routes/connectionRoutes.js';
import { createRoutingRouter } from './routes/routingRoutes.js';
import { createCertRouter } from './routes/certRoutes.js';
import { createAccountRouter } from './routes/accountRoutes.js';
import { createSettingsRouter } from './routes/settingsRoutes.js';
import { createUpdateRouter } from './routes/updateRoutes.js';
import { createSubRouter } from './routes/subRoutes.js';
import { createXrayRouter } from './routes/xrayRoutes.js';
import { createEventsRouter } from './routes/eventsRoutes.js';
import { createTemplateRouter } from './routes/templateRoutes.js';
import { createMetricsRouter } from './routes/metricsRoutes.js';
import { createBackupDestinationsRouter } from './routes/backupRoutes.js';
import { startCollectorLoop } from './services/collector.js';
import { reconcileRunningInboundsOnBoot } from './services/syncService.js';
import { startTelegramBackupScheduler } from './services/telegramBackup.js';
import { startOffsiteBackupScheduler } from './services/offsiteBackup.js';
import { startAutoUpdateScheduler } from './services/updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function applyPendingRestore(): void {
  const dbPath = getDbPath();
  const pending = `${dbPath}.pending-restore`;
  if (fs.existsSync(pending)) {
    if (fs.existsSync(dbPath)) {
      const backupOld = `${dbPath}.before-restore-${Date.now()}`;
      fs.renameSync(dbPath, backupOld);
    }
    fs.renameSync(pending, dbPath);
    console.log('[xprotocol] Restored pending database backup.');
  }
}

export function createApp(initialConfig: RuntimeConfig) {
  let runtimeConfig = initialConfig;
  const driverMode = detectDriverMode(runtimeConfig.driverMode);

  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const authMiddleware = requireAuth(() => runtimeConfig.trustProxy);

  // Public subscription router (accessible via /<subPath>/:token)
  const subRouter = createSubRouter();
  app.use((req, res, next) => {
    const subPrefix = `/${runtimeConfig.subPath}`;
    if (req.path === subPrefix || req.path.startsWith(`${subPrefix}/`)) {
      req.url = req.url.slice(subPrefix.length) || '/';
      const ua = String(req.headers['user-agent'] || '');
      const accept = String(req.headers.accept || '');
      const isProxyAppUa =
        /happ|v2ray|hiddify|shadowrocket|streisand|nekobox|karing|clash|sing-box|flclash|foxray|v2box|stash|quantumult|loon|surge/i.test(
          ua,
        );
      const wantsProxyFeed =
        /^\/[^/]+\/(data|profile|proxy|raw)(\/|$)/.test(req.path) ||
        Boolean(req.query.format) ||
        isProxyAppUa ||
        (req.path !== '/' && !req.path.includes('/assets/') && !accept.includes('text/html'));
      if (wantsProxyFeed) {
        subRouter(req, res, next);
        return;
      }
      // Restore original url for SPA serving below
      req.url = `${subPrefix}${req.url === '/' ? '' : req.url}`;
    }
    next();
  });

  // Optional root /metrics endpoint when metricsRoot is enabled
  const metricsRouter = createMetricsRouter();
  app.use('/metrics', (req, res, next) => {
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    if (!general.metricsRoot) {
      next();
      return;
    }
    authMiddleware(req, res, () => metricsRouter(req, res, next));
  });

  // Secret path guard for panel API & SPA
  app.use((req, res, next) => {
    const subPrefix = `/${runtimeConfig.subPath}`;
    if (req.path === subPrefix || req.path.startsWith(`${subPrefix}/`)) {
      next();
      return;
    }
    if (runtimeConfig.secretPath) {
      if (req.path === runtimeConfig.secretPath) {
        res.redirect(301, `${runtimeConfig.secretPath}/`);
        return;
      }
      if (req.path.startsWith(`${runtimeConfig.secretPath}/`)) {
        req.url = req.url.slice(runtimeConfig.secretPath.length) || '/';
        next();
        return;
      }
      res.status(404).send('404 page not found');
      return;
    }
    next();
  });

  // API routes
  const api = express.Router();
  interface PendingChunkUpload {
    method: 'POST' | 'PUT' | 'PATCH';
    path: string;
    total: number;
    parts: Array<string | undefined>;
    createdAt: number;
  }
  const chunkUploads = new Map<string, PendingChunkUpload>();

  api.post('/_chunk', authMiddleware, (req: AuthedRequest, res, next) => {
    const now = Date.now();
    for (const [k, v] of chunkUploads) {
      if (now - v.createdAt > 60_000) chunkUploads.delete(k);
    }
    const { id, i, n, m, p, d } = (req.body || {}) as {
      id?: string;
      i?: number;
      n?: number;
      m?: string;
      p?: string;
      d?: string;
    };
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9_-]{4,40}$/.test(id) ||
      typeof i !== 'number' ||
      typeof n !== 'number' ||
      !Number.isInteger(i) ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > 2048 ||
      i < 0 ||
      i >= n ||
      typeof d !== 'string' ||
      d.length > 4096
    ) {
      res.status(400).json({ error: 'Invalid chunk envelope' });
      return;
    }

    const ownerKey = `${req.auth!.account.id}:${req.auth!.sessionId || 'api'}:${id}`;
    let entry = chunkUploads.get(ownerKey);
    if (i === 0) {
      const upperM = String(m || '').toUpperCase();
      const targetPath = String(p || '');
      if (
        (upperM !== 'POST' && upperM !== 'PUT' && upperM !== 'PATCH') ||
        !targetPath.startsWith('/') ||
        targetPath.startsWith('/_chunk') ||
        targetPath.includes('..') ||
        targetPath.includes('://')
      ) {
        res.status(400).json({ error: 'Invalid chunk target' });
        return;
      }
      entry = {
        method: upperM,
        path: targetPath,
        total: n,
        parts: new Array(n).fill(undefined),
        createdAt: now,
      };
      chunkUploads.set(ownerKey, entry);
    } else if (!entry || entry.total !== n) {
      res.status(400).json({ error: 'Chunk session missing or expired' });
      return;
    }

    entry.parts[i] = d;
    if (i < n - 1) {
      res.status(202).json({ ok: true, received: i });
      return;
    }

    chunkUploads.delete(ownerKey);
    if (entry.parts.some((part) => typeof part !== 'string')) {
      res.status(400).json({ error: 'Incomplete chunk sequence' });
      return;
    }
    try {
      const rawJson = Buffer.from(entry.parts.join(''), 'base64').toString('utf8');
      req.body = rawJson ? JSON.parse(rawJson) : {};
    } catch {
      res.status(400).json({ error: 'Invalid assembled JSON payload' });
      return;
    }
    req.method = entry.method;
    req.url = entry.path;
    api(req, res, next);
  });

  api.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0-beta.3', driverMode }));
  api.use('/auth', createAuthRouter(authMiddleware, () => runtimeConfig.trustProxy));
  api.use('/dashboard', authMiddleware, createDashboardRouter(driverMode));
  api.use('/clients', authMiddleware, createClientRouter());
  api.use('/client-templates', authMiddleware, createTemplateRouter());
  api.use('/groups', authMiddleware, createGroupRouter());
  const inboundRouter = createInboundRouter(driverMode);
  api.use('/inbounds', authMiddleware, inboundRouter);
  api.use('/instances', authMiddleware, inboundRouter);
  api.use('/xray', authMiddleware, createXrayRouter());
  api.use('/nodes', authMiddleware, createNodeRouter());
  api.use('/connections', authMiddleware, createConnectionRouter());
  api.use('/routing', authMiddleware, createRoutingRouter());
  api.use('/certificates', authMiddleware, createCertRouter());
  api.use('/accounts', authMiddleware, createAccountRouter());
  api.use('/backup/destinations', authMiddleware, createBackupDestinationsRouter());
  api.use('/metrics', authMiddleware, metricsRouter);
  api.use('/', authMiddleware, createEventsRouter());
  api.use(
    '/settings',
    authMiddleware,
    createSettingsRouter(
      () => runtimeConfig,
      (cfg) => {
        runtimeConfig = cfg;
      },
    ),
  );
  api.use('/updates', authMiddleware, createUpdateRouter());

  app.use('/api', api);

  // Serve built frontend when available
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    // Allow relative ./assets/* requests from nested paths like /sub/:token, /clients/1, or /:secretPath/
    app.use((req, _res, next) => {
      const m = req.url.match(/(\/assets\/[^?#]+(?:\?[^#]*)?)$/);
      if (m && !req.url.startsWith('/api/')) {
        req.url = m[1];
      }
      next();
    });
    app.use(express.static(webDist, { index: false }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/assets/')) {
        res.status(404).end();
        return;
      }
      const html = fs.readFileSync(path.join(webDist, 'index.html'), 'utf-8');
      const cfgScript = `<script>window.__XP_BASE_PATH__=${JSON.stringify(runtimeConfig.secretPath || '')};window.__XP_SUB_PATH__=${JSON.stringify(runtimeConfig.subPath || 'sub')};</script>`;
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(html.replace('</head>', `${cfgScript}</head>`));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ message: 'XProtocol API running. Start Vite dev server in /web for UI.', version: '1.0.4' });
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[xprotocol] Unhandled request error:', msg);
    if (!res.headersSent) {
      res.status(500).json({ error: msg || 'Internal server error' });
    }
  });

  return app;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function detectHostIpv4(): string | null {
  const ifaces = os.networkInterfaces();
  let fallbackPrivate: string | null = null;
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) return entry.address;
      if (!fallbackPrivate) fallbackPrivate = entry.address;
    }
  }
  return fallbackPrivate;
}

function syncDetectedHostIp(): void {
  if (process.platform !== 'linux') return;
  const detected = detectHostIpv4();
  if (!detected) return;
  const isLoopback = (v: string) => !v || v === '127.0.0.1' || v === 'localhost' || v === '0.0.0.0';
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  if (isLoopback((general.publicAddress || '').trim())) {
    setSetting('general', { ...general, publicAddress: detected });
  }
  const db = getDb();
  const localNodes = db.prepare('SELECT id, address FROM nodes WHERE is_local = 1').all() as { id: number; address: string }[];
  for (const n of localNodes) {
    if (isLoopback((n.address || '').trim())) {
      db.prepare('UPDATE nodes SET address = ? WHERE id = ?').run(detected, n.id);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on('unhandledRejection', (reason) => {
    console.error('[xprotocol] Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[xprotocol] Uncaught exception:', err);
  });

  applyPendingRestore();
  const runtimeConfig = loadRuntimeConfig();
  const { initialPasswordGenerated } = initDatabase();
  syncDetectedHostIp();
  reconcileRunningInboundsOnBoot().catch(() => undefined);
  startCollectorLoop();
  startTelegramBackupScheduler();
  startOffsiteBackupScheduler();
  startAutoUpdateScheduler();
  const app = createApp(runtimeConfig);

  const server = http.createServer(app);
  // Keep alive above nginx/Cloudflare 60s timeout to prevent ECONNRESET races
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;
  const host = runtimeConfig.bindAddress || '0.0.0.0';
  server.listen(runtimeConfig.port, host, () => {
    const base = `http://localhost:${runtimeConfig.port}${runtimeConfig.secretPath}/`;
    console.log(`◆ XProtocol Open-Core Panel v1.0.4`);
    console.log(`◆ Panel URL: ${base}`);
    console.log(`◆ Driver mode: ${detectDriverMode(runtimeConfig.driverMode)}`);
    if (initialPasswordGenerated) {
      console.log(`◆ Initial Owner Login -> username: admin | password: ${initialPasswordGenerated}`);
    }
  });
}
