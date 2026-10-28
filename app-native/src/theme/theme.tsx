// Colours and spacing, taken from src/css/app.css in the current app.
// Each company's own colours (organizations.color_primary / color_secondary) replace brand1/brand2.
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { Organization } from '@/lib/types';

export const DEFAULT_BRAND1 = '#4E8FD1';
export const DEFAULT_BRAND2 = '#101114';

export const base = {
  red: '#C8102E',
  ink: '#1E2124',
  paper: '#F3F4F6',
  card: '#FFFFFF',
  line: '#E6E8EC',
  cardLine: '#ECEEF2',
  slate: '#5B6472',
  slateLight: '#88909B',
  ok: '#2F8F5B',
  okBg: '#E4F3EA',
  warn: '#C97A1F',
  warnBg: '#FBEEDE',
  blue: '#1F3A5F',
  blueBg: '#E7EDF4',
  tabIdle: '#6B7080',
};

export const radius = { card: 18, tile: 18, input: 12, button: 12, row: 14 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

function luminance(hex: string): number | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
}
// Black or white text on a solid brand colour.
export function readableTextColor(hex: string | null | undefined): string {
  const l = hex ? luminance(hex) : null;
  return l == null ? '#fff' : l > 0.72 ? '#101114' : '#fff';
}
// brand2 used as text on a light background: too pale falls back to near-black.
export function onLightTextColor(hex: string | null | undefined, fallback: string): string {
  const l = hex ? luminance(hex) : null;
  return l == null || l > 0.65 ? fallback : (hex as string);
}

export type Theme = typeof base & { brand1: string; brand2: string; brand1Text: string; brand2OnLight: string };

export function themeFor(org: Pick<Organization, 'color_primary' | 'color_secondary'> | null): Theme {
  const brand1 = org?.color_primary || DEFAULT_BRAND1;
  const brand2 = org?.color_secondary || DEFAULT_BRAND2;
  return { ...base, brand1, brand2, brand1Text: readableTextColor(brand1), brand2OnLight: onLightTextColor(brand2, '#101114') };
}

const Ctx = createContext<Theme>(themeFor(null));
export function ThemeProvider({ org, children }: { org: Organization | null; children: ReactNode }) {
  const t = useMemo(() => themeFor(org), [org]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
