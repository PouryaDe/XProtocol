import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Card, Input, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';

interface AccountItem {
  id: number;
  username: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  status: string;
  active: boolean;
  trafficPoolBytes: number | null;
  trafficUsedBytes: number;
  expiresAt: string | null;
  clientCount: number;
  onlineCount: number;
  totpEnabled: boolean;
  note: string;
}

interface RoleItem {
  id: string;
  name: string;
  builtIn: boolean;
  isOwner: boolean;
  accountCount: number;
  permissions: Record<string, Record<string, string>>;
  limits: {
    defaultTrafficPoolGb: number | null;
    clientLimit: number | null;
    requireGroup: boolean;
    maxTrafficPerClientGb: number | null;
    maxLifetimeDays: number | null;
    maxDevicesPerClient: number | null;
    allowUnlimitedTraffic: boolean;
  };
}

export function AccountsPage() {
  const { t, lang } = useUi();
  const [tab, setTab] = useState<'accounts' | 'roles'>('accounts');
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('reseller');
  const [poolGb, setPoolGb] = useState('100');
  const [days, setDays] = useState('30');
  const [allowedGroupIds, setAllowedGroupIds] = useState<number[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    const [aRes, rRes, gRes] = await Promise.all([
      apiFetch<{ accounts: AccountItem[] }>('/accounts'),
      apiFetch<{ roles: RoleItem[] }>('/accounts/roles'),
      apiFetch<{ groups: { id: number; name: string }[] }>('/groups'),
    ]);
    setAccounts(aRes.accounts);
    setRoles(rRes.roles);
    setGroups(gRes.groups);
  };

  useEffect(() => {
    load();
  }, []);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const expiresAt = days ? new Date(Date.now() + Number(days) * 86400_000).toISOString() : null;
      await apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          roleId,
          trafficPoolGb: roleId === 'owner' ? null : Number(poolGb || 0),
          expiresAt: roleId === 'owner' ? null : expiresAt,
          allowedGroupIds,
        }),
      });
      setCreateOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const duplicateRole = async (r: RoleItem) => {
    await apiFetch('/accounts/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: `${r.name} copy`,
        permissions: r.permissions,
        limits: r.limits,
      }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-(--text-primary)">{t.accounts.title}</h1>
        <div className="flex gap-2">
          <Button variant={tab === 'accounts' ? 'primary' : 'secondary'} onClick={() => setTab('accounts')}>
            {t.accounts.accountsTab}
          </Button>
          <Button variant={tab === 'roles' ? 'primary' : 'secondary'} onClick={() => setTab('roles')}>
            {t.accounts.rolesTab}
          </Button>
          {tab === 'accounts' && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.accounts.newAccount}
            </Button>
          )}
        </div>
      </div>

      {tab === 'accounts' && (
        <div className="grid gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-(--text-primary)">{a.username}</span>
                    <span className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2 py-0.5 text-[11px] text-(--text-secondary)">
                      {a.roleName}
                    </span>
                    <StatusPill tone={a.status === 'active' ? 'green' : 'red'} label={a.status} />
                  </div>
                  <div className="text-xs text-(--text-muted)">
                    {a.clientCount} clients · {a.onlineCount} online
                    {a.trafficPoolBytes !== null &&
                      ` · Pool: ${formatBytes(a.trafficUsedBytes, lang)} / ${formatBytes(a.trafficPoolBytes, lang)}`}
                    {a.expiresAt && ` · ${formatDaysLeft(a.expiresAt, null, lang)}`}
                  </div>
                </div>
              </div>

              {!a.isOwner && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await apiFetch(`/accounts/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ addTrafficGb: 50 }),
                      });
                      load();
                    }}
                  >
                    +50 GB
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await apiFetch(`/accounts/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ addDays: 30 }),
                      });
                      load();
                    }}
                  >
                    +30d
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await apiFetch(`/accounts/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ active: !a.active }),
                      });
                      load();
                    }}
                  >
                    {a.active ? 'Switch off' : 'Switch on'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(t.common.confirmDelete)) return;
                      await apiFetch(`/accounts/${a.id}`, { method: 'DELETE' });
                      load();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid gap-3">
          {roles.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-(--text-primary)">{r.name}</span>
                    {r.builtIn && <StatusPill tone="gray" label="Built-in" />}
                  </div>
                  <div className="text-xs text-(--text-muted)">
                    {r.accountCount} accounts · Clients: {r.permissions.clients.view} · Max clients:{' '}
                    {r.limits.clientLimit ?? '∞'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => duplicateRole(r)}>
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                {!r.builtIn && !r.isOwner && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await apiFetch(`/accounts/roles/${r.id}`, { method: 'DELETE' });
                      load();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t.accounts.newAccount}>
        <form onSubmit={createAccount} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t.auth.username} value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Input
              label="Password (min 10 chars)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Select label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {roleId !== 'owner' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={t.accounts.trafficPool} type="number" value={poolGb} onChange={(e) => setPoolGb(e.target.value)} />
                <Input label="Validity (days)" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-(--text-secondary)">Allowed groups</div>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const checked = allowedGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setAllowedGroupIds((prev) =>
                            checked ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                          )
                        }
                        className={`rounded-xl border px-3 py-1 text-xs ${
                          checked
                            ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                            : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary)'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCreateOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.create}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
