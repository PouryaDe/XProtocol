import React, { createContext, useContext, useEffect, useState } from 'react';
import { en, type TranslationDict } from './en';
import { fa } from './fa';

export type Lang = 'en' | 'fa';
export type ThemeMode = 'system' | 'dark' | 'light';
export type AccentName = 'lime' | 'cyan' | 'mint' | 'amber' | 'coral' | 'rose' | 'violet' | 'sky';

const ACCENT_PALETTES: Record<AccentName, { dark: string; darkFg: string; light: string; lightFg: string }> = {
  lime: { dark: '#c4f82a', darkFg: '#0b1300', light: '#a3e635', lightFg: '#0b1300' },
  cyan: { dark: '#46d6e6', darkFg: '#041418', light: '#22d3ee', lightFg: '#041418' },
  mint: { dark: '#34e0a1', darkFg: '#001a0f', light: '#2fd896', lightFg: '#001a0f' },
  amber: { dark: '#fbbf24', darkFg: '#1a1000', light: '#f59e0b', lightFg: '#1a1000' },
  coral: { dark: '#fb7185', darkFg: '#1f0409', light: '#f43f5e', lightFg: '#ffffff' },
  rose: { dark: '#f472b6', darkFg: '#1f0413', light: '#ec4899', lightFg: '#ffffff' },
  violet: { dark: '#a78bfa', darkFg: '#110726', light: '#8b5cf6', lightFg: '#ffffff' },
  sky: { dark: '#38bdf8', darkFg: '#04131d', light: '#0ea5e9', lightFg: '#ffffff' },
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

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('xprotocol_lang', l);
  };

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem('xprotocol_theme', t);
  };

  const setAccent = (a: AccentName) => {
    setAccentState(a);
    localStorage.setItem('xprotocol_accent', a);
  };

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(resolvedTheme);
    html.dir = lang === 'fa' ? 'rtl' : 'ltr';
    html.lang = lang;

    const pal = ACCENT_PALETTES[accent] || ACCENT_PALETTES.mint;
    const hex = resolvedTheme === 'dark' ? pal.dark : pal.light;
    const fg = resolvedTheme === 'dark' ? pal.darkFg : pal.lightFg;
    html.style.setProperty('--accent', hex);
    html.style.setProperty('--accent-fg', fg);
    html.style.setProperty('--accent-soft', resolvedTheme === 'dark' ? `${hex}1a` : `${hex}24`);
    html.style.setProperty('--accent-glow', resolvedTheme === 'dark' ? `${hex}61` : `${hex}66`);
    html.style.setProperty('--blob-a', resolvedTheme === 'dark' ? `${hex}1c` : `${hex}38`);
  }, [lang, resolvedTheme, accent]);

  const value: UiContextValue = {
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
  };

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}
