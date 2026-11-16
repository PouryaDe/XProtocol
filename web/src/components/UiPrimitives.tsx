import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../i18n/context';

const SPOTLIGHT_SELECTOR =
  '.xp-card, .xp-kpis, .node-card, .login-form-card, .panel, .kpis, .editor, .update-hero, .group-card, .sub-hero, .sub-qr, .chart, .sub-steps';

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
        const dotIdx = chars.findIndex((c) => c === '.' || c === '٫');
        const intChars = dotIdx >= 0 ? chars.slice(0, dotIdx) : chars;
        const fracChars = dotIdx >= 0 ? chars.slice(dotIdx) : [];
        const renderChar = (ch: string, ci: number) => {
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
        };
        return (
          <span key={idx} className="odo-n" dir="ltr" aria-hidden="true">
            {intChars.map((ch, i) => renderChar(ch, i))}
            {fracChars.length > 0 && (
              <span className="odo-frac">{fracChars.map((ch, i) => renderChar(ch, intChars.length + i))}</span>
            )}
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

export function EmptySonar({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="xp-empty-ring" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="text-xs text-(--text-muted)">{text}</p>
      {action}
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
  const sizes = size === 'sm' ? 'h-[30px] px-3 text-[13px] rounded-[8px]' : 'h-[36px] px-4 text-[14px]';
  const variants = {
    primary: 'xp-btn-primary',
    secondary:
      'border border-(--border-strong) bg-gradient-to-b from-(--bg-elevated) to-(--bg-surface) text-(--text-primary) shadow-[inset_0_1px_0_var(--edge)] hover:border-(--accent)/55 hover:bg-(--bg-hover)',
    danger: 'border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25',
    ghost: 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
  }[variant];

  return (
    <button
      type="button"
      {...rest}
      className={`xp-btn inline-flex items-center justify-center gap-2 font-[560] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${sizes} ${variants} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useSlidingIndicator(ref, '[aria-pressed="true"]', value);
  return (
    <div className="segmented" role="group" aria-label={label} ref={ref}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.value === value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
  const tagClass: Record<string, string> = {
    green: 'tag tag-active',
    lime: 'tag tag-online',
    amber: 'tag tag-pending',
    red: 'tag tag-expired',
    blue: 'tag tag-online',
    gray: 'tag tag-disabled',
  };
  return (
    <span className={tagClass[tone] || 'tag tag-disabled'}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function PageHead({
  title,
  sub,
  actions,
  docTitle,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  docTitle?: string;
}) {
  const { brandName } = useUi();
  const resolvedDoc = docTitle ?? (typeof title === 'string' ? title : '');

  useEffect(() => {
    if (resolvedDoc) {
      document.title = `${resolvedDoc} · ${brandName || 'XProtocol'}`;
    }
  }, [resolvedDoc, brandName]);

  return (
    <div className="pagehead">
      <div className="ph-text">
        {typeof title === 'string' ? <SplitHeading text={title} /> : <h1>{title}</h1>}
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {actions ? <div className="ph-actions">{actions}</div> : null}
    </div>
  );
}

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  count?: number;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useSlidingIndicator(tabsRef, '[aria-selected="true"]', value);

  return (
    <div ref={tabsRef} className="tabs" role="tablist">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'active' : undefined}
            onClick={() => onChange(item.id)}
          >
            <span>{item.label}</span>
            {item.count !== undefined ? <span className="t-count count">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Lamps({
  used,
  limit,
  count = 12,
  size = 'sm',
}: {
  used: number;
  limit: number;
  count?: number;
  size?: 'sm' | 'lg';
}) {
  if (!limit || limit <= 0) {
    return (
      <span className={`${size === 'lg' ? 'lamps lamps-lg' : 'lamps'} lamps-unlimited`} aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <i key={i} className="on" />
        ))}
      </span>
    );
  }
  const remainingFrac = Math.max(0, Math.min(1, 1 - used / limit));
  const lit = remainingFrac * count;
  return (
    <span className={size === 'lg' ? 'lamps lamps-lg' : 'lamps'} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const part = Math.max(0, Math.min(1, lit - i));
        const cls = part >= 1 ? 'on' : part > 0 ? 'part' : undefined;
        return (
          <i
            key={i}
            className={cls}
            style={part > 0 && part < 1 ? ({ '--f': part } as React.CSSProperties) : undefined}
          />
        );
      })}
    </span>
  );
}

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionMenu({
  label,
  trigger,
  items,
}: {
  label: string;
  trigger: React.ReactNode;
  items: (ActionMenuItem | null | false | undefined)[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const [sheet, setSheet] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const triggerRect = btnRef.current?.getBoundingClientRect();
    const menuEl = menuRef.current;
    if (!triggerRect || !menuEl) return;
    if (window.innerWidth < 640) {
      setSheet(true);
      setPos({});
      return;
    }
    setSheet(false);
    const w = menuEl.offsetWidth;
    const h = menuEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isRtl = getComputedStyle(document.documentElement).direction === 'rtl';
    let left = isRtl ? triggerRect.left : triggerRect.right - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = triggerRect.bottom + 4;
    if (top + h > vh - 8) {
      const above = triggerRect.top - 4 - h;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    setPos({ left, top, maxHeight: vh - 16 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node | null)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const cleanItems = items.filter((item): item is ActionMenuItem | null => item !== false && item !== undefined);

  return (
    <div className="menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <>
            {sheet ? <div className="menu-scrim" aria-hidden="true" onMouseDown={close} /> : null}
            <div
              ref={menuRef}
              className={`menu${sheet ? ' sheet' : ''}`}
              role="menu"
              aria-label={label}
              style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}
            >
              {cleanItems.map((item, idx) =>
                item === null ? (
                  <hr key={idx} />
                ) : (
                  <button
                    key={item.label + idx}
                    type="button"
                    role="menuitem"
                    className={item.danger ? 'danger' : undefined}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      btnRef.current?.focus();
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          </>,
          btnRef.current?.closest('dialog[open]') ?? document.body,
        )}
    </div>
  );
}
