import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Segmented } from './UiPrimitives';
import type { ClientTemplateItem } from '../pages/TemplatesPage';

export interface ClientFormClient {
  id: number;
  name: string;
  trafficLimitBytes: number | null;
  expiresAt: string | null;
  firstConnectDays: number | null;
  deviceLimit: number | null;
  downloadMbps?: number | null;
  uploadMbps?: number | null;
  resetPeriod: string;
  resetEveryDays?: number;
  resetAnchor?: number;
  templateId?: number;
  subUpdateHours?: number;
  subAnnounce?: string;
  fixedIp: string;
  enabled: boolean;
  note: string;
  contact: string;
  groups: { id: number; name: string }[];
  inboundIds: number[];
  vpnPassword?: string;
}

export interface ClientFormGroup {
  id: number;
  name: string;
}

export interface ClientFormInbound {
  id: number;
  name: string;
  protocol: string;
  transport: string;
  port: number;
  subnet?: string;
  nodeName: string;
  enabled: boolean;
}

interface ClientFormSheetProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'bulk' | 'edit';
  client?: ClientFormClient | null;
  groups: ClientFormGroup[];
  inbounds: ClientFormInbound[];
  templates?: ClientTemplateItem[];
  templatesOnly?: boolean;
  onSaved: (bulkItems?: Array<{ id: number; name: string; subToken: string }>) => void | Promise<void>;
}

const TRAFFIC_CHIPS = ['10', '20', '50', '100', '200', '500', ''] as const;
const DURATION_CHIPS = ['1', '7', '30', '60', '90', '180', '365'] as const;

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToDateInput(currentDateStr: string, addDays: number): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let base = today;
  if (currentDateStr) {
    const parsed = new Date(`${currentDateStr}T12:00:00`);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > today.getTime()) {
      base = parsed;
    }
  }
  const next = new Date(base.getTime() + addDays * 86400_000);
  return toDateInputValue(next.toISOString());
}

function formatReadableDate(dateStr: string, lang: 'en' | 'fa'): string {
  if (!dateStr) return lang === 'fa' ? 'بدون تاریخ پایان' : 'No end date';
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  try {
    return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parsed);
  } catch {
    return dateStr;
  }
}

function formatInboundProtocolTag(ib: ClientFormInbound): string {
  const p = String(ib.protocol || '').toLowerCase();
  const t = String(ib.transport || 'udp').toUpperCase();
  if (p === 'wireguard' || p === 'amneziawg') return `${t} ${ib.port}`;
  return `${t} ${ib.port}`;
}

export function ClientFormSheet({
  open,
  onClose,
  mode,
  client,
  groups,
  inbounds,
  templates = [],
  templatesOnly = false,
  onSaved,
}: ClientFormSheetProps) {
  const { lang } = useUi();
  const isEdit = mode === 'edit' && Boolean(client);
  const isBulk = mode === 'bulk';

  const [templateId, setTemplateId] = useState(0);
  const [name, setName] = useState('');
  const [startNumber, setStartNumber] = useState('1');
  const [bulkCount, setBulkCount] = useState('10');

  const [trafficGb, setTrafficGb] = useState('50');
  const [downloadMbps, setDownloadMbps] = useState('');
  const [uploadMbps, setUploadMbps] = useState('');

  // Create / Bulk duration state
  const [expiryMode, setExpiryMode] = useState<'unlimited' | 'days' | 'first_connect'>('days');
  const [expiryDays, setExpiryDays] = useState('30');

  // Edit date state
  const [endsOn, setEndsOn] = useState('');

  const [deviceLimit, setDeviceLimit] = useState('2');
  const [resetPeriod, setResetPeriod] = useState('never');
  const [resetEveryDays, setResetEveryDays] = useState('30');
  const [resetAnchor, setResetAnchor] = useState(0);

  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [allInbounds, setAllInbounds] = useState(true);
  const [selectedInboundIds, setSelectedInboundIds] = useState<number[]>([]);

  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [vpnPassword, setVpnPassword] = useState('');
  const [fixedIp, setFixedIp] = useState('');
  const [subUpdateHours, setSubUpdateHours] = useState('');
  const [subAnnounce, setSubAnnounce] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const enabledInbounds = useMemo(() => inbounds.filter((ib) => ib.enabled), [inbounds]);

  const applyTemplateToForm = (tpl: ClientTemplateItem) => {
    setTemplateId(tpl.id);
    setTrafficGb(
      tpl.settings.trafficLimit > 0 ? String(Math.round((tpl.settings.trafficLimit / 1024 ** 3) * 100) / 100) : '',
    );
    setDownloadMbps(tpl.settings.speedDown > 0 ? String(tpl.settings.speedDown / 1000) : '');
    setUploadMbps(tpl.settings.speedUp > 0 ? String(tpl.settings.speedUp / 1000) : '');
    if (tpl.settings.days > 0) {
      setExpiryMode(tpl.settings.startOnFirstUse ? 'first_connect' : 'days');
      setExpiryDays(String(tpl.settings.days));
    } else {
      setExpiryMode('unlimited');
      setExpiryDays('');
    }
    setDeviceLimit(tpl.settings.maxDevices > 0 ? String(tpl.settings.maxDevices) : '0');
    setResetPeriod(tpl.settings.resetStrategy === 'none' ? 'never' : tpl.settings.resetStrategy || 'never');
    setResetEveryDays(String(tpl.settings.resetEveryDays || 30));
    setResetAnchor(tpl.settings.resetAnchor || 0);
    setSubUpdateHours(tpl.settings.subUpdateHours > 0 ? String(tpl.settings.subUpdateHours) : '');
    setSubAnnounce(tpl.settings.subAnnounce || '');
    if (tpl.settings.groups?.length) setSelectedGroupIds(tpl.settings.groups);
    if (tpl.settings.instances?.length) {
      setAllInbounds(false);
      setSelectedInboundIds(tpl.settings.instances);
    }
  };

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setSaving(false);

    if (mode === 'edit' && client) {
      setTemplateId(client.templateId || 0);
      setName(client.name);
      setTrafficGb(client.trafficLimitBytes ? String(Math.round(client.trafficLimitBytes / 1024 ** 3)) : '');
      setDownloadMbps(client.downloadMbps ? String(client.downloadMbps) : '');
      setUploadMbps(client.uploadMbps ? String(client.uploadMbps) : '');
      setEndsOn(toDateInputValue(client.expiresAt));
      setDeviceLimit(client.deviceLimit && client.deviceLimit > 0 ? String(client.deviceLimit) : '0');
      setResetPeriod(client.resetPeriod || 'never');
      setResetEveryDays(String(client.resetEveryDays || 30));
      setResetAnchor(client.resetAnchor || 0);
      setSelectedGroupIds(client.groups.map((g) => g.id));

      const hasAllDirect =
        client.inboundIds.length === 0 ||
        (enabledInbounds.length > 0 && enabledInbounds.every((ib) => client.inboundIds.includes(ib.id)));
      setAllInbounds(hasAllDirect);
      setSelectedInboundIds(hasAllDirect ? [] : client.inboundIds);

      setVpnPassword(client.vpnPassword || '');
      setFixedIp(client.fixedIp || '');
      setSubUpdateHours(client.subUpdateHours && client.subUpdateHours > 0 ? String(client.subUpdateHours) : '');
      setSubAnnounce(client.subAnnounce || '');
      setContact(client.contact || '');
      setNote(client.note || '');
      setEnabled(client.enabled);
      setShowMoreOptions(
        Boolean(
          !client.enabled ||
            client.fixedIp ||
            client.contact ||
            client.note ||
            client.subAnnounce ||
            (client.subUpdateHours && client.subUpdateHours > 0),
        ),
      );
      return;
    }

    // Create / Bulk defaults matching Ovira
    setTemplateId(0);
    setName(mode === 'bulk' ? 'user-' : '');
    setStartNumber('1');
    setBulkCount('10');
    setTrafficGb('50');
    setDownloadMbps('');
    setUploadMbps('');
    setExpiryMode('days');
    setExpiryDays('30');
    setEndsOn('');
    setDeviceLimit('2');
    setResetPeriod('never');
    setResetEveryDays('30');
    setResetAnchor(0);
    setSelectedGroupIds([]);
    setAllInbounds(true);
    setSelectedInboundIds([]);
    setVpnPassword('');
    setFixedIp('');
    setSubUpdateHours('');
    setSubAnnounce('');
    setContact('');
    setNote('');
    setEnabled(true);
    setShowMoreOptions(false);

    if (templatesOnly && templates.length > 0) {
      applyTemplateToForm(templates[0]);
    }
  }, [open, mode, client]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const bulkPreviewRange = useMemo(() => {
    const raw = name.trim() || 'user-';
    const sep = /[-_]$/.test(raw) ? '' : '-';
    const start = Math.max(1, Number(startNumber || 1));
    const count = Math.max(1, Number(bulkCount || 1));
    const first = `${raw}${sep}${String(start).padStart(2, '0')}`;
    const last = `${raw}${sep}${String(start + count - 1).padStart(2, '0')}`;
    return { first, last };
  }, [name, startNumber, bulkCount]);

  const subnetHint = useMemo(() => {
    const subs = enabledInbounds.map((i) => i.subnet).filter((s): s is string => Boolean(s && s.trim()));
    if (subs.length === 0) return '(-, -)';
    return `(${subs[0]}, ${subs[subs.length - 1]})`;
  }, [enabledInbounds]);

  if (!open) return null;

  const title = isEdit
    ? lang === 'fa'
      ? `ویرایش ${client!.name}`
      : `Edit ${client!.name}`
    : isBulk
      ? lang === 'fa'
        ? 'ساخت چند کاربر'
        : 'Create several clients'
      : lang === 'fa'
        ? 'کاربر جدید'
        : 'New client';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const parsedDev = deviceLimit.trim() === '' ? null : Math.max(0, Math.trunc(Number(deviceLimit)));
      const effectiveDeviceLimit = parsedDev === null || parsedDev <= 0 ? null : parsedDev;
      const resolvedInboundIds = allInbounds
        ? selectedGroupIds.length === 0
          ? enabledInbounds.map((ib) => ib.id)
          : []
        : selectedInboundIds;

      if (isEdit && client) {
        const origDateStr = toDateInputValue(client.expiresAt);
        let nextExpiresAt: string | null | undefined = undefined;
        if (endsOn !== origDateStr) {
          nextExpiresAt = endsOn ? new Date(`${endsOn}T23:59:59`).toISOString() : null;
        }
        await apiFetch(`/clients/${client.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            trafficGb: trafficGb.trim() ? Number(trafficGb) : null,
            downloadMbps: downloadMbps.trim() ? Number(downloadMbps) : null,
            uploadMbps: uploadMbps.trim() ? Number(uploadMbps) : null,
            expiresAt: nextExpiresAt,
            deviceLimit: effectiveDeviceLimit,
            resetPeriod,
            resetEveryDays: resetPeriod === 'every_n_days' ? Number(resetEveryDays || 30) : 0,
            resetAnchor,
            subUpdateHours: subUpdateHours.trim() ? Number(subUpdateHours) : 0,
            subAnnounce,
            fixedIp,
            vpnPassword: vpnPassword.trim() || undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
            inboundIds: resolvedInboundIds,
          }),
        });
        await onSaved();
      } else {
        const res = await apiFetch<{ ids: number[]; items?: Array<{ id: number; name: string; subToken: string }> }>('/clients', {
          method: 'POST',
          body: JSON.stringify({
            name: isBulk ? undefined : name.trim(),
            prefix: isBulk ? name.trim() : undefined,
            startNumber: isBulk ? Number(startNumber || 1) : undefined,
            count: isBulk ? Math.max(1, Number(bulkCount || 1)) : 1,
            templateId: templateId || undefined,
            trafficGb: trafficGb.trim() ? Number(trafficGb) : null,
            downloadMbps: downloadMbps.trim() ? Number(downloadMbps) : null,
            uploadMbps: uploadMbps.trim() ? Number(uploadMbps) : null,
            expiryMode,
            expiryDays: expiryMode === 'unlimited' ? 0 : Number(expiryDays || 30),
            deviceLimit: effectiveDeviceLimit,
            resetPeriod,
            resetEveryDays: resetPeriod === 'every_n_days' ? Number(resetEveryDays || 30) : 0,
            resetAnchor,
            subUpdateHours: subUpdateHours.trim() ? Number(subUpdateHours) : 0,
            subAnnounce,
            fixedIp: isBulk ? '' : fixedIp,
            vpnPassword: !isBulk && vpnPassword.trim() ? vpnPassword.trim() : undefined,
            enabled,
            note,
            contact,
            groupIds: selectedGroupIds,
            inboundIds: resolvedInboundIds,
          }),
        });
        await onSaved(isBulk ? res.items : undefined);
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : lang === 'fa' ? 'خطا در ذخیره کاربر' : 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const lockPlanForReseller = Boolean(templatesOnly && !isEdit);
  const submitDisabled = saving || !name.trim();

  return (
    <div
      className="xp-backdrop fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ov-sheet" role="dialog" aria-modal="true" aria-labelledby="ov-client-sheet-title">
        <header className="ov-sheet-head">
          <h2 id="ov-client-sheet-title" className="ov-sheet-title">
            {title}
          </h2>
          <button
            type="button"
            className="ov-sheet-close"
            onClick={onClose}
            aria-label={lang === 'fa' ? 'بستن' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="ov-sheet-body">
            <div className="stack">
              {!isEdit && templates.length > 0 && (
                <div className="field">
                  <label className="label">{lang === 'fa' ? 'قالب آماده' : 'Plan template'}</label>
                  <select
                    className="select"
                    value={String(templateId)}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      if (!id) {
                        setTemplateId(0);
                      } else {
                        const tpl = templates.find((tItem) => tItem.id === id);
                        if (tpl) applyTemplateToForm(tpl);
                      }
                    }}
                  >
                    {!templatesOnly && (
                      <option value="0">{lang === 'fa' ? '— تنظیم دستی —' : '— Custom plan —'}</option>
                    )}
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                  {templatesOnly && (
                    <p className="hint">
                      {lang === 'fa'
                        ? 'حساب شما فقط مجاز به ساخت کاربر از قالب‌های تعریف‌شده است.'
                        : 'Your role sells from approved templates only.'}
                    </p>
                  )}
                </div>
              )}

              {isBulk ? (
                <div className="field">
                  <div className="form-row-3">
                    <label className="field">
                      <span className="label">{lang === 'fa' ? 'پیشوند نام' : 'Name prefix'}</span>
                      <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span className="label">{lang === 'fa' ? 'شماره شروع' : 'First number'}</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={999}
                        value={startNumber}
                        onChange={(e) => setStartNumber(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span className="label">{lang === 'fa' ? 'تعداد' : 'How many'}</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={200}
                        value={bulkCount}
                        onChange={(e) => setBulkCount(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <p className="hint" dir="ltr">
                    {lang === 'fa'
                      ? `ساخته می‌شود: ${bulkPreviewRange.first} … ${bulkPreviewRange.last}`
                      : `Creates ${bulkPreviewRange.first} … ${bulkPreviewRange.last}`}
                  </p>
                </div>
              ) : (
                <label className="field">
                  <span className="label">{lang === 'fa' ? 'نام' : 'Name'}</span>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <span className="hint">
                    {lang === 'fa'
                      ? 'نام کاربری VPN نیز هست. فقط حروف، اعداد، نقطه، خط تیره و زیرخط.'
                      : 'Also the VPN username. Letters, digits, dot, dash, underscore.'}
                  </span>
                </label>
              )}

              <h3 className="sheet-section-title">{lang === 'fa' ? 'طرح' : 'Plan'}</h3>

              <div className="field">
                <label className="label">{lang === 'fa' ? 'حجم ترافیک' : 'Traffic allowance'}</label>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    value={trafficGb}
                    disabled={lockPlanForReseller}
                    onChange={(e) => setTrafficGb(e.target.value)}
                    placeholder={lang === 'fa' ? 'نامحدود' : 'Unlimited'}
                  />
                  <span className="suffix">GB</span>
                </div>
                <div className="chips">
                  {TRAFFIC_CHIPS.map((preset) => {
                    const active = trafficGb === preset;
                    return (
                      <button
                        key={preset || 'unlimited'}
                        type="button"
                        className="chip"
                        aria-pressed={active}
                        disabled={lockPlanForReseller}
                        onClick={() => setTrafficGb(preset)}
                      >
                        {preset || (lang === 'fa' ? 'نامحدود' : 'Unlimited')}
                      </button>
                    );
                  })}
                </div>
                <p className="hint">{lang === 'fa' ? 'برای نامحدود خالی بگذارید.' : 'Leave empty for unlimited.'}</p>
              </div>

              <div className="field">
                <div className="form-row">
                  <label className="field">
                    <span className="label">{lang === 'fa' ? 'سرعت دانلود' : 'Download speed'}</span>
                    <div className="input-group">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.5"
                        value={downloadMbps}
                        disabled={lockPlanForReseller}
                        onChange={(e) => setDownloadMbps(e.target.value)}
                        placeholder={lang === 'fa' ? 'نامحدود' : 'Unlimited'}
                      />
                      <span className="suffix">Mbps</span>
                    </div>
                  </label>
                  <label className="field">
                    <span className="label">{lang === 'fa' ? 'سرعت آپلود' : 'Upload speed'}</span>
                    <div className="input-group">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.5"
                        value={uploadMbps}
                        disabled={lockPlanForReseller}
                        onChange={(e) => setUploadMbps(e.target.value)}
                        placeholder={lang === 'fa' ? 'نامحدود' : 'Unlimited'}
                      />
                      <span className="suffix">Mbps</span>
                    </div>
                  </label>
                </div>
                <p className="hint">
                  {lang === 'fa'
                    ? 'برای هر دستگاه؛ خالی یا ۰ = نامحدود. روی WireGuard، AmneziaWG، OpenVPN، OpenConnect، IKEv2، L2TP و Xray اعمال می‌شود.'
                    : 'Per device, empty or 0 = unlimited. Applies across WireGuard, AmneziaWG, OpenVPN, OpenConnect, IKEv2, L2TP, and Xray.'}
                </p>
              </div>

              {isEdit ? (
                <div className="field">
                  <label className="label">{lang === 'fa' ? 'تاریخ پایان' : 'Ends on'}</label>
                  <input
                    className="input"
                    type="date"
                    value={endsOn}
                    onChange={(e) => setEndsOn(e.target.value)}
                  />
                  <div className="chips">
                    {[30, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="chip"
                        aria-pressed={false}
                        onClick={() => setEndsOn((prev) => addDaysToDateInput(prev, d))}
                      >
                        {lang === 'fa' ? `+${d} روز` : `+${d} days`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={!endsOn}
                      onClick={() => setEndsOn('')}
                    >
                      {lang === 'fa' ? 'بدون تاریخ پایان' : 'No end date'}
                    </button>
                  </div>
                  <p className="hint">
                    {!endsOn && client?.firstConnectDays
                      ? lang === 'fa'
                        ? `شروع با اولین اتصال (${client.firstConnectDays} روز)`
                        : `Starts on first connection (${client.firstConnectDays} days)`
                      : formatReadableDate(endsOn, lang)}
                  </p>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label className="label">{lang === 'fa' ? 'مدت اعتبار' : 'Duration'}</label>
                    <div className="input-group">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        disabled={lockPlanForReseller}
                        value={expiryMode === 'unlimited' ? '' : expiryDays}
                        onChange={(e) => {
                          if (expiryMode === 'unlimited') setExpiryMode('days');
                          setExpiryDays(e.target.value);
                        }}
                        placeholder={lang === 'fa' ? 'بدون تاریخ پایان' : 'No end date'}
                      />
                      <span className="suffix">{lang === 'fa' ? 'روز' : 'days'}</span>
                    </div>
                    <div className="chips">
                      {DURATION_CHIPS.map((d) => {
                        const active = expiryMode !== 'unlimited' && expiryDays === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            className="chip"
                            aria-pressed={active}
                            disabled={lockPlanForReseller}
                            onClick={() => {
                              if (expiryMode === 'unlimited') setExpiryMode('days');
                              setExpiryDays(d);
                            }}
                          >
                            {d}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={expiryMode === 'unlimited'}
                        disabled={lockPlanForReseller}
                        onClick={() => setExpiryMode('unlimited')}
                      >
                        {lang === 'fa' ? 'بدون تاریخ پایان' : 'No end date'}
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <span className="label">{lang === 'fa' ? 'شروع شمارش زمان' : 'Start the clock'}</span>
                    <Segmented
                      value={expiryMode === 'first_connect' ? 'first_connect' : 'days'}
                      disabled={lockPlanForReseller}
                      onChange={(next) => {
                        setExpiryMode(next);
                        if (!expiryDays) setExpiryDays('30');
                      }}
                      label={lang === 'fa' ? 'شروع شمارش زمان' : 'Start the clock'}
                      options={[
                        { value: 'days', label: lang === 'fa' ? 'اکنون' : 'Now' },
                        { value: 'first_connect', label: lang === 'fa' ? 'در اولین اتصال' : 'At first connection' },
                      ]}
                    />
                  </div>
                </>
              )}

              <div className="form-row">
                <label className="field">
                  <span className="label">{lang === 'fa' ? 'دستگاه همزمان' : 'Devices at once'}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    disabled={lockPlanForReseller}
                    value={deviceLimit}
                    onChange={(e) => setDeviceLimit(e.target.value)}
                  />
                  <span className="hint">
                    {lang === 'fa' ? '0 = بدون محدودیت' : '0 = no limit'}
                    {(Number(deviceLimit) === 0 || Number(deviceLimit) > 1) &&
                      (lang === 'fa'
                        ? ' · در WireGuard/AmneziaWG هر کلید همزمان روی ۱ دستگاه در یک اینباند کار می‌کند (کاربر چندکاربره می‌تواند از پروتکل یا اینباند دیگر همزمان استفاده کند).'
                        : ' · WireGuard/AmneziaWG uses one keypair per client (1 active device per WG inbound; multi-device works across different protocols or separate WG inbounds).')}
                  </span>
                </label>

                <label className="field">
                  <span className="label">{lang === 'fa' ? 'ریست ترافیک' : 'Reset traffic'}</span>
                  <select
                    className="select"
                    disabled={lockPlanForReseller}
                    value={resetPeriod}
                    onChange={(e) => setResetPeriod(e.target.value)}
                  >
                    <option value="never">{lang === 'fa' ? 'هیچ‌وقت' : 'Never'}</option>
                    <option value="monthly">{lang === 'fa' ? 'ماهانه' : 'Monthly'}</option>
                    <option value="weekly">{lang === 'fa' ? 'هفتگی' : 'Weekly'}</option>
                    <option value="daily">{lang === 'fa' ? 'روزانه' : 'Daily'}</option>
                    <option value="yearly">{lang === 'fa' ? 'سالانه' : 'Yearly'}</option>
                    <option value="jalali_monthly">{lang === 'fa' ? 'ماهانه شمسی' : 'Persian monthly'}</option>
                    <option value="jalali_yearly">{lang === 'fa' ? 'سالانه شمسی' : 'Persian yearly'}</option>
                    <option value="every_n_days">{lang === 'fa' ? 'هر N روز' : 'Every N days'}</option>
                  </select>
                </label>
              </div>

              {resetPeriod === 'every_n_days' && (
                <div className="field">
                  <label className="label">{lang === 'fa' ? 'ریست هر چند روز' : 'Reset every'}</label>
                  <div className="input-group">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="365"
                      disabled={lockPlanForReseller}
                      value={resetEveryDays}
                      onChange={(e) => setResetEveryDays(e.target.value)}
                    />
                    <span className="suffix">{lang === 'fa' ? 'روز' : 'days'}</span>
                  </div>
                  <p className="hint">
                    {lang === 'fa'
                      ? '۱ تا ۳۶۵ روز، محاسبه‌شده از تاریخ شروع کاربر.'
                      : '1 to 365 days, counted from the day the client started.'}
                  </p>
                </div>
              )}

              {['monthly', 'yearly', 'jalali_monthly', 'jalali_yearly'].includes(resetPeriod) && (
                <label className="field">
                  <span className="label">{lang === 'fa' ? 'مبنای محاسبه دوره' : 'Count from'}</span>
                  <select
                    className="select"
                    disabled={lockPlanForReseller}
                    value={String(resetAnchor)}
                    onChange={(e) => setResetAnchor(Number(e.target.value))}
                  >
                    <option value="0">{lang === 'fa' ? 'ابتدای تقویم' : 'Calendar start'}</option>
                    <option value="1">{lang === 'fa' ? 'تاریخ شروع کاربر' : 'Client start'}</option>
                  </select>
                </label>
              )}

              {groups.length > 0 && (
                <div className="field">
                  <span className="label">{lang === 'fa' ? 'گروه‌ها' : 'Groups'}</span>
                  <p className="hint">
                    {lang === 'fa'
                      ? 'کاربر عضو گروه، اینباندهای همان گروه را دریافت می‌کند. در غیر این صورت، اینباندهای زیر اعمال می‌شوند.'
                      : 'A client in groups gets the inbounds of those groups. In none, it gets the inbounds chosen below.'}
                  </p>
                  <div className="chips">
                    {groups.map((g) => {
                      const pressed = selectedGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className="chip"
                          aria-pressed={pressed}
                          onClick={() =>
                            setSelectedGroupIds((prev) =>
                              pressed ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                            )
                          }
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="field">
                <span className="label">{lang === 'fa' ? 'اینباندها' : 'Inbounds'}</span>
                <p className="hint">
                  {lang === 'fa'
                    ? 'مشخص کنید این کاربر مجاز به استفاده از کدام اینباندها است.'
                    : 'Choose which inbounds this client may use.'}
                </p>
                <div className="inb-check-list">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allInbounds}
                      onChange={(e) => {
                        const nextAll = e.target.checked;
                        setAllInbounds(nextAll);
                        if (!nextAll && selectedInboundIds.length === 0) {
                          setSelectedInboundIds(enabledInbounds.map((ib) => ib.id));
                        }
                      }}
                    />
                    <span>{lang === 'fa' ? 'همه اینباندها' : 'All inbounds'}</span>
                  </label>
                  {enabledInbounds.map((ib) => {
                    const checked = !allInbounds && selectedInboundIds.includes(ib.id);
                    return (
                      <label key={ib.id} className={`check ${allInbounds ? 'is-disabled' : ''}`}>
                        <input
                          type="checkbox"
                          disabled={allInbounds}
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelectedInboundIds((prev) =>
                              on ? [...prev, ib.id] : prev.filter((x) => x !== ib.id),
                            );
                          }}
                        />
                        <span>
                          {ib.nodeName ? <span className="faint">{ib.nodeName} · </span> : null}
                          <strong>{ib.name}</strong>
                          <span className="faint num"> · {formatInboundProtocolTag(ib)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                className="disclosure"
                aria-expanded={showMoreOptions}
                onClick={() => setShowMoreOptions((s) => !s)}
              >
                {showMoreOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span>{lang === 'fa' ? 'گزینه‌های بیشتر' : 'More options'}</span>
              </button>

              {showMoreOptions && (
                <div className="stack">
                  {!isBulk && (
                    <>
                      <label className="field">
                        <span className="label">{lang === 'fa' ? 'رمزعبور VPN' : 'VPN password'}</span>
                        <input
                          className="input"
                          value={vpnPassword}
                          onChange={(e) => setVpnPassword(e.target.value)}
                        />
                        <span className="hint">
                          {lang === 'fa'
                            ? 'برای پروتکل‌های نیازمند رمز استفاده می‌شود. برای ساخت خودکار خالی بگذارید.'
                            : 'Used by inbounds with password sign-in. Leave empty to generate one.'}
                        </span>
                      </label>

                      <label className="field">
                        <span className="label">{lang === 'fa' ? 'آدرس تانل ثابت' : 'Fixed tunnel address'}</span>
                        <input
                          className="input"
                          dir="ltr"
                          value={fixedIp}
                          onChange={(e) => setFixedIp(e.target.value)}
                          placeholder="10.8.0.200"
                        />
                        <span className="hint">
                          {lang === 'fa'
                            ? `اختیاری. باید در رنج رزرو شده اینباند باشد ${subnetHint}.`
                            : `Optional. Must be inside an inbound's reserved range ${subnetHint}.`}
                        </span>
                      </label>
                    </>
                  )}

                  <label className="field">
                    <span className="label">
                      {lang === 'fa' ? 'بازه بروزرسانی اشتراک' : 'Subscription update interval'}
                    </span>
                    <div className="input-group">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="720"
                        value={subUpdateHours}
                        onChange={(e) => setSubUpdateHours(e.target.value)}
                        placeholder={lang === 'fa' ? 'تنظیم پیش‌فرض پنل' : "Panel's setting"}
                      />
                      <span className="suffix">h</span>
                    </div>
                    <span className="hint">
                      {lang === 'fa'
                        ? 'برای این کاربر در اپلیکیشن‌های پروکسی. خالی = تنظیم پنل.'
                        : "For this customer in proxy apps. Empty uses the panel's setting."}
                    </span>
                  </label>

                  <label className="field">
                    <span className="label">
                      {lang === 'fa' ? 'اعلان در اپلیکیشن‌های پروکسی' : 'Announcement in proxy apps'}
                    </span>
                    <textarea
                      className="textarea"
                      maxLength={200}
                      value={subAnnounce}
                      onChange={(e) => setSubAnnounce(e.target.value)}
                      placeholder={lang === 'fa' ? 'تنظیم پیش‌فرض پنل' : "Panel's setting"}
                    />
                    <span className="hint">
                      {lang === 'fa'
                        ? `به‌جای اعلان پنل نمایش داده می‌شود، حداکثر ۲۰۰ کاراکتر (${subAnnounce.length}).`
                        : `Shown instead of the panel's announcement, at most 200 characters (${subAnnounce.length}).`}
                    </span>
                  </label>

                  <label className="field">
                    <span className="label">{lang === 'fa' ? 'راه ارتباطی' : 'Contact'}</span>
                    <input
                      className="input"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder={lang === 'fa' ? '@تلگرام یا شماره تماس' : '@telegram or phone'}
                    />
                  </label>

                  <label className="field">
                    <span className="label">{lang === 'fa' ? 'یادداشت' : 'Note'}</span>
                    <textarea
                      className="textarea"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>

                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />
                    <span className="track" />
                    <span className="sw-text">{lang === 'fa' ? 'فعال' : 'Enabled'}</span>
                  </label>
                </div>
              )}

              {formError && <div className="banner err">{formError}</div>}
            </div>
          </div>

          <footer className="ov-sheet-foot">
            <button type="button" className="btn" onClick={onClose}>
              {lang === 'fa' ? 'انصراف' : 'Cancel'}
            </button>
            <button type="submit" className="btn primary" disabled={submitDisabled}>
              {saving
                ? lang === 'fa'
                  ? 'در حال ذخیره...'
                  : 'Saving…'
                : isEdit
                  ? lang === 'fa'
                    ? 'ذخیره'
                    : 'Save'
                  : lang === 'fa'
                    ? 'ایجاد'
                    : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
