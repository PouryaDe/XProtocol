import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import { useUi } from '../i18n/context';
import { Button, PageHead } from './UiPrimitives';
import { Modal } from './Modal';
import { XrayAdvancedSection, type XrayCombosResponse } from './XrayInboundEditor';

interface NodeOption {
  id: number;
  name: string;
  address: string;
  isLocal: boolean;
  status: string;
  enabled: boolean;
}

type PresetId = 'direct' | 'cdn' | 'relay' | 'vmess-classic' | 'trojan' | 'shadowsocks' | 'manual';

const TEMPLATES: Array<{
  id: PresetId;
  titleEn: string;
  titleFa: string;
  descEn: string;
  descFa: string;
}> = [
  {
    id: 'direct',
    titleEn: 'Direct connection',
    titleFa: 'اتصال مستقیم',
    descEn: 'The best choice for most servers. Nothing to enter: the port and the camouflage site are picked for you.',
    descFa: 'بهترین انتخاب برای اکثر سرورها. بدون نیاز به تنظیم دستی: پورت و سایت استتار خودکار انتخاب می‌شوند.',
  },
  {
    id: 'cdn',
    titleEn: 'Behind a CDN (Cloudflare)',
    titleFa: 'پشت CDN (کلادفلر)',
    descEn: 'Hide this server behind your own domain on Cloudflare. You need a domain.',
    descFa: 'سرور را پشت دامنه خودتان در کلادفلر مخفی کنید. نیاز به دامنه دارید.',
  },
  {
    id: 'relay',
    titleEn: 'Behind a relay or tunnel server',
    titleFa: 'پشت سرور واسط یا تانل',
    descEn: 'Clients reach you through a tunnel or relay, for example from Iran, with PROXY protocol so their real address is known.',
    descFa: 'کلاینت‌ها از طریق سرور واسط یا تانل متصل می‌شوند و با PROXY protocol آی‌پی واقعی مشخص است.',
  },
  {
    id: 'vmess-classic',
    titleEn: 'Classic VMess',
    titleFa: 'VMess کلاسیک',
    descEn: 'The older protocol every app understands. Nothing to enter.',
    descFa: 'پروتکل قدیمی که تمام برنامه‌ها پشتیبانی می‌کنند.',
  },
  {
    id: 'trojan',
    titleEn: 'Trojan',
    titleFa: 'Trojan',
    descEn: 'Looks like an ordinary secure website. Nothing to enter.',
    descFa: 'شبیه یک وب‌سایت امن معمولی به نظر می‌رسد.',
  },
  {
    id: 'shadowsocks',
    titleEn: 'Shadowsocks',
    titleFa: 'Shadowsocks',
    descEn: 'Simple and light, with a separate key for every client. Nothing to enter.',
    descFa: 'ساده و سبک، با کلید مجزا برای هر کاربر.',
  },
  {
    id: 'manual',
    titleEn: 'Manual (advanced)',
    titleFa: 'دستی (پیشرفته)',
    descEn: 'Start from a plain setup and choose every detail yourself.',
    descFa: 'شروع از یک تنظیمات خام و انتخاب تمام جزئیات به‌صورت دستی.',
  },
];

export function XrayWizard({ onBackOtherProtocols }: { onBackOtherProtocols: () => void }) {
  const { lang } = useUi();
  const L = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [combos, setCombos] = useState<XrayCombosResponse | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [preset, setPreset] = useState<PresetId>('direct');
  const [pendingPreset, setPendingPreset] = useState<PresetId | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [cdnDomain, setCdnDomain] = useState('');
  const [cfGuideOpen, setCfGuideOpen] = useState(false);

  const [port, setPort] = useState<number>(443);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [sniGrade, setSniGrade] = useState<string>('');
  const [sniMillis, setSniMillis] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ nodes: NodeOption[] }>('/nodes'),
      apiFetch<XrayCombosResponse>('/xray/combos'),
    ])
      .then(([nRes, cRes]) => {
        setNodes(nRes.nodes || []);
        setCombos(cRes);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const loadDefaultsFor = async (targetPreset: PresetId, nodeIdStr: string) => {
    const nid = Number(nodeIdStr || 0);
    if (!nid) return;
    setLoadingDefaults(true);
    setError('');
    try {
      const res = await apiFetch<{
        port: number;
        settings: Record<string, unknown>;
        sniGrade?: string;
        sniMillis?: number | null;
      }>(`/inbounds/defaults?kind=xray&preset=${targetPreset}&node=${nid}`);
      setPort(res.port || 443);
      let loaded = { ...(res.settings || {}) };
      if (targetPreset === 'cdn' && cdnDomain.trim()) {
        const cleanDom = cdnDomain.trim();
        const prevTls = loaded.tls && typeof loaded.tls === 'object' ? (loaded.tls as Record<string, unknown>) : {};
        loaded = {
          ...loaded,
          host: cleanDom,
          cdnDomain: cleanDom,
          behindCdn: true,
          tls: { ...prevTls, certHost: cleanDom, serverName: cleanDom, sni: cleanDom },
        };
      }
      setSettings(loaded);
      setSniGrade(res.sniGrade || '');
      setSniMillis(res.sniMillis ?? null);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingDefaults(false);
    }
  };

  useEffect(() => {
    if (selectedNodeId) {
      void loadDefaultsFor(preset, selectedNodeId);
    }
  }, [selectedNodeId]);

  // Sync CDN domain into settings live when on cdn template
  useEffect(() => {
    if (preset !== 'cdn' || !selectedNodeId) return;
    const cleanDom = cdnDomain.trim();
    if (!cleanDom) return;
    setSettings((prev) => {
      const prevTls = prev.tls && typeof prev.tls === 'object' ? (prev.tls as Record<string, unknown>) : {};
      return {
        ...prev,
        host: cleanDom,
        cdnDomain: cleanDom,
        behindCdn: true,
        tls: { ...prevTls, certHost: cleanDom, serverName: cleanDom, sni: cleanDom },
      };
    });
  }, [cdnDomain, preset, selectedNodeId]);

  const handleSelectPreset = (nextPreset: PresetId) => {
    if (nextPreset === preset) return;
    if (dirty && selectedNodeId) {
      setPendingPreset(nextPreset);
      return;
    }
    setPreset(nextPreset);
    if (selectedNodeId) {
      void loadDefaultsFor(nextPreset, selectedNodeId);
    }
  };

  const confirmSwitchPreset = () => {
    if (!pendingPreset) return;
    const target = pendingPreset;
    setPendingPreset(null);
    setPreset(target);
    if (selectedNodeId) {
      void loadDefaultsFor(target, selectedNodeId);
    }
  };

  const activeTemplate = TEMPLATES.find((t) => t.id === preset) || TEMPLATES[0];
  const needsCdnDomain = preset === 'cdn' && !cdnDomain.trim();
  const canSubmit = Boolean(selectedNodeId) && !needsCdnDomain && !loadingDefaults && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{ id: number; ids?: number[] }>('/inbounds', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'xray',
          preset,
          nodeId: Number(selectedNodeId),
          port,
          displayName: displayName.trim() || undefined,
          settings:
            preset === 'cdn' && cdnDomain.trim()
              ? {
                  ...settings,
                  cdnDomain: cdnDomain.trim(),
                  behindCdn: true,
                  host: String(settings.host || cdnDomain.trim()),
                }
              : settings,
        }),
      });
      navigate(`/inbounds/${res.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHead
        title={L('New Xray inbound', 'اینباند Xray جدید')}
        sub={L(
          'Choose the server, start from a template if you like, and set everything the way you want. Keys, port and camouflage site are filled in for you.',
          'سرور را انتخاب کنید، از یک قالب شروع کنید و همه چیز را مطابق نیاز تنظیم کنید. کلیدها، پورت و سایت استتار به‌صورت خودکار پر می‌شوند.',
        )}
        actions={
          <Button variant="secondary" size="sm" onClick={onBackOtherProtocols}>
            {L('Other protocols', 'سایر پروتکل‌ها')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="panel editor">
        {/* Section 1: Server and template */}
        <section className="ed-section">
          <div>
            <h2>{L('Server and template', 'سرور و قالب')}</h2>
            <p className="ed-lede">
              {L(
                'Pick which server runs this Xray inbound and which scenario to pre-fill from.',
                'سرور میزبان و قالب اولیه این اینباند را انتخاب کنید.',
              )}
            </p>
          </div>
          <div className="ed-fields">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-(--text-primary)">{L('Server', 'سرور')}</span>
              <select
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
                className="select text-sm"
              >
                <option value="">{L('Choose a server…', 'یک سرور انتخاب کنید…')}</option>
                {nodes.map((n) => (
                  <option key={n.id} value={String(n.id)}>
                    {n.isLocal ? L('This server', 'همین سرور') : `${n.name} (${n.address})`}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-(--text-muted)">
                {selectedNodeId
                  ? L('The server that runs this inbound.', 'سروری که این اینباند روی آن اجرا می‌شود.')
                  : L('Required: choose the server this inbound runs on.', 'الزامی: سروری که این اینباند روی آن اجرا می‌شود را انتخاب کنید.')}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-(--text-primary)">{L('Start from', 'شروع از')}</span>
              <select
                value={preset}
                onChange={(e) => handleSelectPreset(e.target.value as PresetId)}
                className="select text-sm"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {L(t.titleEn, t.titleFa)}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-(--text-muted)">
                {L(activeTemplate.descEn, activeTemplate.descFa)}
              </span>
            </label>

            {preset === 'cdn' && (
              <div className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-(--text-primary)">
                    {L('Your domain on the CDN', 'دامنه شما روی CDN')}
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={cdnDomain}
                    onChange={(e) => {
                      setCdnDomain(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="vpn.example.com"
                    className="input font-mono text-xs"
                  />
                  <span className="block text-xs text-(--text-muted)">
                    {L(
                      'The domain you set up in Cloudflare, for example vpn.example.com.',
                      'دامنه‌ای که در کلادفلر تنظیم کرده‌اید، مثلاً vpn.example.com.',
                    )}
                  </span>
                </label>

                <div>
                  <button
                    type="button"
                    onClick={() => setCfGuideOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-(--text-primary) hover:text-(--accent)"
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${cfGuideOpen ? 'rotate-90' : ''}`} />
                    <span>{L('How to set this up in Cloudflare', 'راهنمای تنظیم در کلادفلر')}</span>
                  </button>
                  {cfGuideOpen && (
                    <ol className="mt-2.5 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-(--text-muted)">
                      <li>
                        {L(
                          'Point your domain nameservers to Cloudflare and wait for DNS activation.',
                          'نیم‌سرورهای دامنه را روی کلادفلر تنظیم کنید.',
                        )}
                      </li>
                      <li>
                        {L(
                          'Create an A record (or subdomain such as vpn) pointing to this server IP with the orange proxy cloud enabled.',
                          'یک رکورد A به آی‌پی این سرور با ابر نارنجی (Proxied) بسازید.',
                        )}
                      </li>
                      <li>
                        {L(
                          'Under SSL/TLS -> Overview, choose Full or Full (strict). Never use Flexible.',
                          'در بخش SSL/TLS گزینه Full یا Full (strict) را انتخاب کنید.',
                        )}
                      </li>
                      <li>
                        {L(
                          'Under Network, make sure WebSockets is turned On.',
                          'در بخش Network مطمئن شوید WebSockets روشن است.',
                        )}
                      </li>
                      <li>
                        {L(
                          'Use a Cloudflare-proxied HTTPS port such as 443, 8443, 2053, 2083, 2087, or 2096.',
                          'از پورت‌های HTTPS کلادفلر مانند 443، 8443، 2053، 2083، 2087 یا 2096 استفاده کنید.',
                        )}
                      </li>
                      <li>
                        {L(
                          'Keep Proxy mode enabled only for traffic and test client connection after saving.',
                          'پس از ذخیره، اتصال کلاینت را آزمایش کنید.',
                        )}
                      </li>
                    </ol>
                  )}
                </div>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-(--text-primary)">{L('Name', 'نام')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setDirty(true);
                }}
                placeholder={L('Optional', 'اختیاری')}
                className="input text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Shown in the panel. Leave empty to use the suggested name.', 'نمایش در پنل. برای نام پیشنهادی خالی بگذارید.')}
              </span>
            </label>
          </div>
        </section>

        {/* Section 2: Settings */}
        <section className="ed-section">
          <div>
            <h2>{L('Settings', 'تنظیمات')}</h2>
            <p className="ed-lede">
              {L(
                'Every Xray transport, security, Reality SNI, connect address, socket and sniffing control.',
                'تمام تنظیمات پروتکل، انتقال، امنیت Reality/TLS، آدرس اتصال و سوکت.',
              )}
            </p>
          </div>
          <div className="ed-fields">
            {!selectedNodeId ? (
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 text-xs text-(--text-muted)">
                {L(
                  'Choose a server first. The port and camouflage site are picked for that server.',
                  'ابتدا یک سرور انتخاب کنید. پورت و سایت استتار متناسب با آن سرور انتخاب می‌شوند.',
                )}
              </div>
            ) : needsCdnDomain ? (
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 text-xs text-(--text-muted)">
                {L('Enter your CDN domain first.', 'ابتدا دامنه CDN خود را وارد کنید.')}
              </div>
            ) : loadingDefaults ? (
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 text-xs text-(--text-muted)">
                {L('Loading recommended defaults for this server...', 'در حال بارگذاری تنظیمات پیشنهادی سرور...')}
              </div>
            ) : (
              <XrayAdvancedSection
                settings={settings}
                onChange={(next) => {
                  setSettings(next);
                  setDirty(true);
                }}
                combos={combos}
                nodeId={Number(selectedNodeId)}
                port={port}
                onPortChange={(p) => {
                  setPort(p);
                  setDirty(true);
                }}
                sniGrade={sniGrade}
                sniMillis={sniMillis}
              />
            )}
          </div>
        </section>

        {/* Footer */}
        <div className="savebar">
          <span className="text-xs text-(--text-muted)">
            {!selectedNodeId
              ? L('Select a server to enable creation.', 'برای ساخت اینباند یک سرور انتخاب کنید.')
              : needsCdnDomain
                ? L('Enter a CDN domain to continue.', 'برای ادامه دامنه CDN را وارد کنید.')
                : L('Ready to create on the chosen server.', 'آماده ساخت روی سرور انتخاب‌شده.')}
          </span>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {submitting ? L('Creating…', 'در حال ساخت…') : L('Create', 'ایجاد')}
          </Button>
        </div>
      </div>

      <Modal
        open={pendingPreset !== null}
        onClose={() => setPendingPreset(null)}
        title={L('Start the form again?', 'فرم از نو پر شود؟')}
        subtitle={L(
          'The form is filled again from the new choice, and your changes to it are lost.',
          'با این کار فرم با مقادیر قالب جدید پر می‌شود و تغییرات فعلی از بین می‌روند.',
        )}
        size="sm"
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setPendingPreset(null)}>
            {L('Cancel', 'انصراف')}
          </Button>
          <Button onClick={confirmSwitchPreset}>{L('Start again', 'شروع مجدد')}</Button>
        </div>
      </Modal>
    </div>
  );
}
