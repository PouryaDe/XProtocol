import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EmptySonar, EqLoader, PageHead } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';

interface GroupItem {
  id: number;
  name: string;
  note: string;
  allInbounds: boolean;
  enabled: boolean;
  downloadMbps: number | null;
  uploadMbps: number | null;
  inboundIds: number[];
  clientCount: number;
}

interface InboundOption {
  id: number;
  name: string;
  protocol: string;
  transport?: string;
  port: number;
}

function formatTransportLabel(ib: InboundOption): string {
  if (ib.transport) return ib.transport.toUpperCase();
  if (ib.protocol === 'ocserv') return 'TCP';
  return 'UDP';
}

function formatSpeedSummary(dl: number | null, ul: number | null): string | null {
  if (!dl && !ul) return null;
  if (dl && ul) return `↓ ${dl} · ↑ ${ul} Mbps`;
  if (dl) return `↓ ${dl} Mbps`;
  return `↑ ${ul} Mbps`;
}

export function GroupsPage() {
  const { t, lang } = useUi();
  const isFa = lang === 'fa';

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [inbounds, setInbounds] = useState<InboundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [allInbounds, setAllInbounds] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [inboundIds, setInboundIds] = useState<number[]>([]);
  const [downloadMbps, setDownloadMbps] = useState('');
  const [uploadMbps, setUploadMbps] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [gRes, iRes] = await Promise.all([
        apiFetch<{ groups: GroupItem[] }>('/groups'),
        apiFetch<{ inbounds: InboundOption[] }>('/inbounds').catch(() => ({ inbounds: [] })),
      ]);
      setGroups(gRes.groups || []);
      setInbounds(iRes.inbounds || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setNote('');
    setAllInbounds(false);
    setEnabled(true);
    setInboundIds([]);
    setDownloadMbps('');
    setUploadMbps('');
    setFormErr(null);
    setModalOpen(true);
  };

  const openEdit = (g: GroupItem) => {
    setEditing(g);
    setName(g.name);
    setNote(g.note || '');
    setAllInbounds(g.allInbounds);
    setEnabled(g.enabled);
    setInboundIds(g.inboundIds || []);
    setDownloadMbps(g.downloadMbps !== null && g.downloadMbps !== undefined ? String(g.downloadMbps) : '');
    setUploadMbps(g.uploadMbps !== null && g.uploadMbps !== undefined ? String(g.uploadMbps) : '');
    setFormErr(null);
    setModalOpen(true);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: 'enable' | 'disable' | 'delete', ids: number[]) => {
    if (ids.length === 0) return;
    if (
      action === 'delete' &&
      !confirm(isFa ? 'آیا از حذف گروه(های) انتخاب‌شده مطمئن هستید؟' : t.common.confirmDelete)
    ) {
      return;
    }
    await apiFetch('/groups/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action }),
    });
    setSelected(new Set());
    await load();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormErr(null);
    const dlVal = downloadMbps.trim() ? Number(downloadMbps.trim()) : null;
    const ulVal = uploadMbps.trim() ? Number(uploadMbps.trim()) : null;
    const payload = {
      name: name.trim(),
      note: note.trim(),
      allInbounds,
      enabled,
      inboundIds: allInbounds ? [] : inboundIds,
      downloadMbps: dlVal && Number.isFinite(dlVal) && dlVal > 0 ? dlVal : null,
      uploadMbps: ulVal && Number.isFinite(ulVal) && ulVal > 0 ? ulVal : null,
    };
    try {
      if (editing) {
        await apiFetch(`/groups/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/groups', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormErr(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <EqLoader />;

  return (
    <div className="page">
      <PageHead
        title={t.groups.title}
        sub={
          isFa
            ? 'گروه تعیین می‌کند کلاینت‌ها به کدام اینباندها دسترسی داشته باشند. یک کلاینت در چند گروه، همه آن‌ها را می‌گیرد.'
            : 'A group decides which inbounds its clients get. A client in several groups gets all of them.'
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {isFa ? 'ایجاد گروه' : 'Create group'}
          </Button>
        }
      />

      {selected.size > 0 && (
        <div className="bulkbar" role="region">
          <strong className="num">
            {isFa ? `${selected.size} گروه انتخاب شده` : `${selected.size} selected`}
          </strong>
          <Button size="sm" onClick={() => void runBulk('enable', [...selected])}>
            {isFa ? 'فعال‌سازی' : 'Enable'}
          </Button>
          <Button size="sm" onClick={() => void runBulk('disable', [...selected])}>
            {isFa ? 'غیرفعال‌سازی' : 'Disable'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void runBulk('delete', [...selected])}>
            {t.common.delete}
          </Button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="cert-empty-box">
          <EmptySonar
            text={
              isFa
                ? 'هنوز گروهی وجود ندارد. تا زمانی که کلاینت عضو گروهی نباشد، اینباندهای زمان ساخت خود را حفظ می‌کند.'
                : 'No groups yet. Until a client is in a group it keeps the inbounds it was created with.'
            }
          />
        </div>
      ) : (
        <ul className="group-grid">
          {groups.map((g, idx) => {
            const matchedInbounds = g.inboundIds
              .map((id) => inbounds.find((ib) => ib.id === id))
              .filter((x): x is InboundOption => Boolean(x));
            const visibleInbounds = matchedInbounds.slice(0, 6);
            const extraCount = matchedInbounds.length - visibleInbounds.length;
            const speedText = formatSpeedSummary(g.downloadMbps, g.uploadMbps);

            return (
              <li
                key={g.id}
                className={`group-card${!g.enabled ? ' off' : ''}`}
                style={{ '--r': idx } as React.CSSProperties}
              >
                <div className="gc-head">
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={g.name}
                      checked={selected.has(g.id)}
                      onChange={() => toggleSelect(g.id)}
                    />
                  </label>
                  <span className="gc-ico" aria-hidden="true">
                    <Layers />
                  </span>
                  <h2 dir="auto">{g.name}</h2>
                  {!g.enabled && <span className="tag tag-disabled">{t.common.disabled}</span>}
                </div>

                {g.note ? (
                  <p className="text-xs text-(--ink-2)" style={{ margin: 0 }} dir="auto">
                    {g.note}
                  </p>
                ) : null}

                <div className="gc-servers">
                  {g.allInbounds ? (
                    <span className="srv-pill">
                      <span>{isFa ? 'همه اینباندها' : 'All inbounds'}</span>
                    </span>
                  ) : visibleInbounds.length === 0 ? (
                    <span className="srv-pill" style={{ opacity: 0.6 }}>
                      <span>{isFa ? 'بدون اینباند' : 'No inbounds'}</span>
                    </span>
                  ) : (
                    <>
                      {visibleInbounds.map((ib) => (
                        <span key={ib.id} className="srv-pill">
                          <span className="proto">{formatTransportLabel(ib)}</span>
                          <span dir="ltr">{ib.name}</span>
                        </span>
                      ))}
                      {extraCount > 0 && <span className="srv-pill">+{extraCount}</span>}
                    </>
                  )}
                </div>

                {speedText && (
                  <div className="gc-speed" dir="ltr">
                    {speedText}
                  </div>
                )}

                <div className="gc-foot">
                  <button
                    type="button"
                    className="gc-count"
                    onClick={() => navigate(`/clients?group=${g.id}`)}
                  >
                    <Users aria-hidden="true" />
                    <span className="num">
                      {g.clientCount} {isFa ? 'کلاینت' : g.clientCount === 1 ? 'client' : 'clients'}
                    </span>
                    {!g.allInbounds && matchedInbounds.length > 0 && (
                      <span className="faint num">
                        · {matchedInbounds.length} {isFa ? 'اینباند' : matchedInbounds.length === 1 ? 'inbound' : 'inbounds'}
                      </span>
                    )}
                  </button>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="gc-icon-btn"
                      aria-label={t.common.edit}
                      title={t.common.edit}
                      onClick={() => openEdit(g)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="gc-icon-btn danger"
                      aria-label={t.common.delete}
                      title={t.common.delete}
                      onClick={() => void runBulk('delete', [g.id])}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-lg"
        title={editing ? (isFa ? 'ویرایش گروه' : 'Edit group') : isFa ? 'ایجاد گروه' : 'Create group'}
      >
        <form className="grp-modal-form" onSubmit={(e) => void handleSave(e)}>
          {formErr && (
            <p className="rt-form-error" role="alert">
              {formErr}
            </p>
          )}

          <div className="field">
            <label className="label">{t.common.name}</label>
            <input
              className="input"
              dir="auto"
              value={name}
              maxLength={40}
              autoFocus
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">{t.common.note}</label>
            <input
              className="input"
              dir="auto"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <fieldset className="grp-section">
            <legend className="grp-section-title">{isFa ? 'اینباندها' : 'Inbounds'}</legend>
            <label className="switch">
              <input
                type="checkbox"
                checked={allInbounds}
                onChange={(e) => setAllInbounds(e.target.checked)}
              />
              <span className="track" aria-hidden="true" />
              <span className="sw-text">
                <span>
                  {isFa ? 'همه اینباندها، از جمله موارد جدید آینده' : 'All inbounds, including ones added later'}
                </span>
              </span>
            </label>

            {!allInbounds && inbounds.length > 0 && (
              <div className="grp-inbound-checks">
                {inbounds.map((ib) => {
                  const checked = inboundIds.includes(ib.id);
                  return (
                    <label key={ib.id} className="check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setInboundIds((prev) =>
                            e.target.checked ? [...prev, ib.id] : prev.filter((id) => id !== ib.id),
                          )
                        }
                      />
                      <span>
                        <span className="grp-ib-name">{ib.name}</span>{' '}
                        <span className="grp-ib-meta" dir="ltr">
                          · {formatTransportLabel(ib)} {ib.port}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="grp-section">
            <legend className="grp-section-title">{isFa ? 'محدودیت سرعت' : 'Speed limits'}</legend>
            <div className="grp-speed-grid">
              <div className="field">
                <label className="label">{isFa ? 'سرعت دانلود' : 'Download speed'}</label>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.1"
                    dir="ltr"
                    placeholder={isFa ? 'نامحدود' : 'Unlimited'}
                    value={downloadMbps}
                    onChange={(e) => setDownloadMbps(e.target.value)}
                  />
                  <span className="suffix">Mbps</span>
                </div>
              </div>

              <div className="field">
                <label className="label">{isFa ? 'سرعت آپلود' : 'Upload speed'}</label>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.1"
                    dir="ltr"
                    placeholder={isFa ? 'نامحدود' : 'Unlimited'}
                    value={uploadMbps}
                    onChange={(e) => setUploadMbps(e.target.value)}
                  />
                  <span className="suffix">Mbps</span>
                </div>
              </div>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {isFa
                ? 'به عنوان الگو: فیلدهای سرعت کلاینت‌های جدیدی که به این گروه بپیوندند را پر می‌کند. کلاینت‌های فعلی تغییر نمی‌کنند.'
                : 'A template: it fills the speed fields of new clients that join this group. Existing clients are not changed.'}
            </p>
          </fieldset>

          <div>
            <label className="switch">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="track" aria-hidden="true" />
              <span className="sw-text">
                <span>{t.common.enabled}</span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
              {saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
