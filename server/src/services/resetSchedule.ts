export type ResetStrategy =
  | 'none'
  | 'never'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'every_n_days'
  | 'jalali_monthly'
  | 'jalali_yearly';

export function normalizeResetStrategy(raw: string | undefined | null): ResetStrategy {
  const s = (raw || 'never').trim().toLowerCase();
  if (s === 'none') return 'never';
  if (
    s === 'daily' ||
    s === 'weekly' ||
    s === 'monthly' ||
    s === 'yearly' ||
    s === 'every_n_days' ||
    s === 'jalali_monthly' ||
    s === 'jalali_yearly'
  ) {
    return s;
  }
  return 'never';
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sun .. 6 = Sat
}

function getZonedParts(date: Date, timeZone: string, calendar: 'gregory' | 'persian'): ZonedParts {
  const locale = calendar === 'persian' ? 'en-US-u-ca-persian' : 'en-US';
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const num = (type: string) => {
    const val = parts.find((p) => p.type === type)?.value || '0';
    return Number(val.replace(/\D/g, '')) || 0;
  };
  const wdStr = parts.find((p) => p.type === 'weekday')?.value || 'Sun';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour') % 24,
    minute: num('minute'),
    second: num('second'),
    weekday: wdMap[wdStr] ?? 0,
  };
}

/** Find UTC timestamp (ms) corresponding to local midnight (00:00:00) of the day containing `startMs + offsetDays` in `timeZone`. */
function findStartOfLocalDayMs(approxMs: number, timeZone: string): number {
  const target = getZonedParts(new Date(approxMs), timeZone, 'gregory');
  // Refine by stepping to midnight via offset subtraction
  let guess = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = getZonedParts(new Date(guess), timeZone, 'gregory');
    const diffMs = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
    if (p.year === target.year && p.month === target.month && p.day === target.day && diffMs === 0) {
      return guess;
    }
    const dayShift = Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(p.year, p.month - 1, p.day);
    guess += dayShift - diffMs;
  }
  return guess;
}

/** Find the first instant (UTC ms) when a calendar boundary predicate (persian or gregory) starts a new month/year. */
function findNextCalendarBoundaryMs(
  fromMs: number,
  timeZone: string,
  calendar: 'gregory' | 'persian',
  mode: 'month' | 'year',
): number {
  const cur = getZonedParts(new Date(fromMs), timeZone, calendar);
  let probeMs = findStartOfLocalDayMs(fromMs, timeZone) + 24 * 3600_000;
  const maxDays = mode === 'year' ? 370 : 35;
  for (let i = 0; i < maxDays; i++) {
    const p = getZonedParts(new Date(probeMs + 12 * 3600_000), timeZone, calendar);
    if (mode === 'month' && (p.year !== cur.year || p.month !== cur.month) && p.day === 1) {
      return findStartOfLocalDayMs(probeMs + 12 * 3600_000, timeZone);
    }
    if (mode === 'year' && p.year !== cur.year && p.month === 1 && p.day === 1) {
      return findStartOfLocalDayMs(probeMs + 12 * 3600_000, timeZone);
    }
    probeMs += 24 * 3600_000;
  }
  return fromMs + (mode === 'year' ? 365 : 30) * 86400_000;
}

export function computeNextResetIso(
  strategyRaw: string,
  opts: {
    fromMs?: number;
    timeZone?: string;
    resetEveryDays?: number;
    resetAnchor?: number; // 0 = calendar boundaries, 1 = client start
    anchorStartMs?: number;
  } = {},
): string | null {
  const strategy = normalizeResetStrategy(strategyRaw);
  if (strategy === 'never') return null;
  const fromMs = opts.fromMs ?? Date.now();
  const tz = opts.timeZone || 'Asia/Tehran';
  const anchor = Number(opts.resetAnchor || 0);

  try {
    if (strategy === 'daily') {
      const todayStart = findStartOfLocalDayMs(fromMs, tz);
      return new Date(todayStart + 86400_000).toISOString();
    }
    if (strategy === 'weekly') {
      const todayStart = findStartOfLocalDayMs(fromMs, tz);
      if (anchor === 1) {
        return new Date(todayStart + 7 * 86400_000).toISOString();
      }
      const p = getZonedParts(new Date(fromMs), tz, 'gregory');
      // Next Saturday (start of week in Iran) or Monday (1)
      const daysUntilMonday = ((8 - p.weekday) % 7) || 7;
      return new Date(todayStart + daysUntilMonday * 86400_000).toISOString();
    }
    if (strategy === 'every_n_days') {
      const n = Math.max(1, Math.min(365, Math.trunc(opts.resetEveryDays || 30)));
      const baseMs = opts.anchorStartMs ?? fromMs;
      let nextMs = baseMs + n * 86400_000;
      while (nextMs <= fromMs) nextMs += n * 86400_000;
      return new Date(nextMs).toISOString();
    }
    if (strategy === 'monthly') {
      if (anchor === 1) {
        return new Date(fromMs + 30 * 86400_000).toISOString();
      }
      return new Date(findNextCalendarBoundaryMs(fromMs, tz, 'gregory', 'month')).toISOString();
    }
    if (strategy === 'yearly') {
      if (anchor === 1) {
        return new Date(fromMs + 365 * 86400_000).toISOString();
      }
      return new Date(findNextCalendarBoundaryMs(fromMs, tz, 'gregory', 'year')).toISOString();
    }
    if (strategy === 'jalali_monthly') {
      if (anchor === 1) {
        const p = getZonedParts(new Date(fromMs), tz, 'persian');
        const days = p.month <= 6 ? 31 : p.month <= 11 ? 30 : 29;
        return new Date(fromMs + days * 86400_000).toISOString();
      }
      return new Date(findNextCalendarBoundaryMs(fromMs, tz, 'persian', 'month')).toISOString();
    }
    if (strategy === 'jalali_yearly') {
      if (anchor === 1) {
        return new Date(fromMs + 365 * 86400_000).toISOString();
      }
      return new Date(findNextCalendarBoundaryMs(fromMs, tz, 'persian', 'year')).toISOString();
    }
  } catch {
    // Fallback if invalid timezone string
    const d = new Date(fromMs);
    if (strategy === 'daily') return new Date(d.getTime() + 86400_000).toISOString();
    if (strategy === 'weekly') return new Date(d.getTime() + 7 * 86400_000).toISOString();
    if (strategy === 'yearly' || strategy === 'jalali_yearly') return new Date(d.getTime() + 365 * 86400_000).toISOString();
    return new Date(d.getTime() + 30 * 86400_000).toISOString();
  }
  return null;
}
