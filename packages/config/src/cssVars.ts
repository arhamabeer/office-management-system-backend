import { tokens, type ColorRoles, type ThemeTokens } from './tokens';

const CAMEL_TO_KEBAB = /[A-Z]/g;
const kebab = (s: string) => s.replace(CAMEL_TO_KEBAB, (m) => `-${m.toLowerCase()}`);

function colorVars(colors: ColorRoles, indent = '  '): string {
  return (Object.keys(colors) as (keyof ColorRoles)[])
    .map((k) => `${indent}--color-${kebab(k)}: ${colors[k]};`)
    .join('\n');
}

function scaleVars(prefix: string, scale: Record<string, string | number>, indent = '  '): string {
  return Object.entries(scale)
    .map(([k, v]) => `${indent}--${prefix}-${k}: ${v};`)
    .join('\n');
}

/**
 * Build the full themed stylesheet: light tokens on :root, dark overrides under
 * [data-theme="dark"], plus non-color scales. Drop this into a global stylesheet
 * (web) — see frontend `styles/theme.css`.
 */
export function buildThemeCss(t: ThemeTokens = tokens): string {
  const staticScales = [
    scaleVars('space', t.space),
    scaleVars('radius', t.radius),
    `  --font-sans: ${t.font.sans};`,
    `  --font-mono: ${t.font.mono};`,
    scaleVars('fs', t.font.size),
    scaleVars('fw', t.font.weight),
    scaleVars('lh', t.font.lineHeight),
    scaleVars('shadow', t.shadow),
  ].join('\n');

  return [
    ':root {',
    '  /* Color roles (light) — BrainCrop brand (PLAN.md §6) */',
    colorVars(t.colors.light),
    '',
    '  /* Scales */',
    staticScales,
    '}',
    '',
    ':root[data-theme="dark"] {',
    colorVars(t.colors.dark),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    colorVars(t.colors.dark, '    '),
    '  }',
    '}',
    '',
  ].join('\n');
}
