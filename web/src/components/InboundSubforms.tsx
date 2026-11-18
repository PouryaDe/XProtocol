import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { Button } from './UiPrimitives';
import { Modal } from './Modal';
import {
  getPresetRanges,
  randomAmneziaParams,
  randomTokenStr,
  SMARTDNS_CATEGORIES,
  validateCidr,
  type InboundItem,
  type InboundSettings,
  type NodeOption,
} from '../lib/inboundTypes';

export interface CertOption {
  id: number;
  domain: string;
  source?: string;
  status?: string;
}

export function L(lang: string, enText: string, faText: string): string {
  return lang === 'fa' ? faText : enText;
}

/* -------------------------------------------------------------------------- */
/*  FoldSection (2-column .ed-section + .fold-main matching Ovira CSS)         */
/* -------------------------------------------------------------------------- */

export function FoldSection({
  title,
  summary,
  summaryPrefix,
  toggleLabel,
  defaultOpen = false,
  className = '',
  children,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  summaryPrefix?: React.ReactNode;
  toggleLabel?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { lang } = useUi();
  const [open, setOpen] = useState(defaultOpen);
  const actLabel = toggleLabel || L(lang, 'Customize', 'سفارشی‌سازی');

  return (
    <div className={`ed-section ${className}`.trim()}>
      <div>
        <h2>{title}</h2>
      </div>
      <div className="fold-main">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>
            {summaryPrefix}
            {summary}
          </span>
          <span className="fold-act">
            <span>{open ? L(lang, 'Hide', 'بستن') : actLabel}</span>
            <ChevronDown />
          </span>
        </button>
        {open && <div className="ed-fields">{children}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TunnelNetworkPicker                                                        */
/* -------------------------------------------------------------------------- */

export function TunnelNetworkPicker({
  value,
  kind,
  onChange,
  onValidityChange,
}: {
  value: string;
  kind: string;
  onChange: (cidr: string) => void;
  onValidityChange?: (ok: boolean) => void;
}) {
  const { lang } = useUi();
  const presets = useMemo(() => getPresetRanges(kind), [kind]);
  const info = useMemo(() => validateCidr(value, kind), [value, kind]);
  const isPresetMatch = value === '' || presets.some((p) => p.cidr === value);
  const [customMode, setCustomMode] = useState(!isPresetMatch);

  useEffect(() => {
    setCustomMode(value !== '' && !presets.some((p) => p.cidr === value));
  }, [value, presets]);

  useEffect(() => {
    onValidityChange?.(info.ok);
  }, [info.ok, onValidityChange]);

  const errorText = () => {
    if (info.ok) return null;
    if (info.reason === 'format') {
      return L(
        lang,
        'Enter an address range in CIDR form, such as 10.40.0.0/24.',
        'بازه آدرس را به شکل CIDR وارد کنید، مثلا 10.40.0.0/24.',
      );
    }
    if (info.reason === 'unmasked') {
      return L(
        lang,
        'End the address in zero for the mask (for example 10.40.0.0/24, not 10.40.0.1/24).',
        'آدرس باید با توجه به ماسک با صفر تمام شود (مثلا 10.40.0.0/24).',
      );
    }
    if (info.reason === 'range') {
      return L(lang, 'Mask must be between /8 and /28.', 'ماسک باید بین /8 تا /28 باشد.');
    }
    return L(
      lang,
      'Use a private address range (10.x, 172.16-31.x, 192.168.x, or 100.64.x).',
      'از یک بازه آدرس خصوصی استفاده کنید (10.x، 172.16-31.x، 192.168.x یا 100.64.x).',
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'Ready-made ranges', 'بازه‌های آماده')}
        </span>
        <select
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary) transition focus:border-(--accent) focus:outline-none"
          value={customMode ? '__custom__' : value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') {
              setCustomMode(true);
            } else {
              setCustomMode(false);
              onChange(v);
            }
          }}
        >
          <option value="">{L(lang, 'Automatic (free range on the node)', 'خودکار (انتخاب بازه آزاد روی نود)')}</option>
          {presets.map((p) => (
            <option key={p.cidr} value={p.cidr}>
              {p.cidr === '10.0.0.0/8' ? `${L(lang, 'Large', 'بزرگ')} · ` : ''}
              {p.cidr} · {p.usable.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}{' '}
              {L(lang, 'client IPs', 'IP کلاینت')}
            </option>
          ))}
          <option value="__custom__">{L(lang, 'Custom range (type below)', 'بازه سفارشی (در زیر بنویسید)')}</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'Tunnel network', 'شبکه تونل')}
        </span>
        <input
          type="text"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={L(lang, 'Leave empty for a free range', 'برای انتخاب خودکار بازه آزاد خالی بگذارید')}
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary) placeholder:font-sans placeholder:text-(--text-muted) transition focus:border-(--accent) focus:outline-none"
        />
      </label>

      {info.ok ? (
        <div className="flex flex-col gap-1 text-xs text-(--text-muted)">
          <p>
            {value.trim()
              ? lang === 'fa'
                ? `${value} تا ${(info.usable || 0).toLocaleString('fa-IR')} IP کلاینت در اختیار می‌گذارد.`
                : `${value} holds up to ${(info.usable || 0).toLocaleString('en-US')} client IPs.`
              : L(
                  lang,
                  'A free range is chosen on the node when this server is attached.',
                  'هنگام اتصال به نود، یک بازه آزاد به‌طور خودکار انتخاب می‌شود.',
                )}
          </p>
          <p>
            {L(
              lang,
              'This is how many addresses the range holds; it is separate from the maximum connections and license limits.',
              'این مقدار صرفاً ظرفیت آدرس‌های رنج است و از سقف اتصالات همزمان و محدودیت لایسنس جداست.',
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs text-red-400">{errorText()}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NodePickerGrid                                                             */
/* -------------------------------------------------------------------------- */

export function NodePickerGrid({
  nodes,
  selectedIds,
  onToggle,
  errors = {},
  needsInstall = false,
  notice,
}: {
  nodes: NodeOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  errors?: Record<number, string | null>;
  needsInstall?: boolean;
  notice?: string;
}) {
  const { lang } = useUi();
  const [search, setSearch] = useState('');

  const visibleNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        (n.address || '').toLowerCase().includes(q) ||
        (n.isLocal && L(lang, 'this server', 'همین سرور').toLowerCase().includes(q)),
    );
  }, [nodes, search, lang]);

  return (
    <div className="inb-node-picker">
      <p className="hint text-xs text-(--text-secondary)">
        {L(
          lang,
          'Select one or more nodes. Missing protocol software is installed automatically.',
          'یک یا چند نود انتخاب کنید. پیش‌نیازهای پروتکل به‌طور خودکار نصب می‌شوند.',
        )}
      </p>

      {notice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {notice}
        </div>
      )}

      <label className="inb-search">
        <Search className="h-4 w-4 shrink-0 text-(--text-muted)" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L(lang, 'Search name or address…', 'جستجوی نام یا آدرس…')}
          className="w-full bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
        />
      </label>

      {visibleNodes.length === 0 ? (
        <div className="inb-empty">
          {L(lang, 'No nodes match your filter.', 'نودی با این فیلتر یافت نشد.')}
        </div>
      ) : (
        <div className="inb-node-options">
          {visibleNodes.map((n) => {
            const selected = selectedIds.includes(n.id);
            const err = errors[n.id];
            const offline = n.status && n.status !== 'online' && n.status !== 'connected';
            return (
              <label
                key={n.id}
                className={`inb-node-option${selected ? ' selected' : ''}${err ? ' has-error' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(n.id)}
                />
                <Server />
                <span>
                  <strong>{n.isLocal ? L(lang, 'This server', 'همین سرور') : n.name}</strong>
                  <small>
                    {err ? (
                      <span className="text-red-400">{err}</span>
                    ) : offline ? (
                      n.status
                    ) : needsInstall ? (
                      L(lang, 'Installed when needed', 'نصب در صورت نیاز')
                    ) : (
                      L(lang, 'Ready to set up', 'آماده راه‌اندازی')
                    )}
                  </small>
                </span>
                {selected && <Check className="inb-selected-mark h-4 w-4 shrink-0" />}
              </label>
            );
          })}
        </div>
      )}

      <p className="hint text-xs text-(--text-secondary)">
        {lang === 'fa' ? `نودهای انتخاب‌شده: ${selectedIds.length}` : `Selected nodes: ${selectedIds.length}`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DeploymentNodesPanel                                                       */
/* -------------------------------------------------------------------------- */

export function DeploymentNodesPanel({
  inbound,
  nodes,
  busyAction,
  onAction,
  onReload,
}: {
  inbound: InboundItem;
  nodes: NodeOption[];
  busyAction: string | null;
  onAction: (action: 'start' | 'stop' | 'restart') => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { lang } = useUi();
  const [addOpen, setAddOpen] = useState(false);
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [portOverrides, setPortOverrides] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [overrideNodeOpen, setOverrideNodeOpen] = useState(false);
  const [ovPort, setOvPort] = useState(String(inbound.port));
  const [ovSubnet, setOvSubnet] = useState(inbound.subnet || '');
  const [ovHost, setOvHost] = useState(inbound.publicAddressOverride || '');
  const [savingOv, setSavingOv] = useState(false);

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);

  const attachedNode = useMemo(() => {
    if (inbound.nodeId != null) {
      return nodes.find((n) => n.id === inbound.nodeId) || null;
    }
    return null;
  }, [inbound.nodeId, nodes]);

  const unattachedNodes = useMemo(
    () => nodes.filter((n) => n.id !== inbound.nodeId),
    [nodes, inbound.nodeId],
  );

  const openAddNodes = () => {
    setPickedIds(unattachedNodes.length === 1 ? [unattachedNodes[0].id] : []);
    setPortOverrides({});
    setAddError(null);
    setAddOpen(true);
  };

  const handleDeploy = async () => {
    if (pickedIds.length === 0) return;
    setAdding(true);
    setAddError(null);
    try {
      const ports: Record<string, number> = {};
      for (const id of pickedIds) {
        const raw = portOverrides[id];
        if (raw && Number(raw) > 0) ports[String(id)] = Number(raw);
      }
      await apiFetch(`/inbounds/${inbound.id}/deployments`, {
        method: 'POST',
        body: JSON.stringify({ nodeIds: pickedIds, ports }),
      });
      setAddOpen(false);
      await onReload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleSaveOverride = async (useShared = false) => {
    setSavingOv(true);
    try {
      await apiFetch(`/inbounds/${inbound.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          port: useShared ? inbound.port : Number(ovPort) || inbound.port,
          subnet: useShared ? inbound.subnet : ovSubnet.trim() || inbound.subnet,
          publicAddressOverride: useShared ? '' : ovHost.trim(),
        }),
      });
      setOverrideNodeOpen(false);
      await onReload();
    } finally {
      setSavingOv(false);
    }
  };

  const handleRemoveDeployment = async () => {
    if (inbound.nodeId == null) return;
    setRemoving(true);
    try {
      await apiFetch(`/inbounds/${inbound.id}/deployments/${inbound.nodeId}`, {
        method: 'DELETE',
      });
      setRemoveConfirmOpen(false);
      await onReload();
    } finally {
      setRemoving(false);
    }
  };

  const nodeDisplayName = attachedNode
    ? attachedNode.isLocal
      ? L(lang, 'This server', 'همین سرور')
      : attachedNode.name
    : inbound.nodeName || L(lang, 'This server', 'همین سرور');

  const prepStamp = inbound.createdAt || new Date().toISOString();
  const prepLines = [
    `${prepStamp} · checking`,
    `${prepStamp} · configuring (${inbound.protocol} ${inbound.transport.toUpperCase()} :${inbound.port})`,
    `${prepStamp} · ${inbound.running ? 'starting' : 'stopped'}`,
    `${prepStamp} · ${inbound.running ? 'ready' : 'idle'}`,
  ].join('\n');

  return (
    <div className="panel inb-deployments">
      <div className="panel-head">
        <div>
          <h2>{L(lang, 'Deployment nodes', 'نودهای اجرا')}</h2>
          <p className="text-xs text-(--text-secondary)">
            {L(
              lang,
              'Preparation continues when you leave this page.',
              'حتی اگر این صفحه را ببندید فرآیند آماده‌سازی در پس‌زمینه ادامه می‌یابد.',
            )}
          </p>
        </div>
        {unattachedNodes.length > 0 && (
          <Button size="sm" variant="secondary" onClick={openAddNodes}>
            + {L(lang, 'Add nodes', 'افزودن نود')}
          </Button>
        )}
      </div>

      {inbound.nodeId == null ? (
        <div className="inb-empty flex flex-col items-center gap-3">
          <p>
            {L(
              lang,
              'This inbound is saved as a draft. Attach at least one node to start accepting connections.',
              'این اینباند به‌عنوان پیش‌نویس ذخیره شده است. برای شروع پذیرش اتصال حداقل یک نود متصل کنید.',
            )}
          </p>
          {unattachedNodes.length > 0 && (
            <Button size="sm" variant="primary" onClick={openAddNodes}>
              + {L(lang, 'Add nodes', 'افزودن نود')}
            </Button>
          )}
        </div>
      ) : (
        <div className="inb-deployment">
          <header>
            <div className="inb-deployment-name">
              <Server />
              <strong>{nodeDisplayName}</strong>
            </div>

            <div className="inb-deployment-actions">
              <span className="inb-endpoint">
                {inbound.transport.toUpperCase()} · {inbound.port}
                {inbound.publicAddressOverride ? ` · ${inbound.publicAddressOverride}` : ''}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setOvPort(String(inbound.port));
                  setOvSubnet(inbound.subnet || '');
                  setOvHost(inbound.publicAddressOverride || '');
                  setOverrideNodeOpen(true);
                }}
                title={`${L(lang, 'Node-specific settings', 'تنظیمات این نود')} · ${nodeDisplayName}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRemoveConfirmOpen(true)}
                title={`${L(lang, 'Remove from this node', 'حذف از این نود')} · ${nodeDisplayName}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          </header>

          <div className="inb-progress">
            <div className="inb-progress-title">
              {inbound.running ? (
                <CheckCircle2 className="text-emerald-400" />
              ) : (
                <Clock className="text-amber-400" />
              )}
              <strong>
                {inbound.running ? L(lang, 'Running', 'در حال اجرا') : L(lang, 'Stopped', 'متوقف')}
              </strong>
            </div>

            <div className="mt-2">
              <button
                type="button"
                onClick={() => setPrepOpen((v) => !v)}
                className="text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) transition"
              >
                {prepOpen ? '− ' : '+ '}
                {L(lang, 'Preparation report', 'گزارش آماده‌سازی')}
              </button>
              {prepOpen && (
                <pre className="code-block mt-2 rounded-lg border border-(--border-subtle)" dir="ltr">
                  {prepLines}
                </pre>
              )}
            </div>

            <div className="inb-run-actions">
              {inbound.running ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busyAction}
                    onClick={() => void onAction('restart')}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'restart' ? 'animate-spin' : ''}`} />
                    {busyAction === 'restart'
                      ? L(lang, 'Restarting…', 'در حال ری‌استارت…')
                      : L(lang, 'Restart', 'ری‌استارت')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busyAction}
                    onClick={() => void onAction('stop')}
                  >
                    {busyAction === 'stop'
                      ? L(lang, 'Stopping…', 'در حال توقف…')
                      : L(lang, 'Stop', 'توقف')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!!busyAction}
                  onClick={() => void onAction('start')}
                >
                  {busyAction === 'start'
                    ? L(lang, 'Starting…', 'در حال شروع…')
                    : L(lang, 'Start', 'شروع')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Nodes Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L(lang, 'Add nodes', 'افزودن نود')}
        subtitle={L(
          lang,
          'Select a server node to run this inbound on.',
          'یک نود سرور برای اجرای این اینباند انتخاب کنید.',
        )}
      >
        <div className="flex flex-col gap-4">
          <NodePickerGrid
            nodes={unattachedNodes}
            selectedIds={pickedIds}
            onToggle={(id) => {
              setPickedIds((prev) => (prev.includes(id) ? [] : [id]));
            }}
          />
          {pickedIds.length > 0 && (
            <div className="flex flex-col gap-2">
              {pickedIds.map((nid) => {
                const n = nodes.find((x) => x.id === nid);
                return (
                  <label key={nid} className="block">
                    <span className="mb-1 block text-xs text-(--text-secondary)">
                      {L(lang, 'Custom port ·', 'پورت سفارشی ·')} {n?.isLocal ? L(lang, 'This server', 'همین سرور') : n?.name || `#${nid}`}
                    </span>
                    <input
                      type="number"
                      dir="ltr"
                      min={1}
                      max={65535}
                      value={portOverrides[nid] ?? String(inbound.port)}
                      onChange={(e) => setPortOverrides((p) => ({ ...p, [nid]: e.target.value }))}
                      className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                    />
                  </label>
                );
              })}
            </div>
          )}
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {L(lang, 'Cancel', 'لغو')}
            </Button>
            <Button variant="primary" disabled={adding || pickedIds.length === 0} onClick={() => void handleDeploy()}>
              {adding ? L(lang, 'Adding…', 'در حال اتصال…') : L(lang, 'Apply', 'اعمال')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Node-specific settings Modal (Ovira style) */}
      <Modal
        open={overrideNodeOpen}
        onClose={() => setOverrideNodeOpen(false)}
        title={`${L(lang, 'Node-specific settings', 'تنظیمات اختصاصی نود')} · ${nodeDisplayName}`}
        subtitle={L(
          lang,
          'Leave a field empty to inherit the shared setting. A changed field only affects this node.',
          'برای استفاده از تنظیمات مشترک فیلد را خالی بگذارید. تغییر هر فیلد فقط روی این نود اعمال می‌شود.',
        )}
      >
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Custom port', 'پورت سفارشی')}
            </span>
            <input
              type="number"
              dir="ltr"
              min={1}
              max={65535}
              value={ovPort}
              onChange={(e) => setOvPort(e.target.value)}
              placeholder={String(inbound.port)}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Custom tunnel network', 'شبکه تونل سفارشی')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={ovSubnet}
              onChange={(e) => setOvSubnet(e.target.value)}
              placeholder={inbound.subnet}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Custom public address', 'آدرس عمومی سفارشی')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={ovHost}
              onChange={(e) => setOvHost(e.target.value)}
              placeholder={attachedNode?.address || 'vpn.example.com'}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button variant="secondary" disabled={savingOv} onClick={() => void handleSaveOverride(true)}>
              {L(lang, 'Use shared settings', 'استفاده از تنظیمات مشترک')}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOverrideNodeOpen(false)}>
                {L(lang, 'Cancel', 'لغو')}
              </Button>
              <Button variant="primary" disabled={savingOv} onClick={() => void handleSaveOverride(false)}>
                {savingOv ? L(lang, 'Applying…', 'در حال اعمال…') : L(lang, 'Apply to this node', 'اعمال روی این نود')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Remove Deployment Modal */}
      <Modal
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        title={`${L(lang, 'Remove from this node', 'حذف از این نود')} · ${nodeDisplayName}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-(--text-secondary)">
            {L(
              lang,
              'This stops the service on this node and converts the inbound back to a draft. Shared settings and allowed clients are kept.',
              'این کار سرویس روی این نود را متوقف کرده و اینباند را دوباره به پیش‌نویس تبدیل می‌کند. تنظیمات مشترک و کلاینت‌های مجاز حفظ می‌شوند.',
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveConfirmOpen(false)}>
              {L(lang, 'Cancel', 'لغو')}
            </Button>
            <Button variant="danger" disabled={removing} onClick={() => void handleRemoveDeployment()}>
              {removing ? L(lang, 'Removing…', 'در حال حذف…') : L(lang, 'Remove', 'حذف')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  OpenConnectSection                                                         */
/* -------------------------------------------------------------------------- */

export function OpenConnectSection({
  settings,
  certs,
  onPatch,
}: {
  settings: InboundSettings;
  certs: CertOption[];
  onPatch: (patch: Partial<InboundSettings>) => void;
}) {
  const { lang } = useUi();

  return (
    <FoldSection
      title="OpenConnect"
      summaryPrefix={L(lang, 'Recommended defaults are in use. ', 'تنظیمات پیش‌فرض پیشنهادی فعال است. ')}
      summary={`${settings.dtls !== false ? 'DTLS On' : 'TCP only'}${settings.camouflage ? ' · Camouflage' : ''}`}
    >
      <div className="checks-inline">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.dtls !== false}
            onChange={(e) => onPatch({ dtls: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">
            {L(lang, 'Enable UDP (DTLS) for faster data transfer', 'فعال‌سازی UDP (DTLS) برای انتقال سریع‌تر')}
          </span>
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={settings.ciscoCompat !== false}
            onChange={(e) => onPatch({ ciscoCompat: e.target.checked })}
          />
          <span className="track" />
          <span className="sw-text">
            {L(lang, 'Cisco AnyConnect client compatibility', 'سازگاری با کلاینت Cisco AnyConnect')}
          </span>
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={!!settings.camouflage}
            onChange={(e) =>
              onPatch({
                camouflage: e.target.checked,
                camouflageSecret: settings.camouflageSecret || randomTokenStr(16),
              })
            }
          />
          <span className="track" />
          <span className="sw-text">
            {L(lang, 'Camouflage URL secret (anti-probing)', 'مخفی‌سازی مسیر اتصال Camouflage')}
          </span>
        </label>
      </div>

      {settings.camouflage && (
        <div className="form-row">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Camouflage secret', 'کلید مخفی Camouflage')}
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={settings.camouflageSecret || ''}
                onChange={(e) => onPatch({ camouflageSecret: e.target.value })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPatch({ camouflageSecret: randomTokenStr(16) })}
                title={L(lang, 'Regenerate', 'تولید مجدد')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Camouflage realm', 'دامنه/Realm مخفی')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={settings.camouflageRealm || 'Login'}
              onChange={(e) => onPatch({ camouflageRealm: e.target.value })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
            />
          </label>
        </div>
      )}

      <div className="form-row">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Server certificate', 'گواهینامه سرور')}
          </span>
          <select
            value={settings.certSource || 'pki'}
            onChange={(e) => onPatch({ certSource: e.target.value as InboundSettings['certSource'] })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
          >
            <option value="pki">{L(lang, 'Internal CA certificate', 'گواهینامه داخلی پنل')}</option>
            <option value="panel">{L(lang, 'Panel HTTPS certificate', 'گواهینامه HTTPS پنل')}</option>
            <option value="acme">{L(lang, "Let's Encrypt domain", "دامنه Let's Encrypt")}</option>
          </select>
        </label>

        {settings.certSource === 'acme' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Certificate domain', 'دامنه گواهینامه')}
            </span>
            {certs.length > 0 ? (
              <select
                value={settings.acmeHost || ''}
                onChange={(e) => onPatch({ acmeHost: e.target.value })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              >
                <option value="">{L(lang, 'Select issued certificate…', 'انتخاب گواهینامه صادرشده…')}</option>
                {certs.map((c) => (
                  <option key={c.id} value={c.domain}>
                    {c.domain}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                dir="ltr"
                value={settings.acmeHost || ''}
                onChange={(e) => onPatch({ acmeHost: e.target.value })}
                placeholder="vpn.example.com"
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
            )}
          </label>
        )}
      </div>

      <div className="form-row three">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Idle timeout (s)', 'مهلت بیکاری (ثانیه)')}
          </span>
          <input
            type="number"
            dir="ltr"
            value={settings.idleTimeout ?? 1200}
            onChange={(e) => onPatch({ idleTimeout: Number(e.target.value) || 0 })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'DPD (s)', 'بررسی قطع اتصال DPD (ثانیه)')}
          </span>
          <input
            type="number"
            dir="ltr"
            value={settings.dpd ?? 90}
            onChange={(e) => onPatch({ dpd: Number(e.target.value) || 0 })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Cookie timeout (s)', 'اعتبار کوکی (ثانیه)')}
          </span>
          <input
            type="number"
            dir="ltr"
            value={settings.cookieTimeout ?? 300}
            onChange={(e) => onPatch({ cookieTimeout: Number(e.target.value) || 0 })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
          />
        </label>
      </div>

      <div className="form-row">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'TLS priorities', 'اولویت‌های TLS')}
          </span>
          <input
            type="text"
            dir="ltr"
            value={settings.tlsPriorities || 'NORMAL:%SERVER_PRECEDENCE:%COMPAT:-VERS-SSL3.0'}
            onChange={(e) => onPatch({ tlsPriorities: e.target.value })}
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
          />
        </label>
        <div className="flex items-end pb-2">
          <label className="switch">
            <input
              type="checkbox"
              checked={!!settings.proxyProtocol}
              onChange={(e) => onPatch({ proxyProtocol: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L(lang, 'Accept PROXY protocol', 'پذیرش پروتکل PROXY')}</span>
          </label>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
          {L(lang, 'Custom ocserv directives', 'دستورات سفارشی ocserv')}
        </span>
        <textarea
          rows={3}
          dir="ltr"
          value={settings.ocCustom || ''}
          onChange={(e) => onPatch({ ocCustom: e.target.value })}
          placeholder="# extra ocserv.conf lines"
          className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
        />
      </label>
    </FoldSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  WireGuardSection (collapsed + Advanced inside .inb-advanced-basics)        */
/* -------------------------------------------------------------------------- */

export function WireGuardSection({
  settings,
  serverPublicKey,
  onPatch,
}: {
  settings: InboundSettings;
  serverPublicKey?: string;
  onPatch: (patch: Partial<InboundSettings>) => void;
}) {
  const { lang } = useUi();
  const isAmnezia = settings.obfuscation === 'amnezia';
  const rawAmz = settings.amnezia || randomAmneziaParams();
  const displayAmz = {
    jc: rawAmz.Jc,
    jmin: rawAmz.Jmin,
    jmax: rawAmz.Jmax,
    s1: rawAmz.S1,
    s2: rawAmz.S2,
    h1: rawAmz.H1,
    h2: rawAmz.H2,
    h3: rawAmz.H3,
    h4: rawAmz.H4,
  };

  return (
    <details className="inb-advanced-basics mx-5.5 my-4.5">
      <summary>{L(lang, 'Advanced', 'تنظیمات پیشرفته')}</summary>
      <div className="ed-section">
        <div>
          <h2>WireGuard</h2>
        </div>
        <div className="ed-fields">
          {serverPublicKey && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Server public key', 'کلید عمومی سرور')}
              </span>
              <input
                type="text"
                readOnly
                dir="ltr"
                value={serverPublicKey}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-secondary)"
              />
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="switch">
              <input
                type="checkbox"
                checked={isAmnezia}
                onChange={(e) =>
                  onPatch({
                    obfuscation: e.target.checked ? 'amnezia' : 'off',
                    amnezia: settings.amnezia || randomAmneziaParams(),
                  })
                }
              />
              <span className="track" />
              <span className="sw-text">
                {L(lang, 'Amnezia obfuscation', 'مبهم‌سازی Amnezia')}
              </span>
            </label>
            <span className="hint text-xs text-(--text-muted)">
              {L(
                lang,
                'For networks that block WireGuard. Requires the AmneziaVPN app.',
                'برای شبکه‌هایی که WireGuard را مسدود می‌کنند. نیازمند اپلیکیشن AmneziaVPN است.',
              )}
            </span>
          </div>

          {isAmnezia && (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onPatch({ amnezia: randomAmneziaParams() })}
              >
                {L(lang, 'Regenerate Amnezia parameters', 'تولید مجدد پارامترهای Amnezia')}
              </Button>
              <pre className="wg-params font-mono" dir="ltr">
                {JSON.stringify(displayAmz, null, 2)}
              </pre>
            </div>
          )}

          <div className="form-row">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Tunnel MTU', 'مقدار MTU تونل')}
              </span>
              <input
                type="number"
                dir="ltr"
                min={1200}
                max={1500}
                value={settings.mtu ?? 1420}
                onChange={(e) => onPatch({ mtu: Number(e.target.value) || 1420 })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Persistent keepalive (seconds)', 'بازه ارسال Keepalive (ثانیه)')}
              </span>
              <input
                type="number"
                dir="ltr"
                min={0}
                max={300}
                value={settings.keepalive ?? 25}
                onChange={(e) => onPatch({ keepalive: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
              />
              <span className="mt-1 block text-xs text-(--text-muted)">
                {L(
                  lang,
                  '0 turns keepalive off. Default: 25 seconds.',
                  'مقدار 0 این قابلیت را خاموش می‌کند. پیش‌فرض: 25 ثانیه.',
                )}
              </span>
            </label>
          </div>
        </div>
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/*  IpsecSection (IKEv2 & L2TP)                                                */
/* -------------------------------------------------------------------------- */

const IKE_PROPOSALS = [
  'aes256-sha256-modp2048',
  'aes128-sha256-modp2048',
  'aes256gcm16-prfsha256-ecp256',
  'chacha20poly1305-prfsha256-curve25519',
];

const ESP_PROPOSALS = [
  'aes256-sha256',
  'aes128-sha256',
  'aes256gcm16',
  'chacha20poly1305',
];

export function IpsecSection({
  kind,
  settings,
  certs,
  onPatch,
}: {
  kind: 'ikev2' | 'l2tp';
  settings: InboundSettings;
  certs: CertOption[];
  onPatch: (patch: Partial<InboundSettings>) => void;
}) {
  const { lang } = useUi();

  const toggleProposal = (field: 'ikeProposals' | 'espProposals', item: string) => {
    const current = (settings[field] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = current.includes(item);
    const next = exists ? current.filter((x) => x !== item) : [...current, item];
    onPatch({ [field]: next.join(',') });
  };

  return (
    <>
      <div className="ed-section">
        <div>
          <h2>
            {kind === 'ikev2'
              ? L(lang, 'IKEv2 identity & certificate', 'هویت و گواهینامه IKEv2')
              : L(lang, 'L2TP/IPsec pre-shared key', 'کلید مشترک L2TP/IPsec')}
          </h2>
        </div>

        <div className="ed-fields">
          {kind === 'ikev2' ? (
            <>
              <div className="form-row">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                    {L(lang, 'Certificate source', 'منبع گواهینامه')}
                  </span>
                  <select
                    value={settings.certSource || 'pki'}
                    onChange={(e) => onPatch({ certSource: e.target.value as InboundSettings['certSource'] })}
                    className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary)"
                  >
                    <option value="pki">{L(lang, 'Internal CA certificate', 'گواهینامه داخلی پنل')}</option>
                    <option value="panel">{L(lang, 'Panel HTTPS certificate', 'گواهینامه HTTPS پنل')}</option>
                    <option value="acme">{L(lang, "Let's Encrypt domain", "دامنه Let's Encrypt")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                    {L(lang, 'Server identity (SAN / FQDN)', 'شناسه سرور (SAN / دامنه)')}
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={settings.serverId || ''}
                    onChange={(e) => onPatch({ serverId: e.target.value })}
                    placeholder="vpn.example.com"
                    className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                  />
                </label>
              </div>

              {settings.certSource === 'acme' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                    {L(lang, 'Certificate domain', 'دامنه گواهینامه')}
                  </span>
                  {certs.length > 0 ? (
                    <select
                      value={settings.acmeHost || ''}
                      onChange={(e) => onPatch({ acmeHost: e.target.value })}
                      className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                    >
                      <option value="">{L(lang, 'Select issued certificate…', 'انتخاب گواهینامه…')}</option>
                      {certs.map((c) => (
                        <option key={c.id} value={c.domain}>
                          {c.domain}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      dir="ltr"
                      value={settings.acmeHost || ''}
                      onChange={(e) => onPatch({ acmeHost: e.target.value })}
                      placeholder="vpn.example.com"
                      className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                    />
                  )}
                </label>
              )}
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'IPsec pre-shared key (PSK)', 'کلید مشترک IPsec (PSK)')}
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={settings.psk || ''}
                  onChange={(e) => onPatch({ psk: e.target.value })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPatch({ psk: randomTokenStr(20) })}
                  title={L(lang, 'Generate random PSK', 'تولید کلید تصادفی')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </label>
          )}
        </div>
      </div>

      <FoldSection
        title={L(lang, 'Advanced IPsec settings', 'تنظیمات پیشرفته IPsec')}
        summaryPrefix={L(lang, 'Recommended ciphers & timers. ', 'رمزنگاری و تایمرهای پیشنهادی فعال است. ')}
        summary={kind === 'ikev2' ? 'MOBIKE · Fragmentation' : `PPP MTU ${settings.pppMtu ?? 1400}`}
      >
        <div className="ed-sub">
          <h3>{L(lang, 'IKE cipher proposals', 'پیشنهادهای رمزنگاری IKE')}</h3>
          <div className="checks-inline mt-2">
            {IKE_PROPOSALS.map((prop) => {
              const active = (settings.ikeProposals || '').includes(prop);
              return (
                <label key={prop} className="inline-flex items-center gap-2 text-xs font-mono text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleProposal('ikeProposals', prop)}
                  />
                  <span>{prop}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="ed-sub">
          <h3>{L(lang, 'ESP cipher proposals', 'پیشنهادهای رمزنگاری ESP')}</h3>
          <div className="checks-inline mt-2">
            {ESP_PROPOSALS.map((prop) => {
              const active = (settings.espProposals || '').includes(prop);
              return (
                <label key={prop} className="inline-flex items-center gap-2 text-xs font-mono text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleProposal('espProposals', prop)}
                  />
                  <span>{prop}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="form-row three">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'IKE rekey (s)', 'تمدید کلید IKE (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.rekeySeconds ?? 10800}
              onChange={(e) => onPatch({ rekeySeconds: Number(e.target.value) || 0 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Child SA rekey (s)', 'تمدید Child SA (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.childRekeySeconds ?? 3600}
              onChange={(e) => onPatch({ childRekeySeconds: Number(e.target.value) || 0 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'DPD delay (s)', 'تاخیر DPD (ثانیه)')}
            </span>
            <input
              type="number"
              dir="ltr"
              value={settings.dpdSeconds ?? 30}
              onChange={(e) => onPatch({ dpdSeconds: Number(e.target.value) || 0 })}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
        </div>

        {kind === 'ikev2' ? (
          <div className="checks-inline">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.mobike !== false}
                onChange={(e) => onPatch({ mobike: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">
                {L(lang, 'MOBIKE (seamless Wi-Fi / LTE roaming)', 'پشتیبانی از جابجایی شبکه‌ای (MOBIKE)')}
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.fragmentation !== false}
                onChange={(e) => onPatch({ fragmentation: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">
                {L(lang, 'IKEv2 packet fragmentation', 'تکه‌بندی بسته‌های IKEv2')}
              </span>
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="form-row three">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">PPP MTU</span>
                <input
                  type="number"
                  dir="ltr"
                  value={settings.pppMtu ?? 1400}
                  onChange={(e) => onPatch({ pppMtu: Number(e.target.value) || 1400 })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">PPP MRU</span>
                <input
                  type="number"
                  dir="ltr"
                  value={settings.pppMru ?? 1400}
                  onChange={(e) => onPatch({ pppMru: Number(e.target.value) || 1400 })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'Idle disconnect (s)', 'قطع اتصال بیکاری (ثانیه)')}
                </span>
                <input
                  type="number"
                  dir="ltr"
                  value={settings.idleSeconds ?? 0}
                  onChange={(e) => onPatch({ idleSeconds: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
              </label>
            </div>
            <div className="form-row">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'LCP echo interval (s)', 'بازه LCP Echo (ثانیه)')}
                </span>
                <input
                  type="number"
                  dir="ltr"
                  value={settings.lcpEchoInterval ?? 30}
                  onChange={(e) => onPatch({ lcpEchoInterval: Number(e.target.value) || 30 })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'LCP failure threshold', 'آستانه خطای LCP')}
                </span>
                <input
                  type="number"
                  dir="ltr"
                  value={settings.lcpEchoFailure ?? 4}
                  onChange={(e) => onPatch({ lcpEchoFailure: Number(e.target.value) || 4 })}
                  className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
                />
              </label>
            </div>
            <div className="checks-inline">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.forceEncap !== false}
                  onChange={(e) => onPatch({ forceEncap: e.target.checked })}
                />
                <span className="track" />
                <span className="sw-text">
                  {L(lang, 'Force UDP encapsulation (NAT-T)', 'اجبار کپسوله‌سازی UDP (NAT-T)')}
                </span>
              </label>
            </div>
          </div>
        )}
      </FoldSection>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  SmartDnsSection                                                            */
/* -------------------------------------------------------------------------- */

export function SmartDnsSection({
  settings,
  onPatch,
}: {
  settings: InboundSettings;
  onPatch: (patch: Partial<InboundSettings>) => void;
}) {
  const { lang } = useUi();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [domainSearch, setDomainSearch] = useState('');

  const activeCategories = Array.isArray(settings.dnsCategories)
    ? settings.dnsCategories
    : ['games', 'dev', 'ai', 'general'];
  const selectedDomainsMap =
    settings.dnsSelectedDomains && typeof settings.dnsSelectedDomains === 'object'
      ? settings.dnsSelectedDomains
      : {};

  const toggleCategory = (catId: string) => {
    const exists = activeCategories.includes(catId);
    const next = exists ? activeCategories.filter((x) => x !== catId) : [...activeCategories, catId];
    onPatch({ dnsCategories: next });
  };

  const getCategorySelected = (catId: string, allDomains: string[]): string[] => {
    const custom = selectedDomainsMap[catId];
    return Array.isArray(custom) ? custom : allDomains;
  };

  const setCategorySelected = (catId: string, nextList: string[]) => {
    onPatch({
      dnsSelectedDomains: {
        ...selectedDomainsMap,
        [catId]: nextList,
      },
    });
  };

  return (
    <>
      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Domain lists', 'فهرست دامنه‌ها')}</h2>
          <p className="ed-lede">
            {L(
              lang,
              'Choose which categories of sanctioned domains this Smart DNS proxies for clients.',
              'دسته‌بندی سرویس‌هایی که این Smart DNS عبور می‌دهد را انتخاب کنید.',
            )}
          </p>
        </div>
        <div className="ed-fields space-y-3">
          {SMARTDNS_CATEGORIES.map((cat) => {
            const enabled = activeCategories.includes(cat.id);
            const isOpen = expandedCat === cat.id;
            const currentSelected = getCategorySelected(cat.id, cat.domains);
            const q = domainSearch.trim().toLowerCase();
            const filteredDomains = q ? cat.domains.filter((d) => d.toLowerCase().includes(q)) : cat.domains;

            const isBroad = cat.id === 'broad';
            return (
              <div
                key={cat.id}
                className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="switch">
                    <input type="checkbox" checked={enabled} onChange={() => toggleCategory(cat.id)} />
                    <span className="track" />
                    <span className="sw-text font-medium">{L(lang, cat.labelEn, cat.labelFa)}</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                    <span>
                      {lang === 'fa' ? `${cat.domains.length} دامنه` : `${cat.domains.length} domains`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDomainSearch('');
                        setExpandedCat(isOpen ? null : cat.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-(--border-subtle) px-2 py-1 text-xs text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary)"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span>
                        {lang === 'fa'
                          ? `انتخاب دامنه‌ها (${currentSelected.length}/${cat.domains.length})`
                          : `Choose domains in ${cat.labelEn}`}
                      </span>
                    </button>
                  </div>
                </div>

                {isBroad && enabled && (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
                    {L(
                      lang,
                      'Broad matching routes entire cloud/CDN company ranges through DNS proxy and can increase bandwidth usage.',
                      'انتخاب این فهرست باعث عبور کل رنج‌های شرکت‌های بزرگ و افزایش مصرف ترافیک می‌شود.',
                    )}
                  </p>
                )}

                {isOpen && (
                  <div className="mt-3 space-y-2.5 border-t border-(--border-subtle) pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={domainSearch}
                        onChange={(e) => setDomainSearch(e.target.value)}
                        placeholder={L(lang, 'Search domains', 'جستجوی دامنه‌ها')}
                        className="input h-8! min-w-[180px] flex-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setCategorySelected(cat.id, cat.domains)}
                      >
                        {L(lang, 'Select all', 'انتخاب همه')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setCategorySelected(cat.id, [])}
                      >
                        {L(lang, 'Select none', 'لغو همه')}
                      </Button>
                    </div>
                    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {filteredDomains.map((dom) => {
                        const checked = currentSelected.includes(dom);
                        return (
                          <label
                            key={dom}
                            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-(--text-secondary) hover:bg-(--bg-elevated)"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextList = e.target.checked
                                  ? Array.from(new Set([...currentSelected, dom]))
                                  : currentSelected.filter((d) => d !== dom);
                                setCategorySelected(cat.id, nextList);
                              }}
                            />
                            <span className="truncate font-mono">{dom}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Your own domains', 'دامنه‌های دلخواه شما')}</h2>
        </div>
        <div className="ed-fields">
          <div className="form-row">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Extra domains', 'دامنه‌های اضافی')}
              </span>
              <textarea
                rows={4}
                dir="ltr"
                value={Array.isArray(settings.extraDomains) ? settings.extraDomains.join('\n') : String(settings.extraDomains || '')}
                onChange={(e) => onPatch({ extraDomains: e.target.value.split('\n') })}
                placeholder="example.com"
                className="textarea font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Never pass these', 'عبور ندادن این دامنه‌ها')}
              </span>
              <textarea
                rows={4}
                dir="ltr"
                value={Array.isArray(settings.neverPassDomains) ? settings.neverPassDomains.join('\n') : String(settings.neverPassDomains || '')}
                onChange={(e) => onPatch({ neverPassDomains: e.target.value.split('\n') })}
                placeholder="bank.ir"
                className="textarea font-mono text-xs"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Clients', 'کلاینت‌ها')}</h2>
        </div>
        <div className="ed-fields">
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Addresses per client', 'تعداد آدرس برای هر کلاینت')}
            </span>
            <input
              type="number"
              min={1}
              max={16}
              dir="ltr"
              value={settings.maxAddressesPerClient ?? 1}
              onChange={(e) => onPatch({ maxAddressesPerClient: Number(e.target.value) || 1 })}
              className="input font-mono text-sm"
            />
          </label>
        </div>
      </div>

      <FoldSection
        title={L(lang, 'Advanced', 'پیشرفته')}
        summaryPrefix={L(lang, 'Upstream resolvers and bind options. ', 'سرورهای DNS بالادست و آدرس‌دهی. ')}
        summary={String(settings.smartDnsIpv4 || 'Auto')}
      >
        <div className="form-row">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Upstream resolvers', 'سرورهای بالادست')}
            </span>
            <textarea
              rows={3}
              dir="ltr"
              value={Array.isArray(settings.upstreams) ? settings.upstreams.join('\n') : String(settings.upstreams || '1.1.1.1\n8.8.8.8')}
              onChange={(e) => onPatch({ upstreams: e.target.value.split('\n') })}
              className="textarea font-mono text-xs"
            />
          </label>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'IPv4 address', 'آدرس IPv4')}
              </span>
              <input
                type="text"
                dir="ltr"
                value={settings.smartDnsIpv4 || ''}
                onChange={(e) => onPatch({ smartDnsIpv4: e.target.value })}
                placeholder={L(lang, 'Auto-detected server IP', 'تشخیص خودکار آی‌پی سرور')}
                className="input font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'IPv6 address', 'آدرس IPv6')}
              </span>
              <input
                type="text"
                dir="ltr"
                value={settings.smartDnsIpv6 || ''}
                onChange={(e) => onPatch({ smartDnsIpv6: e.target.value })}
                placeholder={L(lang, 'Optional', 'اختیاری')}
                className="input font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Extra TLS ports', 'پورت‌های TLS اضافی')}
              </span>
              <input
                type="text"
                dir="ltr"
                value={settings.extraTlsPorts || ''}
                onChange={(e) => onPatch({ extraTlsPorts: e.target.value })}
                placeholder="8443"
                className="input font-mono text-xs"
              />
            </label>
          </div>
        </div>
      </FoldSection>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  TelegramProxySection                                                       */
/* -------------------------------------------------------------------------- */

export function TelegramProxySection({
  settings,
  onPatch,
}: {
  settings: InboundSettings;
  onPatch: (patch: Partial<InboundSettings>) => void;
}) {
  const { lang } = useUi();

  return (
    <>
      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Connection modes', 'حالت‌های اتصال')}</h2>
          <p className="ed-lede">
            {L(
              lang,
              'Choose which MTProto handshake modes this proxy accepts.',
              'حالت‌های MTProto قابل‌پذیرش توسط این پروکسی را انتخاب کنید.',
            )}
          </p>
        </div>
        <div className="ed-fields">
          <div className="checks-inline">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.tgFakeTls !== false}
                onChange={(e) => onPatch({ tgFakeTls: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">Fake-TLS</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.tgSecure)}
                onChange={(e) => onPatch({ tgSecure: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">{L(lang, 'Secure', 'امن (dd)')}</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.tgClassic)}
                onChange={(e) => onPatch({ tgClassic: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">{L(lang, 'Classic', 'کلاسیک')}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="ed-section">
        <div>
          <h2>{L(lang, 'Cover site', 'سایت پوششی')}</h2>
        </div>
        <div className="ed-fields space-y-3">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Fake-TLS domain', 'دامنه Fake-TLS')}
            </span>
            <input
              type="text"
              dir="ltr"
              value={settings.fakeTlsDomain || 'www.cloudflare.com'}
              onChange={(e) => onPatch({ fakeTlsDomain: e.target.value })}
              className="input font-mono text-sm"
            />
          </label>
          <div className="checks-inline">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.passOtherTraffic !== false}
                onChange={(e) => onPatch({ passOtherTraffic: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">
                {L(lang, 'Pass other traffic to the real site', 'هدایت سایر ترافیک به سایت واقعی')}
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.copyHandshake !== false}
                onChange={(e) => onPatch({ copyHandshake: e.target.checked })}
              />
              <span className="track" />
              <span className="sw-text">
                {L(lang, "Copy the site's handshake", 'کپی کردن هندشیک سایت')}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="ed-section">
        <div>
          <h2>{L(lang, 'More options', 'گزینه‌های بیشتر')}</h2>
        </div>
        <div className="ed-fields space-y-3">
          <div className="form-row">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Sponsored channel tag', 'تگ کانال اسپانسری')}
              </span>
              <input
                type="text"
                dir="ltr"
                maxLength={32}
                value={settings.sponsoredTag || ''}
                onChange={(e) => onPatch({ sponsoredTag: e.target.value })}
                placeholder={L(lang, '32 chars from @MTProxybot', '۳۲ کاراکتر از @MTProxybot')}
                className="input font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
                {L(lang, 'Connection limit', 'محدودیت اتصال')}
              </span>
              <input
                type="number"
                min={1}
                dir="ltr"
                value={settings.maxClients ?? 10000}
                onChange={(e) => onPatch({ maxClients: Number(e.target.value) || 10000 })}
                className="input font-mono text-sm"
              />
            </label>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.listenIpv6 !== false}
              onChange={(e) => onPatch({ listenIpv6: e.target.checked })}
            />
            <span className="track" />
            <span className="sw-text">{L(lang, 'Listen on IPv6', 'شنود روی IPv6')}</span>
          </label>
          <p className="text-xs text-(--text-muted)" dir="ltr">
            MTProto engine: telemt
          </p>
        </div>
      </div>
    </>
  );
}
