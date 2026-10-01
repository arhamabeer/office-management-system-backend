/**
 * Design tokens — the single source of truth for theming (PLAN.md §6).
 *
 * BRANDING: BrainCrop. Colors extracted from the supplied logo:
 *   brand orange #FC6810 (leaves + "CROP"), brand gray #989898 (head + "BRAIN").
 * Font: Geist (loaded per-app: web via `geist`/next-font, mobile via bundled files).
 *
 * Everything consumes these tokens (CSS variables on web, a theme object on
 * React Native), so a rebrand is a one-file change. Per-org RUNTIME overrides
 * live in the `AppConfig` collection (editable later by the console-dashboard).
 */

export interface ColorRoles {
  /** Brand orange — primary fills (buttons, active states, highlights). */
  primary: string;
  /** Darker orange for hover/pressed. */
  primaryHover: string;
  /** Deep orange for orange TEXT/links/icons on light surfaces (AA contrast). */
  primaryStrong: string;
  /** Fill for solid controls (buttons/badges) — darker so WHITE text meets WCAG AA. */
  primaryFill: string;
  primaryFillHover: string;
  /** Text/icon color on top of a `primary`/`primaryFill` fill. */
  onPrimary: string;
  /** Brand gray (the logo wordmark/head) — secondary marks & dividers accents. */
  brandGray: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface ThemeTokens {
  colors: {
    light: ColorRoles;
    dark: ColorRoles;
  };
  space: Record<string, string>;
  radius: Record<string, string>;
  font: {
    sans: string;
    mono: string;
    size: Record<string, string>;
    weight: Record<string, number>;
    lineHeight: Record<string, number>;
  };
  shadow: Record<string, string>;
}

export const tokens: ThemeTokens = {
  colors: {
    light: {
      primary: '#FC6810',
      primaryHover: '#E85C0B',
      primaryStrong: '#C2410C',
      primaryFill: '#C2410C',
      primaryFillHover: '#9A3410',
      onPrimary: '#FFFFFF',
      brandGray: '#989898',
      bg: '#F7F8FA',
      surface: '#FFFFFF',
      surfaceAlt: '#F1F3F5',
      text: '#1A1D23',
      textMuted: '#6B7280',
      border: '#E5E7EB',
      success: '#16A34A',
      warning: '#CA8A04',
      danger: '#DC2626',
      info: '#2563EB',
    },
    dark: {
      primary: '#FB7524',
      primaryHover: '#FF8A3D',
      primaryStrong: '#FDBA74',
      primaryFill: '#C2410C',
      primaryFillHover: '#9A3410',
      onPrimary: '#FFFFFF',
      brandGray: '#B8BCC2',
      bg: '#0F1115',
      surface: '#171A21',
      surfaceAlt: '#1F242D',
      text: '#E5E7EB',
      textMuted: '#9CA3AF',
      border: '#2A2F3A',
      success: '#22C55E',
      warning: '#EAB308',
      danger: '#EF4444',
      info: '#60A5FA',
    },
  },
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
    12: '48px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '999px',
  },
  font: {
    sans: '"Geist", system-ui, "Segoe UI", Roboto, sans-serif',
    mono: '"Geist Mono", ui-monospace, "SF Mono", monospace',
    size: {
      xs: '12px',
      sm: '14px',
      md: '16px',
      lg: '20px',
      xl: '24px',
      '2xl': '32px',
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
    },
  },
  shadow: {
    sm: '0 1px 2px rgba(16,24,40,.06)',
    md: '0 4px 12px rgba(16,24,40,.10)',
    lg: '0 12px 32px rgba(16,24,40,.14)',
  },
};

/** React Native theme objects (RN has no CSS variables). */
export const rnLightTheme = {
  colors: tokens.colors.light,
  space: tokens.space,
  radius: tokens.radius,
  font: tokens.font,
};

export const rnDarkTheme = {
  ...rnLightTheme,
  colors: tokens.colors.dark,
};

export type RnTheme = typeof rnLightTheme;
