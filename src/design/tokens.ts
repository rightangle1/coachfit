/**
 * Design tokens (ADR-0110) — the single source of visual truth.
 *
 * Direction: calm & focused — warm neutrals, soft sage accent, gentle contrast,
 * generous rounding. To restyle the whole app, edit the palettes here. Screens
 * must never hard-code colors; they read everything through `useTheme()`.
 */

export type ColorScheme = 'light' | 'dark';

/**
 * Contextual color is deliberately separate from status color. A strength
 * session is an emphasis, not an error; `danger` remains available only for
 * something that needs attention.
 */
export type ContextTone = 'primary' | 'strength' | 'endurance' | 'mobility' | 'accent';

export interface ContextToneStyle {
  /** Restrained fill for a summary, selected control, or compact icon tile. */
  surface: string;
  /** Definition for a tinted surface without making it feel boxed-in. */
  border: string;
  /** Readable icon/text color on the soft surface. */
  text: string;
  /** The hue for meters, chart series, and small emphasis marks. */
  solid: string;
}

export interface Palette {
  bg: string; // app background
  surface: string; // cards / raised content
  surfaceAlt: string; // subtle fills, inputs, chips
  text: string; // primary text
  textMuted: string; // secondary text
  textFaint: string; // tertiary / hints
  border: string; // hairlines, card borders
  borderStrong: string; // emphasized dividers
  primary: string; // sage accent (actions, focus)
  primaryStrong: string; // deeper sage — gradient end stop, pressed states
  primaryText: string; // text/icon on `primary`
  primarySoft: string; // tinted accent background
  primaryTextSoft: string; // text on `primarySoft`
  accent: string; // warm terracotta secondary
  info: string; // ocean — conditioning, discovery, neutral guidance
  infoSoft: string;
  mobility: string; // calm lavender/moss for mobility/recovery contexts
  mobilitySoft: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  /**
   * Training-zone flags (ADR-0128). Deliberately NOT reusing `danger` for
   * strength: `danger` means "something is wrong", and a STRENGTH badge borrowing
   * it would read as a warning rather than as the day's headline work. The
   * endurance blue is the palette's first cool hue, chosen muted enough to sit
   * inside a warm-neutral system without shouting.
   */
  zoneStrength: string;
  zoneStrengthSoft: string;
  zoneEndurance: string;
  zoneEnduranceSoft: string;
  overlay: string; // modal scrims
  hero: string; // immersive exercise-media stage
  heroOverlay: string; // readable dark wash over exercise media
  heroPill: string; // compact controls placed on the hero
  heroBorder: string;
  heroText: string;
  heroMuted: string;
  glassTint: string; // fallback fill where liquid glass is unavailable
  tierBronze: string; // achievement trophy-case tiers
  tierSilver: string;
  tierGold: string;
  tones: Record<ContextTone, ContextToneStyle>;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F7F4EE',
    surface: '#FFFDF9',
    surfaceAlt: '#F0EBE2',
    text: '#24251F',
    textMuted: '#6E6D64',
    textFaint: '#96938A',
    border: '#E9E3D8',
    borderStrong: '#D8D0C3',
  primary: '#345C47',
  primaryStrong: '#264635',
    primaryText: '#FFFFFF',
  primarySoft: '#E1ECE3',
  primaryTextSoft: '#294A38',
  accent: '#B9764D',
    info: '#3D7180',
    infoSoft: '#DCECEF',
    mobility: '#6B6E9B',
    mobilitySoft: '#E8E7F2',
    success: '#477B57',
    warning: '#B08346',
  danger: '#A95245',
  dangerSoft: '#F3DFDA',
    zoneStrength: '#4B5D78',
    zoneStrengthSoft: '#E3E8F0',
    zoneEndurance: '#3D6382',
    zoneEnduranceSoft: '#DCE6EF',
    overlay: 'rgba(40,36,32,0.45)',
    hero: '#171922',
    heroOverlay: 'rgba(12,13,19,0.55)',
    heroPill: 'rgba(48,50,65,0.92)',
    heroBorder: 'rgba(255,255,255,0.12)',
    heroText: '#FFFFFF',
    heroMuted: '#C5C7D2',
    glassTint: 'rgba(255,253,249,0.72)',
    tierBronze: '#B08159',
    tierSilver: '#9AA0AA',
    tierGold: '#C9A227',
    tones: {
      primary: { surface: '#E1ECE3', border: '#345C47', text: '#294A38', solid: '#345C47' },
      // Strength uses a grounded slate-blue. It feels composed beside the
      // sage brand hue, stays distinct from cardio's ocean tone, and never
      // reads like danger or a warm terracotta callout.
      strength: { surface: '#E3E8F0', border: '#4B5D78', text: '#36465E', solid: '#4B5D78' },
      endurance: { surface: '#DCE6EF', border: '#3D6382', text: '#294F6A', solid: '#3D6382' },
      mobility: { surface: '#E8E7F2', border: '#6B6E9B', text: '#50527C', solid: '#6B6E9B' },
      accent: { surface: '#F4E2D5', border: '#B9764D', text: '#874D2A', solid: '#B9764D' },
    },
  },
  dark: {
    bg: '#12131C',
    surface: '#1D1E2B',
    surfaceAlt: '#292A3A',
    text: '#F8F8FC',
    textMuted: '#B2B3C4',
    textFaint: '#7D7E91',
    border: '#373849',
    borderStrong: '#4C4D62',
    // Light sage rather than the mint this used to be: `primary` is the brand
    // hue and must survive a light/dark switch (ADR-0130). The old #86E5CC was
    // a different hue *and* collided exactly with `success`.
  primary: '#8DBFA0',
  primaryStrong: '#6DA27F',
    primaryText: '#122A1D',
  primarySoft: '#23372B',
  primaryTextSoft: '#C4DEC9',
  accent: '#D99A70',
    info: '#8BBECC',
    infoSoft: '#223941',
    mobility: '#B5B3E1',
    mobilitySoft: '#35334D',
    success: '#86E5CC',
    warning: '#E9C66C',
  danger: '#DE8378',
  dangerSoft: '#472B2A',
    zoneStrength: '#A8BAD2',
    zoneStrengthSoft: '#283240',
    zoneEndurance: '#8FB6D6',
    zoneEnduranceSoft: '#22323F',
    overlay: 'rgba(5,6,12,0.7)',
    hero: '#0D0E15',
    heroOverlay: 'rgba(5,6,12,0.5)',
    heroPill: 'rgba(49,50,65,0.94)',
    heroBorder: 'rgba(255,255,255,0.12)',
    heroText: '#FFFFFF',
    heroMuted: '#C5C7D2',
    glassTint: 'rgba(29,30,43,0.72)',
    tierBronze: '#D9A377',
    tierSilver: '#C7CBD4',
    tierGold: '#E8C766',
    tones: {
      primary: { surface: '#23372B', border: '#8DBFA0', text: '#C4DEC9', solid: '#8DBFA0' },
      strength: { surface: '#283240', border: '#A8BAD2', text: '#D2DDED', solid: '#A8BAD2' },
      endurance: { surface: '#22323F', border: '#8FB6D6', text: '#B8D5EA', solid: '#8FB6D6' },
      mobility: { surface: '#35334D', border: '#B5B3E1', text: '#D0CFF2', solid: '#B5B3E1' },
      accent: { surface: '#473228', border: '#D99A70', text: '#F0BE9C', solid: '#D99A70' },
    },
  },
};

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type FontWeightName = keyof typeof fontWeight;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subtitle'
  | 'body'
  | 'label'
  | 'caption';

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: (typeof fontWeight)[keyof typeof fontWeight];
  letterSpacing?: number;
}

export const typography: Record<TextVariant, TypeStyle> = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -0.45 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.2 },
};

export interface Shadow {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export interface ShadowScale {
  xs: Shadow; // barely-there lift: chips, inline pills
  sm: Shadow; // resting surfaces
  md: Shadow; // raised cards, heroes
  lg: Shadow; // sheets, the tab bar — things that float over content
}

export const shadows: Record<ColorScheme, ShadowScale> = {
  light: {
    xs: { shadowColor: '#2E2A24', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sm: { shadowColor: '#2E2A24', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    md: { shadowColor: '#2E2A24', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    lg: { shadowColor: '#2E2A24', shadowOpacity: 0.14, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  },
  dark: {
    xs: { shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sm: { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    md: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    lg: { shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  },
};

/**
 * Motion (ADR-0130) — the timing vocabulary for every animation in the app.
 *
 * Deliberately dependency-free: easings are stored as cubic-bezier control
 * points rather than Reanimated `Easing` functions so this module stays a pure
 * data file (importable from tests and from web without pulling in the
 * animation runtime). `src/design/motion.ts` turns them into easing functions.
 */
export const motion = {
  duration: {
    instant: 0,
    fast: 120, // press feedback, color swaps
    base: 200, // the default — meters, crossfades, chips
    slow: 320, // view swaps, sheet slides, step transitions
    slower: 480, // chart draw-on, celebratory reveals
  },
  /** Cubic-bezier control points; pass to `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0.05, 0.7, 0.1, 1],
    accelerate: [0.3, 0, 0.8, 0.15],
    /** Slight overshoot — reserved for arrivals, never for exits. */
    emphasized: [0.34, 0, 0.2, 1.24],
  },
  spring: {
    gentle: { damping: 18, stiffness: 180, mass: 1 },
    snappy: { damping: 15, stiffness: 320, mass: 0.8 },
    /** Reward moments only: celebrations, achievement unlocks, PRs. */
    reward: { damping: 11, stiffness: 220, mass: 0.9 },
  },
} as const;

export type DurationToken = keyof typeof motion.duration;
export type EasingToken = keyof typeof motion.easing;
export type SpringToken = keyof typeof motion.spring;

/**
 * Press feedback, in one place. Before ADR-0130 this was `opacity: pressed ?
 * 0.85 : 1` written out by hand in ~30 components with three different values.
 */
export const press = { scale: 0.97, opacity: 0.9 } as const;

export interface Gradient {
  colors: readonly [string, string, ...string[]];
  /** Stop positions 0→1; omit for even distribution. */
  locations?: readonly [number, number, ...number[]];
}

export interface GradientScale {
  /** Top→bottom wash over hero photography. Bottom-weighted so the image keeps
   *  its detail up top while text stays legible where it actually sits. */
  heroScrim: Gradient;
  /** Downward wash from the very top edge — status-bar / eyebrow legibility. */
  heroScrimTop: Gradient;
  /** Left→right fill for `Meter` and progress bars. */
  meterFill: Gradient;
  /** Diagonal highlight sweep for achievement-unlock reveals. */
  shine: Gradient;
  /** Area under a line chart. Applied as stop-opacities over the series tint,
   *  which is per-chart, so this carries opacities rather than colors. */
  chartArea: { fromOpacity: number; toOpacity: number };
}

export const gradients: Record<ColorScheme, GradientScale> = {
  light: {
    heroScrim: {
      colors: ['rgba(12,13,19,0.10)', 'rgba(12,13,19,0.46)', 'rgba(12,13,19,0.88)'],
      locations: [0, 0.42, 1],
    },
    heroScrimTop: { colors: ['rgba(12,13,19,0.55)', 'rgba(12,13,19,0)'], locations: [0, 1] },
    meterFill: { colors: ['#5C8570', '#35533F'], locations: [0, 1] },
    shine: {
      colors: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'],
      locations: [0, 0.5, 1],
    },
    chartArea: { fromOpacity: 0.3, toOpacity: 0 },
  },
  dark: {
    heroScrim: {
      colors: ['rgba(5,6,12,0.14)', 'rgba(5,6,12,0.48)', 'rgba(5,6,12,0.9)'],
      locations: [0, 0.42, 1],
    },
    heroScrimTop: { colors: ['rgba(5,6,12,0.6)', 'rgba(5,6,12,0)'], locations: [0, 1] },
    meterFill: { colors: ['#A5D4B7', '#6BA585'], locations: [0, 1] },
    shine: {
      colors: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.34)', 'rgba(255,255,255,0)'],
      locations: [0, 0.5, 1],
    },
    chartArea: { fromOpacity: 0.34, toOpacity: 0 },
  },
};

/** Scalar palette keys accepted by text, icon, chart, and meter primitives. */
export type ColorToken = Exclude<keyof Palette, 'tones'>;
export type SpacingToken = keyof typeof spacing;
