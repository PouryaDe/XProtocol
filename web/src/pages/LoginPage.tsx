import React, { useState } from 'react';
import { Eye, EyeOff, Globe, Lock, Monitor, Moon, Sun } from 'lucide-react';
import { apiFetch, setCsrfToken } from '../lib/api';
import { useUi, type ThemeMode } from '../i18n/context';
import { BrandMark, Button, Card, Input } from '../components/UiPrimitives';
import type { CurrentAccount } from '../components/Layout';

function BoreTunnelArt() {
  return (
    <svg className="bore" viewBox="0 0 600 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="bore-glow" cx="300" cy="400" r="260" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="bore-sun" cx="300" cy="400" r="260" fill="url(#bore-glow)" />
      <path className="bore-lane" d="M300 400 L-40 760" />
      <path className="bore-lane" d="M300 400 L640 760" />
      {Array.from({ length: 10 }, (_, idx) => (
        <g key={idx} className="bore-gate" style={{ '--i': idx } as React.CSSProperties}>
          <path d="M40 680 V300 A260 260 0 0 1 560 300 V680" />
          <path className="bore-lamp" d="M270 42 H330" />
        </g>
      ))}
    </svg>
  );
}

export function LoginPage({ onSuccess }: { onSuccess: (acc: CurrentAccount) => void }) {
  const { t, lang, setLang, theme, resolvedTheme, setTheme, brandName } = useUi();

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-shell">
      {/* Animated Tunnel Artwork Left Pane */}
      <div className="login-art">
        <BoreTunnelArt />
        <div className="login-pitch">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-(--text-muted) rtl:font-sans rtl:tracking-normal rtl:normal-case">
            {brandName} · {lang === 'fa' ? 'پنل چندپروتکلی وی‌پی‌ان' : 'MULTI-PROTOCOL VPN PANEL'}
          </span>
          <p className="text-(--text-primary)">
            {lang === 'fa'
              ? 'کنترل کامل تونل‌ها، نودها و اشتراک‌ها در یک جا.'
              : 'Every tunnel, node and client in one place.'}
          </p>
        </div>
      </div>

      {/* Sign-in Column Right Pane */}
      <div className="flex flex-col px-6 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2.5 font-display text-base font-bold tracking-tight text-(--text-primary)">
            <BrandMark size={26} />
            <span>{brandName}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleTheme}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary) transition"
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
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary) transition"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'en' ? 'فارسی' : 'English'}
            </button>
          </div>
        </div>

        <Card className="login-form-card mx-auto my-auto w-full max-w-[420px] p-8">
          <div style={{ '--s': 0 } as React.CSSProperties} className="mb-5">
            <h1 className="font-display text-3xl font-bold tracking-tight text-(--text-primary)">
              {needs2fa ? (lang === 'fa' ? 'تأیید دو مرحله‌ای' : 'Two-factor check') : t.auth.signIn}
            </h1>
            <p className="mt-1 text-sm text-(--text-secondary)">{t.auth.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div style={{ '--s': 1 } as React.CSSProperties}>
              <Input
                label={t.auth.username}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div style={{ '--s': 2 } as React.CSSProperties} className="relative">
              <Input
                label={t.auth.password}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pe-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute bottom-1.5 end-1.5 rounded-lg p-1.5 text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {needs2fa && (
              <div style={{ '--s': 3 } as React.CSSProperties}>
                <Input
                  label={t.auth.totpCode}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="font-mono text-lg tracking-[0.28em]"
                  autoFocus
                  required
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <div style={{ '--s': 4 } as React.CSSProperties}>
              <Button type="submit" variant="primary" className="h-11 w-full text-base" disabled={loading}>
                <Lock className="h-4 w-4" />
                {loading ? t.common.loading : needs2fa ? t.auth.verify : t.auth.signIn}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
