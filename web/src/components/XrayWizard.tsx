import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, EqLoader, Input, PageHead, Select, StatusPill } from './UiPrimitives';
import { XrayAdvancedSection, XraySniPickerModal, type XrayCombosResponse } from './XrayInboundEditor';

interface XrayPresetItem {
  id: string;
  titleEn: string;
  titleFa: string;
  summaryEn: string;
  summaryFa: string;
  needs: string[];
  recommended?: boolean;
}

interface NodeOption {
  id: number;
  name: string;
  address: string;
  isLocal?: boolean;
}

export function XrayWizard({ onBackOtherProtocols }: { onBackOtherProtocols: () => void }) {
  const { lang } = useUi();
  const fa = lang === 'fa';

  const [presets, setPresets] = useState<XrayPresetItem[]>([]);
  const [combos, setCombos] = useState<XrayCombosResponse | null>(null);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('direct');
  const [nodeId, setNodeId] = useState(0);
  const [name, setName] = useState('');
  const [port, setPort] = useState('443');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [sniInfo, setSniInfo] = useState<{ grade?: string; millis?: number; tested?: boolean }>({});
  const [needs, setNeeds] = useState<string[]>([]);
  const [cdnHost, setCdnHost] = useState('');
  const [certFile, setCertFile] = useState('');
  const [keyFile, setKeyFile] = useState('');
  const [relayIps, setRelayIps] = useState('');
  const [sniModalOpen, setSniModalOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: XrayPresetItem[] }>('/xray/presets'),
      apiFetch<XrayCombosResponse>('/xray/combos'),
      apiFetch<{ nodes: NodeOption[] }>('/nodes').catch(() => ({ nodes: [] })),
    ])
      .then(([pRes, cRes, nRes]) => {
        setPresets(pRes.items || []);
        setCombos(cRes);
        setNodes(nRes.nodes || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiFetch<{
      port: number;
      settings: Record<string, unknown>;
      needs: string[];
      sniGrade?: string;
      sniMillis?: number;
      sniTested?: boolean;
    }>(`/inbounds/defaults?kind=xray&preset=${selectedPreset}&node=${nodeId}`)
      .then((res) => {
        setPort(String(res.port || 443));
        setSettings(res.settings || {});
        setNeeds(res.needs || []);
        setSniInfo({ grade: res.sniGrade, millis: res.sniMillis, tested: res.sniTested });
        if (selectedPreset === 'manual') setAdvancedOpen(true);
      })
      .catch(() => undefined);
  }, [selectedPreset, nodeId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const merged: Record<string, unknown> = { ...settings };
      if (needs.includes('cdnHost') && cdnHost.trim()) {
        merged.cdnHost = cdnHost.trim();
        merged.tlsHost = cdnHost.trim();
        merged.host = cdnHost.trim();
      }
      if (needs.includes('certFile') && certFile.trim()) {
        merged.tls = { ...(merged.tls as Record<string, unknown>), certFile: certFile.trim(), keyFile: keyFile.trim() };
      }
      if (needs.includes('relayIPs') && relayIps.trim()) {
        merged.allowFrom = relayIps.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      }

      const res = await apiFetch<{ id: number }>('/inbounds', {
        method: 'POST',
        body: JSON.stringify({
          protocol: 'xray',
          preset: selectedPreset,
          nodeId,
          displayName: name.trim() || undefined,
          port: Number(port),
          enabled: true,
          settings: merged,
        }),
      });
      navigate(`/inbounds/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Xray inbound');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <EqLoader />
      </div>
    );
  }

  const reality = (settings.reality && typeof settings.reality === 'object' ? settings.reality : {}) as Record<string, unknown>;
  const currentSni = Array.isArray(reality.serverNames) ? String(reality.serverNames[0] || '') : '';

  return (
    <div className="space-y-6">
      <PageHead
        title={fa ? 'ایجاد اینباند Xray جدید' : 'New Xray inbound'}
        sub={
          fa
            ? 'سناریوی اتصال را انتخاب کنید؛ پنل تنظیمات امن و دامنه استتار مناسب را آماده می‌کند.'
            : 'Pick a ready scenario and press Create, or fine-tune every transport and security option.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onBackOtherProtocols}>
              {fa ? 'سایر پروتکل‌ها' : 'Other protocols'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/inbounds')}>
              <ArrowLeft size={15} />
              {fa ? 'بازگشت' : 'Back'}
            </Button>
          </div>
        }
      />

      <form onSubmit={handleCreate} className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {fa ? 'به چه چیزی نیاز دارید؟' : 'What do you need?'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {presets.map((p) => {
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPreset(p.id)}
                  className="text-start rounded-2xl border p-4 transition-all"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--line)',
                    background: active ? 'var(--accent-wash)' : 'var(--raise)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm" style={{ color: 'var(--ink)' }}>
                      {fa ? p.titleFa : p.titleEn}
                    </strong>
                    {p.recommended && <StatusPill tone="good">{fa ? 'پیشنهادی' : 'Recommended'}</StatusPill>}
                    {!p.recommended && active && <Check size={16} style={{ color: 'var(--accent)' }} />}
                  </div>
                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {fa ? p.summaryFa : p.summaryEn}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-2xl border p-5 space-y-4"
          style={{ borderColor: 'var(--line)', background: 'var(--raise)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {fa ? 'بررسی و ساخت' : 'Check and create'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={fa ? 'نام نمایشی (اختیاری)' : 'Name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`xray-${selectedPreset}`}
            />
            <Input
              label={fa ? 'پورت' : 'Port'}
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            <Select
              label={fa ? 'نود اجرا' : 'Node'}
              value={String(nodeId)}
              onChange={(e) => setNodeId(Number(e.target.value))}
            >
              <option value="0">{fa ? 'همین سرور (اصلی)' : 'This server'}</option>
              {nodes.filter((n) => !n.isLocal).map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.address})</option>
              ))}
            </Select>
          </div>

          {settings.security === 'reality' && (
            <div
              className="rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
              style={{ borderColor: 'var(--line)', background: 'var(--raise-2)' }}
            >
              <div>
                <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {fa ? 'دامنه استتار (Camouflage site)' : 'Camouflage site'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {currentSni || 'www.amd.com'}
                  </span>
                  {sniInfo.grade && (
                    <StatusPill tone={sniInfo.grade === 'green' ? 'good' : sniInfo.grade === 'yellow' ? 'warn' : 'bad'}>
                      {sniInfo.grade}{sniInfo.millis ? ` · ${sniInfo.millis} ms` : ''}
                    </StatusPill>
                  )}
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSniModalOpen(true)}>
                <Sparkles size={14} />
                {fa ? 'تغییر' : 'Change'}
              </Button>
            </div>
          )}

          {selectedPreset === 'cdn' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  label={fa ? 'دامنه روی CDN (Cloudflare)' : 'Your domain on the CDN'}
                  value={cdnHost}
                  onChange={(e) => setCdnHost(e.target.value)}
                  placeholder="cdn.example.com"
                  required
                />
                <Input
                  label={fa ? 'مسیر فایل گواهی (certFile)' : 'Certificate file (certFile)'}
                  value={certFile}
                  onChange={(e) => setCertFile(e.target.value)}
                  placeholder="/etc/letsencrypt/live/.../fullchain.pem"
                />
                <Input
                  label={fa ? 'مسیر فایل کلید (keyFile)' : 'Private key file (keyFile)'}
                  value={keyFile}
                  onChange={(e) => setKeyFile(e.target.value)}
                  placeholder="/etc/letsencrypt/live/.../privkey.pem"
                />
              </div>
              <details className="rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--raise-2)', color: 'var(--ink-2)' }}>
                <summary className="font-semibold cursor-pointer" style={{ color: 'var(--ink)' }}>
                  {fa ? 'راهنمای تنظیم در Cloudflare' : 'How to set this up in Cloudflare'}
                </summary>
                <ul className="list-disc ps-5 mt-2 space-y-1">
                  <li>{fa ? 'از یکی از پورت‌های پشتیبانی‌شده Cloudflare استفاده کنید: 443، 8443، 2053، 2083، 2087، 2096.' : 'Use one of Cloudflare HTTPS ports: 443, 8443, 2053, 2083, 2087, 2096.'}</li>
                  <li>{fa ? 'حالت SSL/TLS را روی Full یا Full (Strict) بگذارید و WebSockets را روشن کنید.' : 'Set SSL/TLS mode to Full (or Full Strict) and enable WebSockets.'}</li>
                  <li>{fa ? 'رکورد DNS دامنه را روی حالت Proxied (ابر نارنجی) قرار دهید.' : 'Keep the DNS record Proxied (orange cloud).'}</li>
                </ul>
              </details>
            </div>
          )}

          {selectedPreset === 'relay' && (
            <Input
              label={fa ? 'آی‌پی سرورهای رله / تانل (با کاما جدا کنید)' : 'Relay server IPs (comma-separated)'}
              value={relayIps}
              onChange={(e) => setRelayIps(e.target.value)}
              placeholder="203.0.113.10, 198.51.100.4"
              required
            />
          )}

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: 'var(--accent-text)' }}
            >
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              <span>{fa ? 'تنظیمات پیشرفته' : 'Advanced'}</span>
            </button>
            {advancedOpen && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
                <XrayAdvancedSection
                  settings={settings}
                  onChange={setSettings}
                  combos={combos}
                  nodeId={nodeId}
                />
              </div>
            )}
          </div>

          {error && <div className="text-xs" style={{ color: 'var(--bad)' }}>{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (fa ? 'در حال ساخت...' : 'Creating...') : fa ? 'ایجاد اینباند Xray' : 'Create'}
            </Button>
          </div>
        </div>
      </form>

      <XraySniPickerModal
        open={sniModalOpen}
        onClose={() => setSniModalOpen(false)}
        nodeId={nodeId}
        currentSni={currentSni}
        onSelect={(domain, grade, millis) => {
          setSettings((prev) => ({
            ...prev,
            reality: { ...(prev.reality as Record<string, unknown>), serverNames: [domain], target: `${domain}:443` },
          }));
          if (grade) setSniInfo({ grade, millis, tested: true });
        }}
      />
    </div>
  );
}
