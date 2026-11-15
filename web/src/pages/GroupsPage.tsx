import React, { useEffect, useState } from 'react';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Button, Card, Input, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';

interface GroupItem {
  id: number;
  name: string;
  note: string;
  allInbounds: boolean;
  enabled: boolean;
  inboundIds: number[];
  clientCount: number;
}

interface InboundOption {
  id: number;
  name: string;
  protocol: string;
  port: number;
}

export function GroupsPage() {
  const { t } = useUi();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [inbounds, setInbounds] = useState<InboundOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [allInbounds, setAllInbounds] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [inboundIds, setInboundIds] = useState<number[]>([]);

  const load = async () => {
    const [gRes, iRes] = await Promise.all([
      apiFetch<{ groups: GroupItem[] }>('/groups'),
      apiFetch<{ inbounds: InboundOption[] }>('/inbounds').catch(() => ({ inbounds: [] })),
    ]);
    setGroups(gRes.groups);
    setInbounds(iRes.inbounds);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setNote('');
    setAllInbounds(true);
    setEnabled(true);
    setInboundIds([]);
    setModalOpen(true);
  };

  const openEdit = (g: GroupItem) => {
    setEditing(g);
    setName(g.name);
    setNote(g.note);
    setAllInbounds(g.allInbounds);
    setEnabled(g.enabled);
    setInboundIds(g.inboundIds);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, note, allInbounds, enabled, inboundIds };
    if (editing) {
      await apiFetch(`/groups/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/groups', { method: 'POST', body: JSON.stringify(payload) });
    }
    setModalOpen(false);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t.groups.title}</h1>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t.groups.newGroup}
        </Button>
      </div>

      <div className="grid gap-3">
        {groups.map((g) => (
          <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">{g.name}</span>
                  <StatusPill tone={g.enabled ? 'green' : 'gray'} label={g.enabled ? t.common.enabled : t.common.disabled} />
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {g.allInbounds ? t.groups.allInbounds : `${g.inboundIds.length} ${t.groups.inboundsCount}`} ·{' '}
                  {g.clientCount} {t.groups.clientsCount}
                  {g.note ? ` · ${g.note}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => openEdit(g)}>
                <Pencil className="h-3.5 w-3.5" />
                {t.common.edit}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!confirm(t.common.confirmDelete)) return;
                  await apiFetch(`/groups/${g.id}`, { method: 'DELETE' });
                  load();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t.common.edit : t.groups.newGroup}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label={t.common.name} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={t.common.note} value={note} onChange={(e) => setNote(e.target.value)} />

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={allInbounds} onChange={(e) => setAllInbounds(e.target.checked)} />
            <span>{t.groups.allInbounds}</span>
          </label>

          {!allInbounds && (
            <div className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              {inbounds.map((ib) => {
                const checked = inboundIds.includes(ib.id);
                return (
                  <label key={ib.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setInboundIds((prev) =>
                          checked ? prev.filter((id) => id !== ib.id) : [...prev, ib.id],
                        )
                      }
                    />
                    <span>
                      {ib.name} ({ib.protocol.toUpperCase()} :{ib.port})
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{t.common.enabled}</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setModalOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.save}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
