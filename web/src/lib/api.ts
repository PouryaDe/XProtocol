let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getApiBase(): string {
  return './api';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
