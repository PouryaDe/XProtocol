import { getBasePath } from './router';

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getApiBase(): string {
  const base = getBasePath();
  return base ? `${base}/api` : '/api';
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let mfaConfirmHandler: (() => Promise<boolean>) | null = null;

export function registerMfaConfirmHandler(fn: (() => Promise<boolean>) | null): void {
  mfaConfirmHandler = fn;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}, _retriedMfa = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfToken && init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) msg = data.error;
      if (data.code) code = data.code;
    } catch {
      // ignore
    }
    if (res.status === 403 && code === 'mfa_confirm_required' && !_retriedMfa && mfaConfirmHandler) {
      const confirmed = await mfaConfirmHandler();
      if (confirmed) {
        return apiFetch<T>(path, init, true);
      }
    }
    throw new ApiError(res.status, msg, code);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
