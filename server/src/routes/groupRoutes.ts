import { Router } from 'express';
import { getDb } from '../db/database.js';
import { recordAudit } from '../services/audit.js';
import type { AuthedRequest } from './context.js';

export function createGroupRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.groups.view === 'none') {
      res.status(403).json({ error: 'No permission to view groups' });
      return;
    }

    const db = getDb();
    let rows = db.prepare('SELECT * FROM groups ORDER BY id DESC').all() as Array<{
      id: number;
      name: string;
      note: string;
      all_inbounds: number;
      enabled: number;
      created_at: string;
    }>;

    if (!acc.isOwner && acc.permissions.groups.view === 'granted') {
      rows = rows.filter((g) => acc.allowedGroupIds.includes(g.id));
    }

    const giRows = db.prepare('SELECT group_id, inbound_id FROM group_inbounds').all() as {
      group_id: number;
      inbound_id: number;
    }[];
    const giMap = new Map<number, number[]>();
    for (const r of giRows) {
      const arr = giMap.get(r.group_id) || [];
      arr.push(r.inbound_id);
      giMap.set(r.group_id, arr);
    }

    const cgCounts = db.prepare('SELECT group_id, COUNT(*) as cnt FROM client_groups GROUP BY group_id').all() as {
      group_id: number;
      cnt: number;
    }[];
    const countMap = new Map(cgCounts.map((c) => [c.group_id, c.cnt]));

    res.json({
      groups: rows.map((g) => ({
        id: g.id,
        name: g.name,
        note: g.note,
        allInbounds: Boolean(g.all_inbounds),
        enabled: Boolean(g.enabled),
        inboundIds: giMap.get(g.id) || [],
        clientCount: countMap.get(g.id) || 0,
        createdAt: g.created_at,
      })),
    });
  });

  router.post('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission to manage groups' });
      return;
    }

    const { name, note, allInbounds, enabled, inboundIds } = req.body as {
      name?: string;
      note?: string;
      allInbounds?: boolean;
      enabled?: boolean;
      inboundIds?: number[];
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }
    const db = getDb();
    try {
      const info = db
        .prepare('INSERT INTO groups (name, note, all_inbounds, enabled, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(name.trim(), note || '', allInbounds ? 1 : 0, enabled === false ? 0 : 1, new Date().toISOString());
      const gid = Number(info.lastInsertRowid);
      if (!allInbounds && inboundIds) {
        for (const iid of inboundIds) {
          db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gid, iid);
        }
      }
      recordAudit({ accountId: acc.id, username: acc.username, action: 'group.create', target: name.trim(), ip: req.clientIp });
      res.status(201).json({ id: gid });
    } catch (err) {
      res.status(400).json({ error: `Could not create group: ${String(err)}` });
    }
  });

  router.patch('/:id', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const { name, note, allInbounds, enabled, inboundIds } = req.body as {
      name?: string;
      note?: string;
      allInbounds?: boolean;
      enabled?: boolean;
      inboundIds?: number[];
    };
    const db = getDb();
    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    db.prepare('UPDATE groups SET name = ?, note = ?, all_inbounds = ?, enabled = ? WHERE id = ?').run(
      name?.trim() || String(existing.name),
      note !== undefined ? note : String(existing.note || ''),
      allInbounds !== undefined ? (allInbounds ? 1 : 0) : Number(existing.all_inbounds),
      enabled !== undefined ? (enabled ? 1 : 0) : Number(existing.enabled),
      id,
    );
    if (inboundIds !== undefined) {
      db.prepare('DELETE FROM group_inbounds WHERE group_id = ?').run(id);
      for (const iid of inboundIds) {
        db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(id, iid);
      }
    }
    recordAudit({ accountId: acc.id, username: acc.username, action: 'group.update', target: String(existing.name), ip: req.clientIp });
    res.json({ ok: true });
  });

  router.post('/bulk', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const { ids, action } = req.body as { ids?: number[]; action?: 'enable' | 'disable' | 'delete' };
    if (!ids || !action) {
      res.status(400).json({ error: 'ids and action required' });
      return;
    }
    const db = getDb();
    for (const id of ids) {
      if (action === 'enable') db.prepare('UPDATE groups SET enabled = 1 WHERE id = ?').run(id);
      else if (action === 'disable') db.prepare('UPDATE groups SET enabled = 0 WHERE id = ?').run(id);
      else if (action === 'delete') db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  });

  router.delete('/:id', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    getDb().prepare('DELETE FROM groups WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return router;
}
