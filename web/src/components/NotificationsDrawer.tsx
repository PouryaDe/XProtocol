import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Drawer } from './Drawer';
import { Button } from './UiPrimitives';

interface EventItem {
  id: number;
  type: string;
  at: number;
  ownerId: number;
  subject: string;
  data: Record<string, unknown>;
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
}

export function NotificationsDrawer({ open, onClose, onUnreadChange }: NotificationsDrawerProps) {
  const { lang } = useUi();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<EventItem[]>('/events?limit=30');
      setEvents(Array.isArray(list) ? list : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadEvents();
    }
  }, [open, loadEvents]);

  const markAllRead = async () => {
    const maxId = events.reduce((m, e) => Math.max(m, e.id), 0);
    try {
      const res = await apiFetch<{ unread: number }>('/events/seen', {
        method: 'POST',
        body: JSON.stringify({ id: maxId }),
      });
      onUnreadChange(res.unread ?? 0);
    } catch {
      onUnreadChange(0);
    }
  };

  const describeEvent = (ev: EventItem): { title: string; subtitle: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } => {
    const name = String(ev.data.name || ev.data.username || ev.data.target || ev.subject || '');
    const fa = lang === 'fa';
    switch (ev.type) {
      case 'client.created':
        return { title: fa ? `کاربر جدید: ${name}` : `Client created: ${name}`, subtitle: ev.type, tone: 'good' };
      case 'client.deleted':
        return { title: fa ? `کاربر حذف شد: ${name}` : `Client deleted: ${name}`, subtitle: ev.type, tone: 'neutral' };
      case 'client.expired':
        return { title: fa ? `اشتراک منقضی شد: ${name}` : `Client expired: ${name}`, subtitle: ev.type, tone: 'warn' };
      case 'client.limited':
        return { title: fa ? `حجم به پایان رسید: ${name}` : `Traffic used up: ${name}`, subtitle: ev.type, tone: 'bad' };
      case 'client.quota_warning':
        return { title: fa ? `هشدار مصرف حجم (${ev.data.pct ?? ''}%): ${name}` : `Quota warning (${ev.data.pct ?? ''}%): ${name}`, subtitle: ev.type, tone: 'warn' };
      case 'client.renewed':
        return { title: fa ? `اشتراک تمدید شد: ${name}` : `Client renewed: ${name}`, subtitle: ev.type, tone: 'good' };
      case 'client.reset':
        return { title: fa ? `ریست ترافیک: ${name}` : `Traffic reset: ${name}`, subtitle: ev.type, tone: 'neutral' };
      case 'client.first_connect':
        return { title: fa ? `اولین اتصال: ${name}` : `First connection: ${name}`, subtitle: ev.type, tone: 'good' };
      case 'node.disconnected':
        return { title: fa ? `قطع ارتباط نود: ${name}` : `Node disconnected: ${name}`, subtitle: ev.type, tone: 'bad' };
      case 'node.connected':
        return { title: fa ? `نود متصل شد: ${name}` : `Node connected: ${name}`, subtitle: ev.type, tone: 'good' };
      case 'node.disk_high':
        return { title: fa ? `دیسک نود پر است (${ev.data.pct ?? ''}%): ${name}` : `High disk usage (${ev.data.pct ?? ''}%): ${name}`, subtitle: ev.type, tone: 'warn' };
      case 'node.memory_high':
        return { title: fa ? `رم نود بالا است (${ev.data.pct ?? ''}%): ${name}` : `High memory usage (${ev.data.pct ?? ''}%): ${name}`, subtitle: ev.type, tone: 'warn' };
      case 'admin.login_new_ip':
        return { title: fa ? `ورود از IP جدید: ${ev.data.ip || ''}` : `Sign-in from new IP: ${ev.data.ip || ''}`, subtitle: name, tone: 'warn' };
      case 'security.ban':
        return { title: fa ? `مسدودسازی امنیتی: ${name}` : `Sign-in ban: ${name}`, subtitle: ev.type, tone: 'bad' };
      case 'backup.failed':
        return { title: fa ? `خطای بکاپ (${ev.data.destination || ''})` : `Backup failed (${ev.data.destination || ''})`, subtitle: String(ev.data.error || ''), tone: 'bad' };
      default:
        return { title: `${ev.type}${name ? `: ${name}` : ''}`, subtitle: ev.subject, tone: 'neutral' };
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={lang === 'fa' ? 'اعلان‌ها' : 'Notifications'}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <Button variant="ghost" onClick={onClose}>
            {lang === 'fa' ? 'بستن' : 'Close'}
          </Button>
          <Button variant="primary" onClick={markAllRead} disabled={events.length === 0}>
            <CheckCheck size={15} />
            {lang === 'fa' ? 'علامت همه به‌عنوان خوانده‌شده' : 'Mark all as read'}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          {lang === 'fa' ? 'در حال بارگذاری...' : 'Loading...'}
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--raise-2)' }}>
            <Bell size={18} style={{ color: 'var(--ink-3)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {lang === 'fa'
              ? 'هنوز اعلانی وجود ندارد. هشدارهای حجم، انقضا و وضعیت سرور اینجا نمایش داده می‌شوند.'
              : 'Nothing to report yet. Quota, expiry and server alerts appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const info = describeEvent(ev);
            const dotColor =
              info.tone === 'good'
                ? 'var(--good)'
                : info.tone === 'warn'
                  ? 'var(--warn)'
                  : info.tone === 'bad'
                    ? 'var(--bad)'
                    : 'var(--ink-3)';
            return (
              <div
                key={ev.id}
                className="p-3 rounded-xl border flex items-start gap-3"
                style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}
              >
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {info.title}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
                    <span className="truncate">{info.subtitle}</span>
                    <span className="shrink-0 num">{new Date(ev.at * 1000).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
