import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  widthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  widthClass = 'max-w-lg',
  footer,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ovira-backdrop fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`ovira-sheet flex h-full w-full ${widthClass} flex-col border-s border-(--border-strong) bg-(--bg-surface)`}
      >
        <div className="flex items-start justify-between border-b border-(--border-subtle) px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-(--text-primary)">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-(--text-secondary)">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary) transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="border-t border-(--border-subtle) bg-(--bg-surface) px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
