import { Router } from 'express';
import { getDb } from '../db/database.js';
import { recordAudit } from '../services/audit.js';
import { scheduleSyncRunningInbounds } from '../services/syncService.js';
import type { AuthedRequest } from './context.js';

function ensureGroupSpeedColumns(): void {
  const db = getDb();
  try {
    const cols = db.prepare('PRAGMA table_info(groups)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'download_mbps')) {
      db.exec('ALTER TABLE groups ADD COLUMN download_mbps REAL');
    }
    if (!cols.some((c) => c.name === 'upload_mbps')) {
      db.exec('ALTER TABLE groups ADD COLUMN upload_mbps REAL');
    }
  } catch {
    // ignore if columns already exist
  }
}

function parseOptionalMbps(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createGroupRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    ensureGroupSpeedColumns();
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
      download_mbps?: number | null;
      upload_mbps?: number | null;
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
        downloadMbps: g.download_mbps ?? null,
        uploadMbps: g.upload_mbps ?? null,
        inboundIds: giMap.get(g.id) || [],
        clientCount: countMap.get(g.id) || 0,
        createdAt: g.created_at,
      })),
    });
  });

  router.post('/', (req: AuthedRequest, res) => {
    ensureGroupSpeedColumns();
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission to manage groups' });
      return;
    }

    const { name, note, allInbounds, enabled, inboundIds, downloadMbps, uploadMbps } = req.body as {
      name?: string;
      note?: string;
      allInbounds?: boolean;
      enabled?: boolean;
      inboundIds?: number[];
      downloadMbps?: number | null;
      uploadMbps?: number | null;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }
    const dl = parseOptionalMbps(downloadMbps);
    const ul = parseOptionalMbps(uploadMbps);
    const db = getDb();
    try {
      const info = db
        .prepare(
          'INSERT INTO groups (name, note, all_inbounds, enabled, download_mbps, upload_mbps, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(name.trim(), note || '', allInbounds ? 1 : 0, enabled === false ? 0 : 1, dl, ul, new Date().toISOString());
      const gid = Number(info.lastInsertRowid);
      if (!allInbounds && inboundIds) {
        for (const iid of inboundIds) {
          db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gid, iid);
        }
      }
      recordAudit({ accountId: acc.id, username: acc.username, action: 'group.create', target: name.trim(), ip: req.clientIp });
      scheduleSyncRunningInbounds();
      res.status(201).json({ id: gid });
    } catch (err) {
      res.status(400).json({ error: `Could not create group: ${String(err)}` });
    }
  });

  router.patch('/:id', (req: AuthedRequest, res) => {
    ensureGroupSpeedColumns();
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.groups.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const { name, note, allInbounds, enabled, inboundIds, downloadMbps, uploadMbps } = req.body as {
      name?: string;
      note?: string;
      allInbounds?: boolean;
      enabled?: boolean;
      inboundIds?: number[];
      downloadMbps?: number | null;
      uploadMbps?: number | null;
    };
    const db = getDb();
    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    const nextDl: number | null =
      downloadMbps !== undefined ? parseOptionalMbps(downloadMbps) : parseOptionalMbps(existing.download_mbps);
    const nextUl: number | null =
      uploadMbps !== undefined ? parseOptionalMbps(uploadMbps) : parseOptionalMbps(existing.upload_mbps);
    db.prepare(
      'UPDATE groups SET name = ?, note = ?, all_inbounds = ?, enabled = ?, download_mbps = ?, upload_mbps = ? WHERE id = ?',
    ).run(
      name?.trim() || String(existing.name),
      note !== undefined ? note : String(existing.note || ''),
      allInbounds !== undefined ? (allInbounds ? 1 : 0) : Number(existing.all_inbounds),
      enabled !== undefined ? (enabled ? 1 : 0) : Number(existing.enabled),
      nextDl,
      nextUl,
      id,
    );
    if (inboundIds !== undefined) {
      db.prepare('DELETE FROM group_inbounds WHERE group_id = ?').run(id);
      if (!allInbounds) {
        for (const iid of inboundIds) {
          db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(id, iid);
        }
      }
    }
    recordAudit({ accountId: acc.id, username: acc.username, action: 'group.update', target: String(existing.name), ip: req.clientIp });
    scheduleSyncRunningInbounds();
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
    scheduleSyncRunningInbounds();
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
    scheduleSyncRunningInbounds();
    res.json({ ok: true });
  });

  return router;
}
