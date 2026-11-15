import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Play,
  RefreshCw,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate, toPanelUrl } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EqLoader, Input, PageHead, Select, StatusPill, Tabs } from '../components/UiPrimitives';

interface InboundDetailItem {
  id: number;
  nodeId: number | null;
  nodeName: string | null;
  protocol: string;
  name: string;
  transport: string;
  port: number;
  subnet: string;
  authMode: string;
  description: string;
  publicAddressOverride: string;
  enabled: boolean;
  running: boolean;
  certId: number | null;
  certDomain: string | null;
  serverPublicKey: string;
  settings: Record<string, unknown>;
  onlineCount: number;
}

export function InboundDetailPage({ inboundId }: { inboundId: number }) {
  const { t, lang } = useUi();
  const [inbound, setInbound] = useState<InboundDetailItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'settings' | 'config' | 'logs'>('settings');
  const [configData, setConfigData] = useState<{ path: string; content: string; logs: string[] } | null>(null);
  const [copiedCfg, setCopiedCfg] = useState(false);

  // Form states
  const [transport, setTransport] = useState('udp');
  const [port, setPort] = useState('51820');
  const [subnet, setSubnet] = useState('10.66.0.0/24');
  const [authMode, setAuthMode] = useState('publickey');
  const [description, setDescription] = useState('');
  const [publicAddressOverride, setPublicAddressOverride] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [dns, setDns] = useState('1.1.1.1, 8.8.8.8');
  const [mtu, setMtu] = useState('1420');
  const [keepalive, setKeepalive] = useState('25');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  const loadConfig = useCallback(async () => {
    const cfg = await apiFetch<{ path: string; content: string; logs: string[] }>(`/inbounds/${inboundId}/config`).catch(
      () => null,
    );
    if (cfg) setConfigData(cfg);
  }, [inboundId]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ inbounds: InboundDetailItem[] }>('/inbounds');
      const found = res.inbounds.find((i) => i.id === inboundId);
      if (!found) {
        setNotFound(true);
        setInbound(null);
        return;
      }
      setNotFound(false);
      setInbound(found);
      setTransport(found.transport);
      setPort(String(found.port));
      setSubnet(found.subnet);
      setAuthMode(found.authMode);
      setDescription(found.description || '');
      setPublicAddressOverride(found.publicAddressOverride || '');
      setEnabled(found.enabled);
      setDns(String(found.settings?.dns ?? '1.1.1.1, 8.8.8.8'));
      setMtu(String(found.settings?.mtu ?? 1420));
      setKeepalive(String(found.settings?.keepalive ?? 25));
      await loadConfig();
    } catch {
      setNotFound(true);
    }
  }, [inboundId, loadConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: 'start' | 'stop' | 'restart') => {
    await apiFetch(`/inbounds/${inboundId}/${action}`, { method: 'POST' });
    await load();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inbound) return;
    setSaving(true);
    setError('');
    setSaveMessage('');
    try {
      await apiFetch(`/inbounds/${inbound.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          transport,
          port: Number(port),
          subnet,
          authMode,
          description,
          publicAddressOverride,
          enabled,
          settings: {
            ...inbound.settings,
            dns,
            mtu: Number(mtu || 1420),
            keepalive: Number(keepalive || 25),
          },
        }),
      });
      setSaveMessage(lang === 'fa' ? 'تنظیمات با موفقیت ذخیره شد.' : 'Inbound settings saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return;
    await apiFetch(`/inbounds/${inboundId}`, { method: 'DELETE' });
    navigate('/inbounds');
  };

  if (notFound) {
    return (
      <div className="page">
        <a
          href={toPanelUrl('/inbounds')}
          onClick={(e) => {
            e.preventDefault();
            navigate('/inbounds');
          }}
          className="backlink"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {lang === 'fa' ? 'همه اینباندها' : 'All inbounds'}
        </a>
        <div className="panel p-8 text-center text-sm text-(--text-secondary)">
          {lang === 'fa' ? 'اینباند مورد نظر یافت نشد.' : 'Inbound not found.'}
        </div>
      </div>
    );
  }

  if (!inbound) {
    return <EqLoader label={t.common.loading} />;
  }

  return (
    <div className="page">
      <a
        href={toPanelUrl('/inbounds')}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          navigate('/inbounds');
        }}
        className="backlink"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {lang === 'fa' ? 'همه اینباندها' : 'All inbounds'}
      </a>

      <PageHead
        title={
          <span className="title-with-tag">
            <span dir="ltr">{inbound.name}</span>
            <StatusPill
              tone={inbound.running ? 'green' : inbound.nodeId ? 'amber' : 'gray'}
              label={
                inbound.running ? t.inbounds.running : inbound.nodeId ? t.inbounds.stopped : t.inbounds.notOnNode
              }
            />
          </span>
        }
        sub={
          <span>
            {inbound.protocol.toUpperCase()} · {inbound.transport.toUpperCase()}/{inbound.port} · {inbound.subnet} ·{' '}
            {inbound.nodeName || t.inbounds.notOnNode} · {inbound.onlineCount} online
          </span>
        }
        actions={
          <>
            {inbound.running ? (
              <>
                <Button size="sm" onClick={() => void runAction('restart')}>
                  <RotateCw className="h-3.5 w-3.5" />
                  {t.inbounds.restart}
                </Button>
                <Button size="sm" onClick={() => void runAction('stop')}>
                  <Square className="h-3.5 w-3.5" />
                  {t.inbounds.stop}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => void runAction('start')} disabled={!inbound.nodeId}>
                <Play className="h-3.5 w-3.5" />
                {t.inbounds.start}
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => void handleDelete()}>
              <Trash2 className="h-3.5 w-3.5" />
              {t.common.delete}
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'settings', label: lang === 'fa' ? 'تنظیمات' : 'Settings' },
          { id: 'config', label: t.inbounds.configFile },
          { id: 'logs', label: lang === 'fa' ? 'لاگ سرویس' : 'Logs' },
        ]}
      />

      {tab === 'settings' && (
        <section className="panel">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label={lang === 'fa' ? 'پروتکل انتقال' : 'Transport'} value={transport} onChange={(e) => setTransport(e.target.value)}>
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
              </Select>
              <Input label={lang === 'fa' ? 'پورت' : 'Port'} type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
              <Input label={lang === 'fa' ? 'ساب‌نت' : 'Subnet'} value={subnet} onChange={(e) => setSubnet(e.target.value)} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={lang === 'fa' ? 'روش احراز هویت' : 'Auth mode'} value={authMode} onChange={(e) => setAuthMode(e.target.value)} />
              <Input
                label={lang === 'fa' ? 'آدرس عمومی جایگزین (اختیاری)' : 'Public endpoint override'}
                value={publicAddressOverride}
                onChange={(e) => setPublicAddressOverride(e.target.value)}
                placeholder="vpn.example.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="DNS" value={dns} onChange={(e) => setDns(e.target.value)} />
              <Input label="MTU" type="number" value={mtu} onChange={(e) => setMtu(e.target.value)} />
              <Input label="Keepalive (s)" type="number" value={keepalive} onChange={(e) => setKeepalive(e.target.value)} />
            </div>

            <Input label={lang === 'fa' ? 'توضیحات' : 'Description'} value={description} onChange={(e) => setDescription(e.target.value)} />

            {inbound.serverPublicKey ? (
              <div>
                <div className="mb-1 text-xs font-medium text-(--text-secondary)">
                  {lang === 'fa' ? 'کلید عمومی سرور' : 'Server public key'}
                </div>
                <code className="block rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs font-mono text-(--text-primary)" dir="ltr">
                  {inbound.serverPublicKey}
                </code>
              </div>
            ) : null}

            <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2.5 text-xs cursor-pointer">
              <span>{lang === 'fa' ? 'اینباند فعال باشد' : 'Enabled'}</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded accent-(--accent)"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
            {saveMessage && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                {saveMessage}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? t.common.loading : t.common.save}
              </Button>
            </div>
          </form>
        </section>
      )}

      {tab === 'config' && (
        <section className="panel space-y-3">
          <header className="panel-head">
            <div>
              <h2>{t.inbounds.configFile}</h2>
              {configData?.path ? (
                <p className="font-mono text-xs text-(--text-muted)" dir="ltr">
                  {configData.path}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              onClick={async () => {
                if (!configData?.content) return;
                await navigator.clipboard.writeText(configData.content);
                setCopiedCfg(true);
                setTimeout(() => setCopiedCfg(false), 1500);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedCfg ? t.common.copied : t.common.copy}
            </Button>
          </header>
          <pre
            dir="ltr"
            className="max-h-[480px] overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-4 font-mono text-xs text-(--text-primary)"
          >
            {configData?.content || 'Loading config...'}
          </pre>
        </section>
      )}

      {tab === 'logs' && (
        <section className="panel space-y-3">
          <header className="panel-head">
            <h2>{lang === 'fa' ? 'گزارش لحظه‌ای سرویس' : 'Service logs'}</h2>
            <Button size="sm" onClick={() => void loadConfig()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {lang === 'fa' ? 'به‌روزرسانی' : 'Refresh'}
            </Button>
          </header>
          <pre
            dir="ltr"
            className="max-h-[420px] overflow-auto rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-4 font-mono text-xs text-(--text-secondary)"
          >
            {(configData?.logs || []).join('\n') || 'No log lines available.'}
          </pre>
        </section>
      )}
    </div>
  );
}
