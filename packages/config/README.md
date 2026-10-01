# @ems/config

The single source of truth for **design tokens** and **feature-flag keys** (PLAN.md §6, §7).

- `tokens` — framework-agnostic color/spacing/radius/typography/shadow tokens (neutral placeholders
  until real brand assets arrive).
- `buildThemeCss()` — emits the web stylesheet (`:root` + dark overrides). See `frontend/styles/theme.css`.
- `rnLightTheme` / `rnDarkTheme` — the same tokens as a React Native theme object.
- `FEATURE_FLAGS` / `DEFAULT_FEATURE_FLAGS` — the console-dashboard hook surface.

**Rebranding = edit `tokens.ts` once**; all clients pick it up. Per-org runtime overrides live in the
backend `AppConfig` collection.
