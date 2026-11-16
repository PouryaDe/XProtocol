import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatBytes } from '../lib/format';
import { useUi } from '../i18n/context';

export interface TrafficSample {
  ts: string;
  download_bytes: number;
  upload_bytes: number;
}

function niceScale(maxVal: number): number {
  if (maxVal <= 0) return 1024 * 1024;
  const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const frac = maxVal / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

export function TrafficChart({
  data,
  height = 280,
  mode = 'bars',
  showTableToggle = false,
  daily = false,
}: {
  data: TrafficSample[];
  height?: number;
  mode?: 'bars' | 'trend';
  showTableToggle?: boolean;
  daily?: boolean;
}) {
  const { t, lang } = useUi();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 640);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setHoverIdx(null);
  }, [data.length, mode]);

  const samples = data ?? [];
  const totalBytes = useMemo(
    () => samples.reduce((acc, d) => acc + (d.download_bytes || 0) + (d.upload_bytes || 0), 0),
    [samples],
  );

  const rawMax = useMemo(
    () =>
      Math.max(
        0,
        ...samples.map((d) =>
          mode === 'trend'
            ? Math.max(d.download_bytes || 0, d.upload_bytes || 0)
            : (d.download_bytes || 0) + (d.upload_bytes || 0),
        ),
      ),
    [samples, mode],
  );

  const scaleMax = niceScale(rawMax);
  const formatTickY = (v: number) => (v === 0 ? '0 B' : formatBytes(v, lang));
  const yLabelW = Math.max(44, Math.max(...[0.5, 1].map((f) => formatTickY(scaleMax * f).length)) * 6.8 + 14);
  const plotW = Math.max(0, width - yLabelW - 8);
  const plotH = Math.max(60, height - 30);
  const nCols = samples.length || 1;
  const colW = plotW / nCols;
  const barW = Math.max(2, Math.min(28, colW * 0.68));
  const yOf = (val: number) => 8 + plotH - (val / scaleMax) * plotH;
  const tickStep = Math.max(1, Math.ceil(nCols / Math.max(2, Math.floor(plotW / 68))));

  const formatTickX = (ts: string) => {
    if (daily) return ts.length >= 10 ? ts.slice(5, 10) : ts;
    return ts.length > 10 ? ts.slice(11, 16) : ts;
  };

  const buildPath = (key: 'download_bytes' | 'upload_bytes') =>
    samples
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${(yLabelW + (i + 0.5) * colW).toFixed(1)},${yOf(d[key] || 0).toFixed(1)}`)
      .join(' ');

  const hovered = hoverIdx !== null ? samples[hoverIdx] : null;

  return (
    <>
      <div
        className="chart chart-inspectable"
        dir="ltr"
        ref={wrapRef}
        style={{ height }}
        onMouseLeave={() => setHoverIdx(null)}
        onPointerMove={(e) => {
          if (!samples.length || colW <= 0) return;
          const relX = e.clientX - e.currentTarget.getBoundingClientRect().left - 4;
          setHoverIdx(Math.max(0, Math.min(samples.length - 1, Math.floor((relX - yLabelW) / colW))));
        }}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={t.overview.download}>
            <defs>
              <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent-text)" />
                <stop offset="1" stopColor="var(--accent-text)" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id={`${id}u`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent-2)" />
                <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((frac) => (
              <g key={frac}>
                <line
                  x1={yLabelW}
                  x2={width - 4}
                  y1={yOf(scaleMax * frac)}
                  y2={yOf(scaleMax * frac)}
                  className="grid"
                />
                <text x={yLabelW - 8} y={yOf(scaleMax * frac) + 4} className="tick" textAnchor="end">
                  {formatTickY(scaleMax * frac)}
                </text>
              </g>
            ))}

            {mode === 'trend' && samples.length > 0 && (
              <>
                <path
                  d={buildPath('download_bytes')}
                  fill="none"
                  stroke="var(--accent-text)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d={buildPath('upload_bytes')}
                  fill="none"
                  stroke="var(--accent-2)"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  strokeLinejoin="round"
                />
              </>
            )}

            {mode === 'trend' && hoverIdx !== null && (
              <line
                x1={yLabelW + (hoverIdx + 0.5) * colW}
                x2={yLabelW + (hoverIdx + 0.5) * colW}
                y1={8}
                y2={height - 22}
                stroke="var(--ink-2)"
                strokeDasharray="3 4"
              />
            )}

            {samples.map((d, i) => {
              const barX = yLabelW + i * colW + (colW - barW) / 2;
              const dl = d.download_bytes || 0;
              const ul = d.upload_bytes || 0;
              const dlH = (dl / scaleMax) * plotH;
              const ulH = (ul / scaleMax) * plotH;
              return (
                <g key={d.ts} className={hoverIdx === i && mode === 'bars' ? 'bar hover' : 'bar'}>
                  <rect
                    x={yLabelW + i * colW}
                    y={8}
                    width={colW}
                    height={plotH}
                    className="hit"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                  {mode === 'bars' && dl > 0 && (
                    <rect
                      x={barX}
                      y={yOf(dl)}
                      width={barW}
                      height={Math.max(1, dlH)}
                      rx={Math.min(3, barW / 2)}
                      className="down"
                      fill={`url(#${id}d)`}
                      style={{ '--i': i } as React.CSSProperties}
                    />
                  )}
                  {mode === 'bars' && ul > 0 && (
                    <rect
                      x={barX}
                      y={yOf(dl + ul)}
                      width={barW}
                      height={Math.max(1, ulH)}
                      rx={Math.min(3, barW / 2)}
                      className="up"
                      fill={`url(#${id}u)`}
                      style={{ '--i': i } as React.CSSProperties}
                    />
                  )}
                  {i % tickStep === 0 && (
                    <text x={barX + barW / 2} y={height - 6} className="tick" textAnchor="middle">
                      {formatTickX(d.ts)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hovered && hoverIdx !== null && (
          <div
            className="chart-tip"
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
            style={{
              left: Math.min(Math.max(8, yLabelW + hoverIdx * colW - 70), Math.max(8, width - 190)),
            }}
          >
            <strong>{hovered.ts.length > 10 ? hovered.ts.slice(0, 16).replace('T', ' ') : hovered.ts}</strong>
            <span>
              <i className="sw down" />
              {t.overview.download}
              <b className="num">{formatBytes(hovered.download_bytes, lang)}</b>
            </span>
            <span>
              <i className="sw up" />
              {t.overview.upload}
              <b className="num">{formatBytes(hovered.upload_bytes, lang)}</b>
            </span>
          </div>
        )}

        {totalBytes === 0 && (
          <p className="chart-empty">
            {lang === 'fa' ? 'در این بازه ترافیکی ثبت نشده است.' : 'No traffic recorded in this period.'}
          </p>
        )}
      </div>

      {showTableToggle && (
        <details className="chart-data">
          <summary>{lang === 'fa' ? 'نمایش جدول داده‌ها' : 'View data table'}</summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{lang === 'fa' ? 'بازهٔ زمانی' : 'Time period'}</th>
                  <th className="text-end">{t.overview.download}</th>
                  <th className="text-end">{t.overview.upload}</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((d) => (
                  <tr key={d.ts}>
                    <td>{d.ts.length > 10 ? d.ts.slice(0, 16).replace('T', ' ') : d.ts}</td>
                    <td className="num text-end">{formatBytes(d.download_bytes, lang)}</td>
                    <td className="num text-end">{formatBytes(d.upload_bytes, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
