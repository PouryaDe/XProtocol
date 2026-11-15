import { Router } from 'express';
import {
  checkForUpdates,
  getUpdateState,
  saveUpdateSettings,
  startUpdateInstall,
  type UpdateSettings,
} from '../services/updater.js';
import { recordAudit } from '../services/audit.js';
import { requireOwner, type AuthedRequest } from './context.js';

export function createUpdateRouter(): Router {
  const router = Router();

  router.get('/', requireOwner, async (_req, res) => {
    const state = await getUpdateState();
    res.json(state);
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
