export type SubThemeKey = 'night' | 'aurora' | 'pop' | 'ticket' | 'orbit' | 'mono';
export type SubMode = 'light' | 'dark';
export type SubLocale = 'en' | 'fa';
export type SubPlatform = 'android' | 'ios' | 'desktop';

const THEMES: SubThemeKey[] = ['night', 'aurora', 'pop', 'ticket', 'orbit', 'mono'];

export const SUB_DEFAULT_ACCENT: Record<SubThemeKey, string> = {
  night: '#34e0a1',
  aurora: '#14b8a6',
  pop: '#5b4bff',
  ticket: '#e8590c',
  orbit: '#8b5cf6',
  mono: '#e5484d',
};

const SUB_SURFACES: Record<SubThemeKey, { light: string; dark: string }> = {
  night: { light: '#f6f5ee', dark: '#0a1112' },
  aurora: { light: '#f5f7fb', dark: '#0b1020' },
  pop: { light: '#ffffff', dark: '#211c36' },
  ticket: { light: '#fffaf0', dark: '#211d17' },
  orbit: { light: '#ffffff', dark: '#10142b' },
  mono: { light: '#fafaf7', dark: '#0d0d0c' },
};

const ACCENT_CSS_VARS = [
  '--accent',
  '--accent-ink',
  '--accent-text',
  '--accent-wash',
  '--accent-glow',
  '--accent-2',
  '--accent-3',
  '--grid-lit',
  '--blob-a',
] as const;

export function normalizeSubTheme(look: string | undefined | null): SubThemeKey {
  if (!look || look === 'night_shift') return 'night';
  if (look === 'paper') return 'aurora';
  return (THEMES as string[]).includes(look) ? (look as SubThemeKey) : 'night';
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(n)) return [52, 224, 161];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relLum(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function ensureContrast(rgb: number[], bg: number[], ratio: number): number[] {
  const [h, s, l0] = rgbToHsl(rgb);
  const dir = relLum(bg) > 0.4 ? -1 : 1;
  let l = l0;
  let cur = rgb;
  for (let i = 0; i < 40 && contrast(cur, bg) < ratio; i++) {
    l = Math.max(0.02, Math.min(0.98, l + dir * 0.025));
    cur = hslToRgb(h, s, l);
  }
  return cur;
}

function rgba(rgb: number[], alpha: number): string {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha})`;
}

export function computeSubAccentTokens(theme: SubThemeKey, accentHex: string, mode: SubMode): Record<string, string> {
  const validHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentHex.trim()) ? accentHex.trim() : SUB_DEFAULT_ACCENT[theme];
  const baseRgb = hexToRgb(validHex);
  const surfRgb = hexToRgb(SUB_SURFACES[theme][mode]);
  const fillBg = mode === 'dark' ? hexToRgb(theme === 'night' ? '#05090a' : SUB_SURFACES[theme].dark) : surfRgb;
  const accentFill = ensureContrast(baseRgb, fillBg, 2.2);
  const [h, s, l] = rgbToHsl(accentFill);
  const ink = contrast(accentFill, [10, 12, 8]) >= contrast(accentFill, [255, 255, 255]) ? '#0b1300' : '#ffffff';
  const acc2 = hslToRgb(h + 160, Math.max(0.55, s), mode === 'dark' ? 0.62 : 0.5);
  const acc3 = hslToRgb(h + 55, Math.max(0.7, s), mode === 'dark' ? 0.66 : 0.58);

  return {
    '--accent': rgbToHex(accentFill),
    '--accent-ink': ink,
    '--accent-text': rgbToHex(ensureContrast(baseRgb, surfRgb, 4.5)),
    '--accent-wash': rgba(accentFill, mode === 'dark' ? 0.12 : 0.14),
    '--accent-glow': rgba(accentFill, 0.4),
    '--accent-2': rgbToHex(acc2),
    '--accent-3': rgbToHex(l > 0.97 ? acc2 : acc3),
    '--grid-lit': rgba(accentFill, 0.55),
    '--blob-a': rgba(accentFill, mode === 'dark' ? 0.1 : 0.22),
  };
}

export function applySubTheme(theme: SubThemeKey, accentHex: string, mode: SubMode): () => void {
  const root = document.documentElement;
  const prevDark = root.classList.contains('dark');
  const prevLight = root.classList.contains('light');
  root.dataset.subTheme = theme;
  root.dataset.mode = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');

  for (const key of ACCENT_CSS_VARS) {
    root.style.removeProperty(key);
  }
  const hasCustomAccent = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((accentHex || '').trim());
  if (theme !== 'night' || hasCustomAccent) {
    const tokens = computeSubAccentTokens(theme, accentHex, mode);
    for (const [k, v] of Object.entries(tokens)) {
      root.style.setProperty(k, v);
    }
  }

  return () => {
    delete root.dataset.subTheme;
    delete root.dataset.mode;
    for (const key of ACCENT_CSS_VARS) {
      root.style.removeProperty(key);
    }
    root.classList.toggle('dark', prevDark);
    root.classList.toggle('light', prevLight);
  };
}

export type ContactKind = 'telegram' | 'whatsapp' | 'instagram' | 'email' | 'phone' | 'web';

export interface ParsedContact {
  role: 'support' | 'channel';
  kind: ContactKind;
  href: string;
  handle: string;
}

export function parseContactLink(rawUrl: string): Omit<ParsedContact, 'role'> | null {
  const s = (rawUrl || '').trim();
  if (!s) return null;
  let normalized = s;
  if (s.startsWith('@')) {
    normalized = `https://t.me/${s.slice(1)}`;
  } else if (!/^(https?:|tg:|whatsapp:|mailto:|tel:)/i.test(s)) {
    normalized = s.includes('@') ? `mailto:${s}` : `https://${s}`;
  }
  if (/^mailto:/i.test(normalized)) {
    return { kind: 'email', href: normalized, handle: decodeURIComponent(normalized.slice(7).split('?')[0]) };
  }
  if (/^tel:/i.test(normalized)) {
    return { kind: 'phone', href: normalized, handle: normalized.slice(4) };
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { kind: 'web', href: normalized, handle: '' };
  }
  if (url.protocol === 'tg:') {
    const domain = url.searchParams.get('domain');
    return { kind: 'telegram', href: normalized, handle: domain ? `@${domain}` : '' };
  }
  if (url.protocol === 'whatsapp:') {
    const phone = (url.searchParams.get('phone') ?? '').replace(/\D/g, '');
    return { kind: 'whatsapp', href: normalized, handle: phone ? `+${phone}` : '' };
  }
  const host = url.hostname.replace(/^www\./, '');
  const segs = url.pathname.split('/').filter(Boolean);
  if (host === 't.me' || host === 'telegram.me' || host === 'telegram.dog') {
    const first = segs[0] ?? '';
    const isPrivate = first.startsWith('+') || first === 'joinchat' || first === 'c';
    return { kind: 'telegram', href: normalized, handle: first && !isPrivate ? `@${first}` : '' };
  }
  if (host === 'wa.me') {
    const phone = (segs[0] ?? '').replace(/\D/g, '');
    return { kind: 'whatsapp', href: normalized, handle: phone ? `+${phone}` : '' };
  }
  if (host === 'whatsapp.com' || host === 'api.whatsapp.com' || host === 'chat.whatsapp.com') {
    const phone = (url.searchParams.get('phone') ?? '').replace(/\D/g, '');
    return { kind: 'whatsapp', href: normalized, handle: phone ? `+${phone}` : '' };
  }
  if (host === 'instagram.com' || host === 'instagr.am') {
    return { kind: 'instagram', href: normalized, handle: segs[0] ? `@${segs[0]}` : '' };
  }
  return { kind: 'web', href: normalized, handle: host };
}

export function detectPlatform(): SubPlatform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

export const PLAT_LABELS: Record<SubPlatform, string> = {
  android: 'Android',
  ios: 'iPhone · iPad',
  desktop: 'Windows · macOS · Linux',
};

export const PLAT_ORDER: SubPlatform[] = ['android', 'ios', 'desktop'];

export const SUB_PROTO_LABELS: Record<string, string> = {
  xray: 'V2Ray',
  openvpn: 'OpenVPN',
  wireguard: 'WireGuard',
  amnezia: 'AmneziaWG',
  amneziawg: 'AmneziaWG',
  openconnect: 'Cisco',
  ikev2: 'IKEv2',
  l2tp: 'L2TP/IPsec',
};

export const SUB_COPY = {
  en: {
    left: 'left',
    unlimited: 'Unlimited traffic',
    usedOf: '{used} used of {total}',
    usedOnly: '{used} used',
    endsOn: 'Ends {date}',
    daysLeft: '{n} days left',
    lastDay: 'Last day',
    noEnd: 'No end date',
    pending: 'Your {n} days start when you first connect.',
    ended: 'This plan ended on {date}.',
    endedSimple: 'This plan has expired.',
    usedUp: 'You have used all your traffic.',
    disabled: 'This account is paused.',
    renew: 'Contact support to renew.',
    online: 'Connected on {n} devices',
    onlineOne: 'Connected now',
    offline: 'Not connected',
    devices: 'Up to {n} devices at once',
    connect: 'Connect',
    install: 'Install the app',
    installLede: 'Free, and the one we recommend for your device.',
    otherDevices: 'Other devices',
    step2: 'Add your profile',
    step2Lede: 'Tap the button on this phone, or download the file and open it with the app.',
    importOvpn: 'Open in OpenVPN Connect',
    downloadProfile: 'Download profile',
    downloadConf: 'Download .conf',
    addConfig: 'Add your configuration',
    wgHint: 'Use one device slot per device. Scan the QR or import the .conf file into the matching app. Keep your configuration private.',
    addServer: 'Add the server',
    ocLede: 'Use Cisco Secure Client or an OpenConnect app. Add the server address, then sign in with your username and password.',
    ocAddress: 'Server address',
    ocShowQr: 'Show QR code',
    ocHideQr: 'Hide QR code',
    ocAdvanced: 'Advanced: certificate pin',
    ocPinHelp: 'Apps that ask you to verify the server can compare this pin.',
    ocPin: 'Certificate pin',
    ocCisco: "In Cisco Secure Client, if the server is not trusted, turn off \"Block untrusted servers\" in the app's settings.",
    step3: 'Sign in',
    step3Lede: 'When the app asks, use these.',
    username: 'Username',
    password: 'Password',
    usage: 'Your usage',
    otherDevice: 'Open on another device',
    otherLede: 'Scan with the phone camera to open this page there.',
    copyLink: "Copy this page's link",
    copied: 'Copied',
    copy: 'Copy',
    support: 'Support',
    channel: 'Channel',
    needHelp: 'Need help?',
    kicker: 'Subscription for',
    scanMe: 'Scan me',
    hey: 'Hey',
    notFound: 'This link is not valid. Ask for a new one.',
    updated: 'Updated {time}',
    days: 'days',
    noProtocols: 'No connection method is available right now. Please contact support.',
    showQr: 'Show QR',
    hideQr: 'Hide QR',
    download: 'Download',
    tkPass: 'Boarding pass',
    tkHolder: 'Passenger',
    tkTraffic: 'Traffic',
    tkValid: 'Valid',
    tkDevices: 'Devices',
    figTraffic: 'Traffic left',
    range7d: '7 days',
    range30d: '30 days',
    downloadLabel: 'Download',
    uploadLabel: 'Upload',
    statusActive: 'Active',
    statusDisabled: 'Disabled',
    statusExpired: 'Expired',
    statusLimited: 'Used up',
    statusPending: 'Not started',
    kinds: {
      telegram: 'Telegram',
      whatsapp: 'WhatsApp',
      instagram: 'Instagram',
      email: 'E-mail',
      phone: 'Phone',
      web: 'Website',
    },
    serversCount: '{n} servers',
    ipsecHost: 'Server address',
    ipsecServerId: 'Server ID',
    ipsecPsk: 'Pre-shared key',
  },
  fa: {
    left: 'باقی‌مانده',
    unlimited: 'ترافیک نامحدود',
    usedOf: '{used} مصرف شده از {total}',
    usedOnly: '{used} مصرف شده',
    endsOn: 'پایان {date}',
    daysLeft: '{n} روز مانده',
    lastDay: 'آخرین روز',
    noEnd: 'بدون تاریخ پایان',
    pending: '{n} روز شما از اولین اتصال شروع می‌شود.',
    ended: 'این پلن در {date} به پایان رسید.',
    endedSimple: 'این پلن منقضی شده است.',
    usedUp: 'همه حجم شما مصرف شده است.',
    disabled: 'این حساب موقتاً متوقف است.',
    renew: 'برای تمدید با پشتیبانی تماس بگیرید.',
    online: 'روی {n} دستگاه متصل',
    onlineOne: 'الان متصل است',
    offline: 'متصل نیست',
    devices: 'حداکثر {n} دستگاه هم‌زمان',
    connect: 'اتصال',
    install: 'نصب برنامه',
    installLede: 'رایگان است و همان برنامه‌ای که برای دستگاه شما پیشنهاد می‌کنیم.',
    otherDevices: 'دستگاه‌های دیگر',
    step2: 'پروفایل خود را اضافه کنید',
    step2Lede: 'روی همین گوشی دکمه را بزنید، یا فایل را دانلود و با برنامه باز کنید.',
    importOvpn: 'باز کردن در OpenVPN Connect',
    downloadProfile: 'دانلود پروفایل',
    downloadConf: 'دریافت فایل ‎.conf',
    addConfig: 'افزودن پیکربندی',
    wgHint: 'برای هر دستگاه از یک جایگاه جداگانه استفاده کنید. کد QR را اسکن کنید یا فایل ‎.conf را در برنامهٔ مربوط وارد کنید. پیکربندی خود را محرمانه نگه دارید.',
    addServer: 'افزودن سرور',
    ocLede: 'از Cisco Secure Client یا یک برنامهٔ OpenConnect استفاده کنید. آدرس سرور را اضافه کنید و با نام کاربری و رمز خود وارد شوید.',
    ocAddress: 'آدرس سرور',
    ocShowQr: 'نمایش کد QR',
    ocHideQr: 'پنهان کردن کد QR',
    ocAdvanced: 'پیشرفته: اثرانگشت گواهی',
    ocPinHelp: 'برنامه‌هایی که از شما می‌خواهند سرور را تأیید کنید، می‌توانند این اثرانگشت را مقایسه کنند.',
    ocPin: 'اثرانگشت گواهی',
    ocCisco: 'در Cisco Secure Client اگر سرور معتبر شناخته نشد، در تنظیمات برنامه گزینهٔ «Block untrusted servers» را خاموش کنید.',
    step3: 'ورود',
    step3Lede: 'وقتی برنامه پرسید، این‌ها را وارد کنید.',
    username: 'نام کاربری',
    password: 'رمز عبور',
    usage: 'مصرف شما',
    otherDevice: 'باز کردن روی دستگاه دیگر',
    otherLede: 'با دوربین گوشی اسکن کنید تا این صفحه آنجا باز شود.',
    copyLink: 'کپی لینک این صفحه',
    copied: 'کپی شد',
    copy: 'کپی',
    support: 'پشتیبانی',
    channel: 'کانال',
    needHelp: 'کمک می‌خواهید؟',
    kicker: 'اشتراک',
    scanMe: 'اسکن کن',
    hey: 'سلام',
    notFound: 'این لینک معتبر نیست. لینک جدید بخواهید.',
    updated: 'به‌روز شده {time}',
    days: 'روز',
    noProtocols: 'فعلاً هیچ روش اتصالی در دسترس نیست. لطفاً با پشتیبانی تماس بگیرید.',
    showQr: 'نمایش QR',
    hideQr: 'بستن QR',
    download: 'دانلود',
    tkPass: 'کارت پرواز',
    tkHolder: 'مسافر',
    tkTraffic: 'حجم',
    tkValid: 'اعتبار',
    tkDevices: 'دستگاه',
    figTraffic: 'ترافیک باقی‌مانده',
    range7d: '۷ روز',
    range30d: '۳۰ روز',
    downloadLabel: 'دانلود',
    uploadLabel: 'آپلود',
    statusActive: 'فعال',
    statusDisabled: 'غیرفعال',
    statusExpired: 'منقضی',
    statusLimited: 'حجم تمام شده',
    statusPending: 'شروع نشده',
    kinds: {
      telegram: 'تلگرام',
      whatsapp: 'واتساپ',
      instagram: 'اینستاگرام',
      email: 'ایمیل',
      phone: 'تلفن',
      web: 'وب‌سایت',
    },
    serversCount: '{n} سرور',
    ipsecHost: 'آدرس سرور',
    ipsecServerId: 'شناسه سرور',
    ipsecPsk: 'کلید مشترک (PSK)',
  },
} as const;

export function fmtSub(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function fmtNum(n: number | string, locale: SubLocale): string {
  if (locale !== 'fa') return String(n);
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
