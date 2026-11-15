import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, subtitle, maxWidth = 'max-w-xl', children }: ModalProps) {
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
      className="ovira-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`ovira-dialog w-full ${maxWidth} max-h-[90vh] overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface)] flex flex-col`}
      >
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
