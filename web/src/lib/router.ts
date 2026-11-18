import { useEffect, useState } from 'react';

interface XpGlobals {
  __XP_BASE_PATH__?: string;
  __XP_SUB_PATH__?: string;
}

const KNOWN_SEGMENTS = [
  'clients',
  'templates',
  'connections',
  'inbounds',
  'nodes',
  'certificates',
  'routing',
  'groups',
  'accounts',
  'admins',
  'updates',
  'settings',
  'servers',
];

function inferBasePath(): string {
  const g = window as unknown as XpGlobals;
  if (typeof g.__XP_BASE_PATH__ === 'string') {
    return g.__XP_BASE_PATH__.replace(/\/+$/, '');
  }
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 0 && !KNOWN_SEGMENTS.includes(parts[0]) && parts[0] !== 'sub') {
    return `/${parts[0]}`;
  }
  return '';
}

export function getBasePath(): string {
  return inferBasePath();
}

export function getSubPath(): string {
  const g = window as unknown as XpGlobals;
  return (g.__XP_SUB_PATH__ || 'sub').replace(/^\/+|\/+$/g, '');
}

/** Normalize app-internal path (e.g. '/clients?new=1') to real URL including secretPath prefix. */
export function toPanelUrl(to: string): string {
  const base = getBasePath();
  const [rawPath, rawSearch] = to.split('?');
  const norm = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const full = norm === '/' ? `${base}/` : `${base}${norm}`;
  return rawSearch ? `${full}?${rawSearch}` : full;
}

/** Extract app-relative pathname (e.g. '/clients/3') from current window.location.pathname. */
export function getRelativePath(pathname = window.location.pathname): string {
  const base = getBasePath();
  let rel = pathname;
  if (base && (rel === base || rel.startsWith(`${base}/`))) {
    rel = rel.slice(base.length) || '/';
  }
  if (!rel.startsWith('/')) rel = `/${rel}`;
  return rel.length > 1 ? rel.replace(/\/+$/, '') : '/';
}

export function navigate(to: string, opts?: { replace?: boolean }): void {
  const target = toPanelUrl(to);
  const current = window.location.pathname + window.location.search;
  if (target !== current) {
    if (opts?.replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function updateSearchParams(
  updater: (params: URLSearchParams) => void,
  opts: { replace?: boolean } = { replace: true },
): void {
  const params = new URLSearchParams(window.location.search);
  updater(params);
  const q = params.toString();
  const next = window.location.pathname + (q ? `?${q}` : '');
  if (opts.replace !== false) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocationState() {
  const [loc, setLoc] = useState(() => ({
    pathname: getRelativePath(),
    search: window.location.search,
  }));

  useEffect(() => {
    const sync = () =>
      setLoc({
        pathname: getRelativePath(),
        search: window.location.search,
      });
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return {
    pathname: loc.pathname,
    search: loc.search,
    searchParams: new URLSearchParams(loc.search),
    navigate,
  };
}
