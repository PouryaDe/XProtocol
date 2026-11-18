import { Router } from 'express';
import { getDb } from '../db/database.js';
import { getEffectiveLimits } from '../security/rbac.js';
import { recordAudit } from '../services/audit.js';
import { requireOwner, type AuthedRequest } from './context.js';

export interface TemplateSettings {
  trafficLimit: number;
  days: number;
  startOnFirstUse: boolean;
  maxDevices: number;
  resetStrategy: string;
  resetEveryDays: number;
  resetAnchor: number;
  groups: number[];
  instances: number[];
  speedDown: number;
  speedUp: number;
  smartdnsMaxIps: number;
  subUpdateHours: number;
  subAnnounce: string;
}

function mapTemplateRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    name: String(r.name),
    settings: JSON.parse(String(r.settings_json || '{}')) as TemplateSettings,
    sort: Number(r.sort || 0),
    enabled: Boolean(r.enabled),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function createTemplateRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const db = getDb();
    let rows = db
      .prepare('SELECT * FROM client_templates ORDER BY sort ASC, id ASC')
      .all() as Array<Record<string, unknown>>;

    if (!acc.isOwner) {
      const limits = getEffectiveLimits(acc);
      const allowed = limits.allowedTemplateIds;
      rows = rows.filter((r) => Boolean(r.enabled) && (allowed.length === 0 || allowed.includes(Number(r.id))));
    }

    res.json({ items: rows.map(mapTemplateRow) });
  });

  router.post('/', requireOwner, (req: AuthedRequest, res) => {
    const body = req.body as {
      name?: string;
      settings?: Partial<TemplateSettings>;
      sort?: number;
      enabled?: boolean;
    };
    const name = (body.name || '').trim();
    if (!name || name.length > 48) {
      res.status(400).json({ error: 'Template name must be 1-48 characters' });
      return;
    }
    const s = body.settings || {};
    const settings: TemplateSettings = {
      trafficLimit: Math.max(0, Number(s.trafficLimit || 0)),
      days: Math.max(0, Math.min(3650, Math.trunc(Number(s.days || 0)))),
      startOnFirstUse: Boolean(s.startOnFirstUse),
      maxDevices: Math.max(0, Math.min(1000, Math.trunc(Number(s.maxDevices || 0)))),
      resetStrategy: String(s.resetStrategy || 'none'),
      resetEveryDays: Math.max(0, Math.min(365, Math.trunc(Number(s.resetEveryDays || 0)))),
      resetAnchor: s.resetAnchor ? 1 : 0,
      groups: Array.isArray(s.groups) ? s.groups.map(Number) : [],
      instances: Array.isArray(s.instances) ? s.instances.map(Number) : [],
      speedDown: Math.max(0, Number(s.speedDown || 0)),
      speedUp: Math.max(0, Number(s.speedUp || 0)),
      smartdnsMaxIps: Math.max(0, Number(s.smartdnsMaxIps || 0)),
      subUpdateHours: Math.max(0, Math.min(720, Math.trunc(Number(s.subUpdateHours || 0)))),
      subAnnounce: String(s.subAnnounce || '').slice(0, 200),
    };

    const now = new Date().toISOString();
    try {
      const info = getDb()
        .prepare(
          'INSERT INTO client_templates (name, settings_json, sort, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(name, JSON.stringify(settings), Number(body.sort || 0), body.enabled === false ? 0 : 1, now, now);
      const created = getDb()
        .prepare('SELECT * FROM client_templates WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
      recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'template.create', target: name, ip: req.clientIp });
      res.status(201).json(mapTemplateRow(created));
    } catch (err) {
      res.status(400).json({ error: String(err).includes('UNIQUE') ? 'Template name already exists' : String(err) });
    }
  });

  router.put('/:id', requireOwner, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM client_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const body = req.body as {
      name?: string;
      settings?: Partial<TemplateSettings>;
      sort?: number;
      enabled?: boolean;
    };
    const prevSettings = JSON.parse(String(existing.settings_json || '{}')) as TemplateSettings;
    const s = body.settings ? { ...prevSettings, ...body.settings } : prevSettings;
    const name = body.name !== undefined ? body.name.trim() : String(existing.name);
    if (!name || name.length > 48) {
      res.status(400).json({ error: 'Template name must be 1-48 characters' });
      return;
    }
    const now = new Date().toISOString();
    try {
      db.prepare('UPDATE client_templates SET name = ?, settings_json = ?, sort = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
        name,
        JSON.stringify(s),
        body.sort !== undefined ? Number(body.sort) : Number(existing.sort),
        body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(existing.enabled),
        now,
        id,
      );
      const updated = db.prepare('SELECT * FROM client_templates WHERE id = ?').get(id) as Record<string, unknown>;
      recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'template.update', target: name, ip: req.clientIp });
      res.json(mapTemplateRow(updated));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.delete('/:id', requireOwner, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    getDb().prepare('DELETE FROM client_templates WHERE id = ?').run(id);
    recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'template.delete', target: String(id), ip: req.clientIp });
    res.json({ ok: true });
  });

  return router;
}
