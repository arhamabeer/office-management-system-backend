# @ems/validation

Shared **Zod** schemas (PLAN.md §3.4). Defined once, used everywhere:

- backend `validate()` middleware validates request `body`/`params`/`query`;
- frontend/mobile reuse the same schemas for form validation;
- types are inferred via `z.infer`, so `@ems/types` and validation never drift;
- the backend generates OpenAPI/Swagger from these schemas.

M0 ships the common primitives (ids, email, password, pagination, role enums). Module schemas
arrive with their modules in M1–M4.
