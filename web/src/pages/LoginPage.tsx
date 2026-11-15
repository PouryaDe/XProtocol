import React, { useState } from 'react';
import { Globe, Lock, Monitor, Moon, Sun } from 'lucide-react';
import { apiFetch, setCsrfToken } from '../lib/api';
import { useUi, type ThemeMode } from '../i18n/context';
import { Button, Card, Input } from '../components/UiPrimitives';
import type { CurrentAccount } from '../components/Layout';

export function LoginPage({ onSuccess }: { onSuccess: (acc: CurrentAccount) => void }) {
  const { t, lang, setLang, theme, resolvedTheme, setTheme, brandName } = useUi();

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        requires2fa?: boolean;
        csrfToken?: string;
        account?: CurrentAccount;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          totpCode: needs2fa ? totpCode : undefined,
        }),
      });
      if (res.requires2fa) {
        setNeeds2fa(true);
      } else if (res.account) {
        setCsrfToken(res.csrfToken || null);
        onSuccess(res.account);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5"
        >
          {theme === 'system' ? (
            <Monitor className="h-3.5 w-3.5" />
          ) : resolvedTheme === 'dark' ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
          {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}
        </button>
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5"
        >
          <Globe className="h-3.5 w-3.5" />
          {lang === 'en' ? 'فارسی' : 'English'}
        </button>
      </div>

      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-lg">
            ◆
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">{brandName}</h1>
            <p className="text-xs text-[var(--text-secondary)]">{t.auth.subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t.auth.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label={t.auth.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {needs2fa && (
            <Input
              label={t.auth.totpCode}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="123456"
              autoFocus
              required
            />
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            <Lock className="h-4 w-4" />
            {loading ? t.common.loading : needs2fa ? t.auth.verify : t.auth.signIn}
          </Button>
        </form>
      </Card>
    </div>
  );
}
