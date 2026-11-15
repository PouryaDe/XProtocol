import React from 'react';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`ovira-card ${className}`}>{children}</div>;
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
    primary: 'ovira-btn-primary',
    secondary:
      'border border-[var(--border-strong)] bg-gradient-to-b from-[var(--bg-elevated)] to-[var(--bg-surface)] text-[var(--text-primary)] shadow-[inset_0_1px_0_var(--edge)] hover:bg-[var(--bg-hover)]',
    danger: 'border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25',
    ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
  }[variant];

  return (
    <button
      {...rest}
      className={`ovira-btn inline-flex items-center justify-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${sizes} ${variants} ${className}`}
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
      {label && <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
      <input
        {...rest}
        className={`w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none ${className}`}
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
      {label && <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
      <select
        {...rest}
        className={`w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none ${className}`}
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
    lime: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    red: 'bg-red-500/15 text-red-400 border-red-500/25',
    blue: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    gray: 'bg-slate-500/15 text-[var(--text-secondary)] border-[var(--border-subtle)]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'lime' || tone === 'green' ? 'ovira-status-live' : ''}`} />
      {label}
    </span>
  );
}
