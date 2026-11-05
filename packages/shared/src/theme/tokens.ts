/**
 * LocalLoop design tokens — shared by the mobile app (StyleSheet) and the
 * admin dashboard (Tailwind theme extension). Brand palette from the product
 * brief; supporting neutrals and status colours are derived to keep
 * WCAG AA contrast on ivory and white surfaces.
 */
export const colors = {
  brand: {
    forest: '#174C38', // primary
    green: '#236B4E', // secondary
    amber: '#E9A83A', // accent — highlights only, never body text on light
    ivory: '#FAF8F1', // app background
    white: '#FFFFFF',
  },
  text: {
    primary: '#202923', // 14.9:1 on ivory
    secondary: '#5F6762', // darkened from brief's #737B75 for 5.6:1 on ivory (AA for body text)
    muted: '#737B75', // brief value — use ≥18px or non-essential labels only
    onBrand: '#FFFFFF',
    link: '#174C38',
  },
  surface: {
    background: '#FAF8F1',
    card: '#FFFFFF',
    sunken: '#F1EEE3',
    border: '#E2DED1',
    borderStrong: '#C9C4B4',
    overlay: 'rgba(32, 41, 35, 0.48)',
  },
  status: {
    success: '#1E7A4C',
    successBg: '#E3F2E9',
    warning: '#8A5A00', // amber-family text that passes AA
    warningBg: '#FBEFD6',
    danger: '#B42318',
    dangerBg: '#FCE8E6',
    info: '#1F5C99',
    infoBg: '#E5EEF8',
  },
  map: {
    route: '#174C38',
    routeCasing: '#FFFFFF',
    partner: '#E9A83A',
    store: '#236B4E',
    destination: '#174C38',
    stale: '#9AA19C',
  },
} as const;

/** 4-pt spacing scale. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/**
 * Type scale. Base body is 16 (never smaller than 14 for readable content).
 * Telugu glyphs are taller — lineHeight ratios are generous (~1.5) so both
 * scripts render without clipping.
 */
export const typography = {
  family: {
    // Noto Sans + Noto Sans Telugu are bundled in the mobile app and loaded
    // from Google Fonts on the admin dashboard.
    latin: 'NotoSans',
    latinMedium: 'NotoSans-Medium',
    latinBold: 'NotoSans-Bold',
    telugu: 'NotoSansTelugu',
    teluguMedium: 'NotoSansTelugu-Medium',
    teluguBold: 'NotoSansTelugu-Bold',
  },
  size: { caption: 13, small: 14, body: 16, bodyLarge: 18, title: 20, heading: 24, display: 30 },
  lineHeight: { caption: 20, small: 21, body: 24, bodyLarge: 27, title: 30, heading: 34, display: 40 },
} as const;

/** Minimum touch target (Android 48dp; Apple HIG 44pt) — we use the larger. */
export const touchTarget = { min: 48, comfortable: 56 } as const;

export const elevation = {
  card: { shadowColor: '#202923', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  raised: { shadowColor: '#202923', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
} as const;

export const tokens = { colors, spacing, radii, typography, touchTarget, elevation } as const;
export type Tokens = typeof tokens;
