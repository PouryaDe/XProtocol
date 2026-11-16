export interface OutboundSummary {
  protocol: string;
  endpoint: string;
  transport: string;
  security: string;
}

export interface OutboundTestResult {
  testedAt?: string;
  reachable: boolean;
  latencyMs: number;
  bestMs?: number;
  avgMs?: number;
  error: string | null;
  exitHost: string;
  attempts?: Array<{ ms: number; error: string | null }>;
}

export interface OutboundItem {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  secretsSet?: string[];
  usedBy?: number[];
  lastTest: OutboundTestResult | null;
  createdAt: string;
}

export interface RoutingRule {
  id: string;
  enabled?: boolean;
  geosite?: string[];
  geoip?: string[];
  domains?: string[];
  ips?: string[];
  ports?: string;
  inboundIds?: number[];
  inboundNames?: string[];
  action: 'outbound' | 'direct' | 'block';
  outboundId?: number;
  outboundTag?: string;
}

export interface InboundRouteOverride {
  inbound: number;
  action: {
    type: 'none' | 'direct' | 'block' | 'outbound';
    outboundId?: number;
  };
}

export interface NodeInboundItem {
  id: number;
  name: string;
  protocol: string;
  port: number;
  subnet: string;
  enabled: boolean;
  running: boolean;
}

export interface RoutingPolicy {
  nodeId: number;
  enabled: boolean;
  inboundScope: 'all' | 'chosen';
  inboundIds: number[];
  inboundRoutes: InboundRouteOverride[];
  defaultAction: 'direct' | 'outbound' | 'block';
  defaultOutboundId: number | null;
  rules: RoutingRule[];
  status: string;
  statusMessage: string;
  updatedAt: string;
}

export interface RoutingCatalog {
  geo: {
    updatedAt: number;
    available: boolean;
    refreshing: boolean;
  };
  geosite: string[];
  geoip: string[];
  favorites: {
    geosite: string[];
    geoip: string[];
  };
  psiphonRegions: string[];
}

export interface NodeListItem {
  id: number;
  name: string;
  address: string;
  isLocal: boolean;
  enabled: boolean;
  status: string;
  xprotocolVersion?: string;
}

export function getOutboundSummary(ob: Pick<OutboundItem, 'type' | 'config'>): OutboundSummary {
  const cfg = ob.config || {};
  const proto = (ob.type || 'vless').toUpperCase();
  const host = String(cfg.address || cfg.serverHostname || '').trim();
  const port = cfg.port ? String(cfg.port) : '';
  const region = String(cfg.region || '').trim();
  const endpoint = host ? (port ? `${host}:${port}` : host) : region || '';
  const transport = String(cfg.transport || (ob.type === 'wireguard' ? 'udp' : ob.type === 'socks' || ob.type === 'http' ? 'tcp' : 'tcp'));
  const security = String(cfg.security || (ob.type === 'wireguard' ? 'noise' : 'none'));
  return { protocol: proto, endpoint, transport, security };
}

export function getProviderType(ob: Pick<OutboundItem, 'config'>): 'warp' | 'nordvpn' | 'psiphon' | null {
  const p = String(ob.config?.provider || '').toLowerCase();
  if (p === 'warp' || p === 'nordvpn' || p === 'psiphon') return p;
  return null;
}

export function makeRuleId(existing: RoutingRule[]): string {
  const used = new Set(existing.map((r) => r.id));
  for (let i = 0; i < 10; i++) {
    const id = `r_${Math.random().toString(36).slice(2, 10)}`;
    if (!used.has(id)) return id;
  }
  return `r_${Date.now().toString(36)}`;
}

export function formatProtocolLabel(proto: string): string {
  switch (proto.toLowerCase()) {
    case 'ocserv':
      return 'OpenConnect';
    case 'wireguard':
      return 'WireGuard';
    case 'ikev2':
      return 'IKEv2';
    case 'l2tp':
      return 'L2TP';
    case 'amneziawg':
      return 'AmneziaWG';
    default:
      return proto.toUpperCase();
  }
}
