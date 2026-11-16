import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type TranslationDict } from './en';
import { fa } from './fa';

export type Lang = 'en' | 'fa';
export type ThemeMode = 'system' | 'dark' | 'light';
export type AccentName = 'lime' | 'cyan' | 'mint' | 'amber' | 'coral' | 'rose' | 'violet' | 'sky';

interface PaletteMode {
  accent: string;
  accentText: string;
  accentInk: string;
  accentWash: string;
  accentGlow: string;
  focus: string;
  gridLit: string;
  gridDot: string;
  line: string;
  lineStrong: string;
  blobA: string;
  blobB: string;
  blobC: string;
  accent2: string;
}

const hexRgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

function makePalette(
  d: { c: string; ink: string; focus: string; accent2: string },
  l: { c: string; text: string; ink: string; accent2: string },
): { dark: PaletteMode; light: PaletteMode } {
  return {
    dark: {
      accent: d.c,
      accentText: d.c,
      accentInk: d.ink,
      accentWash: hexRgba(d.c, 0.1),
      accentGlow: hexRgba(d.c, 0.38),
      focus: d.focus,
      gridLit: hexRgba(d.c, 0.55),
      gridDot: hexRgba(d.focus, 0.08),
      line: hexRgba(d.focus, 0.09),
      lineStrong: hexRgba(d.focus, 0.19),
      blobA: hexRgba(d.c, 0.12),
      blobB: hexRgba(d.accent2, 0.1),
      blobC: hexRgba(d.c, 0.08),
      accent2: d.accent2,
    },
    light: {
      accent: l.c,
      accentText: l.text,
      accentInk: l.ink,
      accentWash: hexRgba(l.c, 0.14),
      accentGlow: hexRgba(l.c, 0.4),
      focus: l.text,
      gridLit: hexRgba(l.text, 0.55),
      gridDot: hexRgba(l.text, 0.12),
      line: hexRgba(l.text, 0.11),
      lineStrong: hexRgba(l.text, 0.22),
      blobA: hexRgba(l.c, 0.22),
      blobB: hexRgba(l.accent2, 0.16),
      blobC: hexRgba(l.c, 0.13),
      accent2: l.accent2,
    },
  };
}

export const ACCENT_PALETTES: Record<AccentName, { dark: PaletteMode; light: PaletteMode }> = {
  lime: {
    dark: {
      accent: '#c4f82a',
      accentText: '#c4f82a',
      accentInk: '#0b1300',
      accentWash: 'rgba(196, 248, 42, 0.1)',
      accentGlow: 'rgba(196, 248, 42, 0.38)',
      focus: '#e2ff80',
      gridLit: 'rgba(196, 248, 42, 0.55)',
      gridDot: 'rgba(196, 248, 42, 0.08)',
      line: 'rgba(196, 248, 42, 0.09)',
      lineStrong: 'rgba(196, 248, 42, 0.18)',
      blobA: 'rgba(196, 248, 42, 0.1)',
      blobB: 'rgba(70, 214, 230, 0.1)',
      blobC: 'rgba(163, 230, 53, 0.07)',
      accent2: '#46d6e6',
    },
    light: {
      accent: '#b7ef25',
      accentText: '#2f6400',
      accentInk: '#0b1300',
      accentWash: 'rgba(120, 190, 0, 0.14)',
      accentGlow: 'rgba(120, 190, 0, 0.4)',
      focus: '#2f6400',
      gridLit: 'rgba(47, 100, 0, 0.55)',
      gridDot: 'rgba(47, 100, 0, 0.11)',
      line: 'rgba(47, 100, 0, 0.11)',
      lineStrong: 'rgba(47, 100, 0, 0.22)',
      blobA: 'rgba(150, 220, 20, 0.22)',
      blobB: 'rgba(11, 140, 155, 0.16)',
      blobC: 'rgba(132, 204, 22, 0.14)',
      accent2: '#0b8c9b',
    },
  },
  cyan: makePalette(
    { c: '#22d3ee', ink: '#00181c', focus: '#8cecfa', accent2: '#3b82f6' },
    { c: '#22d3ee', text: '#00687a', ink: '#00181c', accent2: '#2563eb' },
  ),
  mint: makePalette(
    { c: '#34e0a1', ink: '#001a0f', focus: '#9af5cf', accent2: '#46d6e6' },
    { c: '#2fd896', text: '#006b4a', ink: '#001a0f', accent2: '#0b8c9b' },
  ),
  amber: makePalette(
    { c: '#ffb020', ink: '#1c1000', focus: '#ffd98a', accent2: '#fb923c' },
    { c: '#ffb020', text: '#8a4b00', ink: '#1c1000', accent2: '#ea580c' },
  ),
  coral: makePalette(
    { c: '#ff8f6b', ink: '#240800', focus: '#ffc2ad', accent2: '#fb7185' },
    { c: '#ff8f6b', text: '#b0381a', ink: '#240800', accent2: '#e11d48' },
  ),
  rose: makePalette(
    { c: '#fb7185', ink: '#280009', focus: '#fda4af', accent2: '#c084fc' },
    { c: '#fb7185', text: '#b0123f', ink: '#280009', accent2: '#9333ea' },
  ),
  violet: makePalette(
    { c: '#a78bfa', ink: '#12082e', focus: '#d4c5ff', accent2: '#6366f1' },
    { c: '#a78bfa', text: '#5b3fd1', ink: '#12082e', accent2: '#4f46e5' },
  ),
  sky: makePalette(
    { c: '#4cb8ff', ink: '#00152a', focus: '#a6dcff', accent2: '#6366f1' },
    { c: '#4cb8ff', text: '#0a62a8', ink: '#00152a', accent2: '#4f46e5' },
  ),
};

interface UiContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (t: ThemeMode) => void;
  accent: AccentName;
  setAccent: (a: AccentName) => void;
  brandName: string;
  setBrandName: (name: string) => void;
  supportTelegram: string;
  setSupportTelegram: (s: string) => void;
  t: TranslationDict;
  isRtl: boolean;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('xprotocol_lang') as Lang) || 'en');
  const [theme, setThemeState] = useState<ThemeMode>(() => (localStorage.getItem('xprotocol_theme') as ThemeMode) || 'dark');
  const [accent, setAccentState] = useState<AccentName>(() => (localStorage.getItem('xprotocol_accent') as AccentName) || 'mint');
  const [brandName, setBrandName] = useState<string>('XProtocol');
  const [supportTelegram, setSupportTelegram] = useState<string>('');
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true,
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'dark' | 'light' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('xprotocol_lang', l);
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem('xprotocol_theme', t);
  }, []);

  const setAccent = useCallback((a: AccentName) => {
    setAccentState(a);
    localStorage.setItem('xprotocol_accent', a);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(resolvedTheme);
    html.dataset.theme = resolvedTheme;
    html.dir = lang === 'fa' ? 'rtl' : 'ltr';
    html.lang = lang;

    const pal = (ACCENT_PALETTES[accent] || ACCENT_PALETTES.mint)[resolvedTheme];
    html.style.setProperty('--accent', pal.accent);
    html.style.setProperty('--accent-text', pal.accentText);
    html.style.setProperty('--accent-ink', pal.accentInk);
    html.style.setProperty('--accent-fg', pal.accentInk);
    html.style.setProperty('--accent-wash', pal.accentWash);
    html.style.setProperty('--accent-soft', pal.accentWash);
    html.style.setProperty('--accent-glow', pal.accentGlow);
    html.style.setProperty('--focus', pal.focus);
    html.style.setProperty('--grid-lit', pal.gridLit);
    html.style.setProperty('--grid-dot', pal.gridDot);
    html.style.setProperty('--line', pal.line);
    html.style.setProperty('--line-strong', pal.lineStrong);
    html.style.setProperty('--border-subtle', pal.line);
    html.style.setProperty('--border-strong', pal.lineStrong);
    html.style.setProperty('--blob-a', pal.blobA);
    html.style.setProperty('--blob-b', pal.blobB);
    html.style.setProperty('--blob-c', pal.blobC);
    html.style.setProperty('--accent-2', pal.accent2);
  }, [lang, resolvedTheme, accent]);

  const value = useMemo<UiContextValue>(
    () => ({
      lang,
      setLang,
      theme,
      resolvedTheme,
      setTheme,
      accent,
      setAccent,
      brandName,
      setBrandName,
      supportTelegram,
      setSupportTelegram,
      t: lang === 'fa' ? fa : en,
      isRtl: lang === 'fa',
    }),
    [lang, setLang, theme, resolvedTheme, setTheme, accent, setAccent, brandName, supportTelegram],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}
