import React from 'react';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`xp-card ${className}`}>{children}</div>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const sizes = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm';
  const variants = {
    primary: 'xp-btn-primary',
    secondary:
      'border border-(--border-strong) bg-gradient-to-b from-(--bg-elevated) to-(--bg-surface) text-(--text-primary) shadow-[inset_0_1px_0_var(--edge)] hover:bg-(--bg-hover)',
    danger: 'border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25',
    ghost: 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
  }[variant];

  return (
    <button
      {...rest}
      className={`xp-btn inline-flex items-center justify-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${sizes} ${variants} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">{label}</span>}
      <input
        {...rest}
        className={`w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none ${className}`}
      />
    </label>
  );
}

export function Select({
  label,
  className = '',
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">{label}</span>}
      <select
        {...rest}
        className={`w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary) focus:border-(--accent) focus:outline-none ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

export function StatusPill({
  tone,
  label,
}: {
  tone: 'green' | 'lime' | 'amber' | 'red' | 'gray' | 'blue';
  label: string;
}) {
  const styles: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    lime: 'bg-(--accent-soft) text-(--accent) border-(--accent)/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    red: 'bg-red-500/15 text-red-400 border-red-500/25',
    blue: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    gray: 'bg-slate-500/15 text-(--text-secondary) border-(--border-subtle)',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'lime' || tone === 'green' ? 'xp-status-live' : ''}`} />
      {label}
    </span>
  );
}
