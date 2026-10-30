/**
 * Design tokens extracted from the Claude Design Companion prototype
 * (DutyGraph_Companion_2.dc.html, `#app` custom properties). The prototype is
 * the visual source of truth; do not add screen-specific colors here or in
 * screens. Semantic meaning:
 *
 * - violet: DutyGraph's understanding, not yet confirmed/sent by the participant
 * - sage:   confirmed, sent, time returned
 * - amber:  due, attention, offline
 * - red:    overdue, failure
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  raised: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  soft: string;
  nav: string;
  sage: string;
  sageBg: string;
  amber: string;
  amberBg: string;
  violet: string;
  violetBg: string;
  /** Task Card work type "AI help" (shared web/phone spec, app-ux/task-card-gallery-spec.md). */
  blue: string;
  blueBg: string;
  /** Task Card work type "Mixed": chip text and fill; its band is half amber, half blue. */
  lilac: string;
  lilacBg: string;
  red: string;
  redBg: string;
  accent: string;
  accentBg: string;
  primary: string;
  primaryInk: string;
  /** The lit Next on a covered card: a green accent until the brand colour is chosen (October 18). */
  ready: string;
  readyInk: string;
  focus: string;
  scrim: string;
}

export const darkColors: ColorTokens = {
  bg: '#151515',
  surface: '#202020',
  raised: '#292929',
  ink: '#f0eeea',
  muted: '#b8b8b8',
  faint: '#999999',
  line: '#3b3b3b',
  soft: '#2b2b2b',
  nav: '#101010',
  sage: '#9cccb7',
  sageBg: '#23382f',
  amber: '#e3bd83',
  amberBg: '#3b3020',
  violet: '#c6b5eb',
  violetBg: '#332b46',
  blue: '#9dbdf0',
  blueBg: '#18202c',
  lilac: '#d9cdea',
  lilacBg: '#221e2a',
  red: '#e5a09a',
  redBg: '#322423',
  accent: '#dedbd4',
  accentBg: '#303030',
  primary: '#e7e3db',
  primaryInk: '#222222',
  ready: '#238636',
  readyInk: '#ffffff',
  focus: '#dedbd4',
  scrim: 'rgba(0,0,0,0.55)',
};

export const lightColors: ColorTokens = {
  bg: '#f3f2ef',
  surface: '#fffefa',
  raised: '#ffffff',
  ink: '#252525',
  muted: '#595959',
  faint: '#6b6b6b',
  line: '#d9d9d7',
  soft: '#eeede9',
  nav: '#eeede9',
  sage: '#416e51',
  sageBg: '#e7efe7',
  amber: '#815622',
  amberBg: '#f5ecdf',
  violet: '#6a4c94',
  violetBg: '#eee8f7',
  blue: '#2f5b9a',
  blueBg: '#e6eef9',
  lilac: '#5e4a7e',
  lilacBg: '#efeaf6',
  red: '#a3443e',
  redBg: '#f8e8e5',
  accent: '#494640',
  accentBg: '#e9e7e2',
  primary: '#303030',
  primaryInk: '#fffefa',
  ready: '#1f883d',
  readyInk: '#ffffff',
  focus: '#59564f',
  scrim: 'rgba(0,0,0,0.35)',
};

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  /** Horizontal page gutter used by every screen. */
  gutter: 20,
  /** Inner padding of cards. */
  cardV: 16,
  cardH: 18,
} as const;

export const radius = {
  chip: 6,
  button: 7,
  card: 12,
  sheet: 20,
  pill: 999,
} as const;

/** Minimum touch target (PRD 28: large touch targets). */
export const touch = {
  min: 44,
  primary: 48,
} as const;

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

/**
 * Type scale from the prototype. `letterSpacing` values are in points
 * (the prototype's em values multiplied by the font size).
 */
export const typography = {
  display: { fontFamily: fontFamily.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  title: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  question: { fontFamily: fontFamily.regular, fontSize: 19, lineHeight: 28 },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 23 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  button: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  buttonSecondary: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 19 },
  meta: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  metaStrong: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chip: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 15 },
  label: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 17, letterSpacing: 1.3, textTransform: 'uppercase' as const },
  brand: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 20, letterSpacing: -0.3 },
} as const;

export type Tone = 'plain' | 'sage' | 'amber' | 'violet' | 'red';

export function toneColors(c: ColorTokens, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'sage':
      return { fg: c.sage, bg: c.sageBg };
    case 'amber':
      return { fg: c.amber, bg: c.amberBg };
    case 'violet':
      return { fg: c.violet, bg: c.violetBg };
    case 'red':
      return { fg: c.red, bg: c.redBg };
    default:
      return { fg: c.muted, bg: c.soft };
  }
}
