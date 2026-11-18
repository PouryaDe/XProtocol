import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Info,
  Mail,
  Moon,
  Network,
  Phone,
  Plane,
  QrCode,
  Send,
  ShieldCheck,
  Sun,
  Zap,
} from 'lucide-react';
import '../styles/subscription.css';
import { BrandMark, EqLoader, Odometer, useSlidingIndicator } from '../components/UiPrimitives';
import { TrafficChart, type TrafficSample } from '../components/TrafficChart';
import { formatBytes, formatBytesParts, formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import {
  applySubTheme,
  detectPlatform,
  fmtNum,
  fmtSub,
  normalizeSubTheme,
  parseContactLink,
  PLAT_LABELS,
  PLAT_ORDER,
  SUB_COPY,
  SUB_PROTO_LABELS,
  type ContactKind,
  type ParsedContact,
  type SubLocale,
  type SubMode,
  type SubPlatform,
  type SubThemeKey,
} from '../lib/subTheme';

interface SubAppItem {
  name: string;
  url: string;
}

interface SubProfile {
  inboundId: number;
  inboundName: string;
  protocol: string;
  nodeName: string;
  description: string;
  filename: string;
  configText: string;
  connectInfo: Record<string, string | number>;
}

interface SubXrayServer {
  key: string;
  name: string;
  instanceId: number;
  protocol: string;
  transport: string;
  security: string;
  port: number;
  links: string[];
}

interface SubProtocolTab {
  id: string;
  tabName: string;
  guideNote: string;
  apps: {
    android: SubAppItem[];
    ios: SubAppItem[];
    desktop: SubAppItem[];
  };
  profiles: SubProfile[];
  xrayServers?: SubXrayServer[];
}

export interface SubPayload {
  client: {
    name: string;
    status: string;
    trafficLimitBytes: number | null;
    trafficUsedBytes: number;
    downloadBytes: number;
    uploadBytes: number;
    expiresAt: string | null;
    firstConnectDays: number | null;
    firstConnectedAt?: string | null;
    deviceLimit: number | null;
    onlineCount: number;
    resetPeriod: string;
  };
  appearance: {
    look: string;
    accentColor: string;
    shopName: string;
    supportLink: string;
    supportButtonText: string;
    channelLink: string;
    defaultLanguage: 'en' | 'fa';
  };
  subUrl?: string;
  newSubUrl?: string;
  xrayServers?: SubXrayServer[];
  protocolTabs: SubProtocolTab[];
  usageChart: TrafficSample[];
}

interface PreviewSettingsOverride {
  look?: string;
  accentColor?: string;
  shopName?: string;
  supportLink?: string;
  supportButtonText?: string;
  channelLink?: string;
  protocols?: { id: string; shown: boolean; tabName: string; guideNote: string }[];
}

interface WhenInfo {
  kind: 'pending' | 'dated' | 'forever';
  days: number;
  caption: string;
  ends: string;
}

interface SubViewModel {
  token: string;
  subPath: string;
  data: SubPayload;
  theme: SubThemeKey;
  mode: SubMode;
  locale: SubLocale;
  plat: SubPlatform;
  contacts: ParsedContact[];
  ended: boolean;
  reason: string;
  leftBytes: number;
  leftFrac: number;
  fig: { value: string; unit: string };
  when: WhenInfo;
  devicesText: string;
  onlineText: string;
  qrUrl: string;
  range: '7d' | '30d';
  setRange: (r: '7d' | '30d') => void;
  updatedAt: number;
  copiedKey: string | null;
  copyText: (text: string, key: string) => Promise<void>;
  toggleMode: () => void;
  toggleLocale: () => void;
  profileUrl: (inboundId: number) => string;
  importUrl: (inboundId: number) => string;
}

function getSubPathPrefix(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[0] : 'sub';
}

function normalizeProtoKey(id: string): string {
  const k = id.toLowerCase();
  if (k === 'amneziawg') return 'amnezia';
  return k;
}

function ContactGlyph({ kind }: { kind: ContactKind }) {
  switch (kind) {
    case 'telegram':
      return <Send aria-hidden="true" />;
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.2 20.8 4.7 16A9 9 0 1 1 8 19.3z" />
          <path
            transform="translate(6.6 6.4) scale(0.46)"
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'email':
      return <Mail aria-hidden="true" />;
    case 'phone':
      return <Phone aria-hidden="true" />;
    default:
      return <Globe aria-hidden="true" />;
  }
}

function ProtocolGlyph({ proto }: { proto: string }) {
  switch (normalizeProtoKey(proto)) {
    case 'wireguard':
    case 'openconnect':
      return <Network aria-hidden="true" />;
    case 'amnezia':
      return <Zap aria-hidden="true" />;
    default:
      return <ShieldCheck aria-hidden="true" />;
  }
}

function SubBrandBadge({ shopName, size = 28 }: { shopName: string; size?: number }) {
  const clean = shopName.trim();
  if (!clean || clean.toLowerCase() === 'xprotocol' || clean.toLowerCase() === 'ovira') {
    return <BrandMark size={size} />;
  }
  const ch = Array.from(clean)[0]?.toUpperCase() || 'X';
  return (
    <span className="sub-monogram" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {ch}
    </span>
  );
}

function LampMeter({ used, limit, lamps = 20, label }: { used: number; limit: number; lamps?: number; label: string }) {
  if (limit <= 0) {
    return (
      <span className="lamps lamps-lg lamps-unlimited" role="img" aria-label={label}>
        {Array.from({ length: lamps }, (_, i) => (
          <i key={i} className="on" />
        ))}
      </span>
    );
  }
  const frac = Math.max(0, Math.min(1, 1 - used / limit));
  const lit = frac * lamps;
  return (
    <span className="lamps lamps-lg" role="img" aria-label={label}>
      {Array.from({ length: lamps }, (_, i) => {
        const part = Math.max(0, Math.min(1, lit - i));
        const cls = part >= 1 ? 'on' : part > 0 ? 'part' : '';
        return <i key={i} className={cls} style={part > 0 && part < 1 ? ({ '--f': part } as React.CSSProperties) : undefined} />;
      })}
    </span>
  );
}

function CopyField({
  label,
  value,
  secret = false,
  copyKey,
  m,
}: {
  label: string;
  value: string;
  secret?: boolean;
  copyKey: string;
  m: SubViewModel;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const copy = SUB_COPY[m.locale];
  const isCopied = m.copiedKey === copyKey;
  return (
    <div className="copyfield">
      <span className="cf-label">{label}</span>
      <code className="cf-value" dir="ltr" onClick={() => setRevealed(true)}>
        {revealed ? value : '•'.repeat(Math.min(12, Math.max(6, value.length)))}
      </code>
      <button type="button" className="btn sm" onClick={() => m.copyText(value, copyKey)}>
        {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {isCopied ? copy.copied : copy.copy}
      </button>
    </div>
  );
}

function SubControls({ m }: { m: SubViewModel }) {
  return (
    <div className="row-gap">
      <button type="button" className="btn ghost sm" onClick={m.toggleLocale}>
        {m.locale === 'fa' ? 'English' : 'فارسی'}
      </button>
      <button type="button" className="btn ghost sm icon" aria-label="Toggle theme" onClick={m.toggleMode}>
        {m.mode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}

function SubContacts({ m, className = '' }: { m: SubViewModel; className?: string }) {
  const copy = SUB_COPY[m.locale];
  if (m.contacts.length === 0) return null;
  return (
    <ul className={`sub-contacts ${className}`}>
      {m.contacts.map((c) => {
        const kindName = copy.kinds[c.kind] || copy.kinds.web;
        const primary =
          c.role === 'support' && m.data.appearance.supportButtonText
            ? m.data.appearance.supportButtonText
            : c.handle || (c.role === 'channel' ? copy.channel : kindName);
        const subText = c.role === 'channel' ? `${copy.channel} · ${kindName}` : kindName;
        return (
          <li key={c.role}>
            <a className={`sub-contact k-${c.kind} r-${c.role}`} href={c.href} target="_blank" rel="noreferrer noopener">
              <span className="sub-contact-ico">
                <ContactGlyph kind={c.kind} />
              </span>
              <span className="sub-contact-text">
                <small>{subText}</small>
                <strong dir="auto">{primary}</strong>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SubAlertBanner({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  if (!m.ended) return null;
  const sup = m.contacts[0];
  return (
    <div className="sub-alert" role="alert">
      <strong>{m.reason}</strong>
      <span>{copy.renew}</span>
      {sup && (
        <a className="btn primary" href={sup.href} target="_blank" rel="noreferrer noopener">
          <ContactGlyph kind={sup.kind} />
          {sup.role === 'support' && m.data.appearance.supportButtonText
            ? m.data.appearance.supportButtonText
            : copy.support}
        </a>
      )}
    </div>
  );
}

function AppButton({ app, primary = false }: { app: SubAppItem; primary?: boolean }) {
  return (
    <a className={`btn${primary ? ' primary' : ''}`} href={app.url} target="_blank" rel="noreferrer noopener">
      <ExternalLink size={16} aria-hidden="true" />
      {app.name}
    </a>
  );
}

function InstallStep({ m, apps }: { m: SubViewModel; apps: SubProtocolTab['apps'] }) {
  const copy = SUB_COPY[m.locale];
  const recommended = apps[m.plat] || [];
  const others = PLAT_ORDER.filter((p) => p !== m.plat && (apps[p] || []).length > 0);
  if (recommended.length === 0 && others.length === 0) return null;

  const otherList = (
    <ul className="sub-oc-apps">
      {others.map((plat) => (
        <li key={plat}>
          <span className="sub-oc-plat">{PLAT_LABELS[plat]}</span>
          <span className="stores">
            {(apps[plat] || []).map((app) => (
              <AppButton key={app.url + app.name} app={app} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <li>
      <h3>{copy.install}</h3>
      <p className="muted">{copy.installLede}</p>
      {recommended.length > 0 && (
        <div className="stores">
          {recommended.map((app, idx) => (
            <AppButton key={app.url + app.name} app={app} primary={idx === 0} />
          ))}
        </div>
      )}
      {recommended.length === 0 ? (
        otherList
      ) : others.length > 0 ? (
        <details className="sub-oc-adv sub-more">
          <summary>{copy.otherDevices}</summary>
          {otherList}
        </details>
      ) : null}
    </li>
  );
}

function ProfileQrImage({ value, alt, size = 190 }: { value: string; alt: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) return null;
  return <img src={src} alt={alt} width={size} height={size} className="qr" />;
}

function ProtocolSteps({ m, tab }: { m: SubViewModel; tab: SubProtocolTab }) {
  const copy = SUB_COPY[m.locale];
  const proto = normalizeProtoKey(tab.id);
  const [openQrId, setOpenQrId] = useState<number | null>(null);
  const [openXrayQr, setOpenXrayQr] = useState<string | null>(null);

  if (proto === 'xray') {
    const subLink = m.data.subUrl || `${window.location.origin}/${m.subPath}/${m.token}`;
    const servers = tab.xrayServers || m.data.xrayServers || [];
    const subQrOpen = openXrayQr === '__sub__';
    return (
      <ol className="sub-steps">
        <InstallStep m={m} apps={tab.apps} />
        <li>
          <h3>{m.locale === 'fa' ? 'افزودن لینک اشتراک' : 'Import all configurations'}</h3>
          <p className="muted">
            {m.locale === 'fa'
              ? 'لینک اشتراک زیر را کپی کنید یا کد QR را در Happ / v2rayNG / Hiddify اسکن کنید تا تمام سرورها با هم اضافه شوند.'
              : 'Copy your subscription link or scan the QR code in Happ, v2rayNG, Hiddify or similar apps to import all servers at once.'}
          </p>
          <div className="sub-profile sub-oc-entry" style={{ marginBottom: 14 }}>
            <CopyField label={m.locale === 'fa' ? 'لینک اشتراک' : 'Subscription link'} value={subLink} copyKey="xray-sub" m={m} />
            <div className="row-gap">
              <a className="btn sm primary" href={`happ://add/${subLink}`}>
                <ExternalLink size={14} aria-hidden="true" />
                {m.locale === 'fa' ? 'افزودن در Happ' : 'Open in Happ'}
              </a>
              <button
                type="button"
                className="btn sm"
                aria-expanded={subQrOpen}
                onClick={() => setOpenXrayQr(subQrOpen ? null : '__sub__')}
              >
                <QrCode size={14} aria-hidden="true" />
                {subQrOpen ? (m.locale === 'fa' ? 'بستن QR' : 'Hide QR') : 'QR'}
              </button>
            </div>
            {subQrOpen && <ProfileQrImage value={subLink} alt="Xray subscription" size={200} />}
          </div>

          <ul className="sub-profiles">
            {servers.map((srv) => {
              const link = srv.links[0] || '';
              const isQrOpen = openXrayQr === srv.key;
              const isCopied = m.copiedKey === srv.key;
              return (
                <li key={srv.key} className="sub-profile sub-oc-entry">
                  <div>
                    <strong dir="auto">{srv.name}</strong>
                    <span className="muted small" dir="ltr">
                      {srv.protocol.toUpperCase()} · {srv.transport} · {srv.security} · :{srv.port}
                    </span>
                  </div>
                  <div className="row-gap">
                    <button
                      type="button"
                      className="btn sm"
                      aria-expanded={isQrOpen}
                      onClick={() => setOpenXrayQr(isQrOpen ? null : srv.key)}
                    >
                      <QrCode size={14} aria-hidden="true" />
                      QR
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => m.copyText(link, srv.key)}
                    >
                      {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                      {isCopied ? copy.copied : copy.copy}
                    </button>
                  </div>
                  {isQrOpen && link && <ProfileQrImage value={link} alt={srv.name} size={200} />}
                </li>
              );
            })}
          </ul>
        </li>
      </ol>
    );
  }

  if (proto === 'wireguard' || proto === 'amnezia') {
    return (
      <ol className="sub-steps">
        <InstallStep m={m} apps={tab.apps} />
        <li className="wg-section">
          <h3>{copy.addConfig}</h3>
          <p className="muted">{copy.wgHint}</p>
          <div className="wg-slot">
            <ul className="sub-profiles">
              {tab.profiles.map((p) => {
                const isQrOpen = openQrId === p.inboundId;
                const isCopied = m.copiedKey === `cfg-${p.inboundId}`;
                return (
                  <li key={p.inboundId} className="sub-profile sub-oc-entry">
                    <div>
                      <strong dir="auto">
                        {p.nodeName ? `${p.nodeName} · ` : ''}
                        {p.inboundName}
                      </strong>
                      {p.description && (
                        <span className="muted small" dir="auto">
                          {p.description}
                        </span>
                      )}
                    </div>
                    <div className="row-gap">
                      <a
                        className="btn sm"
                        dir="ltr"
                        href={m.profileUrl(p.inboundId)}
                        download={p.filename}
                        aria-label={copy.downloadConf}
                      >
                        <Download size={14} aria-hidden="true" />
                        .conf
                      </a>
                      <button
                        type="button"
                        className="btn sm"
                        aria-expanded={isQrOpen}
                        onClick={() => setOpenQrId(isQrOpen ? null : p.inboundId)}
                      >
                        <QrCode size={14} aria-hidden="true" />
                        QR
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => m.copyText(p.configText, `cfg-${p.inboundId}`)}
                      >
                        {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        {isCopied ? copy.copied : copy.copy}
                      </button>
                    </div>
                    {isQrOpen && <ProfileQrImage value={p.configText} alt={p.inboundName} size={220} />}
                  </li>
                );
              })}
            </ul>
          </div>
        </li>
      </ol>
    );
  }

  if (proto === 'openconnect') {
    const firstCreds = tab.profiles[0]?.connectInfo;
    return (
      <ol className="sub-steps">
        <InstallStep m={m} apps={tab.apps} />
        <li>
          <h3>{copy.addServer}</h3>
          <p className="muted">{copy.ocLede}</p>
          <ul className="sub-profiles">
            {tab.profiles.map((p) => {
              const addr = String(p.connectInfo?.connectUrl || p.connectInfo?.host || p.configText || '');
              const pin = p.connectInfo?.pin ? String(p.connectInfo.pin) : '';
              const isQrOpen = openQrId === p.inboundId;
              return (
                <li key={p.inboundId} className="sub-profile sub-oc-entry">
                  <div>
                    <strong>
                      {p.nodeName ? `${p.nodeName} · ` : ''}
                      {p.inboundName}
                    </strong>
                    {p.description && (
                      <span className="muted small" dir="auto">
                        {p.description}
                      </span>
                    )}
                  </div>
                  {addr && <CopyField label={copy.ocAddress} value={addr} copyKey={`oc-${p.inboundId}`} m={m} />}
                  <div className="row-gap">
                    <button
                      type="button"
                      className="btn sm"
                      aria-expanded={isQrOpen}
                      onClick={() => setOpenQrId(isQrOpen ? null : p.inboundId)}
                    >
                      <QrCode size={14} aria-hidden="true" />
                      {isQrOpen ? copy.ocHideQr : copy.ocShowQr}
                    </button>
                  </div>
                  {isQrOpen && addr && <ProfileQrImage value={addr} alt={p.inboundName} size={164} />}
                  {pin && (
                    <details className="sub-oc-adv">
                      <summary>{copy.ocAdvanced}</summary>
                      <p className="muted small">{copy.ocPinHelp}</p>
                      <CopyField label={copy.ocPin} value={pin} copyKey={`pin-${p.inboundId}`} m={m} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
        {firstCreds && (firstCreds.username || firstCreds.password) && (
          <li>
            <h3>{copy.step3}</h3>
            <p className="muted">{copy.step3Lede}</p>
            <div className="stack-sm creds">
              {firstCreds.username && (
                <CopyField label={copy.username} value={String(firstCreds.username)} copyKey="oc-user" m={m} />
              )}
              {firstCreds.password && (
                <CopyField label={copy.password} value={String(firstCreds.password)} secret copyKey="oc-pass" m={m} />
              )}
            </div>
            <p className="muted small">{copy.ocCisco}</p>
          </li>
        )}
      </ol>
    );
  }

  if (proto === 'ikev2' || proto === 'l2tp') {
    return (
      <ol className="sub-steps">
        <InstallStep m={m} apps={tab.apps} />
        <li>
          <h3>{copy.addServer}</h3>
          <ul className="sub-profiles">
            {tab.profiles.map((p) => (
              <li key={p.inboundId} className="sub-profile sub-oc-entry">
                <div>
                  <strong>
                    {p.nodeName ? `${p.nodeName} · ` : ''}
                    {p.inboundName}
                  </strong>
                  {p.description && (
                    <span className="muted small" dir="auto">
                      {p.description}
                    </span>
                  )}
                </div>
                {p.connectInfo?.host && (
                  <CopyField label={copy.ipsecHost} value={String(p.connectInfo.host)} copyKey={`ipsec-h-${p.inboundId}`} m={m} />
                )}
                {p.connectInfo?.serverId && (
                  <CopyField label={copy.ipsecServerId} value={String(p.connectInfo.serverId)} copyKey={`ipsec-id-${p.inboundId}`} m={m} />
                )}
                {p.connectInfo?.username && (
                  <CopyField label={copy.username} value={String(p.connectInfo.username)} copyKey={`ipsec-u-${p.inboundId}`} m={m} />
                )}
                {p.connectInfo?.password && (
                  <CopyField label={copy.password} value={String(p.connectInfo.password)} secret copyKey={`ipsec-p-${p.inboundId}`} m={m} />
                )}
                {p.connectInfo?.psk && (
                  <CopyField label={copy.ipsecPsk} value={String(p.connectInfo.psk)} secret copyKey={`ipsec-psk-${p.inboundId}`} m={m} />
                )}
                <div className="row-gap">
                  <a className="btn sm" href={m.profileUrl(p.inboundId)} download={p.filename}>
                    <Download size={14} aria-hidden="true" />
                    {copy.downloadProfile}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </li>
      </ol>
    );
  }

  // OpenVPN default flow
  const ovpnCreds = tab.profiles.find((p) => p.connectInfo?.username || p.connectInfo?.password)?.connectInfo;
  return (
    <ol className="sub-steps">
      <InstallStep m={m} apps={tab.apps} />
      <li>
        <h3>{copy.step2}</h3>
        <p className="muted">{copy.step2Lede}</p>
        <ul className="sub-profiles">
          {tab.profiles.map((p) => {
            const isQrOpen = openQrId === p.inboundId;
            return (
              <li key={p.inboundId} className="sub-profile">
                <div>
                  <strong>
                    {p.nodeName ? `${p.nodeName} · ` : ''}
                    {p.inboundName}{' '}
                    {p.connectInfo?.port ? (
                      <span className="faint num">
                        {String(p.connectInfo.proto || 'UDP').toUpperCase()} {p.connectInfo.port}
                      </span>
                    ) : null}
                  </strong>
                  {p.description && (
                    <span className="muted small sub-p-meta">
                      <span dir="auto">{p.description}</span>
                    </span>
                  )}
                </div>
                <div className="row-gap">
                  {m.plat !== 'desktop' && (
                    <a className="btn primary sm" href={m.importUrl(p.inboundId)}>
                      {copy.importOvpn}
                    </a>
                  )}
                  <a className="btn sm" href={m.profileUrl(p.inboundId)} download={p.filename}>
                    <Download size={14} aria-hidden="true" />
                    {copy.downloadProfile}
                  </a>
                  <button
                    type="button"
                    className="btn sm"
                    aria-expanded={isQrOpen}
                    onClick={() => setOpenQrId(isQrOpen ? null : p.inboundId)}
                  >
                    <QrCode size={14} aria-hidden="true" />
                    QR
                  </button>
                </div>
                {isQrOpen && (
                  <div style={{ flexBasis: '100%' }}>
                    <ProfileQrImage value={p.configText || m.profileUrl(p.inboundId)} alt={p.inboundName} size={180} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </li>
      {ovpnCreds && (ovpnCreds.username || ovpnCreds.password) && (
        <li>
          <h3>{copy.step3}</h3>
          <p className="muted">{copy.step3Lede}</p>
          <div className="stack-sm creds">
            {ovpnCreds.username && <CopyField label={copy.username} value={String(ovpnCreds.username)} copyKey="ovpn-user" m={m} />}
            {ovpnCreds.password && <CopyField label={copy.password} value={String(ovpnCreds.password)} secret copyKey="ovpn-pass" m={m} />}
          </div>
        </li>
      )}
    </ol>
  );
}

function SubConnect({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const uid = useId();
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const tabs = m.data.protocolTabs;
  const [selectedId, setSelectedId] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    return hash || '';
  });

  const activeTab = tabs.find((t) => t.id === selectedId) || tabs[0];
  useSlidingIndicator(tabsRef, '[aria-selected="true"]', activeTab?.id);

  useEffect(() => {
    const el = tabsRef.current;
    const selected = el?.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (!el || !selected) return;
    const first = !mountedRef.current;
    mountedRef.current = true;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    const raw = selected.offsetLeft - (el.clientWidth - selected.offsetWidth) / 2;
    const target = isRtl ? Math.max(-maxScroll, Math.min(0, raw)) : Math.max(0, Math.min(maxScroll, raw));
    const reduceMotion = first || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeTab?.id]);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const updateFade = () => {
      const max = el.scrollWidth - el.clientWidth;
      const isRtl = getComputedStyle(el).direction === 'rtl';
      const cur = el.scrollLeft;
      const showLeft = max > 1 && (isRtl ? cur > 1 - max : cur > 1);
      const showRight = max > 1 && (isRtl ? cur < -1 : cur < max - 1);
      el.style.setProperty('--fade-l', showLeft ? '32px' : '0px');
      el.style.setProperty('--fade-r', showRight ? '32px' : '0px');
    };
    updateFade();
    el.addEventListener('scroll', updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateFade);
      ro.disconnect();
    };
  }, [tabs.length]);

  if (!activeTab) {
    return <p className="sub-empty muted">{copy.noProtocols}</p>;
  }

  const label = activeTab.tabName || SUB_PROTO_LABELS[normalizeProtoKey(activeTab.id)] || activeTab.id;

  const content = (
    <>
      {activeTab.guideNote && (
        <div className="sub-note">
          <Info aria-hidden="true" />
          <p dir="auto">{activeTab.guideNote}</p>
        </div>
      )}
      <ProtocolSteps m={m} tab={activeTab} />
    </>
  );

  if (tabs.length === 1) {
    return (
      <div className="sub-proto">
        <section className="sub-tabpanel single" aria-labelledby={`${uid}-tab-${activeTab.id}`}>
          <h3 className="sub-proto-title" id={`${uid}-tab-${activeTab.id}`} dir="auto">
            {label}
          </h3>
          {content}
        </section>
      </div>
    );
  }

  return (
    <div className="sub-proto">
      <div className="sub-tabs" role="tablist" aria-label={copy.connect} ref={tabsRef}>
        {tabs.map((pt) => {
          const isSelected = pt.id === activeTab.id;
          const ptLabel = pt.tabName || SUB_PROTO_LABELS[normalizeProtoKey(pt.id)] || pt.id;
          return (
            <button
              key={pt.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${pt.id}`}
              className="sub-tab"
              aria-selected={isSelected}
              aria-controls={`${uid}-panel-${pt.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedId(pt.id)}
            >
              <ProtocolGlyph proto={pt.id} />
              <span className="sub-tab-label" dir="auto">
                {ptLabel}
              </span>
              {pt.profiles.length > 1 && (
                <span className="sub-tab-n num" aria-hidden="true">
                  {fmtNum(pt.profiles.length, m.locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        key={activeTab.id}
        className="sub-tabpanel"
        role="tabpanel"
        id={`${uid}-panel-${activeTab.id}`}
        aria-labelledby={`${uid}-tab-${activeTab.id}`}
        tabIndex={0}
      >
        {content}
      </div>
    </div>
  );
}

function SubUsage({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const segRef = useRef<HTMLDivElement | null>(null);
  useSlidingIndicator(segRef, '[aria-pressed="true"]', m.range);
  const samples = m.data.usageChart || [];
  const sliced = m.range === '7d' ? samples.slice(-7) : samples;

  return (
    <>
      <div className="sub-section-head">
        <h2>{copy.usage}</h2>
        <div className="segmented" role="group" aria-label={copy.usage} ref={segRef}>
          <button type="button" aria-pressed={m.range === '7d'} onClick={() => m.setRange('7d')}>
            {copy.range7d}
          </button>
          <button type="button" aria-pressed={m.range === '30d'} onClick={() => m.setRange('30d')}>
            {copy.range30d}
          </button>
        </div>
      </div>
      <TrafficChart data={sliced} height={200} daily />
      <div className="sub-usage-foot">
        <span className="legend">
          <span>
            <i className="sw down" />
            {copy.downloadLabel}
          </span>
          <span>
            <i className="sw up" />
            {copy.uploadLabel}
          </span>
        </span>
        <span className="num muted small">
          ↓ {formatBytes(m.data.client.downloadBytes, m.locale)} · ↑ {formatBytes(m.data.client.uploadBytes, m.locale)}
        </span>
      </div>
    </>
  );
}

function SubQrCard({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const isCopied = m.copiedKey === 'page-link';
  return (
    <>
      {m.qrUrl && <img src={m.qrUrl} alt="QR" width={164} height={164} className="qr" />}
      <div className="stack-sm">
        <h2>{copy.otherDevice}</h2>
        <p className="muted">{copy.otherLede}</p>
        <div>
          <button type="button" className="btn sm" onClick={() => m.copyText(window.location.href, 'page-link')}>
            {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {isCopied ? copy.copied : copy.copyLink}
          </button>
        </div>
      </div>
    </>
  );
}

/* ======================== THEME LAYOUTS ======================== */

function NightView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;

  return (
    <div className={`sub sub-night${m.ended ? ' sub-ended' : ''}`}>
      <header className="sub-bar">
        <span className="brand-sm">
          <SubBrandBadge shopName={shopName} size={26} />
          <span>{shopName}</span>
        </span>
        <SubControls m={m} />
      </header>

      <section className="sub-hero">
        <div className="sub-hero-top">
          <h1 dir="ltr">{client.name}</h1>
          <span className={`sub-online${client.onlineCount > 0 ? ' on' : ''}`}>
            <i aria-hidden="true" />
            {m.onlineText}
          </span>
        </div>

        <div className="sub-figures">
          <div className="sub-traffic">
            <p className="sub-big">
              <span className="num">
                <Odometer value={m.fig.value} />
              </span>
              <span className="sub-unit">{m.fig.unit}</span>
            </p>
            <p className="sub-caption">{unlimited ? copy.unlimited : copy.left}</p>
            <LampMeter
              used={client.trafficUsedBytes}
              limit={client.trafficLimitBytes || 0}
              lamps={20}
              label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}
            />
            <p className="muted num">
              {unlimited
                ? fmtSub(copy.usedOnly, { used: formatBytes(client.trafficUsedBytes, m.locale) })
                : fmtSub(copy.usedOf, {
                    used: formatBytes(client.trafficUsedBytes, m.locale),
                    total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                  })}
            </p>
          </div>

          <div className="sub-time">
            {m.when.kind === 'forever' ? (
              <p className="sub-big">∞</p>
            ) : (
              <p className="sub-big">
                <span className="num">
                  <Odometer value={fmtNum(m.when.days, m.locale)} />
                </span>
                <span className="sub-unit">{copy.days}</span>
              </p>
            )}
            <p className="sub-caption">{m.when.caption}</p>
            {m.when.ends && <p className="muted">{m.when.ends}</p>}
            {m.devicesText && <p className="muted small">{m.devicesText}</p>}
          </div>
        </div>

        <SubAlertBanner m={m} />
      </section>

      <section className="sub-section">
        <h2>{copy.connect}</h2>
        <SubConnect m={m} />
      </section>

      <section className="sub-section">
        <SubUsage m={m} />
      </section>

      <section className="sub-section sub-qr">
        <SubQrCard m={m} />
      </section>

      <footer className="sub-foot">
        <span className="brand-name">{shopName}</span>
        <SubContacts m={m} />
        <span className="faint small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

function AuroraView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;
  const gradId = useId();

  return (
    <div className={`sub sub-aurora${m.ended ? ' sub-ended' : ''}`}>
      <div className="au-glow" aria-hidden="true">
        <i className="a" />
        <i className="b" />
        <i className="c" />
      </div>

      <header className="au-bar">
        <span className="au-brand">
          <SubBrandBadge shopName={shopName} size={30} />
          <span>{shopName}</span>
        </span>
        <SubControls m={m} />
      </header>

      <main className="au-main">
        <section className="au-card au-hero">
          <div className="au-head">
            <p className="au-kicker">{copy.kicker}</p>
            <h1 dir="ltr">{client.name}</h1>
            <span className={`au-pill${client.onlineCount > 0 ? ' on' : ''}`}>
              <i aria-hidden="true" />
              {m.onlineText}
            </span>
          </div>

          <div className="au-gauge">
            <svg viewBox="0 0 120 120" role="img" aria-label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--accent)" />
                  <stop offset="1" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
              <circle className="au-track" cx="60" cy="60" r="52" />
              {m.leftFrac > 0 && (
                <circle
                  className="au-arc"
                  cx="60"
                  cy="60"
                  r="52"
                  pathLength={1}
                  stroke={`url(#${gradId})`}
                  style={{ '--left': m.leftFrac } as React.CSSProperties}
                />
              )}
            </svg>
            <div className="au-gauge-in" aria-hidden="true">
              <p className="au-fig num">
                <Odometer value={m.fig.value} />
                <span className="au-unit">{m.fig.unit}</span>
              </p>
              <p className="au-fig-cap">{unlimited ? copy.unlimited : copy.left}</p>
            </div>
          </div>

          <div className="au-stats">
            <div className="au-stat">
              <p className="au-stat-n num">
                {m.when.kind === 'forever' ? '∞' : <Odometer value={fmtNum(m.when.days, m.locale)} />}
                {m.when.kind !== 'forever' && <small>{copy.days}</small>}
              </p>
              <p className="au-stat-cap">{m.when.caption}</p>
              {m.when.ends && <p className="au-stat-sub">{m.when.ends}</p>}
            </div>
            <div className="au-stat">
              <p className="au-stat-sub num">
                {unlimited
                  ? fmtSub(copy.usedOnly, { used: formatBytes(client.trafficUsedBytes, m.locale) })
                  : fmtSub(copy.usedOf, {
                      used: formatBytes(client.trafficUsedBytes, m.locale),
                      total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                    })}
              </p>
              {m.devicesText && <p className="au-stat-sub">{m.devicesText}</p>}
            </div>
          </div>
        </section>

        <SubAlertBanner m={m} />

        <section className="au-card au-connect">
          <h2>{copy.connect}</h2>
          <SubConnect m={m} />
        </section>

        <section className="au-card au-usage">
          <SubUsage m={m} />
        </section>

        <div className="au-pair">
          <section className="au-card sub-qr">
            <SubQrCard m={m} />
          </section>
          {m.contacts.length > 0 && (
            <section className="au-card au-help">
              <h2>{copy.needHelp}</h2>
              <SubContacts m={m} />
            </section>
          )}
        </div>
      </main>

      <footer className="au-foot">
        <span className="au-shop">{shopName}</span>
        <span className="faint small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

function PopBurst() {
  const pts = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const r = i % 2 ? 41 : 49;
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="pk-burst-art" viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={pts} />
    </svg>
  );
}

function PopView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const tapeText = appearance.shopName.trim() || client.name;
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;

  return (
    <div className={`sub sub-pop${m.ended ? ' sub-ended' : ''}`}>
      <div className="pk-tape" aria-hidden="true">
        <div className="pk-tape-track">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i}>★ {tapeText}</span>
          ))}
        </div>
      </div>

      <header className="pk-top">
        <span className="pk-logo">
          <SubBrandBadge shopName={shopName} size={40} />
          <b>{shopName}</b>
        </span>
        <SubControls m={m} />
      </header>

      <main className="pk-grid">
        <section className="pk-card pk-hello">
          <p className="pk-hey">{copy.hey},</p>
          <h1 dir="ltr">{client.name}</h1>
          <span className={`pk-pill${client.onlineCount > 0 ? ' on' : ''}`}>
            <i aria-hidden="true" />
            {m.onlineText}
          </span>
        </section>

        <section className="pk-card pk-traffic">
          <p className="pk-label">{unlimited ? copy.unlimited : copy.figTraffic}</p>
          <p className="pk-big num">
            <Odometer value={m.fig.value} />
            <span className="pk-unit">{m.fig.unit}</span>
          </p>
          <div className="pk-bar" role="img" aria-label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}>
            <span style={{ '--w': `${m.leftFrac * 100}%` } as React.CSSProperties} />
          </div>
          <p className="pk-sub num">
            {unlimited
              ? fmtSub(copy.usedOnly, { used: formatBytes(client.trafficUsedBytes, m.locale) })
              : fmtSub(copy.usedOf, {
                  used: formatBytes(client.trafficUsedBytes, m.locale),
                  total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                })}
          </p>
        </section>

        <section className="pk-card pk-days">
          <div className="pk-burst">
            <PopBurst />
            <p>
              <strong className="num">{m.when.kind === 'forever' ? '∞' : <Odometer value={fmtNum(m.when.days, m.locale)} />}</strong>
              {m.when.kind !== 'forever' && <small>{copy.days}</small>}
            </p>
          </div>
          <p className="pk-cap">{m.when.caption}</p>
          {m.when.ends && <p className="pk-sub">{m.when.ends}</p>}
          {m.devicesText && <p className="pk-sub">{m.devicesText}</p>}
        </section>

        {m.ended && (
          <div className="pk-wide">
            <SubAlertBanner m={m} />
          </div>
        )}

        <section className="pk-card pk-connect">
          <h2>{copy.connect}</h2>
          <SubConnect m={m} />
        </section>

        <section className="pk-card pk-usage">
          <SubUsage m={m} />
        </section>

        <section className="pk-card pk-qr">
          <SubQrCard m={m} />
          <span className="pk-sticker" aria-hidden="true">
            {copy.scanMe}
          </span>
        </section>

        {m.contacts.length > 0 && (
          <section className="pk-card pk-help">
            <h2>{copy.needHelp}</h2>
            <SubContacts m={m} />
          </section>
        )}
      </main>

      <footer className="pk-foot">
        <b>{shopName}</b>
        <span className="small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

function TicketView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;
  const usedFrac = unlimited ? 0.5 : 1 - m.leftFrac;

  const stampText =
    client.status === 'disabled'
      ? copy.statusDisabled
      : client.status === 'expired'
        ? copy.statusExpired
        : client.status === 'limited'
          ? copy.statusLimited
          : client.status === 'pending'
            ? copy.statusPending
            : copy.statusActive;

  return (
    <div className={`sub sub-kit sub-ticket${m.ended ? ' sub-ended' : ''}`}>
      <header className="tk-bar">
        <span className="tk-brand">
          <SubBrandBadge shopName={shopName} size={30} />
          <span>{shopName}</span>
        </span>
        <SubControls m={m} />
      </header>

      <main className="tk-main">
        <section className="tk-pass">
          <div className="tk-body">
            <div className="tk-top">
              <span className="tk-label">{copy.tkPass}</span>
              <span className={`tk-pill${client.onlineCount > 0 ? ' on' : ''}`}>
                <i aria-hidden="true" />
                {m.onlineText}
              </span>
            </div>

            <div className="tk-holder">
              <p className="tk-label">{copy.tkHolder}</p>
              <h1 dir="ltr">{client.name}</h1>
            </div>

            <div className="tk-flight">
              <p className="tk-label">{unlimited ? copy.unlimited : copy.figTraffic}</p>
              <p className="tk-big num">
                <Odometer value={m.fig.value} />
                <span className="tk-unit">{m.fig.unit}</span>
              </p>
              <div
                className="tk-path"
                role="img"
                aria-label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}
                style={{ '--p': usedFrac } as React.CSSProperties}
              >
                <i className="tk-done" aria-hidden="true" />
                <span className="tk-plane" aria-hidden="true">
                  <Plane />
                </span>
              </div>
            </div>

            <dl className="tk-fields">
              <div>
                <dt className="tk-label">{copy.tkTraffic}</dt>
                <dd className="num">
                  {unlimited
                    ? fmtSub(copy.usedOnly, { used: formatBytes(client.trafficUsedBytes, m.locale) })
                    : fmtSub(copy.usedOf, {
                        used: formatBytes(client.trafficUsedBytes, m.locale),
                        total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                      })}
                </dd>
              </div>
              <div>
                <dt className="tk-label">{copy.tkValid}</dt>
                <dd>{m.when.ends || m.when.caption}</dd>
              </div>
              {m.devicesText && (
                <div>
                  <dt className="tk-label">{copy.tkDevices}</dt>
                  <dd>{m.devicesText}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="tk-stub">
            <div className="tk-days">
              <p className="tk-label">{copy.tkValid}</p>
              <p className="tk-days-n num">
                {m.when.kind === 'forever' ? '∞' : <Odometer value={fmtNum(m.when.days, m.locale)} />}
                {m.when.kind !== 'forever' && <small>{copy.days}</small>}
              </p>
              <p className="tk-days-cap">{m.when.caption}</p>
            </div>
            <span className="tk-stamp">{stampText}</span>
            <i className="tk-barcode" aria-hidden="true" />
          </div>
        </section>

        <SubAlertBanner m={m} />

        <section className="tk-card tk-connect">
          <h2>{copy.connect}</h2>
          <SubConnect m={m} />
        </section>

        <section className="tk-card tk-usage">
          <SubUsage m={m} />
        </section>

        <div className="tk-pair">
          <section className="tk-card sub-qr">
            <SubQrCard m={m} />
          </section>
          {m.contacts.length > 0 && (
            <section className="tk-card tk-help">
              <h2>{copy.needHelp}</h2>
              <SubContacts m={m} />
            </section>
          )}
        </div>
      </main>

      <footer className="tk-foot">
        <span className="tk-shop">{shopName}</span>
        <span className="small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

function OrbitView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;
  const gradId = useId();
  const pct = unlimited ? '∞' : `${fmtNum(Math.round(m.leftFrac * 100), m.locale)}${m.locale === 'fa' ? '٪' : '%'}`;

  return (
    <div className={`sub sub-kit sub-orbit${m.ended ? ' sub-ended' : ''}`}>
      <div className="ob-sky" aria-hidden="true">
        <i className="ob-stars a" />
        <i className="ob-stars b" />
        <i className="ob-nebula" />
        <i className="ob-planet" />
      </div>

      <header className="ob-bar">
        <span className="ob-brand">
          <SubBrandBadge shopName={shopName} size={30} />
          <span>{shopName}</span>
        </span>
        <SubControls m={m} />
      </header>

      <main className="ob-main">
        <section className="ob-card ob-hero">
          <div className="ob-head">
            <p className="ob-kicker">{copy.kicker}</p>
            <h1 dir="ltr">{client.name}</h1>
            <span className={`ob-pill${client.onlineCount > 0 ? ' on' : ''}`}>
              <i aria-hidden="true" />
              {m.onlineText}
            </span>
          </div>

          <div className="ob-system" style={{ '--left': m.leftFrac } as React.CSSProperties}>
            <svg viewBox="0 0 140 140" role="img" aria-label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--accent)" />
                  <stop offset="1" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
              <circle className="ob-far" cx="70" cy="70" r="66" />
              <circle className="ob-track" cx="70" cy="70" r="54" />
              {m.leftFrac > 0 && <circle className="ob-arc" cx="70" cy="70" r="54" pathLength={1} stroke={`url(#${gradId})`} />}
            </svg>
            <span className="ob-moon" aria-hidden="true">
              <i />
            </span>
            {m.leftFrac > 0 && (
              <span className="ob-sat" aria-hidden="true">
                <i />
              </span>
            )}
            <div className="ob-core" aria-hidden="true">
              <p className="ob-fig num">
                <Odometer value={m.fig.value} />
                <span className="ob-unit">{m.fig.unit}</span>
              </p>
              <p className="ob-fig-cap">{unlimited ? copy.unlimited : copy.left}</p>
            </div>
          </div>

          <div className="ob-stats">
            <div className="ob-stat">
              <p className="ob-stat-n num">
                {m.when.kind === 'forever' ? '∞' : <Odometer value={fmtNum(m.when.days, m.locale)} />}
                {m.when.kind !== 'forever' && <small>{copy.days}</small>}
              </p>
              <p className="ob-stat-cap">{m.when.caption}</p>
              {m.when.ends && <p className="ob-stat-sub">{m.when.ends}</p>}
            </div>
            <div className="ob-stat">
              <p className="ob-stat-n num">{pct}</p>
              <p className="ob-stat-cap">{unlimited ? copy.unlimited : copy.figTraffic}</p>
              <p className="ob-stat-sub num">
                {unlimited
                  ? fmtSub(copy.usedOnly, { used: formatBytes(client.trafficUsedBytes, m.locale) })
                  : fmtSub(copy.usedOf, {
                      used: formatBytes(client.trafficUsedBytes, m.locale),
                      total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                    })}
              </p>
              {m.devicesText && <p className="ob-stat-sub">{m.devicesText}</p>}
            </div>
          </div>
        </section>

        <SubAlertBanner m={m} />

        <section className="ob-card ob-connect">
          <h2>{copy.connect}</h2>
          <SubConnect m={m} />
        </section>

        <section className="ob-card ob-usage">
          <SubUsage m={m} />
        </section>

        <div className="ob-pair">
          <section className="ob-card sub-qr">
            <SubQrCard m={m} />
          </section>
          {m.contacts.length > 0 && (
            <section className="ob-card ob-help">
              <h2>{copy.needHelp}</h2>
              <SubContacts m={m} />
            </section>
          )}
        </div>
      </main>

      <footer className="ob-foot">
        <span className="ob-shop">{shopName}</span>
        <span className="small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

function MonoView({ m }: { m: SubViewModel }) {
  const copy = SUB_COPY[m.locale];
  const { client, appearance } = m.data;
  const shopName = appearance.shopName.trim() || 'XProtocol';
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;

  return (
    <div className={`sub sub-kit sub-mono${m.ended ? ' sub-ended' : ''}`}>
      <header className="mn-bar">
        <span className="mn-brand">
          <SubBrandBadge shopName={shopName} size={26} />
          <span>{shopName}</span>
        </span>
        <SubControls m={m} />
      </header>

      <main className="mn-main">
        <section className="mn-hero">
          <div className="mn-head">
            <p className="mn-kicker">{copy.kicker}</p>
            <h1 dir="ltr">{client.name}</h1>
            <span className={`mn-pill${client.onlineCount > 0 ? ' on' : ''}`}>
              <i aria-hidden="true" />
              {m.onlineText}
            </span>
          </div>

          <div className="mn-figure">
            <p className="mn-big num">
              <Odometer value={m.fig.value} />
              <span className="mn-unit">{m.fig.unit}</span>
            </p>
            <p className="mn-cap">{unlimited ? copy.unlimited : copy.figTraffic}</p>
          </div>

          <div
            className="mn-meter"
            role="img"
            aria-label={unlimited ? copy.unlimited : `${formatBytes(m.leftBytes, m.locale)} ${copy.left}`}
            style={{ '--w': m.leftFrac } as React.CSSProperties}
          >
            <i aria-hidden="true" />
          </div>

          <dl className="mn-facts">
            <div>
              <dt>{m.when.caption}</dt>
              <dd className="num">
                {m.when.kind === 'forever' ? '∞' : <Odometer value={fmtNum(m.when.days, m.locale)} />}
                {m.when.kind !== 'forever' && <small>{copy.days}</small>}
              </dd>
              {m.when.ends && <dd className="mn-fact-sub">{m.when.ends}</dd>}
            </div>
            <div>
              <dt>{copy.tkTraffic}</dt>
              <dd className="num">{formatBytes(client.trafficUsedBytes, m.locale)}</dd>
              <dd className="mn-fact-sub num">
                {unlimited
                  ? copy.unlimited
                  : fmtSub(copy.usedOf, {
                      used: formatBytes(client.trafficUsedBytes, m.locale),
                      total: formatBytes(client.trafficLimitBytes || 0, m.locale),
                    })}
              </dd>
            </div>
            {m.devicesText && client.deviceLimit ? (
              <div>
                <dt>{copy.tkDevices}</dt>
                <dd className="num">{fmtNum(client.deviceLimit, m.locale)}</dd>
                <dd className="mn-fact-sub">{m.devicesText}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <SubAlertBanner m={m} />

        <section className="mn-sec mn-connect">
          <h2>{copy.connect}</h2>
          <SubConnect m={m} />
        </section>

        <section className="mn-sec mn-usage">
          <SubUsage m={m} />
        </section>

        <section className="mn-sec mn-other">
          <div className="sub-qr">
            <SubQrCard m={m} />
          </div>
        </section>

        {m.contacts.length > 0 && (
          <section className="mn-sec mn-help">
            <h2>{copy.needHelp}</h2>
            <SubContacts m={m} />
          </section>
        )}
      </main>

      <footer className="mn-foot">
        <span className="mn-shop">{shopName}</span>
        <span className="small">
          {fmtSub(copy.updated, { time: new Date(m.updatedAt).toLocaleTimeString(m.locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </footer>
    </div>
  );
}

/* ======================== ROOT PAGE COMPONENT ======================== */

export function SubscriptionPage({ token }: { token: string }) {
  const { lang, setLang, resolvedTheme, setTheme, accent } = useUi();
  const [rawData, setRawData] = useState<SubPayload | null>(null);
  const [previewOverride, setPreviewOverride] = useState<PreviewSettingsOverride | null>(null);
  const [error, setError] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [range, setRange] = useState<'7d' | '30d'>('30d');
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const initializedLangRef = useRef(false);
  const subPath = useMemo(() => getSubPathPrefix(), []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'xp-preview' && e.data.settings) {
        setPreviewOverride(e.data.settings as PreviewSettingsOverride);
      }
    };
    window.addEventListener('message', onMsg);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'xp-preview-ready' }, window.location.origin);
    }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/${subPath}/${encodeURIComponent(token)}/data`, { cache: 'no-store' });
      if (!res.ok) {
        setError('not_found');
        return;
      }
      const json = (await res.json()) as SubPayload;
      setRawData(json);
      setUpdatedAt(Date.now());
      if (!initializedLangRef.current) {
        initializedLangRef.current = true;
        if (json.appearance?.defaultLanguage) {
          setLang(json.appearance.defaultLanguage);
        }
      }
    } catch {
      setError('not_found');
    }
  }, [subPath, token, setLang]);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    QRCode.toDataURL(window.location.href, { width: 164, margin: 1 })
      .then(setQrUrl)
      .catch(() => undefined);
  }, [token]);

  const data: SubPayload | null = useMemo(() => {
    if (!rawData) return null;
    if (!previewOverride) return rawData;
    return {
      ...rawData,
      appearance: {
        ...rawData.appearance,
        look: previewOverride.look ?? rawData.appearance.look,
        accentColor: previewOverride.accentColor !== undefined ? previewOverride.accentColor : rawData.appearance.accentColor,
        shopName: previewOverride.shopName ?? rawData.appearance.shopName,
        supportLink: previewOverride.supportLink ?? rawData.appearance.supportLink,
        supportButtonText: previewOverride.supportButtonText ?? rawData.appearance.supportButtonText,
        channelLink: previewOverride.channelLink ?? rawData.appearance.channelLink,
      },
      protocolTabs: previewOverride.protocols
        ? rawData.protocolTabs
            .filter((pt) => {
              const ov = previewOverride.protocols?.find((x) => x.id === pt.id);
              return ov ? ov.shown : true;
            })
            .map((pt) => {
              const ov = previewOverride.protocols?.find((x) => x.id === pt.id);
              return ov ? { ...pt, tabName: ov.tabName || pt.tabName, guideNote: ov.guideNote } : pt;
            })
        : rawData.protocolTabs,
    };
  }, [rawData, previewOverride]);

  const theme = normalizeSubTheme(data?.appearance.look);
  const mode: SubMode = resolvedTheme === 'light' ? 'light' : 'dark';
  const locale: SubLocale = lang === 'fa' ? 'fa' : 'en';

  useLayoutEffect(() => {
    if (!data) return;
    return applySubTheme(theme, data.appearance.accentColor || '', mode);
  }, [data, theme, data?.appearance.accentColor, mode, locale, accent]);

  useEffect(() => {
    if (!data) return;
    const shop = data.appearance.shopName.trim();
    document.title = shop ? `${shop} · ${data.client.name}` : data.client.name;
  }, [data]);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? null : cur));
      }, 1800);
    } catch {
      // Clipboard blocked in non-HTTPS contexts
    }
  }, []);

  const copy = SUB_COPY[locale];

  if (error) {
    return (
      <div className="sub-missing">
        <BrandMark size={40} />
        <p>{copy.notFound}</p>
      </div>
    );
  }

  if (!data) {
    return <EqLoader />;
  }

  const { client, appearance } = data;
  const unlimited = !client.trafficLimitBytes || client.trafficLimitBytes <= 0;
  const leftBytes = unlimited ? 0 : Math.max(0, (client.trafficLimitBytes || 0) - client.trafficUsedBytes);
  const leftFrac = unlimited ? 1 : Math.max(0, Math.min(1, 1 - client.trafficUsedBytes / (client.trafficLimitBytes || 1)));
  const fig = formatBytesParts(unlimited ? client.trafficUsedBytes : leftBytes, locale);

  const ended = client.status !== 'active' && client.status !== 'pending';
  const reason =
    client.status === 'expired'
      ? client.expiresAt
        ? fmtSub(copy.ended, { date: formatDateTime(client.expiresAt, locale) })
        : copy.endedSimple
      : client.status === 'limited'
        ? copy.usedUp
        : client.status === 'disabled'
          ? copy.disabled
          : '';

  const daysNum = client.expiresAt
    ? Math.max(0, Math.ceil((new Date(client.expiresAt).getTime() - Date.now()) / 86400000))
    : 0;
  const when: WhenInfo =
    client.status === 'pending' && client.firstConnectDays
      ? {
          kind: 'pending',
          days: client.firstConnectDays,
          caption: fmtSub(copy.pending, { n: fmtNum(client.firstConnectDays, locale) }),
          ends: '',
        }
      : client.expiresAt
        ? {
            kind: 'dated',
            days: daysNum,
            caption:
              daysNum > 1
                ? fmtSub(copy.daysLeft, { n: fmtNum(daysNum, locale) })
                : daysNum === 1
                  ? copy.lastDay
                  : copy.statusExpired,
            ends: fmtSub(copy.endsOn, { date: formatDateTime(client.expiresAt, locale) }),
          }
        : {
            kind: 'forever',
            days: 0,
            caption: copy.noEnd,
            ends: '',
          };

  const contacts: ParsedContact[] = [];
  const sup = parseContactLink(appearance.supportLink);
  if (sup) contacts.push({ role: 'support', ...sup });
  const ch = parseContactLink(appearance.channelLink);
  if (ch) contacts.push({ role: 'channel', ...ch });

  const model: SubViewModel = {
    token,
    subPath,
    data,
    theme,
    mode,
    locale,
    plat: detectPlatform(),
    contacts,
    ended,
    reason,
    leftBytes,
    leftFrac,
    fig,
    when,
    devicesText: client.deviceLimit ? fmtSub(copy.devices, { n: fmtNum(client.deviceLimit, locale) }) : '',
    onlineText:
      client.onlineCount > 1
        ? fmtSub(copy.online, { n: fmtNum(client.onlineCount, locale) })
        : client.onlineCount === 1
          ? copy.onlineOne
          : copy.offline,
    qrUrl,
    range,
    setRange,
    updatedAt,
    copiedKey,
    copyText,
    toggleMode: () => setTheme(mode === 'light' ? 'dark' : 'light'),
    toggleLocale: () => setLang(locale === 'fa' ? 'en' : 'fa'),
    profileUrl: (inboundId: number) => `${window.location.origin}/${subPath}/${encodeURIComponent(token)}/profile/${inboundId}`,
    importUrl: (inboundId: number) =>
      `openvpn://import-profile/${window.location.origin}/${subPath}/${encodeURIComponent(token)}/profile/${inboundId}`,
  };

  return theme === 'aurora' ? (
    <AuroraView m={model} />
  ) : theme === 'pop' ? (
    <PopView m={model} />
  ) : theme === 'ticket' ? (
    <TicketView m={model} />
  ) : theme === 'orbit' ? (
    <OrbitView m={model} />
  ) : theme === 'mono' ? (
    <MonoView m={model} />
  ) : (
    <NightView m={model} />
  );
}
