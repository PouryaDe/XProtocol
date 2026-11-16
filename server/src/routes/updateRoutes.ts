import { Router } from 'express';
import {
  checkForUpdates,
  getUpdateState,
  saveUpdateSettings,
  startUpdateInstall,
  triggerBackgroundUpdateCheckIfStale,
  type UpdateSettings,
} from '../services/updater.js';
import { recordAudit } from '../services/audit.js';
import { requireOwner, type AuthedRequest } from './context.js';

export function createUpdateRouter(): Router {
  const router = Router();

  router.get('/', requireOwner, async (req, res) => {
    let backgroundTriggered = false;
    if (req.query.auto === '1') {
      const ttlRaw = Number(req.query.ttl || 180_000);
      const ttl = Number.isFinite(ttlRaw) ? Math.max(15_000, Math.min(3_600_000, ttlRaw)) : 180_000;
      backgroundTriggered = triggerBackgroundUpdateCheckIfStale(ttl);
    }
    const state = await getUpdateState();
    res.json({
      ...state,
      checking: state.checking || backgroundTriggered,
    });
  });

  router.post('/check', requireOwner, async (_req, res) => {
    const state = await checkForUpdates();
    res.json(state);
  });

  router.put('/settings', requireOwner, async (req: AuthedRequest, res) => {
    const prev = await getUpdateState();
    const body = req.body as Partial<UpdateSettings>;
    const saved = saveUpdateSettings(body);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'settings.updates',
      target: `${saved.channel}/${saved.autoUpdate}`,
      ip: req.clientIp,
    });
    if (body.channel && body.channel !== prev.settings.channel) {
      const refreshed = await checkForUpdates();
      res.json(refreshed);
      return;
    }
    res.json(await getUpdateState());
  });

  router.post('/install', requireOwner, async (req: AuthedRequest, res) => {
    const body = (req.body || {}) as { tag?: string };
    const result = await startUpdateInstall(body.tag, req.auth!.account.username);
    if (!result.started) {
      res.status(409).json({ error: result.message || 'Update could not be started' });
      return;
    }
    res.json({ ok: true, state: await getUpdateState() });
  });

  return router;
}
