export type ScopeAllOwnNone = 'none' | 'own' | 'all';
export type ScopeGranted = 'none' | 'granted' | 'all';
export type ScopeBool = 'none' | 'all';

export interface RolePermissions {
  clients: {
    view: ScopeAllOwnNone;
    create: ScopeAllOwnNone;
    edit: ScopeAllOwnNone;
    delete: ScopeAllOwnNone;
    resetTraffic: ScopeAllOwnNone;
    disconnect: ScopeAllOwnNone;
  };
  connections: {
    view: ScopeAllOwnNone;
    disconnect: ScopeAllOwnNone;
  };
  groups: {
    view: ScopeGranted;
    manage: ScopeBool;
  };
  inbounds: {
    view: ScopeGranted;
    manage: ScopeBool;
  };
  nodes: {
    view: ScopeBool;
    manage: ScopeBool;
  };
  webhooks?: boolean;
  ownSubOrigins?: boolean;
  metrics?: boolean;
}

export interface RoleLimits {
  defaultTrafficPoolGb: number | null;
  clientLimit: number | null;
  requireGroup: boolean;
  maxTrafficPerClientGb: number | null;
  maxLifetimeDays: number | null;
  maxDevicesPerClient: number | null;
  allowUnlimitedTraffic: boolean;
  allowedTemplates?: number[];
  templatesOnly?: boolean;
}

export interface AccountRecord {
  id: number;
  username: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  active: boolean;
  permissions: RolePermissions;
  roleLimits: RoleLimits;
  trafficPoolBytes: number | null;
  trafficUsedBytes: number;
  expiresAt: string | null;
  allowedGroupIds: number[];
  allowedInboundIds: number[];
  allowedTemplateIds: number[];
  overrideClientLimit: number | null;
  overrideRequireGroup: boolean | null;
  overrideMaxTrafficGb: number | null;
  overrideMaxLifetimeDays: number | null;
  overrideMaxDevices: number | null;
  overrideAllowUnlimited: boolean | null;
  overrideTemplatesOnly: boolean | null;
}

export const OWNER_PERMISSIONS: RolePermissions = {
  clients: { view: 'all', create: 'all', edit: 'all', delete: 'all', resetTraffic: 'all', disconnect: 'all' },
  connections: { view: 'all', disconnect: 'all' },
  groups: { view: 'all', manage: 'all' },
  inbounds: { view: 'all', manage: 'all' },
  nodes: { view: 'all', manage: 'all' },
  webhooks: true,
  ownSubOrigins: true,
  metrics: true,
};

export const ADMIN_PERMISSIONS: RolePermissions = {
  clients: { view: 'all', create: 'all', edit: 'all', delete: 'all', resetTraffic: 'all', disconnect: 'all' },
  connections: { view: 'all', disconnect: 'all' },
  groups: { view: 'all', manage: 'all' },
  inbounds: { view: 'all', manage: 'all' },
  nodes: { view: 'all', manage: 'all' },
  webhooks: true,
  ownSubOrigins: false,
  metrics: false,
};

export const RESELLER_PERMISSIONS: RolePermissions = {
  clients: { view: 'own', create: 'own', edit: 'own', delete: 'own', resetTraffic: 'own', disconnect: 'own' },
  connections: { view: 'own', disconnect: 'own' },
  groups: { view: 'granted', manage: 'none' },
  inbounds: { view: 'granted', manage: 'none' },
  nodes: { view: 'none', manage: 'none' },
  webhooks: false,
  ownSubOrigins: false,
  metrics: false,
};

export function getEffectiveLimits(acc: AccountRecord) {
  return {
    clientLimit: acc.overrideClientLimit ?? acc.roleLimits.clientLimit,
    requireGroup: acc.overrideRequireGroup ?? acc.roleLimits.requireGroup,
    maxTrafficPerClientGb: acc.overrideMaxTrafficGb ?? acc.roleLimits.maxTrafficPerClientGb,
    maxLifetimeDays: acc.overrideMaxLifetimeDays ?? acc.roleLimits.maxLifetimeDays,
    maxDevicesPerClient: acc.overrideMaxDevices ?? acc.roleLimits.maxDevicesPerClient,
    allowUnlimitedTraffic: acc.overrideAllowUnlimited ?? acc.roleLimits.allowUnlimitedTraffic,
    templatesOnly: acc.overrideTemplatesOnly ?? Boolean(acc.roleLimits.templatesOnly),
    allowedTemplateIds: acc.allowedTemplateIds.length > 0 ? acc.allowedTemplateIds : acc.roleLimits.allowedTemplates || [],
  };
}

export function getAccountStatus(acc: AccountRecord): 'active' | 'disabled' | 'expired' | 'out_of_traffic' {
  if (!acc.active) return 'disabled';
  if (acc.expiresAt && new Date(acc.expiresAt).getTime() <= Date.now()) return 'expired';
  if (acc.trafficPoolBytes !== null && acc.trafficUsedBytes >= acc.trafficPoolBytes) return 'out_of_traffic';
  return 'active';
}
