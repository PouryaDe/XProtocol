import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Plus, Search } from 'lucide-react';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { navigate, toPanelUrl } from '../lib/router';
import { formatKindBadge, type InboundItem } from '../lib/inboundTypes';
import { Button, EmptySonar, EqLoader, PageHead } from '../components/UiPrimitives';
import { L } from '../components/InboundSubforms';

type FilterMode = 'all' | 'attention' | 'drafts';

function isDraftInbound(ib: InboundItem): boolean {
  return ib.nodeId == null;
}

function needsAttentionInbound(ib: InboundItem): boolean {
  if (isDraftInbound(ib)) return false;
  if (!ib.enabled) return false;
  if (!ib.running) return true;
  if (ib.nodeStatus && ib.nodeStatus !== 'online' && ib.nodeStatus !== 'connected') return true;
  return false;
}

export function InboundsPage() {
  const { lang } = useUi();
  const [inbounds, setInbounds] = useState<InboundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ inbounds: InboundItem[] }>('/inbounds');
      setInbounds(res.inbounds || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    let attention = 0;
    let drafts = 0;
    for (const ib of inbounds) {
      if (isDraftInbound(ib)) drafts += 1;
      else if (needsAttentionInbound(ib)) attention += 1;
    }
    return { all: inbounds.length, attention, drafts };
  }, [inbounds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inbounds.filter((ib) => {
      if (filter === 'drafts' && !isDraftInbound(ib)) return false;
      if (filter === 'attention' && !needsAttentionInbound(ib)) return false;
      if (!q) return true;
      const title = (ib.displayName || ib.settings?.displayName || ib.name || '').toLowerCase();
      return (
        title.includes(q) ||
        ib.name.toLowerCase().includes(q) ||
        ib.protocol.toLowerCase().includes(q) ||
        String(ib.port).includes(q) ||
        (ib.description || '').toLowerCase().includes(q) ||
        (ib.nodeName || '').toLowerCase().includes(q)
      );
    });
  }, [inbounds, query, filter]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={L(lang, 'Inbounds', 'اینباندها')}
        sub={L(lang, 'Define once. Run on the nodes you choose.', 'یک‌بار تعریف کنید. روی نودهای دلخواه اجرا کنید.')}
        actions={
          <Button variant="primary" onClick={() => navigate('/inbounds/new')}>
            <Plus className="h-4 w-4" />
            {L(lang, 'New inbound', 'اینباند جدید')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <EqLoader label={L(lang, 'Loading inbounds…', 'در حال بارگذاری اینباندها…')} />
      ) : inbounds.length === 0 ? (
        <div className="cert-empty-box">
          <EmptySonar
            text={L(
              lang,
              'No inbounds yet. Define a protocol once and choose which nodes should run it.',
              'هنوز اینباندی تعریف نشده است. یک پروتکل بسازید و مشخص کنید روی کدام نودها اجرا شود.',
            )}
            action={
              <Button variant="primary" onClick={() => navigate('/inbounds/new')}>
                <Plus className="h-4 w-4" />
                {L(lang, 'New inbound', 'اینباند جدید')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="inb-toolbar">
            <label className="inb-search">
              <Search className="h-4 w-4 shrink-0 text-(--text-muted)" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L(lang, 'Search inbounds', 'جستجوی اینباندها')}
                className="w-full bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
              />
            </label>

            <div className="inb-filters" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                onClick={() => setFilter('all')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === 'all'
                    ? 'border border-(--accent)/45 bg-(--accent-wash) text-(--accent-text)'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                <span>{L(lang, 'All inbounds', 'همه اینباندها')}</span>
                <span className="font-mono opacity-80">{counts.all}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={filter === 'attention'}
                onClick={() => setFilter('attention')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === 'attention'
                    ? 'border border-(--accent)/45 bg-(--accent-wash) text-(--accent-text)'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                <span>{L(lang, 'Needs attention', 'نیازمند بررسی')}</span>
                <span className="font-mono opacity-80">{counts.attention}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={filter === 'drafts'}
                onClick={() => setFilter('drafts')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === 'drafts'
                    ? 'border border-(--accent)/45 bg-(--accent-wash) text-(--accent-text)'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                <span>{L(lang, 'Drafts', 'پیش‌نویس‌ها')}</span>
                <span className="font-mono opacity-80">{counts.drafts}</span>
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-(--text-muted)">
              {L(lang, 'No inbounds match the current filter.', 'هیچ اینباندی با فیلتر فعلی مطابقت ندارد.')}
            </div>
          ) : (
            <div className="inb-service-list">
              {filtered.map((ib) => {
                const draft = isDraftInbound(ib);
                const attention = needsAttentionInbound(ib);
                const active = !draft && ib.enabled && ib.running && !attention;
                const healthClass = active ? 'good' : attention ? 'warn' : 'pending';
                const displayTitle = ib.displayName || ib.settings?.displayName || ib.name;
                const allowedCount = ib.allowedClientsCount ?? 0;

                return (
                  <div key={ib.id} className="panel inb-service">
                    <header>
                      <div className="inb-service-identity">
                        <span className="rounded-md border border-(--border-strong) bg-(--bg-elevated) px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-(--text-secondary)">
                          {formatKindBadge(ib.protocol, ib.settings?.obfuscation)}
                        </span>
                        <a
                          href={toPanelUrl(`/inbounds/${ib.id}`)}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/inbounds/${ib.id}`);
                          }}
                          className="text-[16px] font-semibold text-(--text-primary) hover:text-(--accent-text) transition"
                        >
                          {displayTitle}
                        </a>
                      </div>

                      <div className={`inb-health ${healthClass}`}>
                        {active ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{L(lang, 'Active nodes: 1', 'نودهای فعال: ۱')}</span>
                          </>
                        ) : attention ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>{L(lang, 'Nodes needing attention: 1', 'نودهای نیازمند بررسی: ۱')}</span>
                          </>
                        ) : draft ? (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              {L(
                                lang,
                                'Saved as a draft · no deployment nodes',
                                'ذخیره به‌عنوان پیش‌نویس · بدون نود اجرا',
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            <span>{L(lang, 'Stopped', 'متوقف')}</span>
                          </>
                        )}
                      </div>
                    </header>

                    {ib.description && <p className="text-[13px] text-(--text-secondary)">{ib.description}</p>}

                    <div className="inb-service-meta">
                      <span>
                        <strong className="font-semibold text-(--text-primary)">{ib.onlineCount ?? 0}</strong>{' '}
                        {L(lang, 'Online clients', 'کلاینت آنلاین')}
                      </span>
                      <span>
                        {lang === 'fa'
                          ? `${allowedCount} کلاینت مجاز`
                          : `${allowedCount} ${allowedCount === 1 ? 'client allowed' : 'clients allowed'}`}
                      </span>
                      <span className="font-mono" dir="ltr">
                        {ib.transport.toUpperCase()} · {ib.port}
                      </span>
                      <span className="font-mono" dir="ltr">
                        {ib.subnet}
                      </span>
                    </div>

                    <footer>
                      <div className="inb-node-chips">
                        {draft ? (
                          <span className="text-xs text-(--text-muted)">
                            {L(lang, 'No deployment nodes yet', 'هنوز نود اجرایی انتخاب نشده')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-0.5 text-xs text-(--text-secondary)">
                            <span className={`dot ${ib.running ? 'live' : ''}`} />
                            <span>
                              {ib.nodeIsLocal
                                ? L(lang, 'This server', 'همین سرور')
                                : ib.nodeName || `#${ib.nodeId}`}
                            </span>
                          </span>
                        )}
                      </div>

                      <Button size="sm" variant="ghost" onClick={() => navigate(`/inbounds/${ib.id}`)}>
                        <span>{L(lang, 'Manage inbound', 'مدیریت اینباند')}</span>
                        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Button>
                    </footer>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
