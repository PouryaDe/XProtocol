import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Server, Trash2 } from 'lucide-react';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { Button } from './UiPrimitives';
import { Modal } from './Modal';
import {
  getPresetRanges,
  randomAmneziaParams,
  randomTokenStr,
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
/*  FoldSection                                                                */
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
      <div className="fold-main">
        <h2>{title}</h2>
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )}
          <span className="text-(--text-secondary)">
            {summaryPrefix}
            {summary}
          </span>
          <span className="fold-act">{open ? L(lang, 'Hide', 'بستن') : actLabel}</span>
        </button>
      </div>
      {open && <div className="ed-fields mt-4">{children}</div>}
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
  const isCustom = !presets.some((p) => p.cidr === value);
  const [customMode, setCustomMode] = useState(isCustom);

  useEffect(() => {
    setCustomMode(!presets.some((p) => p.cidr === value));
  }, [value, presets]);

  useEffect(() => {
    onValidityChange?.(info.ok);
  }, [info.ok, onValidityChange]);

  const roleLabel = (role: 'default' | 'small' | 'large') => {
    if (role === 'default') return L(lang, 'Recommended default', 'پیش‌فرض پیشنهادی');
    if (role === 'small') return L(lang, 'Smaller range', 'بازه کوچک‌تر');
    return L(lang, 'Larger range', 'بازه بزرگ‌تر');
  };

  const errorText = () => {
    if (info.ok) return null;
    if (info.reason === 'empty') {
      return L(lang, 'Enter an address range such as 10.8.0.0/24.', 'یک بازه آدرس مانند 10.8.0.0/24 وارد کنید.');
    }
    if (info.reason === 'format') {
      return L(
        lang,
        'Enter an address range in CIDR form, such as 10.8.0.0/24.',
        'بازه آدرس را به شکل CIDR وارد کنید، مثلا 10.8.0.0/24.',
      );
    }
    if (info.reason === 'unmasked') {
      return L(
        lang,
        'End the address in zero for the mask (for example 10.8.0.0/24, not 10.8.0.1/24).',
        'آدرس باید با توجه به ماسک با صفر تمام شود (مثلا 10.8.0.0/24، نه 10.8.0.1/24).',
      );
    }
    if (info.reason === 'range') {
      return L(
        lang,
        'Mask must be between /16 and /29.',
        'ماسک باید بین /16 تا /29 باشد.',
      );
    }
    return L(
      lang,
      'Use a private address range (10.x, 172.16-31.x, or 192.168.x).',
      'از یک بازه آدرس خصوصی استفاده کنید (10.x، 172.16-31.x یا 192.168.x).',
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-(--text-secondary)">
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
          {presets.map((p) => (
            <option key={p.cidr} value={p.cidr}>
              {p.cidr} — {roleLabel(p.role)} (~{p.usable} {L(lang, 'addresses', 'آدرس')})
            </option>
          ))}
          <option value="__custom__">{L(lang, 'Custom CIDR range…', 'بازه CIDR سفارشی…')}</option>
        </select>
      </div>

      {customMode && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
            {L(lang, 'Custom subnet (CIDR)', 'زیرشبکه سفارشی (CIDR)')}
          </span>
          <input
            type="text"
            dir="ltr"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="10.8.0.0/24"
            className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary) transition focus:border-(--accent) focus:outline-none"
          />
        </label>
      )}

      {info.ok ? (
        <p className="text-xs text-(--text-muted)">
          {lang === 'fa'
            ? `حدود ${info.usable} آدرس قابل استفاده در بازه ${value} برای کلاینت‌های همزمان`
            : `About ${info.usable} usable client addresses inside ${value}.`}
        </p>
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
}: {
  nodes: NodeOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  errors?: Record<number, string | null>;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-(--text-secondary)">
          {L(
            lang,
            'Selected nodes will be set up immediately after creation.',
            'نودهای انتخاب‌شده بلافاصله پس از ساخت راه‌اندازی می‌شوند.',
          )}
        </span>
        {nodes.length > 4 && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L(lang, 'Filter nodes…', 'فیلتر نودها…')}
            className="w-52 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1.5 text-xs text-(--text-primary) focus:border-(--accent) focus:outline-none"
          />
        )}
      </div>

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
              <button
                key={n.id}
                type="button"
                className={`inb-node-option${selected ? ' selected' : ''}${err ? ' has-error' : ''}`}
                onClick={() => onToggle(n.id)}
              >
                <span className="inb-node-main">
                  <span className="flex items-center gap-2 font-medium text-sm text-(--text-primary)">
                    <Server className="h-3.5 w-3.5 text-(--accent-text)" />
                    <span>{n.isLocal ? L(lang, 'This server', 'همین سرور') : n.name}</span>
                    {n.isLocal && (
                      <span className="rounded-md bg-(--accent-wash) px-1.5 py-0.5 text-[10px] font-semibold text-(--accent-text)">
                        {L(lang, 'Panel + node', 'پنل + نود')}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-(--text-muted) font-mono" dir="ltr">
                    {n.address || '127.0.0.1'}
                    {offline ? ` · ${n.status}` : ''}
                  </span>
                  {err && <span className="text-xs text-red-400 mt-0.5">{err}</span>}
                </span>
                <span className="inb-selected-mark">
                  {selected ? L(lang, 'Selected', 'انتخاب شده') : L(lang, 'Select', 'انتخاب')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedIds.length === 0 && (
        <div className="callout mt-1">
          <div className="text-xs text-(--text-secondary)">
            {L(
              lang,
              'Leave empty to save as a draft — you can attach nodes later without losing settings.',
              'برای ذخیره به‌عنوان پیش‌نویس خالی بگذارید — بعدا بدون از دست رفتن تنظیمات می‌توانید نود اضافه کنید.',
            )}
          </div>
        </div>
      )}
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
  const [ovHost, setOvHost] = useState(inbound.publicAddressOverride || '');
  const [savingOv, setSavingOv] = useState(false);

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

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

  const handleSaveOverride = async () => {
    setSavingOv(true);
    try {
      await apiFetch(`/inbounds/${inbound.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          port: Number(ovPort) || inbound.port,
          publicAddressOverride: ovHost.trim(),
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

  return (
    <div className="panel inb-deployments">
      <div className="panel-h">
        <h2>{L(lang, 'Deployment nodes', 'نودهای اجرا')}</h2>
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
              + {L(lang, 'Choose node & run', 'انتخاب نود و اجرا')}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="inb-deployment">
            <div className="inb-deployment-main">
              <div className="inb-deployment-name">
                <span className={`dot ${inbound.running ? 'live' : ''}`} />
                <span>{nodeDisplayName}</span>
                <span className="inb-endpoint">
                  {inbound.transport.toUpperCase()} · {inbound.port}
                  {inbound.publicAddressOverride ? ` · ${inbound.publicAddressOverride}` : ''}
                </span>
                <span className="text-xs text-(--text-muted)">
                  {inbound.running
                    ? L(lang, 'Running', 'در حال اجرا')
                    : L(lang, 'Stopped', 'متوقف')}
                </span>
              </div>
              <div className="text-xs text-(--text-muted)" dir="ltr">
                {attachedNode?.address || '127.0.0.1'} · {inbound.subnet}
              </div>
            </div>

            <div className="inb-deployment-actions">
              <div className="inb-run-actions">
                {inbound.running ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!busyAction}
                      onClick={() => void onAction('restart')}
                    >
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

              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setOvPort(String(inbound.port));
                  setOvHost(inbound.publicAddressOverride || '');
                  setOverrideNodeOpen(true);
                }}
              >
                {L(lang, 'Node-specific settings', 'تنظیمات این نود')}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRemoveConfirmOpen(true)}
                title={L(lang, 'Remove from this node', 'حذف از این نود')}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Nodes Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L(lang, 'Attach node', 'اتصال نود')}
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
                      {L(lang, 'Port on', 'پورت روی')} {n?.name || `#${nid}`}
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
              {adding ? L(lang, 'Attaching…', 'در حال اتصال…') : L(lang, 'Attach & apply', 'اتصال و اعمال')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Node-specific settings Modal */}
      <Modal
        open={overrideNodeOpen}
        onClose={() => setOverrideNodeOpen(false)}
        title={L(lang, 'Node-specific settings', 'تنظیمات اختصاصی نود')}
        subtitle={nodeDisplayName}
      >
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Listen port', 'پورت شنود')}
            </span>
            <input
              type="number"
              dir="ltr"
              min={1}
              max={65535}
              value={ovPort}
              onChange={(e) => setOvPort(e.target.value)}
              className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-sm text-(--text-primary)"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Public address override (optional)', 'بازنویسی آدرس عمومی (اختیاری)')}
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOverrideNodeOpen(false)}>
              {L(lang, 'Cancel', 'لغو')}
            </Button>
            <Button variant="primary" disabled={savingOv} onClick={() => void handleSaveOverride()}>
              {savingOv ? L(lang, 'Saving…', 'در حال ذخیره…') : L(lang, 'Save', 'ذخیره')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove Deployment Modal */}
      <Modal
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        title={L(lang, 'Remove from this node', 'حذف از این نود')}
        subtitle={nodeDisplayName}
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
      title={L(lang, 'OpenConnect / AnyConnect', 'تنظیمات OpenConnect / AnyConnect')}
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
/*  WireGuardSection                                                           */
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

  const insertToken = (token: string) => {
    const cur = settings.filenameTemplate || '{inbound}-{client}';
    onPatch({ filenameTemplate: `${cur}${cur.endsWith('-') ? '' : '-'}${token}` });
  };

  return (
    <>
      <div className="ed-section">
        <h2>{L(lang, 'WireGuard & AmneziaWG', 'تنظیمات WireGuard و AmneziaWG')}</h2>
        <div className="ed-fields mt-4">
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

          <div className="checks-inline">
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
                {L(
                  lang,
                  'AmneziaWG obfuscation (bypass DPI blocking)',
                  'مبهم‌سازی AmneziaWG (عبور از فیلترینگ DPI)',
                )}
              </span>
            </label>
          </div>

          {isAmnezia && (
            <div className="wg-params flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-(--text-secondary)">
                  {L(lang, 'AmneziaWG handshake parameters', 'پارامترهای AmneziaWG')}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPatch({ amnezia: randomAmneziaParams() })}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {L(lang, 'Regenerate parameters', 'تولید مجدد پارامترها')}
                </Button>
              </div>
              <pre className="code-block" dir="ltr">
                {JSON.stringify(settings.amnezia || randomAmneziaParams(), null, 2)}
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
                {L(lang, 'Persistent keepalive (s)', 'بازه ارسال Keepalive (ثانیه)')}
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
            </label>
          </div>

          <div className="wg-filename-group">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
              {L(lang, 'Client config filename template', 'الگوی نام فایل کانفیگ کلاینت')}
            </span>
            <div className="wg-filename-row">
              <div className="input-group flex-1">
                <input
                  type="text"
                  dir="ltr"
                  className="input font-mono text-sm"
                  value={settings.filenameTemplate || '{inbound}-{client}'}
                  onChange={(e) => onPatch({ filenameTemplate: e.target.value })}
                />
                <span className="suffix" dir="ltr">
                  .conf
                </span>
              </div>
            </div>
            <div className="wg-filename-help mt-1">
              <span>{L(lang, 'Tokens:', 'متغیرها:')}</span>
              {['{inbound}', '{client}', '{node}', '{kind}'].map((tok) => (
                <button
                  key={tok}
                  type="button"
                  className="rounded border border-(--border-subtle) px-1.5 py-0.5 font-mono text-[11px] hover:border-(--accent)"
                  onClick={() => insertToken(tok)}
                >
                  {tok}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
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
    <div className="flex flex-col gap-4">
      <div className="ed-section">
        <h2>
          {kind === 'ikev2'
            ? L(lang, 'IKEv2 identity & certificate', 'هویت و گواهینامه IKEv2')
            : L(lang, 'L2TP/IPsec pre-shared key', 'کلید مشترک L2TP/IPsec')}
        </h2>

        <div className="ed-fields mt-4">
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
    </div>
  );
}
