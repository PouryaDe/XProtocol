import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useUi } from '../i18n/context';
import { Button, Input } from './UiPrimitives';
import { Modal } from './Modal';

interface MfaConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirmed: () => void;
}

export function MfaConfirmModal({ open, onCancel, onConfirmed }: MfaConfirmModalProps) {
  const { lang } = useUi();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/auth/me/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      setCode('');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={lang === 'fa' ? 'تایید کد دومرحله‌ای' : 'Confirm two-factor code'}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
          <ShieldAlert size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
          <span>
            {lang === 'fa'
              ? 'این عملیات حساس نیاز به وارد کردن یک کد تازه از برنامه احراز هویت دارد (یا یکی از کدهای بازیابی).'
              : 'This sensitive action requires a fresh code from your authenticator app (or an unused recovery code).'}
          </span>
        </div>
        <Input
          label={lang === 'fa' ? 'کد تایید' : 'Verification code'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoFocus
        />
        {error && <div className="text-xs" style={{ color: 'var(--bad)' }}>{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {lang === 'fa' ? 'انصراف' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !code.trim()}>
            {busy ? (lang === 'fa' ? 'در حال بررسی...' : 'Verifying...') : lang === 'fa' ? 'تایید و ادامه' : 'Confirm'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
