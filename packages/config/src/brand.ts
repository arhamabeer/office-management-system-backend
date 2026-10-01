/** BrainCrop brand metadata (PLAN.md §6). Logo asset files live per-app
 *  (e.g. web `public/brand/`, mobile `src/assets/brand/`); the canonical source
 *  is `assets/brand/` at the repo root. */

export const BRAND = {
  name: 'BrainCrop',
  /** Shown in headers/titles and document <title> suffixes. */
  productName: 'BrainCrop',
  /** Extracted from the logo — kept here for quick reference; the live values
   *  used by the UI come from the design tokens (colors.primary / brandGray). */
  colors: {
    orange: '#FC6810',
    gray: '#989898',
  },
  logo: {
    /** Recommended in-app path for the full horizontal lockup. */
    horizontal: '/brand/braincrop-logo.png',
    /** A square/mark variant (add when available; SVG preferred). */
    mark: '/brand/braincrop-mark.png',
  },
} as const;

export type Brand = typeof BRAND;
