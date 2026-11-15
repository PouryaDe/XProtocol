import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { useUi } from '../i18n/context';

interface Sample {
  ts: string;
  download_bytes: number;
  upload_bytes: number;
}

export function TrafficChart({
  data,
  height = 150,
  mode = 'bars',
  showTableToggle = false,
}: {
  data: Sample[];
  height?: number;
  mode?: 'bars' | 'trend';
  showTableToggle?: boolean;
}) {
  const { t, lang } = useUi();
  const [tableOpen, setTableOpen] = useState(false);

  if (!data || data.length === 0) {
    return <div className="flex h-32 items-center justify-center text-xs text-(--text-muted)">—</div>;
  }

  const maxTotal = Math.max(1, ...data.map((d) => d.download_bytes + d.upload_bytes));
  const maxSingle = Math.max(1, ...data.map((d) => Math.max(d.download_bytes, d.upload_bytes)));

  const buildPolyline = (getter: (d: Sample) => number) => {
    const w = 600;
    const h = height;
    const padY = 8;
    return data
      .map((d, idx) => {
        const x = data.length === 1 ? w / 2 : (idx / (data.length - 1)) * w;
        const y = h - padY - (getter(d) / maxSingle) * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-(--text-secondary)">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-(--accent)" />
          {t.overview.download}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-(--info)" />
          {t.overview.upload}
        </span>
      </div>

      {mode === 'bars' ? (
        <div className="flex items-end gap-1" style={{ height }}>
          {data.map((item) => {
            const dlPct = (item.download_bytes / maxTotal) * 100;
            const ulPct = (item.upload_bytes / maxTotal) * 100;
            const label = item.ts.length > 10 ? item.ts.slice(11, 16) : item.ts.slice(5);
            return (
              <div key={item.ts} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-2 py-1 text-[10px] text-(--text-primary) shadow-lg group-hover:block">
                  <div className="font-mono">{label}</div>
                  <div>
                    ↓ {formatBytes(item.download_bytes, lang)} · ↑ {formatBytes(item.upload_bytes, lang)}
                  </div>
                </div>
                <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: '100%' }}>
                  <div
                    className="w-full bg-(--info) opacity-85 transition-all group-hover:opacity-100"
                    style={{ height: `${Math.max(ulPct, item.upload_bytes > 0 ? 2 : 0)}%` }}
                  />
                  <div
                    className="w-full bg-(--accent) opacity-90 transition-all group-hover:opacity-100"
                    style={{ height: `${Math.max(dlPct, item.download_bytes > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <svg viewBox={`0 0 600 ${height}`} className="w-full overflow-visible" style={{ height }}>
          <polyline
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            points={buildPolyline((d) => d.download_bytes)}
          />
          <polyline
            fill="none"
            stroke="var(--info)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
            points={buildPolyline((d) => d.upload_bytes)}
          />
        </svg>
      )}

      {showTableToggle && (
        <div className="mt-3 border-t border-(--border-subtle) pt-2">
          <button
            type="button"
            onClick={() => setTableOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            {tableOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>View data table</span>
          </button>
          {tableOpen && (
            <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-(--border-subtle)">
              <table className="w-full text-xs">
                <thead className="bg-(--bg-elevated) text-(--text-muted)">
                  <tr>
                    <th className="px-3 py-1.5 text-start">Time</th>
                    <th className="px-3 py-1.5 text-end">{t.overview.download}</th>
                    <th className="px-3 py-1.5 text-end">{t.overview.upload}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border-subtle) font-mono">
                  {data.map((d) => (
                    <tr key={d.ts}>
                      <td className="px-3 py-1 text-(--text-secondary)">
                        {d.ts.length > 10 ? d.ts.slice(0, 16).replace('T', ' ') : d.ts}
                      </td>
                      <td className="px-3 py-1 text-end text-(--text-primary)">{formatBytes(d.download_bytes, lang)}</td>
                      <td className="px-3 py-1 text-end text-(--text-secondary)">{formatBytes(d.upload_bytes, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
