import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
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
  suggestedSlug: string;
}> = [
  {
    id: 'direct',
    titleEn: 'Direct connection',
    titleFa: 'اتصال مستقیم',
    descEn: 'The best choice for most servers. Nothing to enter: the port and the camouflage site are picked for you.',
    descFa: 'بهترین انتخاب برای اکثر سرورها. بدون نیاز به تنظیم دستی: پورت و سایت استتار خودکار انتخاب می‌شوند.',
    suggestedSlug: 'vless-raw',
  },
  {
    id: 'cdn',
    titleEn: 'Behind a CDN (Cloudflare)',
    titleFa: 'پشت CDN (کلادفلر)',
    descEn: 'Hide this server behind your own domain on Cloudflare. You need a domain.',
    descFa: 'سرور را پشت دامنه خودتان در کلادفلر مخفی کنید. نیاز به دامنه دارید.',
    suggestedSlug: 'vless-ws',
  },
  {
    id: 'relay',
    titleEn: 'Behind a relay or tunnel server',
    titleFa: 'پشت سرور واسط یا تانل',
    descEn: 'Clients reach you through a tunnel or relay, for example from Iran, with PROXY protocol so their real address is known.',
    descFa: 'کلاینت‌ها از طریق سرور واسط یا تانل متصل می‌شوند و با PROXY protocol آی‌پی واقعی مشخص است.',
    suggestedSlug: 'vless-relay',
  },
  {
    id: 'vmess-classic',
    titleEn: 'Classic VMess',
    titleFa: 'VMess کلاسیک',
    descEn: 'The older protocol every app understands. Nothing to enter.',
    descFa: 'پروتکل قدیمی که تمام برنامه‌ها پشتیبانی می‌کنند.',
    suggestedSlug: 'vmess-raw',
  },
  {
    id: 'trojan',
    titleEn: 'Trojan',
    titleFa: 'Trojan',
    descEn: 'Looks like an ordinary secure website. Nothing to enter.',
    descFa: 'شبیه یک وب‌سایت امن معمولی به نظر می‌رسد.',
    suggestedSlug: 'trojan-raw',
  },
  {
    id: 'shadowsocks',
    titleEn: 'Shadowsocks',
    titleFa: 'Shadowsocks',
    descEn: 'Simple and light, with a separate key for every client. Nothing to enter.',
    descFa: 'ساده و سبک، با کلید مجزا برای هر کاربر.',
    suggestedSlug: 'ss-raw',
  },
  {
    id: 'manual',
    titleEn: 'Manual (advanced)',
    titleFa: 'دستی (پیشرفته)',
    descEn: 'Start from a plain setup and choose every detail yourself.',
    descFa: 'شروع از یک تنظیمات خام و انتخاب تمام جزئیات به‌صورت دستی.',
    suggestedSlug: 'vless-raw',
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
  const showSettingsFields = Boolean(selectedNodeId) && !needsCdnDomain && !loadingDefaults;
  const canSubmit = showSettingsFields && !submitting;

  const suggestedName = !selectedNodeId
    ? 'xray-raw'
    : settings.protocol && settings.transport
      ? `${String(settings.protocol)}-${String(settings.transport)}`
      : activeTemplate.suggestedSlug;

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
    <div className="page xr-create">
      <PageHead
        title={L('New Xray inbound', 'اینباند Xray جدید')}
        sub={L(
          'Choose the server, start from a template if you like, and set everything the way you want. Keys, port and camouflage site are filled in for you.',
          'سرور را انتخاب کنید، از یک قالب شروع کنید و همه چیز را مطابق نیاز تنظیم کنید. کلیدها، پورت و سایت استتار به‌صورت خودکار پر می‌شوند.',
        )}
        actions={
          <Button variant="secondary" onClick={onBackOtherProtocols}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {L('Other protocols', 'سایر پروتکل‌ها')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Section 1: Server and template */}
      <section className="xr-canvas-section">
        <h2>
          <span className="xr-step-num">1</span>
          <span>{L('Server and template', 'سرور و قالب')}</span>
        </h2>

        <div className="xr-main-col">
          <div className="xr-row-3">
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

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-(--text-primary)">{L('Name', 'نام')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setDirty(true);
                }}
                placeholder={suggestedName}
                className="input text-sm"
              />
              <span className="block text-xs text-(--text-muted)">
                {L('Shown in the panel. Leave empty to use the suggested name.', 'نمایش در پنل. برای نام پیشنهادی خالی بگذارید.')}
              </span>
            </label>
          </div>

          {preset === 'cdn' && (
            <>
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
                  className="input font-mono text-sm"
                />
                <span className="block text-xs text-(--text-muted)">
                  {L(
                    'The domain you set up in Cloudflare, for example vpn.example.com.',
                    'دامنه‌ای که در کلادفلر تنظیم کرده‌اید، مثلاً vpn.example.com.',
                  )}
                </span>
              </label>

              <div className="xr-cf-guide">
                <strong className="text-(--text-primary)">
                  {L('How to set this up in Cloudflare', 'راهنمای تنظیم در کلادفلر')}
                </strong>
                <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
                  <li>{L('Add your domain to Cloudflare and use its name servers.', 'دامنه خود را به کلادفلر اضافه کرده و نیم‌سرورها را تنظیم کنید.')}</li>
                  <li>
                    {L(
                      `Under DNS, add an A record for ${cdnDomain.trim() || 'your domain'} that points to this server's IP, with the orange cloud (Proxied) on.`,
                      `در بخش DNS یک رکورد A برای ${cdnDomain.trim() || 'دامنه خود'} به آی‌پی این سرور با ابر نارنجی (Proxied) بسازید.`,
                    )}
                  </li>
                  <li>{L('Under SSL/TLS, choose the mode Full.', 'در بخش SSL/TLS حالت Full را انتخاب کنید.')}</li>
                  <li>{L('Under Network, make sure WebSockets is on.', 'در بخش Network مطمئن شوید WebSockets روشن است.')}</li>
                  <li>{L('Type the same domain in the field above and press Create.', 'همان دامنه را در فیلد بالا وارد کرده و دکمه Create را بزنید.')}</li>
                </ol>
                <strong className="text-xs text-(--text-primary)">
                  {L(
                    'Cloudflare only forwards a few ports (443, 8443, 2053, 2083, 2087, 2096). The port chosen here is one of them.',
                    'کلادفلر فقط پورت‌های محدودی (443، 8443، 2053، 2083، 2087، 2096) را فوروارد می‌کند. پورت انتخاب‌شده یکی از آن‌هاست.',
                  )}
                </strong>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Section 2: Settings */}
      <section className={`xr-canvas-section${showSettingsFields ? '' : ' xr-settings-row'}`}>
        <h2>
          <span className="xr-step-num">2</span>
          <span>{L('Settings', 'تنظیمات')}</span>
        </h2>

        <div className="xr-main-col">
          {!selectedNodeId ? (
            <p className="banner quiet">
              {L(
                'Choose a server first. The port and camouflage site are picked for that server.',
                'ابتدا یک سرور انتخاب کنید. پورت و سایت استتار متناسب با آن سرور انتخاب می‌شوند.',
              )}
            </p>
          ) : needsCdnDomain ? (
            <p className="banner quiet">
              {L('Enter your CDN domain first.', 'ابتدا دامنه CDN خود را وارد کنید.')}
            </p>
          ) : loadingDefaults ? (
            <p className="banner quiet">
              {L('Loading recommended defaults for this server...', 'در حال بارگذاری تنظیمات پیشنهادی سرور...')}
            </p>
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

          <div className="pt-1">
            <Button variant="primary" onClick={handleCreate} disabled={!canSubmit}>
              <Plus className="h-4 w-4" />
              {submitting ? L('Creating…', 'در حال ساخت…') : L('Create', 'ایجاد')}
            </Button>
          </div>
        </div>
      </section>

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
