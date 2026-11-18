import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Check, Copy, Edit3, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { formatDateTime } from '../lib/format';
import { Button, Input, StatusPill } from './UiPrimitives';
import { Modal } from './Modal';

interface WebhookItem {
  id: number;
  ownerId: number;
  url: string;
  events: string[];
  includeSubLink: boolean;
  allowPrivate: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryItem {
  id: number;
  eventId: number;
  eventType: string;
  statusCode: number;
  ok: boolean;
  error: string;
  durationMs: number;
  deliveredAt: number;
}

export function SettingsWebhooksTab({ onNotice }: { onNotice: (msg: string) => void }) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const [items, setItems] = useState<WebhookItem[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [includeSubLink, setIncludeSubLink] = useState(false);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [deliveriesModalId, setDeliveriesModalId] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch<{ items: WebhookItem[]; types: string[]; owner: boolean }>('/webhooks');
      setItems(r.items || []);
      setEventTypes(r.types || []);
      setIsOwner(Boolean(r.owner));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setUrl('');
    setSelectedEvents(eventTypes.slice(0, 6));
    setIncludeSubLink(false);
    setAllowPrivate(false);
    setEnabled(true);
    setFormOpen(true);
  };

  const openEdit = (w: WebhookItem) => {
    setEditingId(w.id);
    setUrl(w.url);
    setSelectedEvents(w.events);
    setIncludeSubLink(w.includeSubLink);
    setAllowPrivate(w.allowPrivate);
    setEnabled(w.enabled);
    setFormOpen(true);
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const saveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        url: url.trim(),
        events: selectedEvents,
        includeSubLink,
        allowPrivate: isOwner ? allowPrivate : false,
        enabled,
      };
      if (editingId == null) {
        const res = await apiFetch<{ item: WebhookItem; secret?: string; warning?: string }>('/webhooks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.secret) setRevealedSecret(res.secret);
        if (res.warning) onNotice(res.warning);
        else onNotice(isFa ? 'وب‌هوک ایجاد شد.' : 'Webhook created.');
      } else {
        const res = await apiFetch<{ item: WebhookItem; warning?: string }>(`/webhooks/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotice(res.warning || (isFa ? 'وب‌هوک به‌روزرسانی شد.' : 'Webhook updated.'));
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const openDeliveries = async (id: number) => {
    setDeliveriesModalId(id);
    setLoadingDeliveries(true);
    try {
      const res = await apiFetch<{ items: DeliveryItem[] }>(`/webhooks/${id}/deliveries`);
      setDeliveries(res.items || []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  return (
    <div className="editor">
      <section className="ed-section">
        <div>
          <h2>{isFa ? 'وب‌هوک‌های رویداد' : 'Event webhooks'}</h2>
          <p className="ed-lede">
            {isFa
              ? 'ارسال رویدادهای پنل به سرور شما با امضای HMAC-SHA256 در هدر X-XProtocol-Signature.'
              : 'Push panel and client events to HTTP endpoints with HMAC-SHA256 signatures and exponential retry.'}
          </p>
        </div>
        <div className="ed-fields">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-(--text-muted)">
              {isFa ? `${items.length} وب‌هوک ثبت شده` : `${items.length} configured endpoint(s)`}
            </span>
            <Button type="button" variant="primary" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {isFa ? 'افزودن وب‌هوک' : 'Add webhook'}
            </Button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-xs text-(--text-muted)">{isFa ? 'در حال بارگذاری…' : 'Loading webhooks…'}</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--border-subtle) px-4 py-6 text-center text-xs text-(--text-muted)">
              {isFa ? 'هنوز وب‌هوکی تعریف نشده است.' : 'No webhooks yet.'}
            </div>
          ) : (
            <div className="stack-sm">
              {items.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusPill
                        tone={w.enabled ? 'green' : 'gray'}
                        label={w.enabled ? (isFa ? 'فعال' : 'Enabled') : isFa ? 'خاموش' : 'Paused'}
                      />
                      <code className="truncate font-mono text-xs text-(--ink)" dir="ltr">
                        {w.url}
                      </code>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const res = await apiFetch<{ ok: boolean; statusCode: number; error?: string }>(
                            `/webhooks/${w.id}/test`,
                            { method: 'POST' },
                          );
                          onNotice(
                            res.ok
                              ? isFa
                                ? `تست موفق (کد ${res.statusCode})`
                                : `Test delivered (${res.statusCode})`
                              : res.error || `Failed (${res.statusCode})`,
                          );
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isFa ? 'تست' : 'Test'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openDeliveries(w.id)}>
                        <Activity className="h-3.5 w-3.5" />
                        {isFa ? 'لاگ‌ها' : 'Deliveries'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const res = await apiFetch<{ secret: string }>(`/webhooks/${w.id}/rotate-secret`, {
                            method: 'POST',
                          });
                          setRevealedSecret(res.secret);
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {isFa ? 'چرخش کلید' : 'Rotate'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(w)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await apiFetch(`/webhooks/${w.id}`, { method: 'DELETE' });
                          onNotice(isFa ? 'وب‌هوک حذف شد.' : 'Webhook removed.');
                          await load();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {w.events.length === 0 ? (
                      <span className="text-[11px] text-(--text-muted)">
                        {isFa ? 'همه رویدادها (یا هیچ‌کدام انتخاب نشده)' : 'No events selected'}
                      </span>
                    ) : (
                      w.events.map((ev) => (
                        <span
                          key={ev}
                          className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-0.5 font-mono text-[11px] text-(--text-secondary)"
                          dir="ltr"
                        >
                          {ev}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          editingId == null
            ? isFa
              ? 'افزودن وب‌هوک جدید'
              : 'Add webhook'
            : isFa
              ? 'ویرایش وب‌هوک'
              : 'Edit webhook'
        }
      >
        <form className="stack" onSubmit={saveWebhook}>
          <Input
            label={isFa ? 'آدرس مقصد (URL)' : 'Endpoint URL'}
            type="url"
            required
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/hooks/xprotocol"
          />

          <div className="flex flex-wrap items-center gap-4">
            <label className="switch">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="track" />
              <span className="sw-text">
                <span>{isFa ? 'فعال' : 'Enabled'}</span>
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={includeSubLink}
                onChange={(e) => setIncludeSubLink(e.target.checked)}
              />
              <span className="track" />
              <span className="sw-text">
                <span>{isFa ? 'ارسال لینک اشتراک در payload' : 'Include subscription link'}</span>
              </span>
            </label>
            {isOwner && (
              <label className="switch">
                <input
                  type="checkbox"
                  checked={allowPrivate}
                  onChange={(e) => setAllowPrivate(e.target.checked)}
                />
                <span className="track" />
                <span className="sw-text">
                  <span>{isFa ? 'مجاز بودن IP خصوصی / محلی' : 'Allow private/local IPs'}</span>
                </span>
              </label>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-(--text-secondary)">
              <span>{isFa ? 'رویدادهای انتخابی' : 'Subscribed events'}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-(--accent-text) hover:underline"
                  onClick={() => setSelectedEvents([...eventTypes])}
                >
                  {isFa ? 'همه' : 'All'}
                </button>
                <button
                  type="button"
                  className="text-(--text-muted) hover:underline"
                  onClick={() => setSelectedEvents([])}
                >
                  {isFa ? 'هیچ‌کدام' : 'None'}
                </button>
              </div>
            </div>
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-2.5 sm:grid-cols-2">
              {eventTypes.map((ev) => (
                <label key={ev} className="flex cursor-pointer items-center gap-2 text-xs text-(--ink)" dir="ltr">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  <span className="font-mono text-[11px]">{ev}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              {isFa ? 'انصراف' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? (isFa ? 'در حال ذخیره…' : 'Saving…') : isFa ? 'ذخیره' : 'Save webhook'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(revealedSecret)}
        onClose={() => setRevealedSecret(null)}
        title={isFa ? 'کلید امضای وب‌هوک' : 'Webhook signing secret'}
      >
        <div className="stack">
          <div className="callout warn text-xs">
            {isFa
              ? 'این کلید فقط یک بار نمایش داده می‌شود. از آن برای بررسی هدر X-XProtocol-Signature استفاده کنید.'
              : 'Copy this secret now — it will not be shown again. Verify payloads using the X-XProtocol-Signature header (HMAC-SHA256).'}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2">
            <code className="truncate font-mono text-xs text-(--ink)" dir="ltr">
              {revealedSecret}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                if (revealedSecret) navigator.clipboard?.writeText(revealedSecret).catch(() => undefined);
                setCopiedSecret(true);
                setTimeout(() => setCopiedSecret(false), 1500);
              }}
            >
              {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deliveriesModalId !== null}
        onClose={() => setDeliveriesModalId(null)}
        title={isFa ? 'تاریخچه ارسال وب‌هوک' : 'Webhook deliveries'}
      >
        {loadingDeliveries ? (
          <div className="text-xs text-(--text-muted)">{isFa ? 'در حال دریافت…' : 'Loading deliveries…'}</div>
        ) : deliveries.length === 0 ? (
          <div className="text-xs text-(--text-muted)">
            {isFa ? 'هنوز ارسالی ثبت نشده است.' : 'No deliveries recorded yet.'}
          </div>
        ) : (
          <div className="stack-sm max-h-80 overflow-y-auto">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={d.ok ? 'good' : 'bad'} label={String(d.statusCode || (d.ok ? 200 : 'ERR'))} />
                    <span className="font-mono text-[11px] text-(--ink)" dir="ltr">
                      {d.eventType}
                    </span>
                  </div>
                  {d.error && <div className="mt-1 truncate text-[11px] text-red-400">{d.error}</div>}
                </div>
                <div className="shrink-0 text-end text-[11px] text-(--text-muted)">
                  <div className="num">{d.durationMs}ms</div>
                  <div>{formatDateTime(new Date(d.deliveredAt * 1000).toISOString(), lang)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
