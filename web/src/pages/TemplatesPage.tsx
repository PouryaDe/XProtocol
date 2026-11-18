import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, FileStack, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, EqLoader, Input, PageHead, Select, StatusPill } from '../components/UiPrimitives';
import { Modal } from '../components/Modal';

export interface ClientTemplateItem {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  settings: {
    trafficLimit: number;
    days: number;
    startOnFirstUse: boolean;
    maxDevices: number;
    resetStrategy: string;
    resetEveryDays: number;
    resetAnchor: number;
    groups: number[];
    instances: number[];
    speedDown: number;
    speedUp: number;
    smartdnsMaxIps: number;
    subUpdateHours: number;
    subAnnounce: string;
  };
}

interface GroupItem {
  id: number;
  name: string;
}

interface InboundItem {
  id: number;
  name: string;
  protocol: string;
  displayName?: string;
}

const GB = 1024 * 1024 * 1024;

export function TemplatesPage({ isOwner }: { isOwner: boolean }) {
  const { lang } = useUi();
  const fa = lang === 'fa';
  const [templates, setTemplates] = useState<ClientTemplateItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [inbounds, setInbounds] = useState<InboundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientTemplateItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [trafficGb, setTrafficGb] = useState('50');
  const [speedDownMbps, setSpeedDownMbps] = useState('');
  const [speedUpMbps, setSpeedUpMbps] = useState('');
  const [days, setDays] = useState('30');
  const [startOnFirstUse, setStartOnFirstUse] = useState(false);
  const [maxDevices, setMaxDevices] = useState('2');
  const [resetStrategy, setResetStrategy] = useState('none');
  const [resetEveryDays, setResetEveryDays] = useState('30');
  const [resetAnchor, setResetAnchor] = useState(0);
  const [selGroups, setSelGroups] = useState<number[]>([]);
  const [allInbounds, setAllInbounds] = useState(true);
  const [selInbounds, setSelInbounds] = useState<number[]>([]);
  const [smartdnsMaxIps, setSmartdnsMaxIps] = useState('0');
  const [subUpdateHours, setSubUpdateHours] = useState('0');
  const [subAnnounce, setSubAnnounce] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, gRes, iRes] = await Promise.all([
        apiFetch<{ items: ClientTemplateItem[] }>('/client-templates'),
        apiFetch<{ groups: GroupItem[] }>('/groups').catch(() => ({ groups: [] })),
        apiFetch<{ inbounds: InboundItem[] }>('/inbounds').catch(() => ({ inbounds: [] })),
      ]);
      setTemplates(tRes.items || []);
      setGroups(gRes.groups || []);
      setInbounds(iRes.inbounds || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (window.location.search.includes('new=1') && isOwner) {
      openNew();
    }
  }, [load, isOwner]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setTrafficGb('50');
    setSpeedDownMbps('');
    setSpeedUpMbps('');
    setDays('30');
    setStartOnFirstUse(false);
    setMaxDevices('2');
    setResetStrategy('none');
    setResetEveryDays('30');
    setResetAnchor(0);
    setSelGroups([]);
    setAllInbounds(true);
    setSelInbounds([]);
    setSmartdnsMaxIps('0');
    setSubUpdateHours('0');
    setSubAnnounce('');
    setSortOrder('0');
    setEnabled(true);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (tpl: ClientTemplateItem) => {
    setEditing(tpl);
    setName(tpl.name);
    setTrafficGb(tpl.settings.trafficLimit > 0 ? String(Math.round((tpl.settings.trafficLimit / GB) * 100) / 100) : '0');
    setSpeedDownMbps(tpl.settings.speedDown > 0 ? String(tpl.settings.speedDown / 1000) : '');
    setSpeedUpMbps(tpl.settings.speedUp > 0 ? String(tpl.settings.speedUp / 1000) : '');
    setDays(String(tpl.settings.days || 0));
    setStartOnFirstUse(Boolean(tpl.settings.startOnFirstUse));
    setMaxDevices(String(tpl.settings.maxDevices || 0));
    setResetStrategy(tpl.settings.resetStrategy || 'none');
    setResetEveryDays(String(tpl.settings.resetEveryDays || 30));
    setResetAnchor(tpl.settings.resetAnchor || 0);
    setSelGroups(tpl.settings.groups || []);
    const hasCustomInb = (tpl.settings.instances || []).length > 0;
    setAllInbounds(!hasCustomInb);
    setSelInbounds(tpl.settings.instances || []);
    setSmartdnsMaxIps(String(tpl.settings.smartdnsMaxIps || 0));
    setSubUpdateHours(String(tpl.settings.subUpdateHours || 0));
    setSubAnnounce(tpl.settings.subAnnounce || '');
    setSortOrder(String(tpl.sort || 0));
    setEnabled(tpl.enabled);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(fa ? 'نام قالب الزامی است' : 'Template name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        sort: Number(sortOrder || 0),
        enabled,
        settings: {
          trafficLimit: Number(trafficGb) > 0 ? Math.round(Number(trafficGb) * GB) : 0,
          days: Math.max(0, Math.trunc(Number(days || 0))),
          startOnFirstUse,
          maxDevices: Math.max(0, Math.trunc(Number(maxDevices || 0))),
          resetStrategy,
          resetEveryDays: resetStrategy === 'every_n_days' ? Math.max(1, Math.trunc(Number(resetEveryDays || 30))) : 0,
          resetAnchor,
          groups: selGroups,
          instances: allInbounds ? [] : selInbounds,
          speedDown: Number(speedDownMbps) > 0 ? Math.round(Number(speedDownMbps) * 1000) : 0,
          speedUp: Number(speedUpMbps) > 0 ? Math.round(Number(speedUpMbps) * 1000) : 0,
          smartdnsMaxIps: Math.max(0, Math.trunc(Number(smartdnsMaxIps || 0))),
          subUpdateHours: Math.max(0, Math.trunc(Number(subUpdateHours || 0))),
          subAnnounce: subAnnounce.slice(0, 200),
        },
      };
      if (editing) {
        await apiFetch(`/client-templates/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/client-templates', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/client-templates/${id}`, { method: 'DELETE' });
    await load();
  };

  const toggleArr = (arr: number[], setArr: (v: number[]) => void, id: number) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const resetLabel = (s: ClientTemplateItem['settings']) => {
    const map: Record<string, string> = {
      none: fa ? 'هیچ‌وقت' : 'Never',
      daily: fa ? 'روزانه' : 'Every day',
      weekly: fa ? 'هفتگی' : 'Every week',
      monthly: fa ? 'ماهانه' : 'Every month',
      yearly: fa ? 'سالانه' : 'Every year',
      jalali_monthly: fa ? 'ماهانه شمسی' : 'Every Persian month',
      jalali_yearly: fa ? 'سالانه شمسی' : 'Every Persian year',
      every_n_days: fa ? `هر ${s.resetEveryDays || 30} روز` : `Every ${s.resetEveryDays || 30} days`,
    };
    return map[s.resetStrategy] || s.resetStrategy;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <EqLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHead
        title={fa ? 'قالب‌های کاربر' : 'Client templates'}
        sub={
          fa
            ? 'پلن‌های آماده برای ساخت سریع و فروش نمایندگان با قوانین از پیش تعیین‌شده'
            : 'Ready-made plans for fast client creation and template-only reseller selling'
        }
        actions={
          isOwner ? (
            <Button variant="primary" onClick={openNew}>
              <Plus size={16} />
              {fa ? 'قالب جدید' : 'New template'}
            </Button>
          ) : undefined
        }
      />

      {templates.length === 0 ? (
        <div
          className="rounded-2xl border p-12 text-center space-y-3"
          style={{ borderColor: 'var(--line)', background: 'var(--raise)' }}
        >
          <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--raise-2)' }}>
            <FileStack size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {fa ? 'هنوز قالبی ساخته نشده است' : 'No templates yet'}
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--ink-2)' }}>
            {fa
              ? 'پلن‌های آماده مثل «۵۰ گیگ ماهانه» یا «نامحدود ۳ ماهه» بسازید تا در زمان ساخت کاربر یا فروش نمایندگان استفاده شوند.'
              : 'Create ready-made plans such as "50 GB Monthly" so admins and resellers can issue clients in one click.'}
          </p>
          {isOwner && (
            <Button variant="primary" onClick={openNew}>
              <Plus size={16} />
              {fa ? 'ایجاد اولین قالب' : 'New template'}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="xp-card rounded-2xl border p-5 space-y-4"
              style={{ borderColor: 'var(--line)', background: 'var(--raise)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                    {tpl.name}
                  </h3>
                  <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                    {tpl.settings.trafficLimit > 0 ? formatBytes(tpl.settings.trafficLimit, lang) : fa ? 'حجم نامحدود' : 'Unlimited traffic'}
                    {' · '}
                    {tpl.settings.days > 0
                      ? `${tpl.settings.days} ${fa ? 'روز' : 'days'}${tpl.settings.startOnFirstUse ? (fa ? ' (از اولین اتصال)' : ' (first connect)') : ''}`
                      : fa
                        ? 'بدون تاریخ انقضا'
                        : 'No end date'}
                  </div>
                </div>
                <StatusPill tone={tpl.enabled ? 'good' : 'neutral'}>
                  {tpl.enabled ? (fa ? 'فعال' : 'Available') : fa ? 'غیرفعال' : 'Hidden'}
                </StatusPill>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl" style={{ background: 'var(--raise-2)' }}>
                  <div style={{ color: 'var(--ink-3)' }}>{fa ? 'دستگاه هم‌زمان' : 'Devices at once'}</div>
                  <div className="font-semibold mt-0.5 num" style={{ color: 'var(--ink)' }}>
                    {tpl.settings.maxDevices > 0 ? tpl.settings.maxDevices : fa ? 'نامحدود' : 'Unlimited'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl" style={{ background: 'var(--raise-2)' }}>
                  <div style={{ color: 'var(--ink-3)' }}>{fa ? 'ریست ترافیک' : 'Reset traffic'}</div>
                  <div className="font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
                    {resetLabel(tpl.settings)}
                  </div>
                </div>
                {(tpl.settings.speedDown > 0 || tpl.settings.speedUp > 0) && (
                  <div className="col-span-2 p-2.5 rounded-xl flex justify-between" style={{ background: 'var(--raise-2)' }}>
                    <span style={{ color: 'var(--ink-3)' }}>{fa ? 'سرعت (دانلود / آپلود)' : 'Speed (Down / Up)'}</span>
                    <span className="font-semibold num" style={{ color: 'var(--ink)' }}>
                      {tpl.settings.speedDown > 0 ? `${tpl.settings.speedDown / 1000} Mbps` : '∞'} /{' '}
                      {tpl.settings.speedUp > 0 ? `${tpl.settings.speedUp / 1000} Mbps` : '∞'}
                    </span>
                  </div>
                )}
              </div>

              {isOwner && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)}>
                    <Edit2 size={14} />
                    {fa ? 'ویرایش' : 'Edit'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(tpl.id)}>
                    <Trash2 size={14} style={{ color: 'var(--bad)' }} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? (fa ? 'ویرایش قالب' : 'Edit template') : fa ? 'قالب جدید' : 'New template'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <Input
            label={fa ? 'نام قالب' : 'Name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={fa ? 'مثلاً ۵۰ گیگ ماهانه' : 'e.g. 50 GB Monthly'}
            required
          />

          <div className="space-y-2">
            <label className="block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
              {fa ? 'سهمیه ترافیک (GB)' : 'Traffic allowance (GB)'}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {['10', '20', '50', '100', '200', '500', '0'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTrafficGb(p)}
                  className="px-2.5 py-1 rounded-lg text-xs border transition-colors"
                  style={{
                    borderColor: trafficGb === p ? 'var(--accent)' : 'var(--line)',
                    background: trafficGb === p ? 'var(--accent-wash)' : 'var(--raise-2)',
                    color: trafficGb === p ? 'var(--accent-text)' : 'var(--ink-2)',
                  }}
                >
                  {p === '0' ? (fa ? 'نامحدود' : 'Unlimited') : `${p} GB`}
                </button>
              ))}
            </div>
            <Input type="number" step="0.1" min="0" value={trafficGb} onChange={(e) => setTrafficGb(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={fa ? 'سرعت دانلود (Mbps)' : 'Download speed (Mbps)'}
              type="number"
              min="0"
              step="0.5"
              value={speedDownMbps}
              onChange={(e) => setSpeedDownMbps(e.target.value)}
              placeholder={fa ? 'نامحدود' : 'Unlimited'}
            />
            <Input
              label={fa ? 'سرعت آپلود (Mbps)' : 'Upload speed (Mbps)'}
              type="number"
              min="0"
              step="0.5"
              value={speedUpMbps}
              onChange={(e) => setSpeedUpMbps(e.target.value)}
              placeholder={fa ? 'نامحدود' : 'Unlimited'}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
              {fa ? 'مدت اعتبار (روز)' : 'Duration (days)'}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {['7', '30', '60', '90', '180', '365', '0'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className="px-2.5 py-1 rounded-lg text-xs border transition-colors"
                  style={{
                    borderColor: days === d ? 'var(--accent)' : 'var(--line)',
                    background: days === d ? 'var(--accent-wash)' : 'var(--raise-2)',
                    color: days === d ? 'var(--accent-text)' : 'var(--ink-2)',
                  }}
                >
                  {d === '0' ? (fa ? 'بدون انقضا' : 'No end date') : `${d}${fa ? ' روز' : 'd'}`}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} />
              <Select
                label={fa ? 'شروع زمان اعتبار' : 'Start the clock'}
                value={startOnFirstUse ? 'first' : 'now'}
                onChange={(e) => setStartOnFirstUse(e.target.value === 'first')}
              >
                <option value="now">{fa ? 'هم‌اکنون' : 'Now'}</option>
                <option value="first">{fa ? 'در اولین اتصال' : 'At first connection'}</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={fa ? 'تعداد دستگاه هم‌زمان (۰ = نامحدود)' : 'Devices at once (0 = unlimited)'}
              type="number"
              min="0"
              value={maxDevices}
              onChange={(e) => setMaxDevices(e.target.value)}
            />
            <Select
              label={fa ? 'چرخه ریست ترافیک' : 'Reset traffic'}
              value={resetStrategy}
              onChange={(e) => setResetStrategy(e.target.value)}
            >
              <option value="none">{fa ? 'هیچ‌وقت' : 'Never'}</option>
              <option value="daily">{fa ? 'هر روز' : 'Every day'}</option>
              <option value="weekly">{fa ? 'هر هفته' : 'Every week'}</option>
              <option value="monthly">{fa ? 'هر ماه' : 'Every month'}</option>
              <option value="yearly">{fa ? 'هر سال' : 'Every year'}</option>
              <option value="jalali_monthly">{fa ? 'هر ماه شمسی' : 'Every Persian month'}</option>
              <option value="jalali_yearly">{fa ? 'هر سال شمسی' : 'Every Persian year'}</option>
              <option value="every_n_days">{fa ? 'هر N روز' : 'Every N days'}</option>
            </Select>
          </div>

          {resetStrategy === 'every_n_days' && (
            <Input
              label={fa ? 'تعداد روز دوره ریست' : 'Every N days (1-365)'}
              type="number"
              min="1"
              max="365"
              value={resetEveryDays}
              onChange={(e) => setResetEveryDays(e.target.value)}
            />
          )}

          {['monthly', 'yearly', 'jalali_monthly', 'jalali_yearly'].includes(resetStrategy) && (
            <Select
              label={fa ? 'مبنای شمارش ریست' : 'Count from'}
              value={String(resetAnchor)}
              onChange={(e) => setResetAnchor(Number(e.target.value))}
            >
              <option value="0">{fa ? 'ابتدای تقویم (ساعت ۰۰:۰۰)' : 'Calendar start'}</option>
              <option value="1">{fa ? 'تاریخ شروع کاربر' : 'Client start'}</option>
            </Select>
          )}

          {groups.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
                {fa ? 'گروه‌ها' : 'Groups'}
              </label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer"
                    style={{
                      borderColor: selGroups.includes(g.id) ? 'var(--accent)' : 'var(--line)',
                      background: selGroups.includes(g.id) ? 'var(--accent-wash)' : 'var(--raise-2)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selGroups.includes(g.id)}
                      onChange={() => toggleArr(selGroups, setSelGroups, g.id)}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              {fa ? 'اینباندها' : 'Inbounds'}
            </label>
            <label className="inline-flex items-center gap-2 text-xs mb-2 cursor-pointer">
              <input type="checkbox" checked={allInbounds} onChange={(e) => setAllInbounds(e.target.checked)} />
              <span>{fa ? 'همه اینباندهای مجاز' : 'All inbounds'}</span>
            </label>
            {!allInbounds && (
              <div className="flex flex-wrap gap-2">
                {inbounds.map((ib) => (
                  <label
                    key={ib.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer"
                    style={{
                      borderColor: selInbounds.includes(ib.id) ? 'var(--accent)' : 'var(--line)',
                      background: selInbounds.includes(ib.id) ? 'var(--accent-wash)' : 'var(--raise-2)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selInbounds.includes(ib.id)}
                      onChange={() => toggleArr(selInbounds, setSelInbounds, ib.id)}
                    />
                    <span>{ib.displayName || ib.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <details className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}>
            <summary className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-2)' }}>
              {fa ? 'گزینه‌های بیشتر' : 'More options'}
            </summary>
            <div className="space-y-3 mt-3">
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label={fa ? 'آدرس‌های Smart DNS' : 'Smart DNS addresses'}
                  type="number"
                  min="0"
                  value={smartdnsMaxIps}
                  onChange={(e) => setSmartdnsMaxIps(e.target.value)}
                />
                <Input
                  label={fa ? 'بازه بروزرسانی اشتراک (ساعت)' : 'Subscription update (h)'}
                  type="number"
                  min="0"
                  max="720"
                  value={subUpdateHours}
                  onChange={(e) => setSubUpdateHours(e.target.value)}
                />
                <Input
                  label={fa ? 'ترتیب نمایش' : 'Order'}
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                  {fa ? 'اعلان در برنامه‌های پروکسی (حداکثر ۲۰۰ کاراکتر)' : 'Announcement in proxy apps (max 200 chars)'}
                </label>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={subAnnounce}
                  onChange={(e) => setSubAnnounce(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent outline-none"
                  style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span>{fa ? 'قالب در دسترس و قابل انتخاب باشد' : 'Available'}</span>
              </label>
            </div>
          </details>

          {error && <div className="text-xs" style={{ color: 'var(--bad)' }}>{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              {fa ? 'انصراف' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (fa ? 'در حال ذخیره...' : 'Saving...') : editing ? (fa ? 'ذخیره تغییرات' : 'Save') : fa ? 'ایجاد قالب' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
