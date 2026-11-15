interface Segment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  total,
  totalLabel,
  segments,
}: {
  total: number;
  totalLabel: string;
  segments: Segment[];
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, total);

  let offset = 0;

  return (
    <div className="flex items-center justify-center">
      <svg width="116" height="116" viewBox="0 0 116 116" className="shrink-0">
        <circle
          cx="58"
          cy="58"
          r={radius}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="12"
        />
        {total > 0 &&
          segments.map((seg) => {
            if (seg.value <= 0) return null;
            const dash = (seg.value / safeTotal) * circumference;
            const el = (
              <circle
                key={seg.label}
                cx="58"
                cy="58"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 58 58)"
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        <text
          x="58"
          y="55"
          textAnchor="middle"
          className="fill-[var(--text-primary)] text-lg font-bold"
          style={{ fontSize: 18, fontWeight: 700 }}
        >
          {total}
        </text>
        <text
          x="58"
          y="71"
          textAnchor="middle"
          className="fill-[var(--text-muted)]"
          style={{ fontSize: 10 }}
        >
          {totalLabel}
        </text>
      </svg>
    </div>
  );
}
