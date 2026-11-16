export function formatBytesParts(
  bytes: number | null | undefined,
  lang: 'en' | 'fa' = 'en',
): { value: string; unit: string } {
  if (bytes === null || bytes === undefined) {
    return { value: lang === 'fa' ? 'نامحدود' : 'Unlimited', unit: '' };
  }
  if (bytes === 0) return { value: '0', unit: 'B' };
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  const formatted = val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return { value: formatted.replace(/\.00$/, ''), unit: units[i] };
}

export function formatBytes(bytes: number | null | undefined, lang: 'en' | 'fa' = 'en'): string {
  const { value, unit } = formatBytesParts(bytes, lang);
  return unit ? `${value} ${unit}` : value;
}

export function formatSpeedParts(bps: number): { value: string; unit: string } {
  if (!bps || bps <= 0) return { value: '0', unit: 'B/s' };
  const k = 1024;
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bps) / Math.log(k)));
  const val = bps / Math.pow(k, i);
  const formatted = val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return { value: formatted.replace(/\.00$/, ''), unit: units[i] };
}

export function formatSpeed(bps: number): string {
  const { value, unit } = formatSpeedParts(bps);
  return `${value} ${unit}`;
}

export function formatDuration(seconds: number, lang: 'en' | 'fa' = 'en'): string {
  if (seconds < 60) return lang === 'fa' ? `${seconds} ثانیه` : `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return lang === 'fa' ? `${mins} دقیقه` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  if (hrs < 24) return lang === 'fa' ? `${hrs} ساعت ${remM}د` : `${hrs}h ${remM}m`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return lang === 'fa' ? `${days} روز ${remH}س` : `${days}d ${remH}h`;
}

export function formatDaysLeft(expiresAt: string | null, firstConnectDays: number | null, lang: 'en' | 'fa' = 'en'): string {
  if (firstConnectDays && !expiresAt) {
    return lang === 'fa' ? `${firstConnectDays} روز از اولین اتصال` : `${firstConnectDays}d from first connect`;
  }
  if (!expiresAt) return lang === 'fa' ? 'بدون انقضا' : 'No end date';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return lang === 'fa' ? 'منقضی شده' : 'Expired';
  const days = Math.ceil(diff / 86400_000);
  return lang === 'fa' ? `${days} روز مانده` : `${days} days left`;
}

export function formatDateTime(iso: string | null | undefined, lang: 'en' | 'fa' = 'en'): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
