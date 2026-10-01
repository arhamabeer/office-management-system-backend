# @ems/types

Shared domain types and enums for the EMS monorepo — the single source of truth for the
two-dimension role model (`AccountType` × `OrgRole`), shared enums, the API response envelope,
and cross-cutting entity shapes.

Consumed directly from source (`./src/index.ts`); backend runs it via `tsx`, web/mobile via
`transpilePackages`. Types stay in lockstep with `@ems/validation` (which infers from Zod).
