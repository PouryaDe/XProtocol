import { Router } from 'express';
import {
  KCP_HEADERS,
  SS_METHODS,
  XHTTP_MODES,
  XRAY_COMBOS,
  XRAY_PRESETS,
  getSniJob,
  getSniListForNode,
  startSniScanJob,
  startSniTestJob,
} from '../drivers/xrayEngine.js';
import type { AuthedRequest } from './context.js';

export function createXrayRouter(): Router {
  const router = Router();

  router.get('/presets', (_req, res) => {
    res.json({ items: XRAY_PRESETS });
  });

  router.get('/combos', (_req, res) => {
    res.json({
      items: XRAY_COMBOS,
      kcpHeaders: KCP_HEADERS,
      xhttpModes: XHTTP_MODES,
      ssMethods: SS_METHODS,
    });
  });

  router.get('/sni', (req, res) => {
    const node = Number(req.query.node ?? 0) || 0;
    res.json(getSniListForNode(node));
  });

  router.post('/sni/test', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const body = req.body as { node?: number; domains?: string[] };
    const rawDomains = Array.isArray(body.domains) ? body.domains : [];
    const domains = rawDomains
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(d) && d.includes('.'))
      .slice(0, 50);
    if (domains.length === 0) {
      res.status(400).json({ error: 'At least one valid domain hostname is required' });
      return;
    }
    const job = startSniTestJob(Number(body.node ?? 0) || 0, domains);
    res.json({ id: job.id, state: job.state, total: job.total, done: job.done, results: job.results });
  });

  router.post('/sni/scan', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const body = req.body as { node?: number; force?: boolean };
    const job = startSniScanJob(Number(body.node ?? 0) || 0, Boolean(body.force));
    res.json({ id: job.id, state: job.state, total: job.total, done: job.done, results: job.results });
  });

  router.get('/sni/jobs/:job', (req, res) => {
    const job = getSniJob(String(req.params.job));
    if (!job) {
      res.status(404).json({ error: 'SNI job not found' });
      return;
    }
    res.json(job);
  });

  return router;
}
