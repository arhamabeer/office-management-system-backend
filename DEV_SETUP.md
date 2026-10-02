# BrainCrop EMS — Backend · Developer Setup

The REST API for the BrainCrop Enterprise Employee Management System (EMS). Node + Express 4 +
Mongoose 8, TypeScript (ESM). This guide gets the backend running on a fresh machine and lists the
conventions every change must follow.

---

## The system (four separate apps)

The EMS is split into four independent repositories that communicate **only over HTTP APIs**. Each
repo is self-contained — the app at its root plus a vendored copy of the shared `@ems/*` packages
under `packages/` (`types`, `validation`, `config`, and `api-client` for the UI apps). There are **no
cross-repo dependencies**.

| App | Repo | Stack | Port |
| --- | --- | --- | --- |
| **Backend** (this repo) | `office-management-system-backend` | Express + Mongoose + TS | `4000` (`/api/v1`) |
| Frontend (self-service web) | `office-management-system-frontend` | Next.js 15 / React 19 | `3001` |
| Console (super-admin) | `office-management-system-console` | Next.js 15 / React 19 | `3002` |
| Mobile | `office-management-system-mobile-app` | React Native 0.76 | Metro |

All repos are under GitHub user `arhamabeer`. The console is intentionally deferred; the mobile app
typechecks and runs Metro but needs a native toolchain to run on a device.

---

## Prerequisites

- **Node.js ≥ 20**
- **Corepack** (ships with Node) — run `corepack enable`. pnpm is pinned to **9.15.4**; always use
  `corepack pnpm …`.
- **MongoDB** on `127.0.0.1:27017` — install MongoDB Community, or run it in Docker:
  `docker run -d -p 27017:27017 --name ems-mongo mongo`.
  > It's a **standalone** mongod (no replica set), so **multi-document transactions are unavailable**.
  > Use atomic `findOneAndUpdate` for consistency — never `session`/transactions.
- **Git** with push access to the `arhamabeer` repos.

---

## Setup

```bash
corepack enable
corepack pnpm install
corepack pnpm seed     # creates the demo org + accounts
corepack pnpm dev      # starts the API on http://localhost:4000
```

- Health check: `GET http://localhost:4000/api/v1/health`
- API docs (when `SWAGGER_ENABLED=true`): `http://localhost:4000/api/docs`
- Demo login (shown on the web app's login page): **`owner@braincrop.io` / `Passw0rd!`** (Owner · Admin)

### Environment

**No `.env` is required in development** — every variable has a safe default (see the table below).
Create a `.env` (gitignored) only to override. A typical dev `.env`:

```ini
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/ems
WEB_ORIGIN=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
SWAGGER_ENABLED=true
MAIL_TRANSPORT=log          # just logs invite/reset links; no SMTP needed in dev

# Generate strong, unique values — do NOT reuse across machines or commit them:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET=__generate_me__
JWT_REFRESH_SECRET=__generate_me__

# Real email (optional in dev) — fill from a secure source and set MAIL_TRANSPORT=smtp
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

> **Never commit secrets.** `.env` is gitignored. JWT secrets must be strong and unique in
> production (the app refuses to start in prod with the `dev-*` defaults). In dev, invite/reset links
> are also returned in the API response, so email delivery is optional.

#### Full environment reference

| Var | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | API port |
| `API_PREFIX` | `/api/v1` | must start with `/` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/ems` | local standalone mongod |
| `WEB_ORIGIN` | `http://localhost:3001` | used to build invite/reset links |
| `CORS_ORIGINS` | `http://localhost:3000,3001,3002` | comma-separated allowlist |
| `JWT_ACCESS_SECRET` | `dev-access-secret-change-me` | **secret** — set your own |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret-change-me` | **secret** — set your own |
| `ACCESS_TOKEN_TTL` | `15m` | access-token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | refresh-token lifetime |
| `RATE_LIMIT_WINDOW_MS` | `900000` | general rate-limit window |
| `RATE_LIMIT_MAX` | `1000` | requests per window per IP |
| `AUTH_RATE_LIMIT_MAX` | `20` | failed auth attempts per window |
| `LOG_LEVEL` | `info` | pino level |
| `SWAGGER_ENABLED` | `false` | enable `/api/docs` in dev |
| `MAIL_TRANSPORT` | `auto` | `auto` \| `smtp` \| `ethereal` \| `log` |
| `MAIL_FROM` | `BrainCrop <no-reply@braincrop.io>` | sender |
| `SMTP_URL` / `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | empty / `587` / off | **secret** — only for real email |

---

## Scripts

| Script | What it does |
| --- | --- |
| `corepack pnpm dev` | run the API with reload (tsx) |
| `corepack pnpm build` | production bundle (tsup → `dist/`) |
| `corepack pnpm start` | run the built bundle |
| `corepack pnpm typecheck` | `tsc --noEmit` |
| `corepack pnpm test` | vitest (in-memory Mongo) |
| `corepack pnpm seed` | seed the demo org + accounts |

**Before committing**, keep these green: `typecheck`, `test`, `build`. `dist/`, `.env`, and coverage
output are gitignored.

---

## Conventions (required)

1. **Git attribution.** Commit as the owner's personal GitHub account **`arhamabeer`** — GitHub
   attributes by email, so set both author and committer:
   ```bash
   git config user.name "arhamabeer"
   git config user.email "57269012+arhamabeer@users.noreply.github.com"
   ```
   **Never** add a `Co-Authored-By` / "Generated with …" trailer.
2. **Conventional Commits** — lowercase-first subject, no trailing period, a scope from the commitlint
   enum (e.g. `backend`). Meaningful messages.
3. **No hardcoded business rules.** Anything a business tunes (shifts, thresholds, leave types,
   timezone, weekly minimums, …) is **configurable data with seeded defaults**, never a literal.
4. **Shared contracts are vendored.** `@ems/types` and `@ems/validation` live under `packages/` in
   **each** repo. A change to a shared type/validation **must be mirrored** into every consuming repo
   (frontend/console/mobile) — there is no single shared package to bump.
5. **RBAC.** Two dimensions — `accountType` (Owner | Employee) × `orgRole` (Admin | Manager | Lead |
   Member). Gate routes with `authorize({ minOrgRole })` and resolve visibility with `scopedUserIds()`.

---

## Notable modules

Auth + invites, Employees (+ CSV import, role assignment, device-ID mapping), Departments, Attendance
(check-in/out, roster, policy + holidays, reports, regularizations/approvals, auto-absent cron),
Leaves, Expenses, Payroll, Notifications, Announcements, Teams, Audit log, Approvals.

**ZKTeco biometric integration.** The attendance terminal pushes punches to the server over the
ZKTeco **ADMS/push** protocol at `/iclock/*` (mounted at the app root in `src/app.ts`, plain-text
body — *not* under `/api`). Punches are stored deduped in `RawPunch`; the daily `Attendance` record is
derived from them (first punch = check-in, last = check-out). A device auto-registers as **Pending**
and only produces attendance once an admin **Enables** it (Attendance → Settings → Biometric devices).
A `node-cron` job in `src/jobs/scheduler.ts` re-derives recent days and flags silent devices.
