# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`hourino` is a Bun + Turborepo monorepo scaffolded with Better-T-Stack: TanStack Router (React) frontend, Fastify + tRPC backend, Drizzle ORM over Postgres (Neon), Better Auth, Polar payments, and Alchemy for infra/deployment.

## Commands

All commands run from the repo root via `turbo`, unless noted. Package manager is Bun (`bun@1.4.2`) — use `bun`, not `npm`/`pnpm`/`yarn`.

- `bun install` — install deps (also runs `postinstall`, which generates `src/env.ts` for each app/package from its `.env.schema` via Varlock)
- `bun run dev` — start all apps (web on :3001, server on :3000)
- `bun run dev:web` — start only the web app
- `bun run build` — build all apps
- `bun run check-types` — TypeScript project-reference check across the whole workspace (`tsc --noEmit` per package)
- `bun run check` — Biome/Ultracite lint + format check (`ultracite check`)
- `bun run fix` — auto-fix lint/format issues (`ultracite fix`)
- `bun run db:push` / `db:generate` / `db:migrate` / `db:studio` — Drizzle Kit commands scoped to `@hourino/db` (see below)
- `bun run auth:generate` — regenerate `packages/db/src/schema/auth.ts` from the Better Auth config in `apps/server/src/services.ts` (run after changing auth plugins/options)
- `bun run env:generate` — regenerate each app/package's `src/env.ts` from its `.env.schema` (run after editing a schema)

To target a single workspace package, use Turbo's filter flag, e.g. `turbo run check-types -F @hourino/api` or `turbo run dev:bare -F web`. `dev:bare` is the raw per-app dev command (`vite dev` for web, `bun --hot src/index.ts` for server) that Turbo's `dev` task fans out to.

There is no test suite/framework configured in this repo yet.

### Database

- Schema lives in `packages/db/src/schema/`; `packages/db/src/schema/auth.ts` is generated (don't hand-edit — regenerate with `bun run auth:generate`). Domain schema (`projects.ts`, `time-entries.ts`, `report-runs.ts`, `monthly-summaries.ts`) is hand-written; all re-exported from `schema/index.ts` and wired into `packages/db/src/relations.ts`.
- Migrations are written to `packages/db/src/migrations` and are checked in; `bun run db:generate` creates new migration SQL from schema changes, `bun run db:migrate` applies them, `bun run db:push` pushes schema directly (dev only). The installed `drizzle-kit` (1.0.0-rc.4, pinned via bun catalog) uses **folder-based migrations** — each migration is `src/migrations/<timestamp>_<slug>/{migration.sql,snapshot.json}`, chained via `prevIds` inside `snapshot.json`, not the older flat `0000_name.sql` + `meta/_journal.json` layout. Use `drizzle-kit generate --custom --name=<name>` for hand-written SQL migrations (partitioning DDL, PL/pgSQL functions) that `drizzle-kit` can't diff from the schema DSL.
- `db:generate`/`db:migrate` validate `DATABASE_URL` even though `generate` never opens a connection — when running them outside an active `bunx alchemy dev` session (which injects the real value), pass a placeholder inline, e.g. `DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder" bun run db:generate`.
- Local dev does **not** need a copied `DATABASE_URL`: Alchemy provisions the Neon database and injects credentials into the running app as part of the same deploy/dev stack (see `packages/infra/alchemy.run.ts`).
- `time_entries` is **physically RANGE-partitioned by `work_date`** (monthly partitions) — `drizzle-kit` has no DSL for `PARTITION BY` and cannot diff a partitioned table, so its schema file (`schema/time-entries.ts`) declares columns only, for typed query-builder/relations support (`db.query.timeEntries.*`). All indexes, the composite `(id, work_date)` primary key, and the `CHECK` constraint are hand-written SQL migrations. Never add `.primaryKey()`/`index()` to that schema file, and never run `bun run db:push` against it — push does live introspection and will try to "fix" the partitioning it doesn't understand. Column changes need a hand-written `ALTER` migration mirrored into the schema file.
- Two SQL functions support the partitioned model: `maintain_time_entries_partitions(months_ahead)` (idempotent monthly partition creation) and `refresh_monthly_summaries(target_month)` (rebuilds the `monthly_summaries` read-model table via `GROUPING SETS`, soft-delete-aware). Neither is scheduled yet — no cron/queue infra exists in this repo; invoke manually until the "Phase 4: CRONs & Background Workers" work (BullMQ/Redis or pg-boss, `apps/worker`) lands and calls them from its monthly fan-out job.

### Environment variables (Varlock)

- Each app/package that needs env vars owns an `.env.schema` file (`apps/web`, `apps/server`, `packages/db`, `packages/infra`). Varlock generates a typed `src/env.ts` (and `env.public.ts` for browser-exposed vars in web) from that schema — regenerate with `bun run env:generate` after editing a schema.
- Import the generated `ENV` accessor rather than reading `process.env` directly.
- Bun's built-in `.env` autoloading is disabled (`bunfig.toml` → `env = false`); Varlock (`varlock/auto-load` or `varlock run`) is the only env loader. Run standalone Node/Bun tools (drizzle-kit, alchemy) from the owning app/package directory so they pick up the right schema.
- `packages/db/.env.schema` and `packages/infra/.env.schema` `@import` vars from `apps/server/.env.schema` rather than redeclaring them — keep server's schema as the source of truth for shared vars (`DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_*`, `POLAR_*`).

## Architecture

### Workspace layout

```
apps/
  web/      TanStack Router SPA (Vite, port 3001) — routes in src/routes/, file-based routing (routeTree.gen.ts is generated, gitignored/biome-ignored)
  server/   Fastify HTTP server (port 3000) — mounts tRPC and Better Auth's handler
packages/
  api/      @hourino/api — tRPC router/procedure definitions and context type (framework-agnostic business logic)
  auth/     @hourino/auth — createAuth() factory wrapping Better Auth + Polar plugin, given env + a Database
  db/       @hourino/db — Drizzle schema, relations, createDb() factory (Neon HTTP driver), migrations
  ui/       @hourino/ui — shared shadcn/ui primitives + Tailwind v4 global styles, imported as @hourino/ui/components/*
  infra/    @hourino/infra — Alchemy stack (alchemy.run.ts): provisions Neon DB, Axiom logging, deploys server to Prisma and web to Cloudflare
  config/   @hourino/config — shared base tsconfig only
```

### Dependency injection pattern

Shared packages (`api`, `auth`, `db`) export **factories**, not singletons — `createDb(env)`, `createAuth(env, db)`. The consuming app is responsible for constructing these and wiring them together. `apps/server/src/services.ts` is the composition root:

```ts
export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
```

`apps/server/src/context.ts` builds the per-request tRPC context (`{ db, session }`) by resolving the Better Auth session from request headers. `packages/api` defines `publicProcedure` / `protectedProcedure` (which throws `UNAUTHORIZED` if there's no session) against that `Context` type, and routers live under `packages/api/src/routers/`.

### Request flow

Fastify (`apps/server/src/index.ts`) registers two things at the HTTP layer:
1. `/api/auth/*` — proxies raw `Request`/`Response` into Better Auth's handler (`auth.handler`)
2. `/trpc` — `fastifyTRPCPlugin` serving `appRouter` from `@hourino/api`, with `createContext` resolving auth per request

The web app talks to `/trpc` via `apps/web/src/utils/trpc.ts` (a `createTRPCClient` + `createTRPCOptionsProxy` wired into TanStack Query, `credentials: "include"` for cookies) and to Better Auth via `apps/web/src/lib/auth-client.ts`. `ENV.VITE_SERVER_URL` (from `env.public.ts`) is the server origin, supplied by Alchemy at deploy time (Cloudflare Worker env → Vite build).

### Domain model (time tracking)

Aggregate roots: `User` (Better Auth's `user`, `text` id), `Project` (owned by a user), `TimeEntry` (belongs to a user + project, partitioned — see Database above), `ReportRun` (one per user+period, unique-constrained). `monthly_summaries` is a derived read-model table, not an aggregate — it's rebuilt wholesale per month by `refresh_monthly_summaries()` rather than written to directly. No `packages/api` router exists yet for these tables; `Context.db` is already threaded through `publicProcedure`/`protectedProcedure` and ready for one.

### Logging

`evlog` provides structured logging on the server: `initLogger()` at startup, `createAxiomDrain()` as the sink, and `createAuthMiddleware` (from `evlog/better-auth`) attaches user identity to logs from the session cookie on every request except `/api/auth/**`.

### Deployment (Alchemy)

`packages/infra/alchemy.run.ts` defines one Alchemy stack with three resource groups, composed with `effect`:
- `Neon.Project` — provisions Postgres, runs `packages/db/src/migrations` on deploy, injects `DATABASE_URL`
- `Axiom.Dataset` + `Axiom.ApiToken` — per-stage logging dataset with a scoped ingest token
- `Prisma.Compute("server", ...)` — deploys `apps/server` (Bun entrypoint) with env assembled from the above plus secrets from `Config.Redacted`
- `Cloudflare.Website.Vite("web", ...)` — deploys `apps/web`, given the server's resolved URL as `VITE_SERVER_URL`

Run infra commands from `packages/infra` (`bunx alchemy dev|deploy|destroy`, or the root `bun run deploy`/`destroy` scripts which delegate via Turbo filter). Deploys are staged; production requires `bunx alchemy deploy --stage production`. After the first deploy, `CORS_ORIGIN` and `BETTER_AUTH_URL` must be set to the real deployed origins in `apps/server/.env` and redeployed.

## Linting/formatting

Biome (via the `ultracite` preset — `ultracite/biome/core`, `/react`, `/tanstack`) is configured in the root `biome.json`: tabs, double quotes, organize-imports-on-save, plus a stricter `style` rule set (no parameter reassignment, enforced `as const`, self-closing elements, etc.). Use `bun run check` / `bun run fix` rather than invoking Biome directly, and don't hand-edit generated files (`routeTree.gen.ts`, `packages/db/src/schema/auth.ts`, `src/env*.ts`).
