import { Router } from 'express';
import { getDb } from '../db/database.js';
import { issueLetsEncryptCert } from '../drivers/linuxEngine.js';
import { requireOwner } from './context.js';

export function createCertRouter(): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/', (_req, res) => {
    const db = getDb();
    const certs = db
      .prepare(
        `SELECT c.*, n.name as node_name
         FROM certificates c
         JOIN nodes n ON n.id = c.node_id
         ORDER BY c.id DESC`,
      )
      .all() as Array<Record<string, unknown>>;
    const inbounds = db.prepare('SELECT id, name, cert_id FROM inbounds WHERE cert_id IS NOT NULL').all() as Array<{
      id: number;
      name: string;
      cert_id: number;
    }>;

    res.json({
      certificates: certs.map((c) => ({
        id: Number(c.id),
        nodeId: Number(c.node_id),
        nodeName: String(c.node_name),
        name: String(c.name),
        domainOrIp: String(c.domain_or_ip),
        certType: String(c.cert_type),
        status: String(c.status),
        expiresAt: String(c.expires_at),
        autoRenew: Boolean(c.auto_renew),
        usedByInbounds: inbounds.filter((i) => i.cert_id === Number(c.id)).map((i) => ({ id: i.id, name: i.name })),
        createdAt: String(c.created_at),
      })),
    });
  });

  router.post('/', async (req, res) => {
    const { nodeId, domainOrIp, certType } = req.body as {
      nodeId?: number;
      domainOrIp?: string;
      certType?: 'letsencrypt' | 'ca' | 'panel';
    };
    const db = getDb();
    const nid = Number(nodeId || 1);
    const node = db.prepare('SELECT address, name FROM nodes WHERE id = ?').get(nid) as
      | { address: string; name: string }
      | undefined;
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const target = (domainOrIp || '').trim() || node.address;
    const type = certType || 'letsencrypt';
    let status = 'valid';
    if (type === 'letsencrypt' && process.platform === 'linux') {
      const issued = await issueLetsEncryptCert(target);
      if (!issued.ok) {
        status = 'failed';
      }
    }
    const days = type === 'ca' ? 3650 : 90;
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();

    const info = db
      .prepare(
        `INSERT INTO certificates (node_id, name, domain_or_ip, cert_type, status, expires_at, auto_renew, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(nid, `${type === 'letsencrypt' ? 'LE' : 'CA'}: ${target}`, target, type, status, expiresAt, new Date().toISOString());

    res.status(201).json({ id: Number(info.lastInsertRowid), status });
  });

  router.post('/:id/renew', (req, res) => {
    const id = Number(req.params.id);
    const nextExpiry = new Date(Date.now() + 90 * 86400_000).toISOString();
    getDb().prepare("UPDATE certificates SET status = 'valid', expires_at = ? WHERE id = ?").run(nextExpiry, id);
    res.json({ ok: true, expiresAt: nextExpiry });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const users = db.prepare('SELECT name FROM inbounds WHERE cert_id = ?').all(id) as { name: string }[];
    if (users.length > 0) {
      res.status(400).json({ error: `Certificate is used by: ${users.map((u) => u.name).join(', ')}` });
      return;
    }
    db.prepare('DELETE FROM certificates WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return router;
}
