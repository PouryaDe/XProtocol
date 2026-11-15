import React, { useEffect, useLayoutEffect, useState } from 'react';

const SPOTLIGHT_SELECTOR = '.xp-card, .xp-kpis, .node-card, .login-form-card';

export function Ambient() {
  useEffect(() => {
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(pointer: fine)').matches;
    if (reduced) return;

    const root = document.documentElement;
    let raf = 0;
    let lastEvent: PointerEvent | null = null;

    const flush = () => {
      raf = 0;
      if (!lastEvent) return;
      root.style.setProperty('--cx', `${lastEvent.clientX}px`);
      root.style.setProperty('--cy', `${lastEvent.clientY}px`);
      const card = (lastEvent.target as HTMLElement | null)?.closest?.(SPOTLIGHT_SELECTOR) as HTMLElement | null;
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${lastEvent.clientX - rect.left}px`);
        card.style.setProperty('--my', `${lastEvent.clientY - rect.top}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      root.dataset.pointer = 'on';
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      delete root.dataset.pointer;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden="true">
      <i className="blob a" />
      <i className="blob b" />
      <i className="blob c" />
      <div className="dots" />
      <div className="dots lit" />
    </div>
  );
}

export function useSlidingIndicator(
  containerRef: React.RefObject<HTMLElement | null>,
  activeSelector: string,
  depKey: string | number,
) {
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const target = el.querySelector(activeSelector) as HTMLElement | null;
      if (target) {
        el.style.setProperty('--ind-x', `${target.offsetLeft}px`);
        el.style.setProperty('--ind-y', `${target.offsetTop}px`);
        el.style.setProperty('--ind-w', `${target.offsetWidth}px`);
        el.style.setProperty('--ind-h', `${target.offsetHeight}px`);
        el.style.setProperty('--ind-o', '1');
      } else {
        el.style.setProperty('--ind-o', '0');
      }
    };

    update();
    const raf = requestAnimationFrame(() => el.setAttribute('data-ready', ''));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    document.fonts?.ready?.then(update);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [containerRef, activeSelector, depKey]);
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="xp-mark">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle
        className="m-ring"
        cx="16"
        cy="16"
        r="8.4"
        pathLength={1}
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        className="m-v"
        d="M11.9 13.4 16 19.2l4.1-5.8"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DIGIT_SETS = ['0123456789', '۰۱۲۳۴۵۶۷۸۹', '٠١٢٣٤٥٦٧٨٩'];
const NUM_RUN_RE = /([0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٫٬،]*)/;

export function Odometer({ value, className = '' }: { value: string | number; className?: string }) {
  const str = String(value);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
    const timer = setTimeout(() => setArmed(true), 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <span className={`odo ${className}`} role="img" aria-label={str}>
      {str.split(NUM_RUN_RE).map((part, idx) => {
        if (!part) return null;
        if (idx % 2 === 0) {
          return part.trim() ? (
            <span key={idx} className="odo-u" aria-hidden="true">
              {part.trim()}
            </span>
          ) : null;
        }
        const chars = Array.from(part);
        return (
          <span key={idx} className="odo-n" dir="ltr" aria-hidden="true">
            {chars.map((ch, ci) => {
              const setIdx = DIGIT_SETS.findIndex((s) => s.includes(ch));
              if (setIdx < 0) return <span key={chars.length - ci}>{ch}</span>;
              const pos = DIGIT_SETS[setIdx].indexOf(ch);
              return (
                <span
                  key={chars.length - ci}
                  className="odo-d"
                  style={{ '--n': armed ? pos : 0, '--k': chars.length - ci } as React.CSSProperties}
                >
                  <span className="odo-strip">
                    {Array.from(DIGIT_SETS[setIdx]).map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </span>
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

export function SplitHeading({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <h1 className={className}>
      {words.map((w, i) => (
        <React.Fragment key={`${w}-${i}`}>
          <span className="w">
            <span style={{ '--i': i } as React.CSSProperties}>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </h1>
  );
}

export function EqLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div className="xp-loader" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      {label && <span className="text-xs text-(--text-secondary)">{label}</span>}
    </div>
  );
}

export function EmptySonar({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="xp-empty-ring" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="text-xs text-(--text-muted)">{text}</p>
    </div>
  );
}

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
      'border border-(--border-strong) bg-gradient-to-b from-(--bg-elevated) to-(--bg-surface) text-(--text-primary) shadow-[inset_0_1px_0_var(--edge)] hover:border-(--accent)/55 hover:bg-(--bg-hover)',
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
        className={`w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) transition focus:border-(--accent) focus:bg-(--bg-surface) focus:shadow-[0_0_0_4px_var(--accent-wash)] focus:outline-none ${className}`}
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
        className={`w-full rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-sm text-(--text-primary) transition focus:border-(--accent) focus:outline-none ${className}`}
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
    lime: 'bg-(--accent-soft) text-(--accent-text) border-(--accent)/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    red: 'bg-red-500/15 text-red-400 border-red-500/25',
    blue: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    gray: 'bg-slate-500/15 text-(--text-secondary) border-(--border-subtle)',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium uppercase tracking-wider rtl:font-sans rtl:tracking-normal rtl:normal-case ${styles[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'lime' || tone === 'green' ? 'xp-status-live' : ''}`} />
      {label}
    </span>
  );
}
