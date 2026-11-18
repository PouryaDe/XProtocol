import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from './UiPrimitives';
import type { InboundRemote } from '../lib/inboundTypes';

export const FLAG_OPTIONS: Array<{ value: string; emoji: string; label: string }> = [
  { value: '', emoji: '🏳️', label: 'No flag' },
  { value: '🇩🇪', emoji: '🇩🇪', label: 'DE' },
  { value: '🇳🇱', emoji: '🇳🇱', label: 'NL' },
  { value: '🇫🇮', emoji: '🇫🇮', label: 'FI' },
  { value: '🇬🇧', emoji: '🇬🇧', label: 'GB' },
  { value: '🇺🇸', emoji: '🇺🇸', label: 'US' },
  { value: '🇹🇷', emoji: '🇹🇷', label: 'TR' },
  { value: '🇫🇷', emoji: '🇫🇷', label: 'FR' },
  { value: '🇸🇪', emoji: '🇸🇪', label: 'SE' },
  { value: '🇵🇱', emoji: '🇵🇱', label: 'PL' },
  { value: '🇨🇭', emoji: '🇨🇭', label: 'CH' },
  { value: '🇦🇹', emoji: '🇦🇹', label: 'AT' },
  { value: '🇸🇬', emoji: '🇸🇬', label: 'SG' },
  { value: '🇦🇪', emoji: '🇦🇪', label: 'AE' },
  { value: '🇯🇵', emoji: '🇯🇵', label: 'JP' },
  { value: '🇭🇰', emoji: '🇭🇰', label: 'HK' },
  { value: '🇷🇺', emoji: '🇷🇺', label: 'RU' },
];

export function ConnectAddressesField({
  lang,
  remotes,
  onChange,
  showSni = false,
  showHostHeader = false,
}: {
  lang: 'en' | 'fa';
  remotes: InboundRemote[];
  onChange: (next: InboundRemote[]) => void;
  showSni?: boolean;
  showHostHeader?: boolean;
}) {
  const L = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const patchRow = (idx: number, patch: Partial<InboundRemote>) => {
    onChange(remotes.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= remotes.length) return;
    const copy = [...remotes];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    onChange(copy);
  };

  return (
    <div className="space-y-2.5">
      {remotes.map((r, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={L('Choose a country flag', 'انتخاب پرچم کشور')}
              value={r.flag || ''}
              onChange={(e) => patchRow(idx, { flag: e.target.value })}
              className="select h-8! w-24! px-2! text-xs"
            >
              {FLAG_OPTIONS.map((f) => (
                <option key={f.value || 'none'} value={f.value}>
                  {f.emoji} {f.value ? f.label : L('Flag', 'پرچم')}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder={L('Label', 'برچسب')}
              value={r.label}
              onChange={(e) => patchRow(idx, { label: e.target.value })}
              className="input h-8! min-w-32.5 flex-1 px-2.5! text-xs"
            />

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveRow(idx, -1)}
                title={L('Move up', 'انتقال به بالا')}
                className="rounded-md border border-(--border-subtle) p-1.5 text-(--text-muted) hover:text-(--text-primary) disabled:opacity-35"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === remotes.length - 1}
                onClick={() => moveRow(idx, 1)}
                title={L('Move down', 'انتقال به پایین')}
                className="rounded-md border border-(--border-subtle) p-1.5 text-(--text-muted) hover:text-(--text-primary) disabled:opacity-35"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(remotes.filter((_, i) => i !== idx))}
                title={L('Remove', 'حذف')}
                className="rounded-md border border-(--border-subtle) p-1.5 text-(--text-muted) hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              dir="ltr"
              placeholder={L('Host (e.g. relay.example.com)', 'میزبان')}
              value={r.host}
              onChange={(e) => patchRow(idx, { host: e.target.value })}
              className="input h-8! px-2.5! font-mono text-xs sm:col-span-2"
            />
            <input
              type="text"
              dir="ltr"
              placeholder={L('Port (same)', 'پورت (مشابه)')}
              value={r.port}
              onChange={(e) => patchRow(idx, { port: e.target.value })}
              className="input h-8! px-2.5! font-mono text-xs"
            />
            {showSni && (
              <input
                type="text"
                dir="ltr"
                placeholder="SNI"
                value={r.sni || ''}
                onChange={(e) => patchRow(idx, { sni: e.target.value })}
                className="input h-8! px-2.5! font-mono text-xs"
              />
            )}
            {showHostHeader && (
              <input
                type="text"
                dir="ltr"
                placeholder={L('Host header', 'هدر Host')}
                value={r.hostHeader || ''}
                onChange={(e) => patchRow(idx, { hostHeader: e.target.value })}
                className="input h-8! px-2.5! font-mono text-xs"
              />
            )}
          </div>
        </div>
      ))}

      <div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange([...remotes, { flag: '', label: '', host: '', port: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          {L('Add an address', 'افزودن آدرس')}
        </Button>
      </div>
    </div>
  );
}
