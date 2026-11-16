import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  Flame,
  Globe,
  Info,
  MoreHorizontal,
  PauseCircle,
  Plus,
  RefreshCw,
  Router as RouterIcon,
  Shield,
  ShieldBan,
  Trash2,
  Waypoints,
} from 'lucide-react';
import {
  OutboundModal,
  PsiphonModal,
  RuleModal,
  TestModal,
  WarpModal,
  NordVpnModal,
} from '../components/RoutingModals';
import {
  ActionMenu,
  Button,
  EmptySonar,
  EqLoader,
  PageHead,
  Segmented,
  Tabs,
} from '../components/UiPrimitives';
import { useUi } from '../i18n/context';
import { apiFetch } from '../lib/api';
import { navigate, updateSearchParams, useLocationState } from '../lib/router';
import {
  formatProtocolLabel,
  getOutboundSummary,
  getProviderType,
  makeRuleId,
  type InboundRouteOverride,
  type NodeInboundItem,
  type NodeListItem,
  type OutboundItem,
  type RoutingCatalog,
  type RoutingPolicy,
  type RoutingRule,
} from '../lib/routingTypes';

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getActionEncode(action?: { type: 'none' | 'direct' | 'block' | 'outbound'; outboundId?: number }): string {
  if (!action) return 'default';
  if (action.type === 'outbound') return `ob:${action.outboundId ?? ''}`;
  return action.type;
}

function parseActionEncode(val: string): InboundRouteOverride['action'] | null {
  if (val === 'default') return null;
  if (val.startsWith('ob:')) {
    const id = Number(val.slice(3));
    return id ? { type: 'outbound', outboundId: id } : { type: 'direct' };
  }
  return { type: val as 'none' | 'direct' | 'block' };
}

export function RoutingPage() {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const loc = useLocationState();
  const tab: 'rules' | 'outbounds' = loc.pathname.replace(/\/+$/, '').endsWith('/outbounds') ? 'outbounds' : 'rules';

  const [nodes, setNodes] = useState<NodeListItem[]>([]);
  const [nodeStates, setNodeStates] = useState<Record<number, string>>({});
  const [outbounds, setOutbounds] = useState<OutboundItem[]>([]);
  const [catalog, setCatalog] = useState<RoutingCatalog | null>(null);
  const [policy, setPolicy] = useState<RoutingPolicy | null>(null);
  const [draft, setDraft] = useState<RoutingPolicy | null>(null);
  const [nodeInbounds, setNodeInbounds] = useState<NodeInboundItem[]>([]);
  const [renderedConfig, setRenderedConfig] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingPolicy, setLoadingPolicy] = useState(false);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const [obSearch, setObSearch] = useState('');
  const [ruleModal, setRuleModal] = useState<{ isNew: boolean; rule: RoutingRule } | null>(null);
  const [obModal, setObModal] = useState<OutboundItem | 'new' | null>(null);
  const [providerModal, setProviderModal] = useState<{
    kind: 'warp' | 'nordvpn' | 'psiphon';
    outbound: OutboundItem | null;
  } | null>(null);
  const [testTarget, setTestTarget] = useState<OutboundItem | null>(null);

  const queryNodeParam = useMemo(() => {
    const raw = new URLSearchParams(loc.search).get('node');
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  }, [loc.search]);

  const selectedNodeId = useMemo(() => {
    if (queryNodeParam !== null && nodes.some((n) => n.id === queryNodeParam)) return queryNodeParam;
    return nodes.find((n) => n.isLocal)?.id ?? nodes[0]?.id ?? null;
  }, [queryNodeParam, nodes]);

  useEffect(() => {
    if (selectedNodeId === null) return;
    const current = new URLSearchParams(loc.search).get('node');
    if (current !== String(selectedNodeId)) {
      updateSearchParams((p) => p.set('node', String(selectedNodeId)), { replace: true });
    }
  }, [selectedNodeId, loc.search]);

  const loadBase = useCallback(async () => {
    try {
      const [nRes, oRes, cRes] = await Promise.all([
        apiFetch<{ nodes: NodeListItem[] }>('/nodes'),
        apiFetch<{ outbounds: OutboundItem[] }>('/routing/outbounds'),
        apiFetch<RoutingCatalog>('/routing/catalog').catch(() => null),
      ]);
      setNodes(nRes.nodes || []);
      setOutbounds(oRes.outbounds || []);
      if (cRes) setCatalog(cRes);

      // Load status summary for every node pill
      if (nRes.nodes?.length) {
        const pairs = await Promise.all(
          nRes.nodes.map(async (nd) => {
            try {
              const p = await apiFetch<{ policy: RoutingPolicy; inbounds?: NodeInboundItem[] }>(
                `/routing/policies/${nd.id}`,
              );
              const state = !p.policy.enabled
                ? 'off'
                : (p.inbounds?.length ?? 0) === 0
                  ? 'no-inbounds'
                  : p.policy.status || 'active';
              return [nd.id, state] as const;
            } catch {
              return [nd.id, 'off'] as const;
            }
          }),
        );
        setNodeStates(Object.fromEntries(pairs));
      }
    } finally {
      setLoadingInit(false);
    }
  }, []);

  const loadPolicy = useCallback(async (nodeId: number) => {
    setLoadingPolicy(true);
    setSaveErr(null);
    try {
      const res = await apiFetch<{
        policy: RoutingPolicy;
        renderedConfig: string;
        inbounds?: NodeInboundItem[];
      }>(`/routing/policies/${nodeId}`);
      const norm: RoutingPolicy = {
        ...res.policy,
        inboundRoutes: res.policy.inboundRoutes || [],
        rules: (res.policy.rules || []).map((r) => ({ ...r, enabled: r.enabled !== false })),
      };
      setPolicy(norm);
      setDraft(norm);
      setRenderedConfig(res.renderedConfig || '');
      setNodeInbounds(res.inbounds || []);
      setNodeStates((prev) => ({
        ...prev,
        [nodeId]: !norm.enabled ? 'off' : (res.inbounds?.length ?? 0) === 0 ? 'no-inbounds' : 'active',
      }));
    } catch (e) {
      setSaveErr(String(e));
    } finally {
      setLoadingPolicy(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (selectedNodeId !== null) {
      void loadPolicy(selectedNodeId);
    }
  }, [selectedNodeId, loadPolicy]);

  const dirty = useMemo(() => {
    if (!policy || !draft) return false;
    return !deepEqual(policy, draft);
  }, [policy, draft]);

  const switchTab = (next: 'rules' | 'outbounds') => {
    const q = selectedNodeId !== null ? `?node=${selectedNodeId}` : '';
    navigate(next === 'outbounds' ? `/routing/outbounds${q}` : `/routing${q}`);
  };

  const selectNode = (id: number) => {
    if (id === selectedNodeId) return;
    if (dirty && !confirm(isFa ? 'تغییرات مسیریابی ذخیره نشده کنار گذاشته شود؟' : 'Discard unsaved routing changes on this node?')) {
      return;
    }
    updateSearchParams((p) => p.set('node', String(id)));
  };

  const handleGeoUpdate = async () => {
    setGeoBusy(true);
    setGeoMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; geo?: RoutingCatalog['geo'] }>('/routing/geo-update', {
        method: 'POST',
      });
      setGeoMsg(res.message);
      if (res.geo) {
        setCatalog((prev) => (prev ? { ...prev, geo: res.geo! } : prev));
      } else {
        const fresh = await apiFetch<RoutingCatalog>('/routing/catalog').catch(() => null);
        if (fresh) setCatalog(fresh);
      }
    } catch (e) {
      setGeoMsg(String(e));
    } finally {
      setGeoBusy(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!draft || selectedNodeId === null) return;
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      await apiFetch(`/routing/policies/${selectedNodeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: draft.enabled,
          inboundScope: draft.inboundScope,
          inboundIds: draft.inboundIds,
          inboundRoutes: draft.inboundRoutes,
          defaultAction: draft.defaultAction,
          defaultOutboundId: draft.defaultOutboundId,
          rules: draft.rules,
        }),
      });
      await Promise.all([loadPolicy(selectedNodeId), loadBase()]);
      setSaveMsg(isFa ? 'سیاست مسیریابی ذخیره و اعمال شد.' : 'Routing policy saved.');
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (e) {
      setSaveErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (policy) {
      setDraft(policy);
      setSaveErr(null);
    }
  };

  const updateDraft = (fn: (prev: RoutingPolicy) => RoutingPolicy) => {
    setSaveErr(null);
    setDraft((prev) => (prev ? fn(prev) : prev));
  };

  const addPresetRule = (preset: 'gemini' | 'openai' | 'iran') => {
    if (!draft) return;
    const defaultOb = outbounds[0];
    const baseRule: RoutingRule =
      preset === 'gemini'
        ? {
            id: makeRuleId(draft.rules),
            enabled: true,
            geosite: ['geosite:google-gemini'],
            action: defaultOb ? 'outbound' : 'direct',
            ...(defaultOb ? { outboundId: defaultOb.id, outboundTag: defaultOb.name } : {}),
          }
        : preset === 'openai'
          ? {
              id: makeRuleId(draft.rules),
              enabled: true,
              geosite: ['geosite:openai'],
              action: defaultOb ? 'outbound' : 'direct',
              ...(defaultOb ? { outboundId: defaultOb.id, outboundTag: defaultOb.name } : {}),
            }
          : {
              id: makeRuleId(draft.rules),
              enabled: true,
              geosite: ['geosite:category-ir'],
              geoip: ['geoip:ir'],
              action: 'direct',
            };
    setRuleModal({ isNew: true, rule: baseRule });
  };

  const moveRule = (idx: number, delta: number) => {
    updateDraft((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.rules.length) return prev;
      const next = [...prev.rules];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, rules: next };
    });
  };

  const deleteRule = (ruleId: string, num: number) => {
    if (!confirm(isFa ? `قانون شماره ${num} حذف شود؟` : `Delete rule #${num}?`)) return;
    updateDraft((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== ruleId),
    }));
  };

  const deleteOutbound = async (ob: OutboundItem) => {
    if (!confirm(isFa ? `خروجی "${ob.name}" حذف شود؟` : `Delete outbound "${ob.name}"?`)) return;
    await apiFetch(`/routing/outbounds/${ob.id}`, { method: 'DELETE' });
    await loadBase();
    if (selectedNodeId !== null) await loadPolicy(selectedNodeId);
  };

  const filteredOutbounds = useMemo(() => {
    const q = obSearch.trim().toLowerCase();
    if (!q) return outbounds;
    return outbounds.filter((o) => {
      const sum = getOutboundSummary(o);
      return [o.name, o.type, sum.endpoint, sum.protocol].join(' ').toLowerCase().includes(q);
    });
  }, [outbounds, obSearch]);

  const currentNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const activeStatusKey = !draft
    ? 'off'
    : !draft.enabled
      ? 'off'
      : nodeInbounds.length === 0
        ? 'no-inbounds'
        : 'active';

  const geoUpdatedAt = catalog?.geo?.updatedAt || 0;
  const geoMissing = Boolean(catalog && !geoUpdatedAt);

  const openOutboundEditor = (ob: OutboundItem) => {
    const provider = getProviderType(ob);
    if (provider) {
      setProviderModal({ kind: provider, outbound: ob });
    } else {
      setObModal(ob);
    }
  };

  if (loadingInit) {
    return <EqLoader />;
  }

  return (
    <div className="page routing-page">
      <PageHead
        title={isFa ? 'مسیریابی خروجی‌ها' : 'Routing'}
        sub={
          isFa
            ? 'سایت‌ها، کشورها یا سرویس‌های دلخواه را بر اساس هر نود از مسیر مستقیم یا یک خروجی دیگر عبور دهید.'
            : 'Send chosen sites, countries, or apps through another server or outbound, node by node.'
        }
      />

      <Tabs
        value={tab}
        onChange={switchTab}
        items={[
          { id: 'rules', label: isFa ? 'قوانین' : 'Rules' },
          { id: 'outbounds', label: isFa ? 'خروجی‌ها' : 'Outbounds', count: outbounds.length },
        ]}
      />

      {nodes.length === 0 ? (
        <EmptySonar text={isFa ? 'ابتدا یک نود اضافه کنید.' : 'No nodes found yet.'} />
      ) : tab === 'rules' ? (
        <>
          <div className="rt-top">
            <div className="rt-picker">
              <span className="rt-field-label">{isFa ? 'نود' : 'Node'}</span>
              <div className="rt-node-row" role="group" aria-label={isFa ? 'انتخاب نود' : 'Select node'}>
                {nodes.map((n) => {
                  const pressed = n.id === selectedNodeId;
                  const st = nodeStates[n.id] || 'off';
                  const dotCls = st === 'active' ? 'ok' : st === 'off' ? 'off' : 'warn';
                  const stateLabel =
                    st === 'active'
                      ? isFa
                        ? 'فعال'
                        : 'Active'
                      : st === 'no-inbounds'
                        ? isFa
                          ? 'نیاز به توجه'
                          : 'No inbounds'
                        : isFa
                          ? 'خاموش'
                          : 'Off';
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className="rt-node-btn"
                      aria-pressed={pressed}
                      onClick={() => selectNode(n.id)}
                    >
                      <span className="rt-node-name">
                        {n.name}
                        {pressed && <Check className="rt-node-check" />}
                      </span>
                      <span className="rt-node-state">
                        <span className={`dot ${dotCls}`} aria-hidden="true" />
                        <span>{stateLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rt-status-slot">
              {loadingPolicy || !draft ? (
                <div className="rt-status-card">
                  <EqLoader />
                </div>
              ) : (
                <section className={`rt-status-card is-${activeStatusKey}`} role="status">
                  <span className="rt-status-icon" aria-hidden="true">
                    {activeStatusKey === 'active' ? (
                      <CheckCircle2 />
                    ) : activeStatusKey === 'no-inbounds' ? (
                      <RouterIcon />
                    ) : (
                      <PauseCircle />
                    )}
                  </span>
                  <div className="rt-status-body">
                    <span className="rt-status-title">
                      {activeStatusKey === 'active'
                        ? isFa
                          ? 'مسیریابی روی این نود فعال است'
                          : 'Routing is active'
                        : activeStatusKey === 'no-inbounds'
                          ? isFa
                            ? 'مسیریابی روشن است اما اینباندی وجود ندارد'
                            : 'No inbounds attached to this node yet'
                          : isFa
                            ? 'مسیریابی خاموش است'
                            : 'Routing is turned off'}
                    </span>
                    {activeStatusKey === 'active' ? (
                      <span className="rt-status-meta mono" dir="ltr">
                        {currentNode?.xprotocolVersion ? `Xray engine · v${currentNode.xprotocolVersion}` : 'Xray policy ready'}
                      </span>
                    ) : activeStatusKey === 'no-inbounds' ? (
                      <button type="button" className="rt-status-link" onClick={() => navigate('/nodes')}>
                        {isFa ? 'رفتن به صفحه نودها ←' : 'Go to Nodes →'}
                      </button>
                    ) : (
                      <p className="rt-status-detail">
                        {isFa
                          ? 'تمام ترافیک فعلاً طبق روال عادی مستقیم از سرور عبور می‌کند.'
                          : 'Traffic leaves directly through this server unless enabled below.'}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>

          <div className={geoMissing ? 'banner rt-geo-banner' : 'rt-geo-line'}>
            <div className="rt-geo-text">
              <span className="rt-geo-status">
                <Globe />
                <span>
                  {geoBusy
                    ? isFa
                      ? 'در حال دریافت فایل‌های Geosite و GeoIP...'
                      : 'Downloading geosite.dat and geoip.dat...'
                    : geoUpdatedAt > 0
                      ? isFa
                        ? `لیست‌های Geo به‌روز هستند (${new Date(geoUpdatedAt).toLocaleDateString()})`
                        : `Geo lists downloaded (${new Date(geoUpdatedAt).toLocaleDateString()})`
                      : isFa
                        ? 'فایل‌های Geo هنوز دانلود نشده‌اند'
                        : 'Geo lists have not been downloaded yet'}
                </span>
              </span>
              {geoMissing && !geoMsg && (
                <p className="rt-geo-note">
                  {isFa
                    ? 'برای استفاده از تگ‌های geosite: و geoip: در قوانین، ابتدا لیست‌ها را دریافت کنید.'
                    : 'Download geosite and geoip databases before enabling category or country-based rules.'}
                </p>
              )}
              {geoMsg && <p className="rt-geo-note">{geoMsg}</p>}
            </div>
            <Button size="sm" disabled={geoBusy} onClick={() => void handleGeoUpdate()}>
              <RefreshCw size={14} className={geoBusy ? 'animate-spin' : ''} />
              {isFa ? 'به‌روزرسانی لیست‌های Geo' : 'Update geo lists'}
            </Button>
          </div>

          {draft && (
            <section className="rt-policy" aria-labelledby="rt-policy-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="rt-section-title" id="rt-policy-title">
                  {isFa ? 'سیاست مسیریابی' : 'Routing policy'}
                </h2>
                {saveMsg && <span className="text-xs font-medium text-emerald-400">{saveMsg}</span>}
              </div>

              <div className="rt-policy-settings">
                <div className="rt-policy-enable">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => updateDraft((p) => ({ ...p, enabled: e.target.checked }))}
                    />
                    <span className="track" aria-hidden="true" />
                    <span className="sw-text">
                      <span>{isFa ? 'فعال‌سازی مسیریابی روی این نود' : 'Route traffic on this node'}</span>
                      <small>
                        {isFa
                          ? 'در صورت خاموش بودن، تمام ترافیک مانند قبل مستقیم خارج می‌شود.'
                          : 'When turned off, all traffic leaves directly through this server as before.'}
                      </small>
                    </span>
                  </label>
                </div>

                <div className="field rt-default">
                  <span className="label">{isFa ? 'پیش‌فرض برای ترافیک تطبیق‌نیافته' : 'Default for unmatched traffic'}</span>
                  <Segmented
                    value={draft.defaultAction}
                    onChange={(val) => {
                      const nextOb =
                        val === 'outbound'
                          ? draft.defaultOutboundId || outbounds[0]?.id || null
                          : null;
                      updateDraft((p) => ({
                        ...p,
                        defaultAction: val,
                        defaultOutboundId: nextOb,
                      }));
                    }}
                    options={[
                      { value: 'direct', label: isFa ? 'مستقیم (همین سرور)' : 'Direct (this server)' },
                      { value: 'outbound', label: isFa ? 'از طریق یک خروجی' : 'Through an outbound' },
                      ...(draft.defaultAction === 'block' ? [{ value: 'block' as const, label: isFa ? 'مسدود' : 'Block' }] : []),
                    ]}
                  />
                  {draft.defaultAction === 'outbound' && (
                    <>
                      <div className="field" style={{ marginTop: 4 }}>
                        <label className="label">{isFa ? 'خروجی پیش‌فرض' : 'Default outbound'}</label>
                        <select
                          className="select"
                          disabled={outbounds.length === 0}
                          value={draft.defaultOutboundId ?? ''}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              defaultOutboundId: e.target.value ? Number(e.target.value) : null,
                            }))
                          }
                        >
                          <option value="">{isFa ? 'یک خروجی انتخاب کنید...' : 'Choose an outbound...'}</option>
                          {outbounds.map((ob) => (
                            <option key={ob.id} value={ob.id}>
                              {ob.name} ({ob.type.toUpperCase()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="hint">
                        {isFa
                          ? 'قوانین زیر همچنان در اولویت هستند؛ ترافیک تطبیق‌نیافته از این خروجی رد می‌شود.'
                          : 'Rules below still run first. Anything that matches none uses this default.'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="field rt-routes">
                <span className="label" id="rt-routes-title">
                  {isFa ? 'مسیر هر اینباند' : 'Route per inbound'}
                </span>
                {nodeInbounds.length === 0 ? (
                  <p className="hint">
                    {isFa ? 'هنوز هیچ اینباندی به این نود متصل نیست.' : 'No inbounds attached to this node yet.'}
                  </p>
                ) : (
                  <>
                    <p className="hint">
                      {isFa
                        ? 'کنترل کنید هر اینباند از تنظیمات پیش‌فرض نود تبعیت کند یا مستقیماً خارج/مسدود شود.'
                        : 'Override routing behavior per inbound, or follow the node default above.'}
                    </p>
                    <ul className="rt-route-list" aria-labelledby="rt-routes-title">
                      {nodeInbounds.map((ib) => {
                        const existing = draft.inboundRoutes.find((ir) => ir.inbound === ib.id);
                        const encoded = getActionEncode(existing?.action);
                        const nodeDefaultLabel =
                          draft.defaultAction === 'outbound'
                            ? outbounds.find((o) => o.id === draft.defaultOutboundId)?.name ||
                              (isFa ? 'خروجی' : 'Outbound')
                            : draft.defaultAction === 'block'
                              ? isFa
                                ? 'مسدود'
                                : 'Block'
                              : isFa
                                ? 'مستقیم'
                                : 'Direct';
                        return (
                          <li key={ib.id} className={`rt-route${existing?.action.type === 'none' ? ' is-none' : ''}`}>
                            <label className="rt-route-text" htmlFor={`rt-route-${ib.id}`}>
                              <span className="rt-inbound-name">{ib.name}</span>
                              <span className="rt-inbound-meta">
                                <span>{formatProtocolLabel(ib.protocol)}</span>
                                <bdi className="mono" dir="ltr">
                                  :{ib.port} · {ib.subnet}
                                </bdi>
                                {!ib.enabled && (
                                  <span className="rt-inbound-off">{isFa ? 'خاموش' : 'Disabled'}</span>
                                )}
                              </span>
                            </label>
                            <select
                              id={`rt-route-${ib.id}`}
                              className="select rt-route-select"
                              value={encoded}
                              onChange={(e) => {
                                const parsed = parseActionEncode(e.target.value);
                                updateDraft((p) => {
                                  const next = p.inboundRoutes.filter((r) => r.inbound !== ib.id);
                                  if (parsed) next.push({ inbound: ib.id, action: parsed });
                                  return { ...p, inboundRoutes: next };
                                });
                              }}
                            >
                              <option value="default">
                                {isFa
                                  ? `پیروی از پیش‌فرض نود (${nodeDefaultLabel})`
                                  : `Follow node default (${nodeDefaultLabel})`}
                              </option>
                              <option value="none">{isFa ? 'مسیریابی نشود (عبور مستقیم)' : 'Do not route (bypass)'}</option>
                              <option value="direct">{isFa ? 'مستقیم (همین سرور)' : 'Direct (this server)'}</option>
                              <option value="block">{isFa ? 'مسدود کردن ترافیک' : 'Block traffic'}</option>
                              {outbounds.map((ob) => (
                                <option key={ob.id} value={`ob:${ob.id}`}>
                                  → {ob.name}
                                </option>
                              ))}
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>

              <p className="rt-note faint">
                <Info />
                <span>
                  {isFa
                    ? 'قوانین از بالا به پایین با اولین تطابق اجرا می‌شوند. درخواست‌های DNS و IPهای شبکه داخلی (LAN) همیشه مستقیم باقی می‌مانند.'
                    : 'Rules run top to bottom on the first match. DNS requests and private/LAN IPs always stay direct so local access is never locked out.'}
                </span>
              </p>

              {outbounds.length === 0 && (
                <EmptySonar
                  text={
                    isFa
                      ? 'هنوز هیچ خروجی تعریف نکرده‌اید. برای ارسال ترافیک از سرور دیگر یک خروجی بسازید.'
                      : 'No outbounds defined yet. Add one to send selected rules through another server, WARP, or Psiphon.'
                  }
                  action={
                    <Button
                      variant="primary"
                      onClick={() => {
                        switchTab('outbounds');
                        setObModal('new');
                      }}
                    >
                      <Plus size={14} />
                      {isFa ? 'افزودن خروجی' : 'Add outbound'}
                    </Button>
                  }
                />
              )}

              <div className="rt-rules-head">
                <h3>{isFa ? 'قوانین مسیریابی' : 'Rules'}</h3>
                <Button
                  variant={draft.rules.length === 0 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() =>
                    setRuleModal({
                      isNew: true,
                      rule: {
                        id: makeRuleId(draft.rules),
                        enabled: true,
                        action: outbounds[0] ? 'outbound' : 'direct',
                        ...(outbounds[0] ? { outboundId: outbounds[0].id, outboundTag: outbounds[0].name } : {}),
                      },
                    })
                  }
                >
                  <Plus size={14} />
                  {isFa ? 'افزودن قانون' : 'Add rule'}
                </Button>
              </div>

              {draft.rules.length === 0 ? (
                <EmptySonar
                  text={
                    isFa
                      ? 'هنوز قانونی تعریف نشده است. می‌توانید یک قانون بسازید یا از الگوهای سریع زیر استفاده کنید.'
                      : 'No routing rules yet. Add a rule or start with one of the quick presets below.'
                  }
                />
              ) : (
                <ol className="rt-rule-list">
                  {draft.rules.map((r, idx) => {
                    const enabled = r.enabled !== false;
                    const targetOb =
                      r.action === 'outbound'
                        ? outbounds.find((o) => o.id === r.outboundId || o.name === r.outboundTag)
                        : undefined;
                    const chips: Array<{ key: string; label: string; isTag?: boolean }> = [];
                    for (const ibName of r.inboundNames || []) {
                      chips.push({ key: `in:${ibName}`, label: `${isFa ? 'اینباند:' : 'inbound:'} ${ibName}` });
                    }
                    for (const g of r.geosite || []) {
                      const clean = g.startsWith('geosite:') ? g : `geosite:${g}`;
                      chips.push({ key: clean, label: clean, isTag: true });
                    }
                    for (const g of r.geoip || []) {
                      const clean = g.startsWith('geoip:') ? g : `geoip:${g}`;
                      chips.push({ key: clean, label: clean, isTag: true });
                    }
                    for (const d of r.domains || []) chips.push({ key: `dom:${d}`, label: d });
                    for (const ip of r.ips || []) chips.push({ key: `ip:${ip}`, label: ip });
                    if (r.ports) chips.push({ key: `port:${r.ports}`, label: `port:${r.ports}` });

                    const visibleChips = chips.slice(0, 6);
                    const moreCount = chips.length - visibleChips.length;

                    return (
                      <li key={r.id} className={`rt-rule${enabled ? '' : ' is-off'}`}>
                        <div className="rt-rule-main">
                          <div className="rt-rule-top">
                            <span className="rt-rule-n num">{idx + 1}</span>
                            <div className="rt-rule-switch">
                              <label className="switch">
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={(e) =>
                                    updateDraft((p) => ({
                                      ...p,
                                      rules: p.rules.map((x) =>
                                        x.id === r.id ? { ...x, enabled: e.target.checked } : x,
                                      ),
                                    }))
                                  }
                                />
                                <span className="track" aria-hidden="true" />
                                <span className="sw-text">
                                  <span>{enabled ? (isFa ? 'روشن' : 'On') : isFa ? 'خاموش' : 'Off'}</span>
                                </span>
                              </label>
                            </div>
                          </div>

                          <div className="rt-rule-summary">
                            <div className="rt-chip-row">
                              {visibleChips.map((ch) => (
                                <span key={ch.key} className={`rt-chip${ch.isTag ? ' is-tag' : ''}`}>
                                  <span className="mono" dir="ltr">
                                    {ch.label}
                                  </span>
                                </span>
                              ))}
                              {moreCount > 0 && (
                                <span className="rt-chip rt-chip-more">
                                  {isFa ? `+${moreCount} مورد دیگر` : `+${moreCount} more`}
                                </span>
                              )}
                            </div>
                            <div className="rt-rule-action">
                              <span className="rt-then-label">{isFa ? 'سپس' : 'then'}</span>
                              {r.action === 'block' ? (
                                <span className="rt-action-pill block">
                                  <ShieldBan size={14} />
                                  {isFa ? 'مسدود شود' : 'Block'}
                                </span>
                              ) : r.action === 'direct' ? (
                                <span className="rt-action-pill direct">
                                  <ArrowRight className="rt-arrow" size={14} />
                                  {isFa ? 'مستقیم' : 'Direct'}
                                </span>
                              ) : (
                                <span className="rt-action-pill outbound">
                                  <ArrowRight className="rt-arrow" size={14} />
                                  <span>{targetOb?.name || r.outboundTag || (isFa ? 'خروجی حذف‌شده' : 'Missing outbound')}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rt-rule-tools">
                          <button
                            type="button"
                            className="rt-tool-btn"
                            title={isFa ? 'انتقال به بالا' : 'Move up'}
                            disabled={idx === 0}
                            onClick={() => moveRule(idx, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="rt-tool-btn"
                            title={isFa ? 'انتقال به پایین' : 'Move down'}
                            disabled={idx === draft.rules.length - 1}
                            onClick={() => moveRule(idx, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            className="rt-tool-btn"
                            title={isFa ? 'ویرایش' : 'Edit'}
                            onClick={() => setRuleModal({ isNew: false, rule: r })}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            className="rt-tool-btn danger"
                            title={isFa ? 'حذف' : 'Delete'}
                            onClick={() => deleteRule(r.id, idx + 1)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {draft.rules.length === 0 && (
                <div className="rt-quick">
                  <span>{isFa ? 'شروع سریع با الگوها' : 'Quick start'}</span>
                  <div className="rt-quick-buttons">
                    <Button size="sm" onClick={() => addPresetRule('gemini')}>
                      <Plus size={14} />
                      {isFa ? 'Gemini از طریق خروجی' : 'Gemini via outbound'}
                    </Button>
                    <Button size="sm" onClick={() => addPresetRule('openai')}>
                      <Plus size={14} />
                      {isFa ? 'OpenAI از طریق خروجی' : 'OpenAI via outbound'}
                    </Button>
                    <Button size="sm" onClick={() => addPresetRule('iran')}>
                      <Plus size={14} />
                      {isFa ? 'ایران مستقیم' : 'Iran direct'}
                    </Button>
                  </div>
                </div>
              )}

              {saveErr && (
                <p className="rt-form-error" role="alert">
                  {saveErr}
                </p>
              )}

              {dirty && (
                <div className="rt-savebar">
                  <span className="rt-savebar-text" role="status">
                    {isFa ? 'تغییرات مسیریابی ذخیره نشده است' : 'Unsaved routing changes'}
                  </span>
                  <Button variant="ghost" disabled={saving} onClick={handleDiscard}>
                    {isFa ? 'لغو تغییرات' : 'Discard'}
                  </Button>
                  <Button variant="primary" disabled={saving} onClick={() => void handleSavePolicy()}>
                    {saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره' : 'Save'}
                  </Button>
                </div>
              )}
            </section>
          )}

          {renderedConfig && (
            <details className="rt-sec">
              <summary>
                <span>{isFa ? 'پیش‌نمایش پیکربندی Xray JSON تولیدشده' : 'Generated Xray Routing Config (JSON)'}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="rt-sec-body" style={{ display: 'grid', gap: 10 }}>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(renderedConfig);
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 1800);
                    }}
                  >
                    <Copy size={13} />
                    {copiedJson ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی JSON' : 'Copy JSON'}
                  </Button>
                </div>
                <pre
                  dir="ltr"
                  className="mono"
                  style={{
                    margin: 0,
                    maxHeight: 280,
                    overflow: 'auto',
                    padding: '12px 14px',
                    borderRadius: 'var(--r)',
                    background: 'var(--ground)',
                    border: '1px solid var(--line)',
                    fontSize: 'var(--t-xs)',
                    lineHeight: 1.55,
                  }}
                >
                  {renderedConfig}
                </pre>
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="rt-toolbar">
            <div className="rt-add-group">
              <Button variant="primary" onClick={() => setObModal('new')}>
                <Plus size={15} />
                {isFa ? 'افزودن خروجی' : 'Add outbound'}
              </Button>
              <Button onClick={() => setProviderModal({ kind: 'warp', outbound: null })}>
                <Flame size={15} />
                {isFa ? 'افزودن WARP' : 'Add WARP'}
              </Button>
              <Button onClick={() => setProviderModal({ kind: 'nordvpn', outbound: null })}>
                <Shield size={15} />
                {isFa ? 'افزودن NordVPN' : 'Add NordVPN'}
              </Button>
              <Button onClick={() => setProviderModal({ kind: 'psiphon', outbound: null })}>
                <Waypoints size={15} />
                {isFa ? 'افزودن Psiphon' : 'Add Psiphon'}
              </Button>
            </div>

            {outbounds.length > 0 && (
              <div className="rt-search-field field">
                <input
                  className="input"
                  type="search"
                  placeholder={isFa ? 'جستجوی خروجی...' : 'Search outbounds...'}
                  value={obSearch}
                  onChange={(e) => setObSearch(e.target.value)}
                />
              </div>
            )}
          </div>

          {outbounds.length === 0 ? (
            <div className="rt-policy">
              <EmptySonar
                text={
                  isFa
                    ? 'هنوز هیچ خروجی اضافه نشده است. برای عبور ترافیک از سرور دیگر، WARP یا Psiphon یک خروجی بسازید.'
                    : 'No outbounds added yet. Add a remote server, Cloudflare WARP, NordVPN, or Psiphon tunnel.'
                }
                action={
                  <Button variant="primary" onClick={() => setObModal('new')}>
                    <Plus size={14} />
                    {isFa ? 'افزودن خروجی' : 'Add outbound'}
                  </Button>
                }
              />
              <p className="rt-empty-formats text-center" style={{ marginTop: 0 }}>
                {isFa
                  ? 'پشتیبانی از VLESS، VMess، Trojan، Shadowsocks، Hysteria2، WireGuard، SOCKS5 و HTTP'
                  : 'Supports VLESS, VMess, Trojan, Shadowsocks, Hysteria2, WireGuard, SOCKS5, and HTTP'}
              </p>
            </div>
          ) : filteredOutbounds.length === 0 ? (
            <EmptySonar
              text={isFa ? 'خروجی مطابق با جستجو یافت نشد.' : 'No outbounds match your search.'}
              action={<Button onClick={() => setObSearch('')}>{isFa ? 'پاک کردن جستجو' : 'Clear search'}</Button>}
            />
          ) : (
            <section aria-labelledby="rt-outbounds-title">
              <h2 className="sr-only" id="rt-outbounds-title">
                {isFa ? 'خروجی‌ها' : 'Outbounds'}
              </h2>
              <ul className="rt-outbound-grid">
                {filteredOutbounds.map((ob) => {
                  const summary = getOutboundSummary(ob);
                  const provider = getProviderType(ob);
                  const usedNames = (ob.usedBy || [])
                    .map((nid) => nodes.find((n) => n.id === nid)?.name || `#${nid}`)
                    .join(', ');
                  return (
                    <li key={ob.id}>
                      <article className="rt-outbound-card">
                        <header className="rt-o-head">
                          <div className="rt-o-title">
                            <h3>{ob.name}</h3>
                            <span className="rt-o-badges">
                              <span className="kind-badge" dir="ltr">
                                {summary.protocol}
                              </span>
                              {provider && (
                                <span className="kind-badge oc" dir="ltr">
                                  {provider === 'warp' ? 'WARP' : provider === 'nordvpn' ? 'NordVPN' : 'Psiphon'}
                                </span>
                              )}
                            </span>
                          </div>

                          <Button size="sm" variant="ghost" onClick={() => setTestTarget(ob)}>
                            <Activity size={14} />
                            {isFa ? 'تست' : 'Test'}
                          </Button>

                          <ActionMenu
                            label={ob.name}
                            trigger={<MoreHorizontal size={16} />}
                            items={[
                              { label: isFa ? 'ویرایش' : 'Edit', onSelect: () => openOutboundEditor(ob) },
                              { label: isFa ? 'تست اتصال' : 'Test', onSelect: () => setTestTarget(ob) },
                              {
                                label: isFa ? 'حذف' : 'Delete',
                                onSelect: () => void deleteOutbound(ob),
                                danger: true,
                              },
                            ]}
                          />
                        </header>

                        <div className="rt-o-facts">
                          {summary.endpoint && (
                            <span className="rt-o-endpoint mono" dir="ltr">
                              {summary.endpoint}
                            </span>
                          )}
                          {provider !== 'psiphon' && (summary.transport || summary.security) && (
                            <span className="rt-o-meta mono" dir="ltr">
                              {[summary.transport, summary.security].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {ob.lastTest && (
                            <span
                              className="rt-o-meta"
                              style={{
                                marginTop: 4,
                                color: ob.lastTest.reachable ? 'var(--good)' : 'var(--bad)',
                                fontWeight: 600,
                              }}
                            >
                              {ob.lastTest.reachable
                                ? `${ob.lastTest.latencyMs} ms · ${isFa ? 'در دسترس' : 'Reachable'}`
                                : ob.lastTest.error || (isFa ? 'خطای اتصال' : 'Unreachable')}
                            </span>
                          )}
                        </div>

                        <footer className="rt-o-foot">
                          {ob.usedBy && ob.usedBy.length > 0
                            ? isFa
                              ? `استفاده‌شده در: ${usedNames}`
                              : `Used by ${usedNames}`
                            : isFa
                              ? 'هنوز در هیچ نودی استفاده نشده است'
                              : 'Not used by any node yet'}
                        </footer>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {ruleModal && draft && (
        <RuleModal
          isNew={ruleModal.isNew}
          rule={ruleModal.rule}
          outbounds={outbounds}
          inbounds={nodeInbounds}
          catalog={catalog}
          onClose={() => setRuleModal(null)}
          onSave={(savedRule) => {
            updateDraft((prev) => ({
              ...prev,
              rules: ruleModal.isNew
                ? [...prev.rules, savedRule]
                : prev.rules.map((r) => (r.id === savedRule.id ? savedRule : r)),
            }));
            setRuleModal(null);
          }}
          isFa={isFa}
        />
      )}

      {obModal !== null && (
        <OutboundModal
          outbound={obModal === 'new' ? null : obModal}
          nodes={nodes}
          onClose={() => setObModal(null)}
          onSaved={() => {
            setObModal(null);
            void loadBase();
            if (selectedNodeId !== null) void loadPolicy(selectedNodeId);
          }}
          isFa={isFa}
        />
      )}

      {providerModal && (
        providerModal.kind === 'warp' ? (
          <WarpModal
            outbound={providerModal.outbound}
            nodes={nodes}
            onClose={() => setProviderModal(null)}
            onChanged={() => {
              void loadBase();
              if (selectedNodeId !== null) void loadPolicy(selectedNodeId);
            }}
            onAdvanced={(ob) => {
              setProviderModal(null);
              setObModal(ob);
            }}
            isFa={isFa}
          />
        ) : providerModal.kind === 'nordvpn' ? (
          <NordVpnModal
            outbound={providerModal.outbound}
            onClose={() => setProviderModal(null)}
            onChanged={() => {
              void loadBase();
              if (selectedNodeId !== null) void loadPolicy(selectedNodeId);
            }}
            onAdvanced={(ob) => {
              setProviderModal(null);
              setObModal(ob);
            }}
            isFa={isFa}
          />
        ) : (
          <PsiphonModal
            outbound={providerModal.outbound}
            regions={catalog?.psiphonRegions || ['AUTO', 'DE', 'NL', 'US', 'GB', 'FR', 'SE', 'CH', 'JP', 'SG']}
            onClose={() => setProviderModal(null)}
            onChanged={() => {
              void loadBase();
              if (selectedNodeId !== null) void loadPolicy(selectedNodeId);
            }}
            isFa={isFa}
          />
        )
      )}

      {testTarget && (
        <TestModal
          source={{ kind: 'saved', id: testTarget.id }}
          name={testTarget.name}
          nodes={nodes}
          onClose={() => {
            setTestTarget(null);
            void loadBase();
          }}
          isFa={isFa}
        />
      )}
    </div>
  );
}
