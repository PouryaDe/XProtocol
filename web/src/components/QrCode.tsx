import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [svgDataUrl, setSvgDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value || ' ', {
      width: size,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setSvgDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!svgDataUrl) {
    return <div style={{ width: size, height: size }} className="rounded-xl bg-white/10 animate-pulse" />;
  }

  return (
    <div className="inline-flex rounded-xl bg-white p-2 shadow-sm">
      <img src={svgDataUrl} alt="QR Code" width={size} height={size} className="rounded" />
    </div>
  );
}
