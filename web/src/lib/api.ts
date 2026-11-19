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

function stringToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function makeChunkId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal | null,
): Promise<Response> {
  const controller = timeoutMs > 0 ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort();
      else outerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  try {
    return await fetch(url, {
      ...init,
      signal: controller ? controller.signal : outerSignal,
      credentials: 'include',
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' && !outerSignal?.aborted) {
      throw new ApiError(0, 'Request timed out. Please try again.', 'timeout');
    }
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
  _retriedMfa = false,
): Promise<T> {
  const { timeoutMs, signal: outerSignal, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers);
  if (fetchInit.body && !headers.has('Content-Type') && !(fetchInit.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfToken && fetchInit.method && fetchInit.method !== 'GET' && fetchInit.method !== 'HEAD') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const method = (fetchInit.method || 'GET').toUpperCase();
  const bodyStr = typeof fetchInit.body === 'string' ? fetchInit.body : null;
  const effTimeout = timeoutMs ?? (fetchInit.body instanceof FormData ? 60_000 : 25_000);

  let res: Response;
  // Transparently split larger JSON mutations into <400B base64 chunks so single TCP frames fit even on low-MTU links
  if (
    bodyStr &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
    path !== '/_chunk' &&
    new TextEncoder().encode(bodyStr).length > 400
  ) {
    const b64 = stringToBase64(bodyStr);
    const chunkSize = 360;
    const total = Math.max(1, Math.ceil(b64.length / chunkSize));
    const chunkId = makeChunkId();
    let finalRes: Response | null = null;
    for (let idx = 0; idx < total; idx++) {
      const part = b64.slice(idx * chunkSize, (idx + 1) * chunkSize);
      const chunkPayload =
        idx === 0
          ? { id: chunkId, i: idx, n: total, m: method, p: path, d: part }
          : { id: chunkId, i: idx, n: total, d: part };
      finalRes = await fetchWithTimeout(
        `${getApiBase()}/_chunk`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: JSON.stringify(chunkPayload),
        },
        effTimeout,
        outerSignal,
      );
      if (idx < total - 1 && !finalRes.ok) {
        break;
      }
    }
    res = finalRes!;
  } else {
    res = await fetchWithTimeout(`${getApiBase()}${path}`, { ...fetchInit, headers }, effTimeout, outerSignal);
  }

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
