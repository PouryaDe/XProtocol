import React, { useEffect, useState } from 'react';
import { Copy, Edit2, Globe, KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDaysLeft } from '../lib/format';
import { updateSearchParams, useLocationState } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, Card, Input, PageHead, Select, StatusPill, Tabs } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';
import type { ClientTemplateItem } from './TemplatesPage';

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
  allowedTemplateIds?: number[];
  overrideTemplatesOnly?: boolean | null;
  note: string;
}

interface RoleItem {
  id: string;
  name: string;
  builtIn: boolean;
  isOwner: boolean;
  accountCount: number;
  permissions: Record<string, unknown>;
  limits: {
    defaultTrafficPoolGb: number | null;
    clientLimit: number | null;
    requireGroup: boolean;
    maxTrafficPerClientGb: number | null;
    maxLifetimeDays: number | null;
    maxDevicesPerClient: number | null;
    allowUnlimitedTraffic: boolean;
    allowedTemplates?: number[];
    templatesOnly?: boolean;
  };
}

export function AccountsPage() {
  const { t, lang } = useUi();
  const { searchParams } = useLocationState();
  const tab = (searchParams.get('tab') === 'roles' ? 'roles' : 'accounts') as 'accounts' | 'roles';
  const setTab = (next: 'accounts' | 'roles') => {
    updateSearchParams((p) => {
      if (next === 'accounts') p.delete('tab');
      else p.set('tab', next);
    }, { replace: true });
  };
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [templates, setTemplates] = useState<ClientTemplateItem[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('reseller');
  const [poolGb, setPoolGb] = useState('100');
  const [days, setDays] = useState('30');
  const [allowedGroupIds, setAllowedGroupIds] = useState<number[]>([]);
  const [allowedTemplateIds, setAllowedTemplateIds] = useState<number[]>([]);
  const [overrideTemplatesOnly, setOverrideTemplatesOnly] = useState<'role' | 'yes' | 'no'>('role');
  const [error, setError] = useState('');

  // Role editor modal
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleTemplatesOnly, setRoleTemplatesOnly] = useState(false);
  const [roleWebhooks, setRoleWebhooks] = useState(false);
  const [roleOwnSub, setRoleOwnSub] = useState(false);
  const [roleMetrics, setRoleMetrics] = useState(false);
  const [roleAllowedTpls, setRoleAllowedTpls] = useState<number[]>([]);

  // Reseller sub-origins & sub-apps modal
  const [resellerSubAccount, setResellerSubAccount] = useState<AccountItem | null>(null);
  const [resellerOrigins, setResellerOrigins] = useState<Array<{ url: string; primary: boolean; note: string }>>([]);
  const [newOriginUrl, setNewOriginUrl] = useState('');
  const [resellerAppSupport, setResellerAppSupport] = useState('');
  const [resellerAppTitle, setResellerAppTitle] = useState('');

  const load = async () => {
    const [aRes, rRes, gRes, tRes] = await Promise.all([
      apiFetch<{ accounts: AccountItem[] }>('/accounts'),
      apiFetch<{ roles: RoleItem[] }>('/accounts/roles'),
      apiFetch<{ groups: { id: number; name: string }[] }>('/groups'),
      apiFetch<{ items: ClientTemplateItem[] }>('/client-templates').catch(() => ({ items: [] })),
    ]);
    setAccounts(aRes.accounts);
    setRoles(rRes.roles);
    setGroups(gRes.groups);
    setTemplates(tRes.items || []);
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
          allowedTemplateIds,
          overrideTemplatesOnly: overrideTemplatesOnly === 'role' ? null : overrideTemplatesOnly === 'yes',
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
    <div className="page">
      <PageHead
        title={t.accounts.title}
        sub={`${accounts.length} accounts · ${roles.length} roles`}
        actions={
          tab === 'accounts' ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.accounts.newAccount}
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'accounts', label: t.accounts.accountsTab, count: accounts.length },
          { id: 'roles', label: t.accounts.rolesTab, count: roles.length },
        ]}
      />

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
                      setResellerSubAccount(a);
                      setNewOriginUrl('');
                      const [origRes, appRes] = await Promise.all([
                        apiFetch<{ origins: Array<{ url: string; primary: boolean; note: string }> }>(`/accounts/${a.id}/sub-origins`).catch(() => ({ origins: [] })),
                        apiFetch<{ supportUrl: string; title: string }>(`/accounts/${a.id}/sub-apps`).catch(() => ({ supportUrl: '', title: '' })),
                      ]);
                      setResellerOrigins(origRes.origins || []);
                      setResellerAppSupport(appRes.supportUrl || '');
                      setResellerAppTitle(appRes.title || '');
                    }}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {lang === 'fa' ? 'دامنه اشتراک' : 'Sub domain'}
                  </Button>
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
                    {r.accountCount} accounts · Clients: {String((r.permissions.clients as Record<string, string>)?.view || 'own')} · Max clients:{' '}
                    {r.limits.clientLimit ?? '∞'}
                    {r.limits.templatesOnly ? ' · Templates only' : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!r.builtIn && !r.isOwner && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingRole(r);
                      setRoleTemplatesOnly(Boolean(r.limits.templatesOnly));
                      setRoleWebhooks(Boolean(r.permissions.webhooks));
                      setRoleOwnSub(Boolean(r.permissions.ownSubOrigins));
                      setRoleMetrics(Boolean(r.permissions.metrics));
                      setRoleAllowedTpls(r.limits.allowedTemplates || []);
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    {t.common.edit}
                  </Button>
                )}
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
              <Select
                label={lang === 'fa' ? 'فروش فقط از قالب آماده' : 'Sell from templates only'}
                value={overrideTemplatesOnly}
                onChange={(e) => setOverrideTemplatesOnly(e.target.value as 'role' | 'yes' | 'no')}
              >
                <option value="role">{lang === 'fa' ? 'از نقش پیروی کند' : 'From role'}</option>
                <option value="yes">{lang === 'fa' ? 'بله (فقط از قالب)' : 'Yes (templates only)'}</option>
                <option value="no">{lang === 'fa' ? 'خیر' : 'No'}</option>
              </Select>
              {templates.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-(--text-secondary)">
                    {lang === 'fa' ? 'قالب‌های مجاز' : 'Allowed templates'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((tpl) => {
                      const checked = allowedTemplateIds.includes(tpl.id);
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() =>
                            setAllowedTemplateIds((prev) =>
                              checked ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id],
                            )
                          }
                          className={`rounded-xl border px-3 py-1 text-xs ${
                            checked
                              ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                              : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary)'
                          }`}
                        >
                          {tpl.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCreateOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.create}</Button>
          </div>
        </form>
      </Modal>

      {/* Role Edit Modal */}
      <Modal open={Boolean(editingRole)} onClose={() => setEditingRole(null)} title={editingRole ? `${t.common.edit}: ${editingRole.name}` : ''}>
        {editingRole && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch(`/accounts/roles/${editingRole.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  permissions: {
                    ...editingRole.permissions,
                    webhooks: roleWebhooks,
                    ownSubOrigins: roleOwnSub,
                    metrics: roleMetrics,
                  },
                  limits: {
                    ...editingRole.limits,
                    templatesOnly: roleTemplatesOnly,
                    allowedTemplates: roleAllowedTpls,
                  },
                }),
              });
              setEditingRole(null);
              load();
            }}
            className="space-y-4"
          >
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleTemplatesOnly} onChange={(e) => setRoleTemplatesOnly(e.target.checked)} />
                <span>{lang === 'fa' ? 'فروش فقط از قالب‌های مجاز (Templates only)' : 'Sell from templates only'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleOwnSub} onChange={(e) => setRoleOwnSub(e.target.checked)} />
                <span>{lang === 'fa' ? 'دامنه اشتراک اختصاصی نماینده' : 'Own subscription domains'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleWebhooks} onChange={(e) => setRoleWebhooks(e.target.checked)} />
                <span>{lang === 'fa' ? 'دسترسی وب‌هوک‌ها' : 'Webhooks'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleMetrics} onChange={(e) => setRoleMetrics(e.target.checked)} />
                <span>{lang === 'fa' ? 'دسترسی متریک‌های Prometheus' : 'Monitoring metrics'}</span>
              </label>
            </div>
            {templates.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-(--text-secondary)">
                  {lang === 'fa' ? 'قالب‌های مجاز نقش' : 'Allowed templates'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {templates.map((tpl) => {
                    const checked = roleAllowedTpls.includes(tpl.id);
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() =>
                          setRoleAllowedTpls((prev) => (checked ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id]))
                        }
                        className={`rounded-xl border px-3 py-1 text-xs ${
                          checked
                            ? 'border-(--accent) bg-(--accent-soft) text-(--accent)'
                            : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary)'
                        }`}
                      >
                        {tpl.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setEditingRole(null)}>{t.common.cancel}</Button>
              <Button type="submit" variant="primary">{t.common.save}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reseller Sub-Origins & Sub-Apps Modal */}
      <Modal
        open={Boolean(resellerSubAccount)}
        onClose={() => setResellerSubAccount(null)}
        title={resellerSubAccount ? `${resellerSubAccount.username} — ${lang === 'fa' ? 'دامنه اشتراک' : 'Subscription domains'}` : ''}
      >
        {resellerSubAccount && (
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  label={lang === 'fa' ? 'افزودن دامنه نماینده' : 'Add reseller subscription domain'}
                  value={newOriginUrl}
                  onChange={(e) => setNewOriginUrl(e.target.value)}
                  placeholder="https://sub.reseller.com"
                />
              </div>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!newOriginUrl.trim()) return;
                  const res = await apiFetch<{ origins: Array<{ url: string; primary: boolean; note: string }> }>(
                    `/accounts/${resellerSubAccount.id}/sub-origins`,
                    { method: 'POST', body: JSON.stringify({ url: newOriginUrl.trim(), primary: resellerOrigins.length === 0 }) },
                  );
                  setResellerOrigins(res.origins || []);
                  setNewOriginUrl('');
                }}
              >
                {lang === 'fa' ? 'افزودن' : 'Add'}
              </Button>
            </div>
            {resellerOrigins.length > 0 && (
              <div className="space-y-1.5">
                {resellerOrigins.map((o) => (
                  <div key={o.url} className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs">
                    <span className="font-mono" dir="ltr">{o.url} {o.primary ? '★' : ''}</span>
                    <div className="flex gap-1.5">
                      {!o.primary && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            const res = await apiFetch<{ origins: Array<{ url: string; primary: boolean; note: string }> }>(
                              `/accounts/${resellerSubAccount.id}/sub-origins`,
                              { method: 'PUT', body: JSON.stringify({ url: o.url, primary: true }) },
                            );
                            setResellerOrigins(res.origins || []);
                          }}
                        >
                          {lang === 'fa' ? 'اصلی' : 'Primary'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          const res = await apiFetch<{ origins: Array<{ url: string; primary: boolean; note: string }> }>(
                            `/accounts/${resellerSubAccount.id}/sub-origins?url=${encodeURIComponent(o.url)}`,
                            { method: 'DELETE' },
                          );
                          setResellerOrigins(res.origins || []);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-(--border-subtle) pt-3 space-y-3">
              <Input
                label={lang === 'fa' ? 'الگوی عنوان در اپ‌ها ({brand} {user})' : 'Proxy app title pattern ({brand}, {user})'}
                value={resellerAppTitle}
                onChange={(e) => setResellerAppTitle(e.target.value)}
              />
              <Input
                label={lang === 'fa' ? 'لینک پشتیبانی اختصاصی در اپ‌ها' : 'Reseller support URL'}
                value={resellerAppSupport}
                onChange={(e) => setResellerAppSupport(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await apiFetch(`/accounts/${resellerSubAccount.id}/sub-apps`, {
                      method: 'PUT',
                      body: JSON.stringify({ title: resellerAppTitle, supportUrl: resellerAppSupport }),
                    });
                    setResellerSubAccount(null);
                  }}
                >
                  {t.common.save}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
