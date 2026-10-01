# EMS Backend (API)

Node.js + Express + MongoDB (Mongoose), TypeScript. The single REST API consumed by the web,
mobile, and (future) console-dashboard clients. See [`../PLAN.md`](../PLAN.md) §3, §7, §8, §12.

## Setup

```bash
# from the repo root
pnpm install
cp backend/.env.example backend/.env   # then edit as needed
```

`MONGODB_URI` is optional to boot: the API starts even if MongoDB is unavailable, and `/health`
reports the DB state. DB-backed routes (from M1) require a running database.

## Run

```bash
pnpm --filter backend dev      # watch mode (tsx)
# or from the root:
pnpm dev:backend
```

- Health: `GET http://localhost:4000/api/v1/health`
- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/docs.json`

## Test & typecheck

```bash
pnpm --filter backend test        # Vitest + supertest
pnpm --filter backend typecheck   # tsc --noEmit
```

## Seed

```bash
pnpm --filter backend seed        # feature flags, config, departments + demo users (needs MongoDB)
```

### Seed account (local only)

The seed creates a **single Owner** and no other users — every other account is created
by hand from the Employees page during testing.

| Email | Password | Account · Role |
|---|---|---|
| `owner@braincrop.io` | `Passw0rd!` | Owner · Admin (Muhammed Fahad) |

The seed also loads the app's base configuration so it is usable immediately — leave
types + policy, expense categories + policy, attendance policy, payroll settings, and five
empty departments (Engineering, Platform, People Operations, Finance, Sales) for assigning
new hires. It seeds **no** demo attendance/leave/payroll/expense records.

Only an Owner can grant/deactivate Owner or Admin accounts; role changes and logins are audited.

## Layout (PLAN.md §11)

```
src/
├── modules/        # feature modules: routes · controller · service · model · tests
│   └── health/
├── middleware/     # auth · rbac · validate · error · audit · rateLimit
├── models/         # cross-cutting: AuditLog · AppConfig · FeatureFlag · Notification
├── config/         # env · db · cors · swagger
├── common/         # errors · logger · asyncHandler · httpResponse
├── docs/           # OpenAPI registry (Swagger generated from Zod)
├── types/          # Express request augmentation
├── app.ts          # buildable Express app (no side-effects)
└── server.ts       # bootstrap: connect DB + listen + graceful shutdown
```

## Conventions

- **Validation:** every input parsed via shared `@ems/validation` Zod schemas (`validate()`
  middleware). OpenAPI is generated from the same schemas, so docs never drift.
- **Errors:** services throw typed `AppError` subclasses; the terminal handler returns
  `{ error: { code, message, details? } }`.
- **Security:** helmet, strict CORS allow-list, rate limiting, pino logs with redaction, and an
  append-only `AuditLog` for sensitive actions. Auth (JWT access + rotating refresh, argon2) and
  full two-dimension RBAC land in **M1**.
