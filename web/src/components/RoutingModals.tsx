import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Flame,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Waypoints,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Modal } from './Modal';
import { Button, Segmented } from './UiPrimitives';
import {
  formatProtocolLabel,
  getOutboundSummary,
  makeRuleId,
  type NodeInboundItem,
  type NodeListItem,
  type OutboundItem,
  type OutboundSummary,
  type OutboundTestResult,
  type RoutingCatalog,
  type RoutingRule,
} from '../lib/routingTypes';

const TAG_RE = /^[a-z0-9][a-z0-9._!@-]*$/i;

const NORD_COUNTRIES: Array<{ id: number; code: string; name: string; servers: Array<{ hostname: string; station: string; city: string; load: number }> }> = [
  { id: 153, code: 'NL', name: 'Netherlands', servers: [{ hostname: 'nl912.nordvpn.com', station: 'nl912.nordvpn.com', city: 'Amsterdam', load: 14 }, { hostname: 'nl841.nordvpn.com', station: 'nl841.nordvpn.com', city: 'Amsterdam', load: 21 }] },
  { id: 81, code: 'DE', name: 'Germany', servers: [{ hostname: 'de1042.nordvpn.com', station: 'de1042.nordvpn.com', city: 'Frankfurt', load: 16 }, { hostname: 'de985.nordvpn.com', station: 'de985.nordvpn.com', city: 'Berlin', load: 24 }] },
  { id: 228, code: 'US', name: 'United States', servers: [{ hostname: 'us9412.nordvpn.com', station: 'us9412.nordvpn.com', city: 'New York', load: 19 }, { hostname: 'us8821.nordvpn.com', station: 'us8821.nordvpn.com', city: 'Los Angeles', load: 28 }] },
  { id: 227, code: 'GB', name: 'United Kingdom', servers: [{ hostname: 'uk2184.nordvpn.com', station: 'uk2184.nordvpn.com', city: 'London', load: 17 }] },
  { id: 74, code: 'FR', name: 'France', servers: [{ hostname: 'fr712.nordvpn.com', station: 'fr712.nordvpn.com', city: 'Paris', load: 22 }] },
  { id: 208, code: 'SE', name: 'Sweden', servers: [{ hostname: 'se518.nordvpn.com', station: 'se518.nordvpn.com', city: 'Stockholm', load: 12 }] },
  { id: 209, code: 'CH', name: 'Switzerland', servers: [{ hostname: 'ch410.nordvpn.com', station: 'ch410.nordvpn.com', city: 'Zurich', load: 15 }] },
  { id: 219, code: 'TR', name: 'Turkey', servers: [{ hostname: 'tr145.nordvpn.com', station: 'tr145.nordvpn.com', city: 'Istanbul', load: 31 }] },
];

const REGION_NAMES: Record<string, { en: string; fa: string }> = {
  AUTO: { en: 'Automatic (fastest region)', fa: 'خودکار (سریع‌ترین منطقه)' },
  AT: { en: 'Austria', fa: 'اتریش' },
  AU: { en: 'Australia', fa: 'استرالیا' },
  BE: { en: 'Belgium', fa: 'بلژیک' },
  BG: { en: 'Bulgaria', fa: 'بلغارستان' },
  CA: { en: 'Canada', fa: 'کانادا' },
  CH: { en: 'Switzerland', fa: 'سوئیس' },
  CZ: { en: 'Czechia', fa: 'چک' },
  DE: { en: 'Germany', fa: 'آلمان' },
  DK: { en: 'Denmark', fa: 'دانمارک' },
  EE: { en: 'Estonia', fa: 'استونی' },
  ES: { en: 'Spain', fa: 'اسپانیا' },
  FI: { en: 'Finland', fa: 'فنلاند' },
  FR: { en: 'France', fa: 'فرانسه' },
  GB: { en: 'United Kingdom', fa: 'بریتانیا' },
  HR: { en: 'Croatia', fa: 'کرواسی' },
  HU: { en: 'Hungary', fa: 'مجارستان' },
  IE: { en: 'Ireland', fa: 'ایرلند' },
  IN: { en: 'India', fa: 'هند' },
  IT: { en: 'Italy', fa: 'ایتالیا' },
  JP: { en: 'Japan', fa: 'ژاپن' },
  LV: { en: 'Latvia', fa: 'لتونی' },
  NL: { en: 'Netherlands', fa: 'هلند' },
  NO: { en: 'Norway', fa: 'نروژ' },
  PL: { en: 'Poland', fa: 'لهستان' },
  PT: { en: 'Portugal', fa: 'پرتغال' },
  RO: { en: 'Romania', fa: 'رومانی' },
  RS: { en: 'Serbia', fa: 'صربستان' },
  SE: { en: 'Sweden', fa: 'سوئد' },
  SG: { en: 'Singapore', fa: 'سنگاپور' },
  SK: { en: 'Slovakia', fa: 'اسلواکی' },
  US: { en: 'United States', fa: 'ایالات متحده' },
};

const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'wireguard', 'socks', 'http'] as const;
const PROTO_LABELS: Record<string, string> = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
  hysteria2: 'Hysteria2',
  wireguard: 'WireGuard',
  socks: 'SOCKS5',
  http: 'HTTP',
};

function defaultPortForProto(proto: string): number {
  switch (proto) {
    case 'wireguard':
      return 51820;
    case 'shadowsocks':
      return 8388;
    case 'socks':
      return 1080;
    case 'http':
      return 8080;
    default:
      return 443;
  }
}

function splitLines(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function validatePorts(val: string): boolean {
  const parts = val.split(',');
  if (!parts.length) return false;
  return parts.every((p) => {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(p.trim());
    if (!m) return false;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return a >= 1 && a <= 65535 && b >= 1 && b <= 65535 && a <= b;
  });
}

function SecretField({
  label,
  hint,
  value,
  stored,
  optional,
  placeholder,
  disabled,
  onChange,
  isFa,
}: {
  label: string;
  hint?: string;
  value: string;
  stored?: boolean;
  optional?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  isFa: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="rt-secret-row">
        <div className="pw-wrap" style={{ flex: 1 }}>
          <input
            className="input mono"
            type={show ? 'text' : 'password'}
            dir={value ? 'ltr' : undefined}
            autoComplete="new-password"
            spellCheck={false}
            disabled={disabled}
            placeholder={
              stored
                ? isFa
                  ? 'ذخیره شده — برای حفظ خالی بگذارید'
                  : 'Stored — leave blank to keep'
                : placeholder
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="btn ghost icon sm pw-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? (isFa ? 'پنهان کردن' : 'Hide') : isFa ? 'نمایش' : 'Show'}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: 0,
              background: 'transparent',
              color: 'var(--ink-2)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {optional && stored && value && (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            {isFa ? 'پاک کردن' : 'Clear'}
          </Button>
        )}
      </div>
      {(hint || stored) && (
        <span className="hint">
          {hint ||
            (isFa
              ? 'مقدار فعلی امن ذخیره شده است؛ در صورت خالی گذاشتن تغییر نمی‌کند.'
              : 'Current secret stays safely stored unless you enter a new value.')}
        </span>
      )}
    </div>
  );
}

function SummaryBox({ summary, preview, isFa }: { summary: OutboundSummary; preview?: boolean; isFa: boolean }) {
  return (
    <div className={`rt-summary${preview ? ' rt-preview' : ''}`}>
      <div className="rt-summary-head">
        <span className="kind-badge" dir="ltr">
          {summary.protocol}
        </span>
        {summary.endpoint && (
          <span className="rt-summary-endpoint mono" dir="ltr">
            {summary.endpoint}
          </span>
        )}
      </div>
      <dl className="rt-summary-facts">
        <div>
          <dt>{isFa ? 'انتقال' : 'Transport'}</dt>
          <dd className="mono" dir="ltr">
            {summary.transport || (isFa ? 'ندارد' : 'None')}
          </dd>
        </div>
        <div>
          <dt>{isFa ? 'امنیت' : 'Security'}</dt>
          <dd className="mono" dir="ltr">
            {summary.security || (isFa ? 'ندارد' : 'None')}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TagPicker({
  label,
  tags,
  favorites,
  selected,
  onChange,
  isFa,
}: {
  label: string;
  tags: string[];
  favorites: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  isFa: boolean;
}) {
  const [search, setSearch] = useState('');
  const selectedLower = new Set(selected.map((s) => s.toLowerCase()));
  const favLower = new Set(favorites.map((s) => s.toLowerCase()));
  const q = search.trim().toLowerCase();

  const filteredFavs = favorites.filter((t) => !q || t.toLowerCase().includes(q));
  const filteredRest = tags
    .filter((t) => {
      const low = t.toLowerCase();
      if (!q && favLower.has(low)) return false;
      return !q || low.includes(q);
    })
    .slice(0, 60);

  const addTag = (raw: string) => {
    const clean = raw.trim().toLowerCase();
    if (!clean || selectedLower.has(clean)) {
      setSearch('');
      return;
    }
    onChange([...selected, clean]);
    setSearch('');
  };

  const toggleTag = (tag: string) => {
    const low = tag.toLowerCase();
    if (selectedLower.has(low)) {
      onChange(selected.filter((x) => x.toLowerCase() !== low));
    } else {
      addTag(tag);
    }
  };

  return (
    <div className="rt-tagpicker">
      <h4 className="rt-picker-title">{label}</h4>
      <div className="field">
        <label className="label">{isFa ? `جستجو یا افزودن تگ ${label}` : `Search or add ${label} tag`}</label>
        <input
          className="input"
          type="search"
          dir="ltr"
          value={search}
          placeholder={isFa ? 'تایپ کنید و Enter بزنید...' : 'Filter tags or press Enter to add custom...'}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (TAG_RE.test(search.trim())) addTag(search);
            }
          }}
        />
      </div>

      {selected.length > 0 && (
        <div className="rt-tag-group">
          <span className="rt-group-title">{isFa ? 'انتخاب‌شده‌ها' : 'Selected'}</span>
          <div className="rt-tag-selected">
            {selected.map((tag) => (
              <span key={tag} className="rt-chip is-tag">
                <span className="mono" dir="ltr">
                  {tag}
                </span>
                <button
                  type="button"
                  className="rt-chip-x"
                  aria-label={`Remove ${tag}`}
                  onClick={() => onChange(selected.filter((t) => t !== tag))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {filteredFavs.length > 0 && (
        <div className="rt-tag-group">
          <span className="rt-group-title">{isFa ? 'محبوب‌ها' : 'Popular'}</span>
          <div className="rt-tag-list">
            {filteredFavs.map((t) => {
              const active = selectedLower.has(t.toLowerCase());
              return (
                <button key={t} type="button" className="rt-tag-toggle" aria-pressed={active} onClick={() => toggleTag(t)}>
                  {active && <Check size={12} />}
                  <span className="mono" dir="ltr">
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filteredRest.length > 0 && (
        <div className="rt-tag-list">
          {filteredRest.map((t) => {
            const active = selectedLower.has(t.toLowerCase());
            return (
              <button key={t} type="button" className="rt-tag-toggle" aria-pressed={active} onClick={() => toggleTag(t)}>
                {active && <Check size={12} />}
                <span className="mono" dir="ltr">
                  {t}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RuleModal({
  isNew,
  rule,
  outbounds,
  inbounds,
  catalog,
  onClose,
  onSave,
  isFa,
}: {
  isNew: boolean;
  rule: RoutingRule;
  outbounds: OutboundItem[];
  inbounds: NodeInboundItem[];
  catalog: RoutingCatalog | null;
  onClose: () => void;
  onSave: (rule: RoutingRule) => void;
  isFa: boolean;
}) {
  const [geosite, setGeosite] = useState<string[]>(() =>
    (rule.geosite || []).map((t) => t.replace(/^geosite:/i, '')),
  );
  const [geoip, setGeoip] = useState<string[]>(() =>
    (rule.geoip || []).map((t) => t.replace(/^geoip:/i, '')),
  );
  const [domainsText, setDomainsText] = useState(() => (rule.domains || []).join('\n'));
  const [ipsText, setIpsText] = useState(() => (rule.ips || []).join('\n'));
  const [ports, setPorts] = useState(rule.ports || '');
  const [selectedInbounds, setSelectedInbounds] = useState<string[]>(() => rule.inboundNames || []);
  const [selectedInboundIds, setSelectedInboundIds] = useState<number[]>(() => rule.inboundIds || []);
  const [action, setAction] = useState<'outbound' | 'direct' | 'block'>(rule.action || 'outbound');
  const [outboundId, setOutboundId] = useState<number | ''>(() => {
    if (rule.action === 'outbound') {
      if (rule.outboundId && outbounds.some((o) => o.id === rule.outboundId)) return rule.outboundId;
      if (rule.outboundTag) {
        const match = outbounds.find((o) => o.name === rule.outboundTag);
        if (match) return match.id;
      }
    }
    return outbounds[0]?.id ?? '';
  });
  const [error, setError] = useState<string | null>(null);

  const toggleInbound = (ib: NodeInboundItem, checked: boolean) => {
    setSelectedInboundIds((prev) =>
      checked ? Array.from(new Set([...prev, ib.id])) : prev.filter((id) => id !== ib.id),
    );
    setSelectedInbounds((prev) =>
      checked ? Array.from(new Set([...prev, ib.name])) : prev.filter((n) => n !== ib.name),
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const doms = splitLines(domainsText);
    const ips = splitLines(ipsText);
    const cleanPorts = ports.trim();

    if (
      geosite.length === 0 &&
      geoip.length === 0 &&
      doms.length === 0 &&
      ips.length === 0 &&
      !cleanPorts &&
      selectedInboundIds.length === 0 &&
      selectedInbounds.length === 0
    ) {
      setError(isFa ? 'حداقل یک شرط تطبیق (تگ، دامنه، IP، پورت یا اینباند) وارد کنید.' : 'Add at least one condition (tag, domain, IP, port, or inbound).');
      return;
    }
    if (cleanPorts && !validatePorts(cleanPorts)) {
      setError(isFa ? 'فرمت پورت نامعتبر است (مثال: 443 یا 8000-9000).' : 'Invalid port list (example: 443 or 8000-9000).');
      return;
    }
    if (action === 'outbound' && outboundId === '') {
      setError(isFa ? 'یک خروجی انتخاب کنید.' : 'Choose an outbound.');
      return;
    }

    const chosenOb = action === 'outbound' ? outbounds.find((o) => o.id === Number(outboundId)) : undefined;
    const formattedGeosite = geosite.map((t) => (t.startsWith('geosite:') ? t : `geosite:${t}`));
    const formattedGeoip = geoip.map((t) => (t.startsWith('geoip:') ? t : `geoip:${t}`));

    onSave({
      id: rule.id || makeRuleId([]),
      enabled: rule.enabled !== false,
      ...(formattedGeosite.length ? { geosite: formattedGeosite } : {}),
      ...(formattedGeoip.length ? { geoip: formattedGeoip } : {}),
      ...(doms.length ? { domains: doms } : {}),
      ...(ips.length ? { ips } : {}),
      ...(cleanPorts ? { ports: cleanPorts } : {}),
      ...(selectedInboundIds.length ? { inboundIds: selectedInboundIds } : {}),
      ...(selectedInbounds.length ? { inboundNames: selectedInbounds } : {}),
      action,
      ...(chosenOb ? { outboundId: chosenOb.id, outboundTag: chosenOb.name } : {}),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={isNew ? (isFa ? 'قانون جدید مسیریابی' : 'New routing rule') : isFa ? 'ویرایش قانون' : 'Edit routing rule'}
    >
      <form className="rt-rule-form" onSubmit={handleSave}>
        {error && (
          <p className="rt-form-error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="rt-match-fields">
          <legend>{isFa ? 'چه زمانی این قانون اعمال شود' : 'Match traffic'}</legend>

          {inbounds.length > 0 && (
            <fieldset className="rt-rule-inbounds">
              <legend className="label">{isFa ? 'فقط برای این اینباندها' : 'Only for these inbounds'}</legend>
              <p className="hint">
                {isFa
                  ? 'اگر هیچ موردی انتخاب نشود، برای تمام اینباندهای این نود اعمال می‌شود.'
                  : 'Leave empty to match traffic from all inbounds on this node.'}
              </p>
              <div className="rt-inbound-list">
                {inbounds.map((ib) => {
                  const checked = selectedInboundIds.includes(ib.id) || selectedInbounds.includes(ib.name);
                  return (
                    <label key={ib.id} className={`rt-inbound${checked ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={(e) => toggleInbound(ib, e.target.checked)} />
                      <span className="rt-inbound-text">
                        <span className="rt-inbound-name">{ib.name}</span>
                        <span className="rt-inbound-meta">
                          <span>{formatProtocolLabel(ib.protocol)}</span>
                          <bdi className="mono" dir="ltr">
                            :{ib.port}
                          </bdi>
                          {!ib.enabled && (
                            <span className="rt-inbound-off">{isFa ? 'خاموش' : 'Disabled'}</span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <TagPicker
            label={isFa ? 'لیست سایت‌ها (Geosite)' : 'Geosite categories'}
            tags={catalog?.geosite || ['google-gemini', 'openai', 'anthropic', 'youtube', 'netflix', 'category-ir', 'category-ads-all', 'telegram']}
            favorites={catalog?.favorites.geosite || ['google-gemini', 'openai', 'anthropic', 'youtube', 'netflix', 'category-ir', 'category-ads-all', 'telegram']}
            selected={geosite}
            onChange={setGeosite}
            isFa={isFa}
          />

          <TagPicker
            label={isFa ? 'کشورها و IPها (GeoIP)' : 'GeoIP countries & networks'}
            tags={catalog?.geoip || ['ir', 'private', 'cloudflare', 'telegram', 'google', 'netflix']}
            favorites={catalog?.favorites.geoip || ['ir', 'private', 'cloudflare', 'telegram', 'google']}
            selected={geoip}
            onChange={setGeoip}
            isFa={isFa}
          />

          <div className="field">
            <label className="label">{isFa ? 'دامنه‌ها' : 'Domains'}</label>
            <textarea
              className="textarea mono"
              dir="ltr"
              rows={3}
              spellCheck={false}
              placeholder="domain:openai.com&#10;full:gemini.google.com"
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
            />
            <span className="hint">
              {isFa
                ? 'هر دامنه در یک خط یا با کاما جدا شود (مثال: openai.com یا keyword:google).'
                : 'One per line or comma-separated (e.g. domain:openai.com or full:example.com).'}
            </span>
          </div>

          <div className="rt-grid">
            <div className="field">
              <label className="label">{isFa ? 'IPها و رنج‌ها (CIDR)' : 'IPs & CIDRs'}</label>
              <textarea
                className="textarea mono"
                dir="ltr"
                rows={3}
                spellCheck={false}
                placeholder="1.1.1.1&#10;192.168.0.0/16"
                value={ipsText}
                onChange={(e) => setIpsText(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">{isFa ? 'پورت‌ها' : 'Ports'}</label>
              <input
                className="input mono"
                dir="ltr"
                placeholder="443, 80, 8000-9000"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
              />
              <span className="hint">{isFa ? 'شماره پورت یا بازه با کاما.' : 'Single ports or ranges (e.g. 443, 8000-9000).'}</span>
            </div>
          </div>
        </fieldset>

        <div className="field">
          <span className="label">{isFa ? 'سپس چه‌کار کند' : 'Then'}</span>
          <Segmented
            value={action}
            onChange={(v) => {
              setAction(v);
              if (v === 'outbound' && outboundId === '' && outbounds[0]) {
                setOutboundId(outbounds[0].id);
              }
            }}
            options={[
              { value: 'outbound', label: isFa ? 'ارسال از طریق خروجی' : 'Send via outbound' },
              { value: 'direct', label: isFa ? 'مستقیم' : 'Direct' },
              { value: 'block', label: isFa ? 'مسدود' : 'Block' },
            ]}
          />
        </div>

        {action === 'outbound' && (
          <div className="field">
            <label className="label">{isFa ? 'خروجی مقصد' : 'Target outbound'}</label>
            <select
              className="select"
              value={outboundId}
              onChange={(e) => setOutboundId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">{isFa ? 'یک خروجی انتخاب کنید...' : 'Choose an outbound...'}</option>
              {outbounds.map((ob) => (
                <option key={ob.id} value={ob.id}>
                  {ob.name} ({ob.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {isFa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary">
            {isNew ? (isFa ? 'افزودن قانون' : 'Add rule') : isFa ? 'ذخیره قانون' : 'Save rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TestModal({
  source,
  name,
  nodes,
  onClose,
  isFa,
}: {
  source: { kind: 'saved'; id: number } | { kind: 'draft'; type: string; config: Record<string, unknown> };
  name: string;
  nodes: NodeListItem[];
  onClose: () => void;
  isFa: boolean;
}) {
  const [targetId, setTargetId] = useState<number>(nodes[0]?.id ?? 0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<OutboundTestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 400);
    return () => window.clearInterval(t);
  }, [running]);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    setErr(null);
    try {
      const res =
        source.kind === 'saved'
          ? await apiFetch<OutboundTestResult>(`/routing/outbounds/${source.id}/test`, {
              method: 'POST',
              body: JSON.stringify({ targetId }),
            })
          : await apiFetch<OutboundTestResult>('/routing/outbounds/test-draft', {
              method: 'POST',
              body: JSON.stringify({ type: source.type, config: source.config, targetId }),
            });
      setResult(res);
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void runTest();
  }, []);

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="max-w-xl"
      title={`${isFa ? 'تست خروجی' : 'Test outbound'} · ${name}`}
    >
      <div className="rt-test">
        {nodes.length > 0 && (
          <div className="field">
            <label className="label">{isFa ? 'تست از طریق نود' : 'Test from node'}</label>
            <select
              className="select"
              value={targetId}
              disabled={running}
              onChange={(e) => setTargetId(Number(e.target.value))}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.address})
                </option>
              ))}
            </select>
          </div>
        )}

        {running && (
          <div className="rt-test-run" role="status">
            <span className="rt-test-pulse" aria-hidden="true" />
            <div>
              <strong>{isFa ? 'در حال برقراری اتصال و سنجش تاخیر...' : 'Testing reachability & latency...'}</strong>
              <p className="hint" style={{ marginTop: 4 }}>
                {isFa ? 'پکت تست به مقصد ارسال می‌شود.' : 'Probing target host over TCP/handshake.'}
              </p>
              <p className="mono" style={{ fontSize: 12, marginTop: 4 }} dir="ltr">
                {elapsed}s
              </p>
            </div>
          </div>
        )}

        {err && !running && (
          <p className="rt-test-error" role="alert">
            <AlertTriangle size={16} />
            <span>{err}</span>
          </p>
        )}

        {result && !running && (
          <div className={`rt-test-card ${result.reachable ? 'good' : 'bad'}`} role="status">
            <div>
              <span className={`rt-test-badge ${result.reachable ? 'good' : 'bad'}`}>
                {result.reachable ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {result.reachable ? (isFa ? 'متصل شد' : 'Connected') : isFa ? 'خطا در اتصال' : 'Failed'}
              </span>
            </div>

            {result.reachable && (
              <dl className="rt-test-facts">
                <div>
                  <dt>{isFa ? 'بهترین تاخیر' : 'Best latency'}</dt>
                  <dd className="mono" dir="ltr">
                    {result.bestMs ?? result.latencyMs} ms
                  </dd>
                </div>
                <div>
                  <dt>{isFa ? 'سرور مقصد' : 'Exit host'}</dt>
                  <dd className="mono" dir="ltr">
                    {result.exitHost}
                  </dd>
                </div>
              </dl>
            )}

            {result.error && (
              <p className="rt-test-errtext mono" dir="ltr">
                {result.error}
              </p>
            )}

            {result.attempts && result.attempts.length > 0 && (
              <div>
                <span className="rt-label">{isFa ? 'تلاش‌ها' : 'Attempts'}</span>
                <ol className="rt-test-attempts">
                  {result.attempts.map((a, idx) => (
                    <li key={idx} className={a.error ? 'bad' : 'good'}>
                      <span>{isFa ? `تلاش ${idx + 1}` : `Attempt ${idx + 1}`}</span>
                      <span className="mono" dir="ltr">
                        {a.error ? a.error : `${a.ms} ms`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {isFa ? 'بستن' : 'Close'}
          </Button>
          <Button variant="primary" disabled={running} onClick={() => void runTest()}>
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            {result || err ? (isFa ? 'تست مجدد' : 'Run again') : isFa ? 'شروع تست' : 'Run test'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function OutboundModal({
  outbound,
  nodes,
  onClose,
  onSaved,
  isFa,
}: {
  outbound: OutboundItem | null;
  nodes: NodeListItem[];
  onClose: () => void;
  onSaved: () => void;
  isFa: boolean;
}) {
  const isEdit = outbound !== null;
  const [mode, setMode] = useState<'form' | 'link' | 'json'>('form');
  const [name, setName] = useState(outbound?.name || '');
  const [proto, setProto] = useState(outbound?.type || 'vless');
  const [cfg, setCfg] = useState<Record<string, unknown>>(() => {
    const base = outbound?.config ? { ...outbound.config } : {};
    for (const k of ['id', 'password', 'secret', 'privateKey', 'preSharedKey', 'accessToken', 'licenseKey']) {
      if (base[k] === '••••••••') base[k] = '';
    }
    return { port: defaultPortForProto(outbound?.type || 'vless'), transport: 'tcp', security: 'none', ...base };
  });
  const [rawText, setRawText] = useState(() =>
    outbound ? JSON.stringify({ protocol: outbound.type, ...outbound.config }, null, 2) : '',
  );
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testingDraft, setTestingDraft] = useState(false);
  const storedSecrets = new Set(outbound?.secretsSet || []);

  const updateCfg = (key: string, val: unknown) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
  };

  const handleModeChange = (next: 'form' | 'link' | 'json') => {
    setErr(null);
    if (next === 'json' && mode === 'form') {
      setRawText(JSON.stringify({ protocol: proto, ...cfg }, null, 2));
    }
    setMode(next);
  };

  const parseInputToForm = async () => {
    if (!rawText.trim()) return;
    setParsing(true);
    setErr(null);
    try {
      const parsed = await apiFetch<{ name: string; type: string; config: Record<string, unknown> }>(
        '/routing/outbounds/parse-link',
        {
          method: 'POST',
          body: JSON.stringify({ link: rawText.trim() }),
        },
      );
      if (!name.trim() && parsed.name) setName(parsed.name);
      setProto(parsed.type);
      setCfg({ port: defaultPortForProto(parsed.type), ...parsed.config });
      setMode('form');
    } catch (e) {
      setErr(String(e));
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr(isFa ? 'نام خروجی الزامی است.' : 'Outbound name is required.');
      return;
    }

    setSaving(true);
    try {
      let submitType = proto;
      let submitCfg = cfg;
      if (mode === 'link') {
        const parsed = await apiFetch<{ name: string; type: string; config: Record<string, unknown> }>(
          '/routing/outbounds/parse-link',
          { method: 'POST', body: JSON.stringify({ link: rawText.trim() }) },
        );
        submitType = parsed.type;
        submitCfg = parsed.config;
      } else if (mode === 'json') {
        const json = JSON.parse(rawText) as Record<string, unknown>;
        submitType = String(json.protocol || proto);
        submitCfg = json;
      }

      if (isEdit && outbound) {
        await apiFetch(`/routing/outbounds/${outbound.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), type: submitType, config: submitCfg }),
        });
      } else {
        await apiFetch('/routing/outbounds', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), type: submitType, config: submitCfg }),
        });
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const summary = getOutboundSummary({ type: proto, config: cfg });
  const isWg = proto === 'wireguard';
  const showTls = !isWg && proto !== 'socks';

  return (
    <>
      <Modal
        open
        onClose={onClose}
        maxWidth="max-w-2xl"
        title={isEdit ? (isFa ? 'ویرایش خروجی' : 'Edit outbound') : isFa ? 'افزودن خروجی' : 'Add outbound'}
      >
        <form className="rt-outbound-form" onSubmit={(e) => void handleSubmit(e)}>
          {err && (
            <p className="rt-form-error" role="alert">
              {err}
            </p>
          )}

          <div className="field">
            <label className="label">{isFa ? 'نام خروجی' : 'Name'}</label>
            <input
              className="input"
              value={name}
              placeholder="Germany-Upstream"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="hint">{isFa ? 'یک نام کوتاه برای انتخاب در قوانین مسیریابی' : 'Short label shown in routing rules'}</span>
          </div>

          <div className="rt-modebar">
            <span className="label">{isFa ? 'حالت تنظیم' : 'Input mode'}</span>
            <Segmented
              value={mode}
              onChange={handleModeChange}
              options={[
                { value: 'form', label: isFa ? 'فرم تنظیمات' : 'Form' },
                { value: 'link', label: isFa ? 'لینک یا کانفیگ' : 'Link / Config' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          </div>

          {mode === 'form' ? (
            <div className="rt-formed">
              <div className="rt-protocol">
                <span className="rt-label">{isFa ? 'پروتکل' : 'Protocol'}</span>
                <div className="rt-proto-grid" role="group">
                  {PROTOCOLS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="rt-proto"
                      aria-pressed={proto === p}
                      onClick={() => {
                        setProto(p);
                        updateCfg('port', defaultPortForProto(p));
                      }}
                    >
                      {PROTO_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <details className="rt-sec" open>
                <summary>
                  <span>{isFa ? 'سرور' : 'Server'}</span>
                  <ChevronDown size={16} />
                </summary>
                <div className="rt-sec-body">
                  <div className="rt-grid">
                    <div className="field">
                      <label className="label">{isFa ? 'آدرس سرور' : 'Address / Host'}</label>
                      <input
                        className="input mono"
                        dir="ltr"
                        placeholder="example.com"
                        value={String(cfg.address || '')}
                        onChange={(e) => updateCfg('address', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label">{isFa ? 'پورت' : 'Port'}</label>
                      <input
                        className="input mono"
                        type="number"
                        dir="ltr"
                        value={String(cfg.port || '')}
                        onChange={(e) => updateCfg('port', Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </details>

              <details className="rt-sec" open>
                <summary>
                  <span>{isFa ? 'احراز هویت' : 'Credentials'}</span>
                  <ChevronDown size={16} />
                </summary>
                <div className="rt-sec-body">
                  <div className="rt-grid">
                    {(proto === 'vless' || proto === 'vmess') && (
                      <div className="rt-span">
                        <SecretField
                          label="UUID"
                          value={String(cfg.id || '')}
                          stored={isEdit && storedSecrets.has('id')}
                          onChange={(v) => updateCfg('id', v)}
                          isFa={isFa}
                        />
                      </div>
                    )}
                    {proto === 'vless' && (
                      <div className="field">
                        <label className="label">Flow</label>
                        <input
                          className="input mono"
                          dir="ltr"
                          placeholder="xtls-rprx-vision"
                          value={String(cfg.flow || '')}
                          onChange={(e) => updateCfg('flow', e.target.value)}
                        />
                      </div>
                    )}
                    {(proto === 'trojan' || proto === 'hysteria2') && (
                      <div className="rt-span">
                        <SecretField
                          label={isFa ? 'گذرواژه' : 'Password'}
                          value={String(cfg.password || '')}
                          stored={isEdit && storedSecrets.has('password')}
                          onChange={(v) => updateCfg('password', v)}
                          isFa={isFa}
                        />
                      </div>
                    )}
                    {proto === 'shadowsocks' && (
                      <>
                        <div className="field">
                          <label className="label">{isFa ? 'متد رمزنگاری' : 'Cipher method'}</label>
                          <select
                            className="select mono"
                            value={String(cfg.method || 'aes-256-gcm')}
                            onChange={(e) => updateCfg('method', e.target.value)}
                          >
                            <option value="2022-blake3-aes-128-gcm">2022-blake3-aes-128-gcm</option>
                            <option value="2022-blake3-aes-256-gcm">2022-blake3-aes-256-gcm</option>
                            <option value="aes-256-gcm">aes-256-gcm</option>
                            <option value="aes-128-gcm">aes-128-gcm</option>
                            <option value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</option>
                          </select>
                        </div>
                        <SecretField
                          label={isFa ? 'کلید / گذرواژه' : 'Password'}
                          value={String(cfg.secret || '')}
                          stored={isEdit && storedSecrets.has('secret')}
                          onChange={(v) => updateCfg('secret', v)}
                          isFa={isFa}
                        />
                      </>
                    )}
                    {(proto === 'socks' || proto === 'http') && (
                      <>
                        <div className="field">
                          <label className="label">{isFa ? 'نام کاربری (اختیاری)' : 'Username (optional)'}</label>
                          <input
                            className="input mono"
                            dir="ltr"
                            value={String(cfg.username || '')}
                            onChange={(e) => updateCfg('username', e.target.value)}
                          />
                        </div>
                        <SecretField
                          label={isFa ? 'گذرواژه (اختیاری)' : 'Password (optional)'}
                          optional
                          value={String(cfg.password || '')}
                          stored={isEdit && storedSecrets.has('password')}
                          onChange={(v) => updateCfg('password', v)}
                          isFa={isFa}
                        />
                      </>
                    )}
                    {isWg && (
                      <>
                        <div className="rt-span">
                          <SecretField
                            label="Private Key"
                            value={String(cfg.privateKey || '')}
                            stored={isEdit && storedSecrets.has('privateKey')}
                            onChange={(v) => updateCfg('privateKey', v)}
                            isFa={isFa}
                          />
                        </div>
                        <div className="field rt-span">
                          <label className="label">Peer Public Key</label>
                          <input
                            className="input mono"
                            dir="ltr"
                            value={String(cfg.publicKey || '')}
                            onChange={(e) => updateCfg('publicKey', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="label">Addresses</label>
                          <input
                            className="input mono"
                            dir="ltr"
                            placeholder="10.0.0.2/32"
                            value={String(cfg.addresses || '10.0.0.2/32')}
                            onChange={(e) => updateCfg('addresses', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="label">MTU</label>
                          <input
                            className="input mono"
                            type="number"
                            dir="ltr"
                            value={String(cfg.mtu || 1420)}
                            onChange={(e) => updateCfg('mtu', Number(e.target.value))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </details>

              {showTls && (
                <details className="rt-sec">
                  <summary>
                    <span>{isFa ? 'انتقال و امنیت (TLS / Reality)' : 'Transport & Security'}</span>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="rt-sec-body">
                    <div className="rt-grid">
                      <div className="field">
                        <label className="label">{isFa ? 'انتقال' : 'Transport'}</label>
                        <select
                          className="select mono"
                          value={String(cfg.transport || 'tcp')}
                          onChange={(e) => updateCfg('transport', e.target.value)}
                        >
                          <option value="tcp">TCP</option>
                          <option value="ws">WebSocket</option>
                          <option value="grpc">gRPC</option>
                          <option value="httpupgrade">HTTPUpgrade</option>
                          <option value="xhttp">XHTTP</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">{isFa ? 'امنیت' : 'Security'}</label>
                        <select
                          className="select mono"
                          value={String(cfg.security || 'none')}
                          onChange={(e) => updateCfg('security', e.target.value)}
                        >
                          <option value="none">None</option>
                          <option value="tls">TLS</option>
                          <option value="reality">Reality</option>
                        </select>
                      </div>
                      {String(cfg.security || 'none') !== 'none' && (
                        <>
                          <div className="field">
                            <label className="label">SNI</label>
                            <input
                              className="input mono"
                              dir="ltr"
                              value={String(cfg.sni || '')}
                              onChange={(e) => updateCfg('sni', e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label className="label">Fingerprint</label>
                            <select
                              className="select mono"
                              value={String(cfg.fingerprint || 'chrome')}
                              onChange={(e) => updateCfg('fingerprint', e.target.value)}
                            >
                              <option value="chrome">chrome</option>
                              <option value="firefox">firefox</option>
                              <option value="safari">safari</option>
                              <option value="ios">ios</option>
                              <option value="android">android</option>
                              <option value="random">random</option>
                            </select>
                          </div>
                        </>
                      )}
                      {String(cfg.security) === 'reality' && (
                        <>
                          <div className="field">
                            <label className="label">Public Key (pbk)</label>
                            <input
                              className="input mono"
                              dir="ltr"
                              value={String(cfg.pbk || '')}
                              onChange={(e) => updateCfg('pbk', e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label className="label">Short ID (sid)</label>
                            <input
                              className="input mono"
                              dir="ltr"
                              value={String(cfg.sid || '')}
                              onChange={(e) => updateCfg('sid', e.target.value)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="field">
              <label className="label">
                {mode === 'json'
                  ? 'Xray / JSON Outbound'
                  : isFa
                    ? 'لینک اشتراک یا WireGuard .conf'
                    : 'Share link or WireGuard .conf'}
              </label>
              <textarea
                className="textarea mono"
                dir="ltr"
                rows={mode === 'json' ? 10 : 5}
                spellCheck={false}
                placeholder={
                  mode === 'json'
                    ? '{ "protocol": "vless", "address": "1.2.3.4", "port": 443 }'
                    : 'vless://... | vmess://... | trojan://... | hy2://... | [Interface]...'
                }
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="rt-secret-note" style={{ flex: 1, marginBlock: 0 }}>
                  <Lock size={14} />
                  <span>
                    {isFa
                      ? 'کلیدها و گذرواژه‌ها پس از ذخیره به‌صورت امن نگهداری می‌شوند و در لیست نمایش داده نمی‌شوند.'
                      : 'Secrets are stored safely on the server and redacted from list views.'}
                  </span>
                </span>
                <Button size="sm" disabled={parsing || !rawText.trim()} onClick={() => void parseInputToForm()}>
                  {parsing ? (isFa ? 'در حال پردازش...' : 'Parsing...') : isFa ? 'تبدیل به فرم' : 'Parse to form'}
                </Button>
              </div>
            </div>
          )}

          <div className="rt-current">
            <span className="rt-current-title">{isFa ? 'پیش‌نمایش خلاصه' : 'Live summary'}</span>
            <SummaryBox summary={summary} preview isFa={isFa} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={!cfg.address}
              onClick={() => setTestingDraft(true)}
            >
              <Activity size={14} />
              {isFa ? 'تست اتصال' : 'Test'}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                {isFa ? 'انصراف' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {testingDraft && (
        <TestModal
          source={isEdit && outbound ? { kind: 'saved', id: outbound.id } : { kind: 'draft', type: proto, config: cfg }}
          name={name.trim() || outbound?.name || (isFa ? 'پیش‌نویس' : 'Draft')}
          nodes={nodes}
          onClose={() => setTestingDraft(false)}
          isFa={isFa}
        />
      )}
    </>
  );
}

export function WarpModal({
  outbound,
  nodes,
  onClose,
  onChanged,
  onAdvanced,
  isFa,
}: {
  outbound: OutboundItem | null;
  nodes: NodeListItem[];
  onClose: () => void;
  onChanged: () => void;
  onAdvanced: (ob: OutboundItem) => void;
  isFa: boolean;
}) {
  const isEdit = outbound !== null;
  const currentHost = String(outbound?.config?.address || 'engage.cloudflareclient.com');
  const currentPort = String(outbound?.config?.port || 2408);
  const currentEp = `${currentHost}:${currentPort}`;
  const isDefault = currentEp === 'engage.cloudflareclient.com:2408';

  const [name, setName] = useState(outbound?.name || 'WARP');
  const [epMode, setEpMode] = useState<'default' | 'custom'>(isDefault ? 'default' : 'custom');
  const [customEp, setCustomEp] = useState(isDefault ? '' : currentEp);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const ep = epMode === 'default' ? 'engage.cloudflareclient.com:2408' : customEp.trim();
    if (!ep) {
      setErr(isFa ? 'آدرس endpoint را وارد کنید.' : 'Enter an endpoint host:port.');
      return;
    }
    const [host, portStr] = ep.split(':');
    const port = Number(portStr || 2408);

    setBusy(true);
    try {
      if (isEdit && outbound) {
        await apiFetch(`/routing/outbounds/${outbound.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim() || 'WARP',
            type: 'wireguard',
            config: {
              ...outbound.config,
              provider: 'warp',
              address: host,
              port,
              ...(licenseKey.trim() ? { licenseKey: licenseKey.trim(), accountType: 'plus' } : {}),
            },
          }),
        });
      } else {
        await apiFetch('/routing/outbounds', {
          method: 'POST',
          body: JSON.stringify({
            preset: 'warp',
            name: name.trim() || 'WARP',
            config: {
              address: host,
              port,
              licenseKey: licenseKey.trim(),
            },
          }),
        });
      }
      onChanged();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const accType = String(outbound?.config?.accountType || (licenseKey.trim() ? 'plus' : 'free')).toUpperCase();

  return (
    <>
      <Modal
        open
        onClose={onClose}
        maxWidth="max-w-xl"
        title={isEdit ? (isFa ? 'تنظیمات خروجی WARP' : 'Edit WARP outbound') : isFa ? 'افزودن Cloudflare WARP' : 'Add Cloudflare WARP'}
      >
        <form className="rt-outbound-form rt-provider-form" onSubmit={(e) => void handleSave(e)}>
          {isEdit && outbound ? (
            <section className="rt-provider-account">
              <div className="rt-provider-account-head">
                <span className="rt-current-title">{isFa ? 'حساب WARP' : 'WARP Account'}</span>
                <span className="kind-badge oc" dir="ltr">
                  {accType}
                </span>
                {outbound.config?.deviceId ? (
                  <span className="mono text-xs text-(--text-muted)" dir="ltr">
                    {String(outbound.config.deviceId)}
                  </span>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="rt-provider-intro small">
              <Flame size={18} />
              <span>
                {isFa
                  ? 'یک تونل WireGuard کلادفلر WARP به‌صورت خودکار ثبت و پیکربندی می‌شود تا ترافیک سایت‌های منتخب با IP تمیز کلادفلر خارج شود.'
                  : 'Automatically registers a Cloudflare WARP WireGuard profile so selected sites route through Cloudflare egress.'}
              </span>
            </p>
          )}

          {err && <p className="rt-form-error">{err}</p>}

          <div className="field">
            <label className="label">{isFa ? 'نام خروجی' : 'Name'}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="rt-provider-endpoint">
            <span className="rt-current-title">{isFa ? 'نقطه اتصال (Endpoint)' : 'WARP Endpoint'}</span>
            <Segmented
              value={epMode}
              onChange={setEpMode}
              options={[
                { value: 'default', label: isFa ? 'پیش‌فرض Cloudflare' : 'Default Cloudflare' },
                { value: 'custom', label: isFa ? 'Endpoint دلخواه' : 'Custom endpoint' },
              ]}
            />
            {epMode === 'default' ? (
              <p className="hint mono" dir="ltr">
                engage.cloudflareclient.com:2408
              </p>
            ) : (
              <div className="field">
                <input
                  className="input mono"
                  dir="ltr"
                  placeholder="162.159.192.1:2408"
                  value={customEp}
                  onChange={(e) => setCustomEp(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="field">
            <label className="label">{isFa ? 'لایسنس WARP+ (اختیاری)' : 'WARP+ License key (optional)'}</label>
            <input
              className="input mono"
              dir="ltr"
              placeholder="xxxxxxxx-xxxxxxxx-xxxxxxxx"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
            />
            <span className="hint">
              {isFa ? 'در صورت خالی بودن از اکانت رایگان کلادفلر استفاده می‌شود.' : 'Leave blank for free Cloudflare WARP.'}
            </span>
          </div>

          {isEdit && outbound && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => onAdvanced(outbound)}>
                {isFa ? 'ویرایش پیشرفته WireGuard' : 'Advanced WireGuard settings'}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit && outbound ? (
              <Button variant="ghost" onClick={() => setTestOpen(true)}>
                <Activity size={14} />
                {isFa ? 'تست' : 'Test'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                {isFa ? 'انصراف' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                <Flame size={14} />
                {busy
                  ? isFa
                    ? 'در حال ثبت...'
                    : 'Creating...'
                  : isEdit
                    ? isFa
                      ? 'ذخیره'
                      : 'Save'
                    : isFa
                      ? 'ساخت خروجی WARP'
                      : 'Create WARP outbound'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {testOpen && outbound && (
        <TestModal
          source={{ kind: 'saved', id: outbound.id }}
          name={outbound.name}
          nodes={nodes}
          onClose={() => setTestOpen(false)}
          isFa={isFa}
        />
      )}
    </>
  );
}

export function NordVpnModal({
  outbound,
  onClose,
  onChanged,
  onAdvanced,
  isFa,
}: {
  outbound: OutboundItem | null;
  onClose: () => void;
  onChanged: () => void;
  onAdvanced: (ob: OutboundItem) => void;
  isFa: boolean;
}) {
  const isEdit = outbound !== null;
  const [token, setToken] = useState('');
  const [countryCode, setCountryCode] = useState(() =>
    NORD_COUNTRIES.find((c) => c.name === String(outbound?.config?.country || 'Netherlands'))?.code || 'NL',
  );
  const [selectedServer, setSelectedServer] = useState(
    () => String(outbound?.config?.serverHostname || outbound?.config?.address || 'nl912.nordvpn.com'),
  );
  const [name, setName] = useState(outbound?.name || 'NordVPN · Netherlands');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeCountry = NORD_COUNTRIES.find((c) => c.code === countryCode) || NORD_COUNTRIES[0];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr(isFa ? 'نام خروجی الزامی است.' : 'Name is required.');
      return;
    }
    setBusy(true);
    try {
      if (isEdit && outbound) {
        await apiFetch(`/routing/outbounds/${outbound.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            type: 'wireguard',
            config: {
              ...outbound.config,
              provider: 'nordvpn',
              address: selectedServer,
              serverHostname: selectedServer,
              country: activeCountry.name,
              ...(token.trim() ? { accessToken: token.trim() } : {}),
            },
          }),
        });
      } else {
        await apiFetch('/routing/outbounds', {
          method: 'POST',
          body: JSON.stringify({
            preset: 'nordvpn',
            name: name.trim(),
            config: {
              country: activeCountry.name,
              address: selectedServer,
              serverHostname: selectedServer,
              accessToken: token.trim(),
            },
          }),
        });
      }
      onChanged();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="max-w-xl"
      title={isEdit ? (isFa ? 'ویرایش NordVPN' : 'Edit NordVPN') : isFa ? 'افزودن NordVPN (NordLynx)' : 'Add NordVPN'}
    >
      <form className="rt-outbound-form rt-provider-form" onSubmit={(e) => void handleSave(e)}>
        <p className="rt-provider-intro small">
          <Shield size={18} />
          <span>
            {isFa
              ? 'کشور و سرور پیشنهادی NordVPN را انتخاب کنید و توکن دسترسی حساب خود را وارد نمایید.'
              : 'Select a NordVPN country and recommended NordLynx WireGuard server.'}
          </span>
        </p>

        {err && <p className="rt-form-error">{err}</p>}

        <SecretField
          label={isFa ? 'توکن دسترسی NordVPN (Access Token)' : 'NordVPN Access Token'}
          value={token}
          stored={isEdit && Boolean(outbound?.secretsSet?.includes('accessToken'))}
          optional
          onChange={setToken}
          isFa={isFa}
        />

        <div className="field">
          <label className="label">{isFa ? 'کشور' : 'Country'}</label>
          <select
            className="select"
            value={countryCode}
            onChange={(e) => {
              const code = e.target.value;
              setCountryCode(code);
              const c = NORD_COUNTRIES.find((x) => x.code === code);
              if (c) {
                setSelectedServer(c.servers[0].hostname);
                if (!isEdit) setName(`NordVPN · ${c.name}`);
              }
            }}
          >
            {NORD_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <fieldset className="rt-server-list" style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend className="rt-current-title">{isFa ? 'سرورهای پیشنهادی' : 'Recommended servers'}</legend>
          <ul style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {activeCountry.servers.map((srv, idx) => {
              const active = selectedServer === srv.hostname;
              return (
                <li key={srv.hostname}>
                  <label className={`rt-server${active ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="nord-srv"
                      checked={active}
                      onChange={() => setSelectedServer(srv.hostname)}
                    />
                    <span className="rt-server-main">
                      <span className="mono rt-server-host" dir="ltr">
                        {srv.hostname}
                      </span>
                      <span className="text-xs text-(--text-muted)">{srv.city}</span>
                    </span>
                    {idx === 0 && <span className="kind-badge oc">{isFa ? 'پیشنهادی' : 'Recommended'}</span>}
                    <span className="rt-server-load mono" dir="ltr">
                      {srv.load}%
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="field">
          <label className="label">{isFa ? 'نام خروجی' : 'Name'}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {isEdit && outbound && (
          <div>
            <Button size="sm" variant="ghost" onClick={() => onAdvanced(outbound)}>
              {isFa ? 'تنظیمات پیشرفته' : 'Advanced settings'}
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {isFa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            <Shield size={14} />
            {busy ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره خروجی' : 'Save NordVPN'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PsiphonModal({
  outbound,
  regions,
  onClose,
  onChanged,
  isFa,
}: {
  outbound: OutboundItem | null;
  regions: string[];
  onClose: () => void;
  onChanged: () => void;
  isFa: boolean;
}) {
  const isEdit = outbound !== null;
  const [region, setRegion] = useState(String(outbound?.config?.region || 'AUTO'));
  const [search, setSearch] = useState('');
  const [name, setName] = useState(outbound?.name || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regions.filter((code) => {
      if (!q) return true;
      const label = REGION_NAMES[code] ? (isFa ? REGION_NAMES[code].fa : REGION_NAMES[code].en) : code;
      return code.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [regions, search, isFa]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const label = REGION_NAMES[region] ? (isFa ? REGION_NAMES[region].fa : REGION_NAMES[region].en) : region;
      const finalName = name.trim() || (region === 'AUTO' ? 'Psiphon · Auto' : `Psiphon · ${label}`);
      if (isEdit && outbound) {
        await apiFetch(`/routing/outbounds/${outbound.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: finalName,
            type: 'socks',
            config: {
              ...outbound.config,
              provider: 'psiphon',
              region,
            },
          }),
        });
      } else {
        await apiFetch('/routing/outbounds', {
          method: 'POST',
          body: JSON.stringify({
            preset: 'psiphon',
            name: finalName,
            config: { region },
          }),
        });
      }
      onChanged();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="max-w-xl"
      title={isEdit ? (isFa ? 'ویرایش خروجی Psiphon' : 'Edit Psiphon') : isFa ? 'افزودن سایفون (Psiphon)' : 'Add Psiphon'}
    >
      <form className="rt-outbound-form rt-provider-form" onSubmit={(e) => void handleSave(e)}>
        <p className="rt-provider-intro small">
          <Waypoints size={18} />
          <span>
            {isFa
              ? 'خروجی محلی سایفون بدون نیاز به سرور خارجی، ترافیک قوانین منتخب را از شبکه توزیع‌شده Psiphon عبور می‌دهد.'
              : 'Built-in Psiphon tunnel lets selected traffic exit through another country without buying an extra VPS.'}
          </span>
        </p>

        {err && <p className="rt-form-error">{err}</p>}

        {isEdit && (
          <div className="field">
            <label className="label">{isFa ? 'نام خروجی' : 'Name'}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label className="label">{isFa ? 'جستجوی کشور / منطقه' : 'Filter exit country'}</label>
          <input
            className="input"
            type="search"
            placeholder={isFa ? 'مثال: Germany یا DE' : 'Search country or code...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ul className="rt-psi-list">
          {list.map((code) => {
            const active = region === code;
            const info = REGION_NAMES[code];
            const label = info ? (isFa ? info.fa : info.en) : code;
            return (
              <li key={code} className={`rt-psi-row${active ? ' is-active' : ''}`}>
                <label className="rt-psi-pick">
                  <input type="radio" name="psi-region" checked={active} onChange={() => setRegion(code)} />
                  <span className="rt-psi-name">
                    <span>{label}</span>
                    {code !== 'AUTO' && (
                      <span className="mono text-xs text-(--text-muted)" dir="ltr">
                        {code}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {isFa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            <Plus size={14} />
            {busy ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isEdit ? (isFa ? 'ذخیره' : 'Save') : isFa ? 'افزودن سایفون' : 'Add Psiphon'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
