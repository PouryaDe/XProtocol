import { Router } from 'express';
import { getDb } from '../db/database.js';
import type { AuthedRequest } from './context.js';

function escLabel(v: string): string {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function createMetricsRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const hasScope =
      acc.isOwner ||
      Boolean(acc.permissions.metrics) ||
      Boolean(req.auth?.apiScopes?.includes('metrics.read'));
    if (!hasScope) {
      res.status(403).type('text/plain').send('# Forbidden: metrics.read permission required\n');
      return;
    }

    const db = getDb();
    const nodes = db.prepare('SELECT * FROM nodes ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    const inbounds = db.prepare('SELECT id, node_id, name, protocol, running FROM inbounds').all() as Array<Record<string, unknown>>;
    const clients = db.prepare('SELECT enabled, traffic_limit_bytes, traffic_used_bytes, expires_at FROM clients').all() as Array<{
      enabled: number;
      traffic_limit_bytes: number | null;
      traffic_used_bytes: number;
      expires_at: string | null;
    }>;
    const liveRows = db.prepare('SELECT node_id, COUNT(*) as cnt FROM connections_live GROUP BY node_id').all() as Array<{
      node_id: number;
      cnt: number;
    }>;
    const liveByNode = new Map(liveRows.map((l) => [Number(l.node_id), Number(l.cnt)]));

    const nowMs = Date.now();
    let activeClients = 0;
    for (const c of clients) {
      if (
        c.enabled &&
        (!c.expires_at || Date.parse(c.expires_at) > nowMs) &&
        (c.traffic_limit_bytes === null || c.traffic_used_bytes < c.traffic_limit_bytes)
      ) {
        activeClients += 1;
      }
    }

    const lines: string[] = [
      '# HELP xprotocol_up Whether the XProtocol panel process is up (1 = up).',
      '# TYPE xprotocol_up gauge',
      'xprotocol_up 1',
      '# HELP xprotocol_clients_total Total number of configured VPN clients.',
      '# TYPE xprotocol_clients_total gauge',
      `xprotocol_clients_total ${clients.length}`,
      '# HELP xprotocol_clients_active Number of currently active clients.',
      '# TYPE xprotocol_clients_active gauge',
      `xprotocol_clients_active ${activeClients}`,
      '# HELP xprotocol_clients_online Total open client tunnels across all nodes.',
      '# TYPE xprotocol_clients_online gauge',
      `xprotocol_clients_online ${[...liveByNode.values()].reduce((a, b) => a + b, 0)}`,
      '# HELP xprotocol_nodes_total Total registered nodes.',
      '# TYPE xprotocol_nodes_total gauge',
      `xprotocol_nodes_total ${nodes.length}`,
      '# HELP xprotocol_node_up Whether a node is reachable (1 = up, 0 = down).',
      '# TYPE xprotocol_node_up gauge',
    ];

    for (const n of nodes) {
      const id = Number(n.id);
      const lbl = `node="${escLabel(String(n.name))}",node_id="${id}"`;
      const up = Boolean(n.enabled) && (Boolean(n.is_local) || String(n.status) === 'connected') ? 1 : 0;
      lines.push(`xprotocol_node_up{${lbl}} ${up}`);
    }

    lines.push('# HELP xprotocol_node_cpu_ratio CPU utilization ratio (0..1) per node.');
    lines.push('# TYPE xprotocol_node_cpu_ratio gauge');
    for (const n of nodes) {
      const id = Number(n.id);
      lines.push(`xprotocol_node_cpu_ratio{node="${escLabel(String(n.name))}",node_id="${id}"} ${(Number(n.cpu_pct || 0) / 100).toFixed(4)}`);
    }

    lines.push('# HELP xprotocol_node_memory_ratio Memory utilization ratio (0..1) per node.');
    lines.push('# TYPE xprotocol_node_memory_ratio gauge');
    for (const n of nodes) {
      const id = Number(n.id);
      lines.push(`xprotocol_node_memory_ratio{node="${escLabel(String(n.name))}",node_id="${id}"} ${(Number(n.mem_pct || 0) / 100).toFixed(4)}`);
    }

    lines.push('# HELP xprotocol_node_disk_ratio Disk utilization ratio (0..1) per node.');
    lines.push('# TYPE xprotocol_node_disk_ratio gauge');
    for (const n of nodes) {
      const id = Number(n.id);
      lines.push(`xprotocol_node_disk_ratio{node="${escLabel(String(n.name))}",node_id="${id}"} ${(Number(n.disk_pct || 0) / 100).toFixed(4)}`);
    }

    lines.push('# HELP xprotocol_node_traffic_bytes_total Total traffic bytes passed through each node.');
    lines.push('# TYPE xprotocol_node_traffic_bytes_total counter');
    for (const n of nodes) {
      const id = Number(n.id);
      lines.push(`xprotocol_node_traffic_bytes_total{node="${escLabel(String(n.name))}",node_id="${id}"} ${Number(n.real_traffic_bytes || 0)}`);
    }

    lines.push('# HELP xprotocol_inbounds_running Running status of configured inbounds.');
    lines.push('# TYPE xprotocol_inbounds_running gauge');
    for (const ib of inbounds) {
      lines.push(
        `xprotocol_inbounds_running{inbound="${escLabel(String(ib.name))}",protocol="${escLabel(String(ib.protocol))}",inbound_id="${Number(ib.id)}"} ${ib.running ? 1 : 0}`,
      );
    }

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
  });

  return router;
}
