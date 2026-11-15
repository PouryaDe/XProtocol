import React, { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Key, Plus, Search, Send, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { ACCENT_PALETTES, useUi, type AccentName } from '../i18n/context';
import { Button, Card, Input, Select, StatusPill } from '../components/UiPrimitives';
import { QrCode } from '../components/QrCode';
import type { CurrentAccount } from '../components/Layout';

type SettingsTab = 'general' | 'subscription' | 'panelAccess' | 'api' | 'myAccount' | 'backup' | 'audit';

const ACCENTS: AccentName[] = ['lime', 'cyan', 'mint', 'amber', 'coral', 'rose', 'violet', 'sky'];
const LOOKS = [
    { id: 'night_shift', mockClass: 'tc-night', name: 'Night shift', desc: 'Dark control room with glowing lamps' },
    { id: 'aurora', mockClass: 'tc-aurora', name: 'Aurora', desc: 'Soft colour glow & frosted-glass cards' },
    { id: 'pop', mockClass: 'tc-pop', name: 'Pop', desc: 'Playful cards with bold outlines' },
    { id: 'ticket', mockClass: 'tc-ticket', name: 'Ticket', desc: 'Clean paper boarding pass' },
    { id: 'orbit', mockClass: 'tc-orbit', name: 'Orbit', desc: 'Deep space with glowing accent ring' },
    { id: 'mono', mockClass: 'tc-mono', name: 'Mono', desc: 'Quiet editorial layout with crisp typography' },
] as const;

export function SettingsPage({ account }: { account: CurrentAccount }) {
    const { t, lang, setAccent, setBrandName, setSupportTelegram } = useUi();
    const [tab, setTab] = useState<SettingsTab>(account.isOwner ? 'general' : 'myAccount');
    const [notice, setNotice] = useState('');

    // General
    const [general, setGeneral] = useState({
        brandName: 'XProtocol',
        publicAddress: '127.0.0.1',
        subscriptionLinkAddress: '',
        supportTelegram: '',
        defaultSubLanguage: 'en',
        panelColor: 'mint' as AccentName,
        warnExpiresWithinDays: 5,
        warnTrafficPercent: 85,
        inactivityTimeoutHours: 72,
    });
    const [sysInfo, setSysInfo] = useState({ version: '1.0.4', platform: '', machineId: '' });

    // Telegram Backup
    const [tgBackup, setTgBackup] = useState({
        enabled: false,
        botToken: '',
        chatId: '',
        intervalHours: 24,
        proxyUrl: '',
        lastSentAt: null as string | null,
    });
    const [hasTgToken, setHasTgToken] = useState(false);
    const [foundChats, setFoundChats] = useState<{ chatId: string; title: string }[]>([]);
    const [tgBusy, setTgBusy] = useState(false);

    // Subscription page settings
    const [subSettings, setSubSettings] = useState<{
        look: string;
        accentColor: string;
        shopName: string;
        supportLink: string;
        supportButtonText: string;
        channelLink: string;
        protocols: { id: string; shown: boolean; tabName: string; guideNote: string; useRecommendedApps: boolean }[];
    } | null>(null);
    const [previewToken, setPreviewToken] = useState<string | null>(null);

    // Panel access
    const [panelAccess, setPanelAccess] = useState({
        port: 2053,
        bindAddress: '',
        subPort: '' as string | number,
        secretPath: '',
        subPath: 'sub',
        tlsCertFile: '',
        tlsKeyFile: '',
        trustProxy: false,
    });

    // API Tokens
    const [tokens, setTokens] = useState<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }[]>([]);
    const [newTokenName, setNewTokenName] = useState('');
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);

    // My Account (password, 2FA, sessions)
    const [curPass, setCurPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [sessions, setSessions] = useState<{ id: string; ip: string; userAgent: string; lastSeenAt: string; current: boolean }[]>([]);

    // Audit
    const [auditEntries, setAuditEntries] = useState<{ id: number; ts: string; username: string; action: string; target: string; ip: string }[]>([]);

    const flash = (msg: string) => {
        setNotice(msg);
        setTimeout(() => setNotice(''), 3000);
    };

    useEffect(() => {
        if (account.isOwner) {
            apiFetch<{ general: typeof general; system: typeof sysInfo }>('/settings/general')
                .then((r) => {
                    setGeneral({ ...r.general, supportTelegram: r.general.supportTelegram || '' });
                    setSysInfo(r.system);
                })
                .catch(() => undefined);
            apiFetch<{ telegram: typeof tgBackup; hasToken: boolean }>('/settings/telegram-backup')
                .then((r) => {
                    setTgBackup(r.telegram);
                    setHasTgToken(r.hasToken);
                })
                .catch(() => undefined);
            apiFetch<{ settings: typeof subSettings; previewToken: string | null }>('/settings/subscription-page')
                .then((r) => {
                    setSubSettings(r.settings);
                    setPreviewToken(r.previewToken);
                })
                .catch(() => undefined);
            apiFetch<{ panelAccess: typeof panelAccess }>('/settings/panel-access')
                .then((r) => setPanelAccess({ ...r.panelAccess, subPort: r.panelAccess.subPort ?? '' }))
                .catch(() => undefined);
            apiFetch<{ entries: typeof auditEntries }>('/settings/audit-log')
                .then((r) => setAuditEntries(r.entries))
                .catch(() => undefined);
        }
        apiFetch<{ tokens: typeof tokens }>('/settings/api-tokens').then((r) => setTokens(r.tokens)).catch(() => undefined);
        apiFetch<{ account: { totpEnabled: boolean }; sessions: typeof sessions }>('/auth/me')
            .then((r) => {
                setTotpEnabled(r.account.totpEnabled);
                setSessions(r.sessions);
            })
            .catch(() => undefined);
    }, [account.isOwner]);

    const availableTabs: { id: SettingsTab; label: string; show: boolean }[] = [
        { id: 'general', label: t.settings.tabs.general, show: account.isOwner },
        { id: 'subscription', label: t.settings.tabs.subscription, show: account.isOwner },
        { id: 'panelAccess', label: t.settings.tabs.panelAccess, show: account.isOwner },
        { id: 'api', label: t.settings.tabs.api, show: true },
        { id: 'myAccount', label: t.settings.tabs.myAccount, show: true },
        { id: 'backup', label: t.settings.tabs.backup, show: account.isOwner },
        { id: 'audit', label: t.settings.tabs.audit, show: account.isOwner || account.permissions.clients.view === 'all' },
    ];

    const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64Db = btoa(binary);
        const res = await apiFetch<{ message: string }>('/settings/backup/restore', {
            method: 'POST',
            body: JSON.stringify({ base64Db }),
        });
        flash(res.message);
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-bold text-(--text-primary)">{t.settings.title}</h1>
                {notice && <StatusPill tone="green" label={notice} />}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {availableTabs
                    .filter((x) => x.show)
                    .map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${tab === item.id
                                ? 'bg-(--accent) text-(--accent-fg)'
                                : 'bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) border border-(--border-subtle)'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
            </div>

            {tab === 'general' && (
                <Card className="space-y-5 p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Brand name"
                            value={general.brandName}
                            onChange={(e) => {
                                setGeneral({ ...general, brandName: e.target.value });
                                setBrandName(e.target.value);
                            }}
                        />
                        <Input
                            label="Public address (IP or domain)"
                            value={general.publicAddress}
                            onChange={(e) => setGeneral({ ...general, publicAddress: e.target.value })}
                        />
                        <Input
                            label="Subscription link address (optional)"
                            value={general.subscriptionLinkAddress}
                            onChange={(e) => setGeneral({ ...general, subscriptionLinkAddress: e.target.value })}
                            placeholder="https://sub.example.com"
                        />
                        <Input
                            label="Support Telegram (@handle or URL)"
                            value={general.supportTelegram}
                            onChange={(e) => {
                                setGeneral({ ...general, supportTelegram: e.target.value });
                                setSupportTelegram(e.target.value);
                            }}
                            placeholder="@xprotocol_support"
                        />
                        <Select
                            label="Default client page language"
                            value={general.defaultSubLanguage}
                            onChange={(e) => setGeneral({ ...general, defaultSubLanguage: e.target.value })}
                        >
                            <option value="en">English</option>
                            <option value="fa">فارسی (Persian)</option>
                        </Select>
                        <Input
                            label="Warn when plan ends within (days)"
                            type="number"
                            value={general.warnExpiresWithinDays}
                            onChange={(e) => setGeneral({ ...general, warnExpiresWithinDays: Number(e.target.value) })}
                        />
                        <Input
                            label="Warn when traffic reaches (%)"
                            type="number"
                            value={general.warnTrafficPercent}
                            onChange={(e) => setGeneral({ ...general, warnTrafficPercent: Number(e.target.value) })}
                        />
                    </div>

                    <div>
                        <div className="mb-2 text-xs font-medium text-(--text-secondary)">Panel accent colour</div>
                        <div className="flex flex-wrap gap-2">
                            {ACCENTS.map((c) => {
                                const swatch = ACCENT_PALETTES[c].dark.accent;
                                const active = general.panelColor === c;
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => {
                                            setGeneral({ ...general, panelColor: c });
                                            setAccent(c);
                                        }}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs capitalize transition ${active
                                            ? 'border-(--accent) bg-(--accent-soft) text-(--accent) font-semibold'
                                            : 'border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary) hover:border-(--border-default)'
                                            }`}
                                    >
                                        <span
                                            className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                                            style={{ background: swatch, boxShadow: active ? `0 0 10px ${swatch}` : undefined }}
                                        />
                                        {c}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border-subtle) pt-4 text-xs text-(--text-muted)">
                        <span>
                            Version: {sysInfo.version} · {sysInfo.platform} · Machine ID:{' '}
                            <code className="font-mono text-(--text-primary)">{sysInfo.machineId}</code>
                        </span>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await apiFetch('/settings/general', { method: 'PUT', body: JSON.stringify(general) });
                                flash('General settings saved.');
                            }}
                        >
                            {t.common.save}
                        </Button>
                    </div>
                </Card>
            )}

            {tab === 'subscription' && subSettings && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="space-y-4 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-(--text-primary)">Appearance & Look</h2>
                            {previewToken && (
                                <a
                                    href={`/sub/${previewToken}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Live preview
                                </a>
                            )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {LOOKS.map((l) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => setSubSettings({ ...subSettings, look: l.id })}
                                    className={`theme-card ${subSettings.look === l.id ? 'on' : ''}`}
                                >
                                    <span
                                        className={`tc-mock ${l.mockClass}`}
                                        style={{ '--mock': 'var(--accent)' } as React.CSSProperties}
                                        aria-hidden="true"
                                    >
                                        <b>24</b>
                                        <i />
                                        <i />
                                    </span>
                                    <div className="px-1 text-xs font-bold text-(--text-primary)">{l.name}</div>
                                    <div className="px-1 text-[11px] leading-snug text-(--text-muted)">{l.desc}</div>
                                </button>
                            ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                label="Shop / Brand name"
                                value={subSettings.shopName}
                                onChange={(e) => setSubSettings({ ...subSettings, shopName: e.target.value })}
                            />
                            <Input
                                label="Support link (t.me/..., https://..., tel:+98...)"
                                value={subSettings.supportLink}
                                onChange={(e) => setSubSettings({ ...subSettings, supportLink: e.target.value })}
                            />
                            <Input
                                label="Support button text"
                                value={subSettings.supportButtonText}
                                onChange={(e) => setSubSettings({ ...subSettings, supportButtonText: e.target.value })}
                            />
                            <Input
                                label="Channel link"
                                value={subSettings.channelLink}
                                onChange={(e) => setSubSettings({ ...subSettings, channelLink: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button
                                variant="primary"
                                onClick={async () => {
                                    await apiFetch('/settings/subscription-page', { method: 'PUT', body: JSON.stringify(subSettings) });
                                    flash('Subscription page settings saved.');
                                }}
                            >
                                {t.common.save}
                            </Button>
                        </div>
                    </Card>

                    <Card className="space-y-4 p-5">
                        <h2 className="text-sm font-semibold text-(--text-primary)">Protocol Tabs</h2>
                        {subSettings.protocols.map((p, idx) => (
                            <div
                                key={p.id}
                                className="space-y-2 rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3 text-xs"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold uppercase text-(--text-primary)">{p.id}</span>
                                    <label className="flex items-center gap-1.5">
                                        <input
                                            type="checkbox"
                                            checked={p.shown}
                                            onChange={(e) => {
                                                const next = [...subSettings.protocols];
                                                next[idx] = { ...p, shown: e.target.checked };
                                                setSubSettings({ ...subSettings, protocols: next });
                                            }}
                                        />
                                        <span>Shown</span>
                                    </label>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Input
                                        placeholder="Custom tab name"
                                        value={p.tabName}
                                        onChange={(e) => {
                                            const next = [...subSettings.protocols];
                                            next[idx] = { ...p, tabName: e.target.value };
                                            setSubSettings({ ...subSettings, protocols: next });
                                        }}
                                    />
                                    <Input
                                        placeholder="Guide note"
                                        value={p.guideNote}
                                        onChange={(e) => {
                                            const next = [...subSettings.protocols];
                                            next[idx] = { ...p, guideNote: e.target.value };
                                            setSubSettings({ ...subSettings, protocols: next });
                                        }}
                                    />
                                </div>
                            </div>
                        ))}

                        {previewToken && (
                            <div className="space-y-2 border-t border-(--border-subtle) pt-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-(--text-secondary)">Live Preview</span>
                                    <a
                                        href={`/sub/${previewToken}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Open in tab
                                    </a>
                                </div>
                                <iframe
                                    title="Subscription page live preview"
                                    src={`/sub/${previewToken}`}
                                    className="h-80 w-full rounded-xl border border-(--border-subtle) bg-(--bg-app)"
                                />
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {tab === 'panelAccess' && (
                <Card className="space-y-4 p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Panel port"
                            type="number"
                            value={panelAccess.port}
                            onChange={(e) => setPanelAccess({ ...panelAccess, port: Number(e.target.value) })}
                        />
                        <Input
                            label="Bind address (empty = all interfaces)"
                            value={panelAccess.bindAddress}
                            onChange={(e) => setPanelAccess({ ...panelAccess, bindAddress: e.target.value })}
                        />
                        <Input
                            label="Secret path (empty = root /)"
                            value={panelAccess.secretPath}
                            onChange={(e) => setPanelAccess({ ...panelAccess, secretPath: e.target.value })}
                            placeholder="/my-secret-panel"
                        />
                        <Input
                            label="Subscription path"
                            value={panelAccess.subPath}
                            onChange={(e) => setPanelAccess({ ...panelAccess, subPath: e.target.value })}
                        />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-(--text-primary)">
                        <input
                            type="checkbox"
                            checked={panelAccess.trustProxy}
                            onChange={(e) => setPanelAccess({ ...panelAccess, trustProxy: e.target.checked })}
                        />
                        <span>Behind a reverse proxy (trust X-Forwarded-For)</span>
                    </label>
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await apiFetch('/settings/panel-access', { method: 'PUT', body: JSON.stringify(panelAccess) });
                                flash('Saved. Restart panel process to apply port/path changes.');
                            }}
                        >
                            {t.common.save}
                        </Button>
                    </div>
                </Card>
            )}

            {tab === 'api' && (
                <Card className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-semibold text-(--text-primary)">API Tokens</h2>
                            <p className="text-xs text-(--text-muted)">
                                Base URL: <code className="font-mono">{window.location.origin}/api</code>
                            </p>
                        </div>
                        <a
                            href="./api/settings/openapi.json"
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-(--accent) hover:underline"
                        >
                            OpenAPI 3.0 Document →
                        </a>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            placeholder="Token name (e.g. Telegram shop bot)"
                            value={newTokenName}
                            onChange={(e) => setNewTokenName(e.target.value)}
                            className="max-w-xs"
                        />
                        <Button
                            variant="primary"
                            onClick={async () => {
                                if (!newTokenName.trim()) return;
                                const res = await apiFetch<{ secret: string }>('/settings/api-tokens', {
                                    method: 'POST',
                                    body: JSON.stringify({ name: newTokenName }),
                                });
                                setCreatedSecret(res.secret);
                                setNewTokenName('');
                                const list = await apiFetch<{ tokens: typeof tokens }>('/settings/api-tokens');
                                setTokens(list.tokens);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            Create token
                        </Button>
                    </div>

                    {createdSecret && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                            <div className="font-semibold text-emerald-400">Copy this secret now — it will not be shown again:</div>
                            <div className="mt-1 flex items-center gap-2">
                                <code className="font-mono text-(--text-primary)">{createdSecret}</code>
                                <Button size="sm" onClick={() => navigator.clipboard.writeText(createdSecret)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {tokens.map((tok) => (
                            <div
                                key={tok.id}
                                className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs"
                            >
                                <div className="flex items-center gap-2">
                                    <Key className="h-3.5 w-3.5 text-(--accent)" />
                                    <span className="font-semibold text-(--text-primary)">{tok.name}</span>
                                    <code className="font-mono text-(--text-muted)">{tok.prefix}…</code>
                                </div>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={async () => {
                                        await apiFetch(`/settings/api-tokens/${tok.id}`, { method: 'DELETE' });
                                        setTokens((prev) => prev.filter((x) => x.id !== tok.id));
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {tab === 'myAccount' && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="space-y-4 p-5">
                        <h2 className="text-sm font-semibold text-(--text-primary)">Change password</h2>
                        <Input
                            label="Current password"
                            type="password"
                            value={curPass}
                            onChange={(e) => setCurPass(e.target.value)}
                        />
                        <Input
                            label="New password (min 10 chars)"
                            type="password"
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                        />
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await apiFetch('/auth/me/password', {
                                    method: 'POST',
                                    body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
                                });
                                setCurPass('');
                                setNewPass('');
                                flash('Password updated.');
                            }}
                        >
                            Update password
                        </Button>
                    </Card>

                    <Card className="space-y-4 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-(--text-primary)">Two-factor authentication (TOTP)</h2>
                            <StatusPill tone={totpEnabled ? 'green' : 'gray'} label={totpEnabled ? 'Enabled' : 'Off'} />
                        </div>

                        {!totpEnabled && !totpSetup && (
                            <Button
                                onClick={async () => {
                                    const res = await apiFetch<{ secret: string; uri: string }>('/auth/me/2fa/setup', { method: 'POST' });
                                    setTotpSetup(res);
                                }}
                            >
                                <ShieldCheck className="h-4 w-4" />
                                Turn on 2FA
                            </Button>
                        )}

                        {totpSetup && (
                            <div className="space-y-3">
                                <QrCode value={totpSetup.uri} size={160} />
                                <div className="font-mono text-xs text-(--text-secondary)">Secret: {totpSetup.secret}</div>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="6-digit code"
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value)}
                                    />
                                    <Button
                                        variant="primary"
                                        onClick={async () => {
                                            const res = await apiFetch<{ recoveryCodes: string[] }>('/auth/me/2fa/enable', {
                                                method: 'POST',
                                                body: JSON.stringify({ secret: totpSetup.secret, code: totpCode }),
                                            });
                                            setRecoveryCodes(res.recoveryCodes);
                                            setTotpSetup(null);
                                            setTotpEnabled(true);
                                        }}
                                    >
                                        Confirm
                                    </Button>
                                </div>
                            </div>
                        )}

                        {recoveryCodes.length > 0 && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                                <div className="font-semibold text-amber-400">Save your recovery codes:</div>
                                <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-(--text-primary)">
                                    {recoveryCodes.map((rc) => (
                                        <span key={rc}>{rc}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border-t border-(--border-subtle) pt-3">
                            <div className="mb-2 text-xs font-semibold text-(--text-secondary)">Signed-in devices</div>
                            <div className="space-y-1.5">
                                {sessions.map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex items-center justify-between rounded-xl bg-(--bg-elevated) px-3 py-2 text-xs"
                                    >
                                        <div>
                                            <span className="font-mono text-(--text-primary)">{s.ip}</span>
                                            {s.current && <span className="ms-2 text-(--accent)">(this device)</span>}
                                            <div className="text-[11px] text-(--text-muted)">
                                                {formatDateTime(s.lastSeenAt, lang)}
                                            </div>
                                        </div>
                                        {!s.current && (
                                            <Button
                                                size="sm"
                                                onClick={async () => {
                                                    await apiFetch(`/auth/me/sessions/${s.id}`, { method: 'DELETE' });
                                                    setSessions((prev) => prev.filter((x) => x.id !== s.id));
                                                }}
                                            >
                                                Sign out
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {tab === 'backup' && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="space-y-4 p-5">
                        <h2 className="text-sm font-semibold text-(--text-primary)">Database Backup & Restore</h2>
                        <p className="text-xs text-(--text-secondary)">
                            Download a hot snapshot of your SQLite database (`xprotocol.db`) containing clients, groups, inbounds, nodes, accounts, and settings.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="./api/settings/backup/download"
                                className="inline-flex items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-sm font-semibold text-(--accent-fg)"
                            >
                                <Download className="h-4 w-4" />
                                Download backup (.db)
                            </a>
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-hover)">
                                <Upload className="h-4 w-4" />
                                <span>Restore from .db</span>
                                <input type="file" accept=".db" className="hidden" onChange={handleRestoreUpload} />
                            </label>
                        </div>
                    </Card>

                    <Card className="space-y-4 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-(--text-primary)">
                                {lang === 'fa' ? 'پشتیبان‌گیری از طریق تلگرام' : 'Backups over Telegram'}
                            </h2>
                            <StatusPill
                                tone={tgBackup.enabled ? 'green' : 'gray'}
                                label={tgBackup.enabled ? 'Active' : 'Off'}
                            />
                        </div>

                        <label className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-elevated) px-3.5 py-2.5 text-xs text-(--text-primary) cursor-pointer">
                            <span>{lang === 'fa' ? 'ارسال خودکار بکاپ به تلگرام' : 'Enable scheduled Telegram backups'}</span>
                            <input
                                type="checkbox"
                                checked={tgBackup.enabled}
                                onChange={(e) => setTgBackup({ ...tgBackup, enabled: e.target.checked })}
                                className="rounded accent-(--accent)"
                            />
                        </label>

                        <Input
                            label="Bot token"
                            type="password"
                            value={tgBackup.botToken}
                            onChange={(e) => setTgBackup({ ...tgBackup, botToken: e.target.value })}
                            placeholder={hasTgToken ? 'Token configured (leave blank to keep)' : '123456:ABC-DEF...'}
                        />

                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-40">
                                <Input
                                    label="Chat ID"
                                    value={tgBackup.chatId}
                                    onChange={(e) => setTgBackup({ ...tgBackup, chatId: e.target.value })}
                                    placeholder="-100123456789"
                                />
                            </div>
                            <Button
                                type="button"
                                disabled={tgBusy}
                                onClick={async () => {
                                    setTgBusy(true);
                                    try {
                                        const res = await apiFetch<{ chats: { chatId: string; title: string }[] }>(
                                            '/settings/telegram-backup/find-chat',
                                            {
                                                method: 'POST',
                                                body: JSON.stringify({ botToken: tgBackup.botToken || undefined }),
                                            },
                                        );
                                        setFoundChats(res.chats);
                                        if (res.chats.length > 0 && !tgBackup.chatId) {
                                            setTgBackup((prev) => ({ ...prev, chatId: res.chats[0].chatId }));
                                        }
                                        flash(res.chats.length > 0 ? `Found ${res.chats.length} chat(s).` : 'No recent messages found; send /start to your bot first.');
                                    } catch (err) {
                                        flash(err instanceof Error ? err.message : 'Failed to inspect bot updates');
                                    } finally {
                                        setTgBusy(false);
                                    }
                                }}
                            >
                                <Search className="h-3.5 w-3.5" />
                                Find chat
                            </Button>
                        </div>

                        {foundChats.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {foundChats.map((c) => (
                                    <button
                                        key={c.chatId}
                                        type="button"
                                        onClick={() => setTgBackup({ ...tgBackup, chatId: c.chatId })}
                                        className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-2.5 py-1 text-[11px] text-(--text-primary) hover:border-(--accent)"
                                    >
                                        {c.title} ({c.chatId})
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Select
                                label="Send every"
                                value={String(tgBackup.intervalHours)}
                                onChange={(e) => setTgBackup({ ...tgBackup, intervalHours: Number(e.target.value) })}
                            >
                                <option value="1">1 hour</option>
                                <option value="6">6 hours</option>
                                <option value="12">12 hours</option>
                                <option value="24">24 hours</option>
                                <option value="72">3 days</option>
                                <option value="168">7 days</option>
                            </Select>
                            <Input
                                label="Proxy URL (optional)"
                                value={tgBackup.proxyUrl}
                                onChange={(e) => setTgBackup({ ...tgBackup, proxyUrl: e.target.value })}
                                placeholder="socks5://127.0.0.1:1080"
                            />
                        </div>

                        {tgBackup.lastSentAt && (
                            <div className="text-[11px] text-(--text-muted)">
                                Last sent: {formatDateTime(tgBackup.lastSentAt, lang)}
                            </div>
                        )}

                        <div className="flex flex-wrap justify-between gap-2 pt-1">
                            <Button
                                type="button"
                                disabled={tgBusy}
                                onClick={async () => {
                                    setTgBusy(true);
                                    try {
                                        await apiFetch('/settings/telegram-backup/send-now', {
                                            method: 'POST',
                                            body: JSON.stringify({
                                                botToken: tgBackup.botToken || undefined,
                                                chatId: tgBackup.chatId || undefined,
                                            }),
                                        });
                                        flash('Telegram backup sent.');
                                    } catch (err) {
                                        flash(err instanceof Error ? err.message : 'Telegram send failed');
                                    } finally {
                                        setTgBusy(false);
                                    }
                                }}
                            >
                                <Send className="h-3.5 w-3.5" />
                                Send now
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={async () => {
                                    await apiFetch('/settings/telegram-backup', {
                                        method: 'PUT',
                                        body: JSON.stringify(tgBackup),
                                    });
                                    flash('Telegram backup settings saved.');
                                }}
                            >
                                {t.common.save}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {tab === 'audit' && (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start text-xs">
                            <thead className="border-b border-(--border-subtle) bg-(--bg-elevated) text-(--text-secondary)">
                                <tr>
                                    <th className="px-4 py-3 text-start">When</th>
                                    <th className="px-4 py-3 text-start">Who</th>
                                    <th className="px-4 py-3 text-start">Action</th>
                                    <th className="px-4 py-3 text-start">Target</th>
                                    <th className="px-4 py-3 text-start">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-(--border-subtle)">
                                {auditEntries.map((e) => (
                                    <tr key={e.id}>
                                        <td className="px-4 py-2.5 text-(--text-secondary)">{formatDateTime(e.ts, lang)}</td>
                                        <td className="px-4 py-2.5 font-medium text-(--text-primary)">{e.username}</td>
                                        <td className={`px-4 py-2.5 font-mono ${e.action.includes('failed') ? 'text-red-400' : 'text-(--accent)'}`}>
                                            {e.action}
                                        </td>
                                        <td className="px-4 py-2.5 text-(--text-secondary)">{e.target}</td>
                                        <td className="px-4 py-2.5 font-mono text-(--text-muted)">{e.ip}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
