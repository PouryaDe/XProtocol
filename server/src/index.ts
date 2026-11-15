import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig, getDbPath, type RuntimeConfig } from './config.js';
import { initDatabase } from './db/database.js';
import { detectDriverMode } from './drivers/runtime.js';
import { requireAuth } from './routes/context.js';
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
import { createSubRouter } from './routes/subRoutes.js';
import { startCollectorLoop } from './services/collector.js';
import { startTelegramBackupScheduler } from './services/telegramBackup.js';

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
    console.log('[ovira] Restored pending database backup.');
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
      // Route /sub/:token/data or /sub/:token/profile/:id to API; otherwise serve SPA index.html
      if (/^\/[^/]+\/(data|profile)(\/|$)/.test(req.path)) {
        subRouter(req, res, next);
        return;
      }
      // Restore original url for SPA serving below
      req.url = `${subPrefix}${req.url === '/' ? '' : req.url}`;
    }
    next();
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
  api.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.4', driverMode }));
  api.use('/auth', createAuthRouter(authMiddleware, () => runtimeConfig.trustProxy));
  api.use('/dashboard', authMiddleware, createDashboardRouter(driverMode));
  api.use('/clients', authMiddleware, createClientRouter());
  api.use('/groups', authMiddleware, createGroupRouter());
  api.use('/inbounds', authMiddleware, createInboundRouter(driverMode));
  api.use('/nodes', authMiddleware, createNodeRouter());
  api.use('/connections', authMiddleware, createConnectionRouter());
  api.use('/routing', authMiddleware, createRoutingRouter());
  api.use('/certificates', authMiddleware, createCertRouter());
  api.use('/accounts', authMiddleware, createAccountRouter());
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

  app.use('/api', api);

  // Serve built frontend when available
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ message: 'Ovira API running. Start Vite dev server in /web for UI.', version: '1.0.4' });
    });
  }

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyPendingRestore();
  const runtimeConfig = loadRuntimeConfig();
  const { initialPasswordGenerated } = initDatabase();
  startCollectorLoop();
  startTelegramBackupScheduler();
  const app = createApp(runtimeConfig);

  const server = http.createServer(app);
  const host = runtimeConfig.bindAddress || '0.0.0.0';
  server.listen(runtimeConfig.port, host, () => {
    const base = `http://localhost:${runtimeConfig.port}${runtimeConfig.secretPath}/`;
    console.log(`◆ Ovira Open-Core Panel v1.0.4`);
    console.log(`◆ Panel URL: ${base}`);
    console.log(`◆ Driver mode: ${detectDriverMode(runtimeConfig.driverMode)}`);
    if (initialPasswordGenerated) {
      console.log(`◆ Initial Owner Login -> username: admin | password: ${initialPasswordGenerated}`);
    }
  });
}
