import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, KeyRound, Play, Plus, RotateCcw, Server, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Input, Select, StatusPill } from './UiPrimitives';
import { Modal } from './Modal';

export interface BackupDestItem {
  id: number;
  kind: 's3' | 'sftp';
  name: string;
  enabled: boolean;
  encrypt: boolean;
  s3?: {
    endpoint?: string;
    region?: string;
    bucket: string;
    prefix?: string;
    accessKey: string;
    pathStyle?: boolean;
  };
  sftp?: {
    host: string;
    port?: number;
    user: string;
    path?: string;
    auth: 'password' | 'key';
    fingerprint?: string;
  };
  hasSecretKey?: boolean;
  hasPassword?: boolean;
  hasPrivateKey?: boolean;
  hasPassphrase?: boolean;
  schedule: { mode: 'interval' | 'daily'; hours?: number; hour?: number };
  retention: { keepLast: number; maxDays: number };
  lastAt: number;
  lastSize: number;
  lastName: string;
  lastError: string;
}

export function SettingsBackupDestinations({
  kind,
  onNotice,
}: {
  kind: 's3' | 'sftp';
  onNotice: (msg: string) => void;
}) {
  const { lang } = useUi();
  const isFa = lang === 'fa';
  const [items, setItems] = useState<BackupDestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BackupDestItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'daily' | 'interval'>('daily');
  const [scheduleHour, setScheduleHour] = useState(3);
  const [scheduleHours, setScheduleHours] = useState(12);
  const [keepLast, setKeepLast] = useState(7);
  const [maxDays, setMaxDays] = useState(30);

  // S3 fields
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Region, setS3Region] = useState('us-east-1');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Prefix, setS3Prefix] = useState('xprotocol/');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [s3PathStyle, setS3PathStyle] = useState(true);

  // SFTP fields
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState(22);
  const [sftpUser, setSftpUser] = useState('root');
  const [sftpPath, setSftpPath] = useState('/var/backups/xprotocol');
  const [sftpAuth, setSftpAuth] = useState<'password' | 'key'>('password');
  const [sftpPassword, setSftpPassword] = useState('');
  const [sftpPrivateKey, setSftpPrivateKey] = useState('');

  // Remote files & restore modal
  const [filesDest, setFilesDest] = useState<BackupDestItem | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<{ name: string; size: number; lastModified: string }[]>([]);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ items: BackupDestItem[] }>('/backup/destinations');
      setItems((res.items || []).filter((i) => i.kind === kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load destinations');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName(kind === 's3' ? 'Off-site S3' : 'Backup Server');
    setEnabled(true);
    setEncrypt(true);
    setPassphrase('');
    setScheduleMode('daily');
    setScheduleHour(3);
    setScheduleHours(12);
    setKeepLast(7);
    setMaxDays(30);
    setS3Endpoint('');
    setS3Region('us-east-1');
    setS3Bucket('');
    setS3Prefix('xprotocol/');
    setS3AccessKey('');
    setS3SecretKey('');
    setS3PathStyle(true);
    setSftpHost('');
    setSftpPort(22);
    setSftpUser('root');
    setSftpPath('/var/backups/xprotocol');
    setSftpAuth('password');
    setSftpPassword('');
    setSftpPrivateKey('');
    setModalOpen(true);
  };

  const openEdit = (d: BackupDestItem) => {
    setEditing(d);
    setName(d.name);
    setEnabled(d.enabled);
    setEncrypt(d.encrypt);
    setPassphrase('');
    setScheduleMode(d.schedule.mode || 'daily');
    setScheduleHour(d.schedule.hour ?? 3);
    setScheduleHours(d.schedule.hours ?? 12);
    setKeepLast(d.retention.keepLast ?? 7);
    setMaxDays(d.retention.maxDays ?? 30);
    if (d.s3) {
      setS3Endpoint(d.s3.endpoint || '');
      setS3Region(d.s3.region || 'us-east-1');
      setS3Bucket(d.s3.bucket || '');
      setS3Prefix(d.s3.prefix || '');
      setS3AccessKey(d.s3.accessKey || '');
      setS3SecretKey('');
      setS3PathStyle(d.s3.pathStyle !== false);
    }
    if (d.sftp) {
      setSftpHost(d.sftp.host || '');
      setSftpPort(d.sftp.port || 22);
      setSftpUser(d.sftp.user || 'root');
      setSftpPath(d.sftp.path || '');
      setSftpAuth(d.sftp.auth || 'password');
      setSftpPassword('');
      setSftpPrivateKey('');
    }
    setModalOpen(true);
  };

  const saveDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const secrets: Record<string, string> = {};
    if (passphrase) secrets.passphrase = passphrase;
    if (kind === 's3' && s3SecretKey) secrets.secretKey = s3SecretKey;
    if (kind === 'sftp' && sftpAuth === 'password' && sftpPassword) secrets.password = sftpPassword;
    if (kind === 'sftp' && sftpAuth === 'key' && sftpPrivateKey) secrets.privateKey = sftpPrivateKey;

    const payload = {
      kind,
      name: name.trim(),
      enabled,
      encrypt,
      s3:
        kind === 's3'
          ? {
              endpoint: s3Endpoint.trim() || undefined,
              region: s3Region.trim() || 'us-east-1',
              bucket: s3Bucket.trim(),
              prefix: s3Prefix.trim(),
              accessKey: s3AccessKey.trim(),
              pathStyle: s3PathStyle,
            }
          : undefined,
      sftp:
        kind === 'sftp'
          ? {
              host: sftpHost.trim(),
              port: Number(sftpPort) || 22,
              user: sftpUser.trim(),
              path: sftpPath.trim(),
              auth: sftpAuth,
            }
          : undefined,
      secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
      schedule:
        scheduleMode === 'daily'
          ? { mode: 'daily', hour: Number(scheduleHour) }
          : { mode: 'interval', hours: Number(scheduleHours) },
      retention: { keepLast: Number(keepLast), maxDays: Number(maxDays) },
    };

    if (editing) {
      await apiFetch(`/backup/destinations/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      onNotice(isFa ? 'مقصد بکاپ ویرایش شد.' : 'Destination updated.');
    } else {
      await apiFetch('/backup/destinations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onNotice(isFa ? 'مقصد بکاپ اضافه شد.' : 'Destination added.');
    }
    setModalOpen(false);
    await load();
  };

  const openRemoteFiles = async (d: BackupDestItem) => {
    setFilesDest(d);
    setLoadingFiles(true);
    try {
      const res = await apiFetch<{ files: { name: string; size: number; lastModified: string }[] }>(
        `/backup/destinations/${d.id}/files`,
      );
      setRemoteFiles(res.files || []);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Failed to list files');
      setRemoteFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  return (
    <div className="editor">
      <section className="ed-section">
        <div>
          <h2>{kind === 's3' ? (isFa ? 'مقصدهای S3' : 'S3 destinations') : isFa ? 'مقصدهای SFTP' : 'SFTP destinations'}</h2>
          <p className="ed-lede">
            {kind === 's3'
              ? isFa
                ? 'ارسال خودکار به Amazon S3، Cloudflare R2، MinIO یا آروان با رمزنگاری اختیاری .ovbk (AES-256-GCM).'
                : 'Schedule backups to S3, R2, MinIO or compatible buckets with optional .ovbk AES-256-GCM encryption.'
              : isFa
                ? 'ارسال زمان‌بندی‌شده به سرور دیگر از طریق SFTP همراه با پین کردن کلید میزبان و نگهداری خودکار.'
                : 'Schedule backups over SFTP with SSH host-key verification and automated retention pruning.'}
          </p>
        </div>

        <div className="ed-fields">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-(--text-muted)">
              {isFa ? `${items.length} مقصد تعریف شده` : `${items.length} destination(s)`}
            </span>
            <Button type="button" variant="primary" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {kind === 's3' ? (isFa ? 'افزودن S3' : 'Add S3') : isFa ? 'افزودن SFTP' : 'Add SFTP'}
            </Button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-xs text-(--text-muted)">{isFa ? 'در حال بارگذاری…' : 'Loading…'}</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--border-subtle) px-4 py-6 text-center text-xs text-(--text-muted)">
              {isFa ? 'مقصدی ثبت نشده است.' : 'No off-site destinations configured yet.'}
            </div>
          ) : (
            <div className="stack-sm">
              {items.map((d) => (
                <div key={d.id} className="rounded-xl border border-(--border-subtle) bg-(--bg-elevated) p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-(--accent)" />
                      <strong className="text-sm text-(--ink)">{d.name}</strong>
                      <StatusPill
                        tone={d.enabled ? 'green' : 'gray'}
                        label={d.enabled ? (isFa ? 'فعال' : 'Active') : isFa ? 'خاموش' : 'Off'}
                      />
                      {d.encrypt && (
                        <StatusPill tone="blue" label={isFa ? 'رمزنگاری .ovbk' : '.ovbk encrypted'} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === d.id}
                        onClick={async () => {
                          setBusyId(d.id);
                          try {
                            const r = await apiFetch<{ ok: boolean; message: string }>(
                              `/backup/destinations/${d.id}/test`,
                              { method: 'POST' },
                            );
                            onNotice(r.message || (r.ok ? 'Connection OK' : 'Test failed'));
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isFa ? 'تست' : 'Test'}
                      </Button>
                      {kind === 'sftp' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === d.id}
                          onClick={async () => {
                            setBusyId(d.id);
                            try {
                              const r = await apiFetch<{ fingerprint: string }>(
                                `/backup/destinations/${d.id}/accept-hostkey`,
                                { method: 'POST' },
                              );
                              onNotice(`Host key trusted: ${r.fingerprint}`);
                              await load();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {isFa ? 'تأیید Host Key' : 'Trust hostkey'}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === d.id}
                        onClick={async () => {
                          setBusyId(d.id);
                          try {
                            await apiFetch(`/backup/destinations/${d.id}/send`, { method: 'POST' });
                            onNotice(isFa ? 'بکاپ با موفقیت ارسال شد.' : 'Backup sent.');
                            await load();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {isFa ? 'ارسال الان' : 'Send now'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openRemoteFiles(d)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        {isFa ? 'فایل‌ها' : 'Files'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(d)}>
                        {isFa ? 'ویرایش' : 'Edit'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await apiFetch(`/backup/destinations/${d.id}`, { method: 'DELETE' });
                          onNotice(isFa ? 'مقصد حذف شد.' : 'Destination deleted.');
                          await load();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-(--text-muted)">
                    <span dir="ltr">
                      {kind === 's3'
                        ? `s3://${d.s3?.bucket}${d.s3?.prefix ? `/${d.s3.prefix}` : ''}`
                        : `sftp://${d.sftp?.user}@${d.sftp?.host}:${d.sftp?.port || 22}${d.sftp?.path || ''}`}
                    </span>
                    <span>
                      {isFa ? 'نگهداری:' : 'Retention:'} {d.retention.keepLast} / {d.retention.maxDays}d
                    </span>
                    {d.lastAt > 0 && (
                      <span>
                        {isFa ? 'آخرین بکاپ:' : 'Last:'} {formatDateTime(new Date(d.lastAt * 1000).toISOString(), lang)}{' '}
                        ({formatBytes(d.lastSize)})
                      </span>
                    )}
                    {d.lastError && <span className="text-red-400">{d.lastError}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? isFa
              ? 'ویرایش مقصد بکاپ'
              : 'Edit backup destination'
            : kind === 's3'
              ? isFa
                ? 'افزودن مقصد S3'
                : 'Add S3 destination'
              : isFa
                ? 'افزودن مقصد SFTP'
                : 'Add SFTP destination'
        }
      >
        <form className="stack" onSubmit={saveDestination}>
          <Input label={isFa ? 'نام نمایشی' : 'Display name'} required value={name} onChange={(e) => setName(e.target.value)} />

          {kind === 's3' ? (
            <>
              <div className="form-row">
                <Input label="Endpoint URL" dir="ltr" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.eu-central-1.amazonaws.com" />
                <Input label="Region" dir="ltr" value={s3Region} onChange={(e) => setS3Region(e.target.value)} />
              </div>
              <div className="form-row">
                <Input label="Bucket" required dir="ltr" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} />
                <Input label="Prefix" dir="ltr" value={s3Prefix} onChange={(e) => setS3Prefix(e.target.value)} />
              </div>
              <div className="form-row">
                <Input label="Access Key" required dir="ltr" value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} />
                <Input
                  label="Secret Key"
                  type="password"
                  dir="ltr"
                  value={s3SecretKey}
                  onChange={(e) => setS3SecretKey(e.target.value)}
                  placeholder={editing?.hasSecretKey ? '(saved — leave blank to keep)' : ''}
                />
              </div>
              <label className="switch">
                <input type="checkbox" checked={s3PathStyle} onChange={(e) => setS3PathStyle(e.target.checked)} />
                <span className="track" />
                <span className="sw-text">
                  <span>{isFa ? 'استفاده از Path-style (مناسب MinIO/R2)' : 'Path-style addressing (MinIO / R2)'}</span>
                </span>
              </label>
            </>
          ) : (
            <>
              <div className="form-row">
                <Input label="Host" required dir="ltr" value={sftpHost} onChange={(e) => setSftpHost(e.target.value)} />
                <Input label="Port" type="number" dir="ltr" value={String(sftpPort)} onChange={(e) => setSftpPort(Number(e.target.value))} />
              </div>
              <div className="form-row">
                <Input label="Username" required dir="ltr" value={sftpUser} onChange={(e) => setSftpUser(e.target.value)} />
                <Input label="Remote path" dir="ltr" value={sftpPath} onChange={(e) => setSftpPath(e.target.value)} />
              </div>
              <Select label="Auth" value={sftpAuth} onChange={(e) => setSftpAuth(e.target.value as 'password' | 'key')}>
                <option value="password">{isFa ? 'رمز عبور' : 'Password'}</option>
                <option value="key">{isFa ? 'کلید خصوصی SSH' : 'SSH private key'}</option>
              </Select>
              {sftpAuth === 'password' ? (
                <Input
                  label={isFa ? 'رمز عبور SFTP' : 'SFTP password'}
                  type="password"
                  dir="ltr"
                  value={sftpPassword}
                  onChange={(e) => setSftpPassword(e.target.value)}
                  placeholder={editing?.hasPassword ? '(saved — leave blank to keep)' : ''}
                />
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">SSH Private Key (PEM)</span>
                  <textarea
                    rows={4}
                    dir="ltr"
                    className="w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 font-mono text-xs text-(--text-primary)"
                    value={sftpPrivateKey}
                    onChange={(e) => setSftpPrivateKey(e.target.value)}
                    placeholder={editing?.hasPrivateKey ? '(saved — leave blank to keep)' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                  />
                </label>
              )}
            </>
          )}

          <div className="form-row">
            <Select label={isFa ? 'زمان‌بندی' : 'Schedule'} value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as 'daily' | 'interval')}>
              <option value="daily">{isFa ? 'روزانه در ساعت مشخص' : 'Daily at hour'}</option>
              <option value="interval">{isFa ? 'هر N ساعت' : 'Every N hours'}</option>
            </Select>
            {scheduleMode === 'daily' ? (
              <Input label={isFa ? 'ساعت اجرا (0-23)' : 'Hour (0-23)'} type="number" min={0} max={23} dir="ltr" value={String(scheduleHour)} onChange={(e) => setScheduleHour(Number(e.target.value))} />
            ) : (
              <Input label={isFa ? 'بازه (ساعت)' : 'Every hours'} type="number" min={1} max={168} dir="ltr" value={String(scheduleHours)} onChange={(e) => setScheduleHours(Number(e.target.value))} />
            )}
          </div>

          <div className="form-row">
            <Input label={isFa ? 'حداکثر تعداد نگهداری' : 'Keep last backups'} type="number" min={1} max={365} dir="ltr" value={String(keepLast)} onChange={(e) => setKeepLast(Number(e.target.value))} />
            <Input label={isFa ? 'حداکثر روز نگهداری' : 'Max age (days)'} type="number" min={1} max={3650} dir="ltr" value={String(maxDays)} onChange={(e) => setMaxDays(Number(e.target.value))} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="switch">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="track" />
              <span className="sw-text">
                <span>{isFa ? 'زمان‌بندی فعال' : 'Schedule active'}</span>
              </span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
              <span className="track" />
              <span className="sw-text">
                <span>{isFa ? 'رمزنگاری فایل (.ovbk AES-256)' : 'Encrypt archive (.ovbk AES-256)'}</span>
              </span>
            </label>
          </div>

          {encrypt && (
            <Input
              label={isFa ? 'رمز رمزنگاری (.ovbk)' : 'Encryption passphrase (.ovbk)'}
              type="password"
              dir="ltr"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={editing?.hasPassphrase ? '(saved — leave blank to keep)' : 'Strong passphrase…'}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              {isFa ? 'انصراف' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary">
              {isFa ? 'ذخیره مقصد' : 'Save destination'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(filesDest)}
        onClose={() => setFilesDest(null)}
        title={filesDest ? `${filesDest.name} · ${isFa ? 'بکاپ‌های موجود' : 'Stored backups'}` : ''}
      >
        <div className="stack">
          {filesDest?.encrypt && (
            <Input
              label={isFa ? 'رمز بازگشایی .ovbk (در صورت نیاز)' : '.ovbk passphrase (for restore)'}
              type="password"
              dir="ltr"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
            />
          )}
          {loadingFiles ? (
            <div className="text-xs text-(--text-muted)">{isFa ? 'در حال دریافت لیست…' : 'Listing remote files…'}</div>
          ) : remoteFiles.length === 0 ? (
            <div className="text-xs text-(--text-muted)">{isFa ? 'فایلی یافت نشد.' : 'No backup files found.'}</div>
          ) : (
            <div className="stack-sm max-h-72 overflow-y-auto">
              {remoteFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-(--ink)" dir="ltr">{f.name}</div>
                    <div className="text-[11px] text-(--text-muted)">
                      {formatBytes(f.size)} {f.lastModified ? `· ${f.lastModified}` : ''}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!filesDest) return;
                      const res = await apiFetch<{ message: string }>(`/backup/destinations/${filesDest.id}/restore`, {
                        method: 'POST',
                        body: JSON.stringify({ fileName: f.name, passphrase: restorePassphrase || undefined }),
                      });
                      onNotice(res.message);
                      setFilesDest(null);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {isFa ? 'بازیابی' : 'Restore'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
