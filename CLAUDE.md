# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`hourino` is a Bun + Turborepo monorepo scaffolded with Better-T-Stack: TanStack Router (React) frontend, Fastify + tRPC backend, Drizzle ORM over Postgres (Neon), Better Auth, Polar payments, and Alchemy for infra/deployment.

## Commands

All commands run from the repo root via `turbo`, unless noted. Package manager is Bun (`bun@1.4.2`) — use `bun`, not `npm`/`pnpm`/`yarn`.

- `bun install` — install deps (also runs `postinstall`, which generates `src/env.ts` for each app/package from its `.env.schema` via Varlock)
- `bun run dev` — start all apps against Alchemy-provisioned Neon (web on :3001, server on :3000), on the Alchemy stage `dev` — the cloud lane
- `bun run deploy` — deploy the Alchemy stage `prd`; `bun run destroy:dev` / `destroy:prd` tear a stage down (there is deliberately no bare `destroy`)
- `bun run dev:local` — start web + server directly (bypassing Alchemy) against the docker-compose Postgres/Redis — the local lane; see Database below
- `bun run docker:up` / `docker:down` — start/stop the local Postgres + Redis containers (`docker-compose.yml`)
- `bun run dev:web` — start only the web app
- `bun run storybook` — run Storybook (Vite builder) for `@hourino/ui`'s component library, on :6006
- `bun run build-storybook` — build Storybook's static bundle (`packages/ui/storybook-static`, gitignored)
- `bun run build` — build all apps
- `bun run check-types` — real TypeScript project-reference build across `db`/`auth`/`api`/`apps/server` (`tsc --build`, incremental) plus plain `tsc --noEmit` for `ui`/`infra`/`web` (which aren't in the reference graph)
- `bun run check` — Biome/Ultracite lint + format check, plus `depcruise` (dependency-cruiser) enforcing the `domain`→`infrastructure` import boundary
- `bun run check:boundaries` — just the `depcruise` architectural-boundary check on its own
- `bun run fix` — auto-fix lint/format issues (`ultracite fix`)
- `bun run db:push` / `db:generate` / `db:migrate` / `db:studio` — Drizzle Kit commands scoped to `@hourino/db` (see below). `db:push` refuses to run against a non-localhost `DATABASE_URL` or `NODE_ENV=production` (`packages/db/scripts/guard-db-push.mjs`) — override with `DB_PUSH_FORCE=1` only if genuinely intentional.
- `bun run auth:generate` — regenerate `packages/db/src/schema/auth.ts` from the Better Auth config in `apps/server/src/services.ts` (run after changing auth plugins/options)
- `bun run env:generate` — regenerate each app/package's `src/env.ts` from its `.env.schema` (run after editing a schema)

To target a single workspace package, use Turbo's filter flag, e.g. `turbo run check-types -F @hourino/api` or `turbo run dev:bare -F web`. `dev:bare` is the raw per-app dev command (`vite dev` for web, `bun --hot src/index.ts` for server) that Turbo's `dev` task fans out to.

Tests are Vitest: `packages/api` (`bun run test` there; router validation/auth + OpenAPI shape, all DB-free) and `apps/web` (`bun run test` there; pure calendar logic in `src/lib`, via its own minimal `vitest.config.ts`). `packages/api/src/__tests__/time-entries.integration.test.ts` runs the categories/time-entries routers against a real Postgres and is skipped unless `INTEGRATION_DATABASE_URL` is set (local lane: `postgresql://hourino:hourino@db.localtest.me:5432/hourino_dev`). On Windows, run `drizzle-kit migrate` directly from `packages/db` (`bunx drizzle-kit migrate`) if `bun run db:migrate` fails with Turbo's "interactive task without Terminal UI" error.

### Database

- Schema lives in `packages/db/src/schema/`; `packages/db/src/schema/auth.ts` is generated (don't hand-edit — regenerate with `bun run auth:generate`). Domain schema (`categories.ts`, `time-entries.ts`, `time-entry-categories.ts`, `report-runs.ts`, `monthly-summaries.ts`) is hand-written; all re-exported from `schema/index.ts` and wired into `packages/db/src/relations.ts`.
- Migrations are written to `packages/db/src/migrations` and are checked in; `bun run db:generate` creates new migration SQL from schema changes, `bun run db:migrate` applies them, `bun run db:push` pushes schema directly (dev only). The installed `drizzle-kit` (1.0.0-rc.4, pinned via bun catalog) uses **folder-based migrations** — each migration is `src/migrations/<timestamp>_<slug>/{migration.sql,snapshot.json}`, chained via `prevIds` inside `snapshot.json`, not the older flat `0000_name.sql` + `meta/_journal.json` layout. Use `drizzle-kit generate --custom --name=<name>` for hand-written SQL migrations (partitioning DDL, PL/pgSQL functions) that `drizzle-kit` can't diff from the schema DSL.
- `db:generate`/`db:migrate` validate `DATABASE_URL` even though `generate` never opens a connection — when running them outside an active `bunx alchemy dev` session (which injects the real value), pass a placeholder inline, e.g. `DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder" bun run db:generate`.
- Local dev does **not** need a copied `DATABASE_URL`: Alchemy provisions the Neon database and injects credentials into the running app as part of the same deploy/dev stack (see `packages/infra/alchemy.run.ts`).
- **Two dev lanes exist.** Cloud lane (`bun run dev`): Alchemy provisions real Neon + orchestrates web/server, as above — no local setup needed. Local lane (`bun run dev:local`): `bun run docker:up` starts `docker-compose.yml`'s Postgres+Redis (Redis is provisioned for the future Phase 4 background-worker item; nothing consumes it yet), then copy each `apps/server/.env.local.example` / `apps/web/.env.local.example` / `packages/db/.env.local.example` to `.env.local` (gitignored, filling in `BETTER_AUTH_SECRET`/`POLAR_ACCESS_TOKEN` placeholders), run `bun run db:migrate` to apply the checked-in migrations to the local Postgres, then `bun run dev:local`. Varlock's `varlock/auto-load` (already wired into `apps/server/src/env.server.ts` and `packages/db/drizzle.config.ts`) picks up `.env.local` automatically when running outside Alchemy.
- `time_entries` is **physically RANGE-partitioned by `work_date`** (monthly partitions) — `drizzle-kit` has no DSL for `PARTITION BY` and cannot diff a partitioned table, so its schema file (`schema/time-entries.ts`) declares columns only, for typed query-builder/relations support (`db.query.timeEntries.*`). All indexes, the composite `(id, work_date)` primary key, and the `CHECK` constraint are hand-written SQL migrations. Never add `.primaryKey()`/`index()` to that schema file, and never run `bun run db:push` against it — push does live introspection and will try to "fix" the partitioning it doesn't understand. Column changes need a hand-written `ALTER` migration mirrored into the schema file.
- Three SQL functions support the partitioned model: `maintain_time_entries_partitions(months_ahead)` (idempotent monthly partition creation), `ensure_time_entries_partition(date)` (on-demand single-month creation, called by the API before writes), and `refresh_monthly_summaries(target_month)` (rebuilds the `monthly_summaries` read-model table via `GROUPING SETS`, soft-delete-aware). The maintain/refresh functions are not scheduled yet — no cron/queue infra exists in this repo; invoke manually until the "Phase 4: CRONs & Background Workers" work (BullMQ/Redis or pg-boss, `apps/worker`) lands and calls them from its monthly fan-out job.

### Environment variables (Varlock)

- Each app/package that needs env vars owns an `.env.schema` file (`apps/web`, `apps/server`, `packages/db`, `packages/infra`). Varlock generates a typed `src/env.ts` (and `env.public.ts` for browser-exposed vars in web) from that schema — regenerate with `bun run env:generate` after editing a schema.
- Import the generated `ENV` accessor rather than reading `process.env` directly.
- Bun's built-in `.env` autoloading is disabled (`bunfig.toml` → `env = false`); Varlock (`varlock/auto-load` or `varlock run`) is the only env loader. Run standalone Node/Bun tools (drizzle-kit, alchemy) from the owning app/package directory so they pick up the right schema.
- `packages/db/.env.schema` and `packages/infra/.env.schema` `@import` vars from `apps/server/.env.schema` rather than redeclaring them — keep server's schema as the source of truth for shared vars (`DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_*`, `POLAR_*`).

### i18n (Paraglide JS, web only)

- `apps/web` is translated with Paraglide JS: `en` (base) + `pt-BR`. Strings live in `apps/web/messages/{en,pt-BR}.json` — add every new key to **both** files. Use them via `import { m } from "@/paraglide/messages"` → `m.some_key()` (messages are functions; call them at render time, not at module scope, or the locale is frozen).
- `apps/web/src/paraglide/` is **generated** by the Vite plugin (`paraglideVitePlugin` in `apps/web/vite.config.ts`) on `vite dev`/`vite build` — gitignored, never hand-edit. `apps/web/project.inlang/settings.json` is the only tracked file in that folder; the SDK ignores the rest itself. The two inlang plugins are local devDeps (loaded from `./node_modules/...`, not a CDN) so builds work offline.
- Locale resolution order (`strategy` in `vite.config.ts`): `localStorage` (`PARAGLIDE_LOCALE`, set by the nav's `LocaleToggle`) → `custom-browserLanguage` (defined in `apps/web/src/lib/i18n.ts`; maps regional variants like `pt-PT`/`pt` to `pt-BR`, which Paraglide's built-in `preferredLanguage` wouldn't) → `baseLocale`. `lib/i18n.ts` must stay the first import in `main.tsx`, since the strategy has to be registered before the first `getLocale()`. `setLocale()` reloads the page; `main.tsx` syncs `<html lang>`.
- Dates/numbers use `Intl.*` with `getLocale()` — no date library in `apps/web`.
- Translated so far: the landing page, marketing nav, `ModeToggle`, the app header (which also carries the `LocaleToggle` language switcher) and the whole calendar (grids, toolbar, entry dialog, toasts). Still English-only: the auth forms (login/signup/reset) and `/user`, tracked on the project board.

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

### TypeScript project references

`db` → `auth` → `api` → `apps/server` form a real TS composite-project graph (`composite: true`, `references` in each `tsconfig.json`): `db` is a leaf, `auth`/`api` reference `db` (and `api` also references `auth`, for the `Session` type), `apps/server` references all three. Since these packages ship raw TS via `exports` (no build step — see below), `composite` projects emit **declarations only** (`declaration: true`, `emitDeclarationOnly: true`) into a gitignored `dist-types/`, purely to satisfy TS's requirement that referenced projects be built — `exports` still points at `src/*.ts` and nothing downstream consumes `dist-types`. This only works via `tsc --build` (plain `tsc --noEmit -p <project>` does **not** auto-build referenced projects and will fail with `TS6305`) — hence `check-types` uses `--build` for these four packages. `apps/web` and `packages/ui` are intentionally outside this graph (web doesn't even extend `@hourino/config`'s base tsconfig and owns its own Vite resolution; ui has no internal package deps to model).

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

### Calendar page (`/calendar`)

The authenticated app's main surface. `routes/_auth/calendar/route.tsx` is a layout (toolbar + sidebar + Day/Week/Month grid) whose URL search params hold all view state: `view`, `date`, `hidden` (category ids filtered out; `"none"` = uncategorized), validated by `calendarSearchSchema` in `components/calendar/calendar-search.ts`. Entry create/edit are **nested routes that render a dialog over the grid**: `entries.new.tsx` (prefill via `workDate`/`start`/`end` search params) and `entries.$entryId.tsx` (loader seeds `getById` from the cached window). Closing navigates back with `replace: true`. On the Day/Week grid, `components/calendar/use-sweep.ts` handles drag-to-sweep (mouse/pen after 4px of travel, touch after a 350ms hold so swipes still scroll, 15-min snap, edge auto-scroll, Esc cancels); a plain click keeps the 1h slot. Release navigates to `entries.new` with the range, and the grid keeps a solid "held" ghost from that route's URL while the dialog is open. The live ghost is painted through direct DOM writes, never React state, so a sweep doesn't re-render the grid. In the dialog, Esc closes one layer at a time (the inline new-category form, then the dialog). The Day/Week/Month choice made in the view switcher is remembered in localStorage (`hourino.calendar.view`, helpers in `calendar-search.ts`). A `view` in the URL wins; without one the calendar opens the remembered view, else Day on phones / Week. In Month view, clicking a day (or Enter on it) opens `entries.new` for that day directly. Previous/Next/Today use TanStack `viewTransition` types (`calendar-prev`/`calendar-next`/`calendar-today`) that slide only the element named `calendar-grid` (CSS in `apps/web/src/index.css`, off under reduced motion). The `/_auth` guard reads the session through `sessionQueryOptions` (`lib/auth-client.ts`, cached 5 min, stale-while-revalidate) because it runs on every navigation. An uncached lookup put ~1s of auth round trips in front of every month change. It never caches a signed-out result, and sign-out clears it. Data: one unfiltered `timeEntries.list` per window (Day and Week share the week window; Month uses the 42-day grid), neighbours prefetched, filters applied client-side; `categories.list({ status: "all" })` fetched once. Pure logic (windows, overlap layout, totals) lives in `lib/calendar.ts` with unit tests; shared date/duration formatting in `lib/time-format.ts`. Gotcha: TanStack Router infers route option types in key order, so keep `validateSearch` → `loaderDeps` → `loader` in that order or the search/deps types collapse to `{}`.

### Web page chrome (marketing vs app)

`apps/web/src/routes/__root.tsx` renders the app `Header` shell for every route **unless** a matched route sets `staticData: { chrome: "marketing" }` (typed via the `StaticDataRouteOption` augmentation in `main.tsx`). The pathless layout `routes/_marketing/route.tsx` sets it and renders its own `MarketingNav`; the public landing page is `routes/_marketing/index.tsx` (URL `/`), built from `components/landing/*` (hero + a client-only calendar demo whose pure logic lives in `lib/calendar-demo.ts`). New public/marketing pages go under `_marketing/`. The auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`) set `staticData: { chrome: "auth" }`: no app header, and they render inside `components/auth-shell.tsx` (a "Back to home" link plus a centered card). Any `chrome` value skips the header. This switch is temporary — moving the authenticated app under `/app` is tracked on the project board and will replace it.

### Domain model (time tracking)

Aggregate roots: `User` (Better Auth's `user`, `text` id), `Category` (owned by a user, soft-deleted, `color` is a curated palette key — the `category_color` enum mirroring `--category-*` tokens, see `packages/ui/DESIGN.md`), `TimeEntry` (belongs to a user, partitioned — see Database above), `ReportRun` (one per user+period, unique-constrained). There is no `projects` table (dropped: it was 1:1 with the user); categories are the only classification, many-to-many via `time_entry_categories` (carries `work_date` for the composite FK to the partitioned `(id, work_date)` PK, `ON UPDATE CASCADE` so links follow an entry moved to another month). `monthly_summaries` is a derived read-model table, not an aggregate — it's rebuilt wholesale per month by `refresh_monthly_summaries()` rather than written to directly.

Time model is **local wall-clock**: `work_date` is the user's local day, `start_minute`/`end_minute` are minutes from local midnight (`CHECK 0 <= start < end <= 1440`, so entries never cross midnight), `minutes_worked` is a STORED generated column. No timezone math anywhere.

Routers: `packages/api/src/routers/{categories,time-entries}.ts` (tRPC + REST mirror via `trpc-to-openapi`). `timeEntries.list({from, to, categoryIds?, search?})` is the calendar read path — `to` exclusive, max 42 days, one query returning each entry's `categoryIds` (resolve against `categories.list({ status: "all" })` so since-deleted categories still render). Both routers are full CRUD: `list` (filters; categories also sort + `limit`/`offset` pagination returning `{ items, total }`), `getById`, `create`, `update`, soft `delete`, plus `categories.restore`. Writes go through `db.batch()` (neon-http has no interactive transactions) and call `ensure_time_entries_partition(date)` first for any month not yet seen by the process, so rows never land in `time_entries_default` (which would block creating that month's partition).

### Logging

`evlog` provides structured logging on the server: `initLogger()` at startup, `createAxiomDrain()` as the sink, and `createAuthMiddleware` (from `evlog/better-auth`) attaches user identity to logs from the session cookie on every request except `/api/auth/**`.

### Deployment (Alchemy)

`packages/infra/alchemy.run.ts` defines one Alchemy stack with three resource groups, composed with `effect`:
- `Neon.Project` — provisions Postgres, runs `packages/db/src/migrations` on deploy, injects `DATABASE_URL`
- `Axiom.Dataset` + `Axiom.ApiToken` — per-stage logging dataset with a scoped ingest token
- `Prisma.Compute("server", ...)` — deploys `apps/server` (Bun entrypoint) with env assembled from the above plus secrets from `Config.Redacted`
- `Cloudflare.Website.Vite("web", ...)` — deploys `apps/web`, given the server's resolved URL as `VITE_SERVER_URL`

There are exactly two stages, both chosen by `packages/infra`'s scripts setting `ALCHEMY_STAGE` (never Alchemy's `live_$USER`/`dev_$USER` default, which varied between shells and made URLs change between deploys):
- **`dev`** — `bun run dev` (`alchemy dev`): its own Neon project, with server and web running as local processes.
- **`prd`** — `bun run deploy` (`alchemy deploy`): its own Neon project, server on Prisma Compute, web on Cloudflare. The URLs stay stable across redeploys of the same stage.

Never `alchemy deploy` to the `dev` stage: dev mode rewrites the stage's server state to a local process (`appId: dev:server`), so a deployed app and `alchemy dev` can't share a stage. `ALCHEMY_STAGE` is also the infra schema's Varlock `@currentEnv`, so `packages/infra/.env` holds the shared secrets and `.env.dev` / `.env.prd` (gitignored) override per stage: `BETTER_AUTH_URL`, `CORS_ORIGIN`, `POLAR_SUCCESS_URL` (localhost for dev; the deployed origins for prd, filled in after the first prd deploy and then redeployed; the Google OAuth redirect URI must match too). Run infra commands through the scripts (root or `packages/infra`), not bare `bunx alchemy`, or the stage falls back to `live_$USER`. Stages from before this split (`live_juana`, `live_unknown`, `dev_juana`) are orphans until destroyed with `bunx alchemy destroy --stage <name>` from `packages/infra`.

## Design system

`@hourino/ui`'s tokens implement **"Balanced Riso-Neobrutalism"** — a brand identity built on `#432F2E` (espresso) / `#c3DAE8` (powder blue), a riso-print duotone pair (~8.6:1 contrast). The full rationale, the WCAG contrast matrix, and usage rules live in `packages/ui/DESIGN.md` — read it before touching tokens or adding components. Key facts a session needs without opening that file:

- All color tokens are oklch in `packages/ui/src/styles/globals.css`, contrast-verified in both `:root` and `.dark` — **dark mode flips emphasis** (powder blue carries `--primary` on dark backgrounds, espresso becomes the `--accent` surface tint); it's not a naive inversion of the light-mode values.
- `--border` (ink brown) and `--ring` (saturated blue) are different hues on purpose, so keyboard focus is never ambiguous against a UI that already shows a visible border on everything — never make them the same color.
- `--success` is a real token now (there wasn't one before this system) — never use a raw `text-red-500`/`bg-green-500`-style Tailwind color-scale class anywhere in the app; every color decision routes through a semantic token.
- Shape language: `border-2 border-border` on bounded surfaces, `--radius` tightened to `0.375rem`, and three hard zero-blur shadow utilities (`shadow-brutal-sm`/`shadow-brutal`/`shadow-brutal-lg`, tinted to `--border`) instead of soft blurred shadows. Buttons/badges/switches get a tactile `:active` press (the shadow collapses and the element translates into it) — always paired with `motion-reduce:transition-none` so the state change still happens instantly under `prefers-reduced-motion`, just without the animated transition.
- `.grain` (a static feTurbulence noise utility in `globals.css`) is for decorative/low-density surfaces only (auth screens, empty states) — **never** on the dashboard or any scrolling table/list.
- Fonts are self-hosted (`@fontsource-variable/space-grotesk` for UI/headings, `@fontsource/space-mono` for durations/timestamps — monospace digits are tabular for free). There was no working font-loading before this system (`Inter Variable` was referenced in the old tokens but never actually loaded — no `@font-face`/package existed for it).
- New primitives come from the `shadcn` MCP/CLI (`bunx shadcn add ...`), then get restyled to match the border/shadow language above before merging — never hand-rolled, never a second component library.

`packages/ui` also has Storybook (Vite builder) for the component library (`bun run storybook` / `bun run build-storybook`, see Commands above). Config lives in `packages/ui/.storybook/`; `preview.tsx` wires a light/dark toolbar toggle against the same `.dark` class strategy the app uses, and imports the real `globals.css` tokens so stories render the actual system. `@storybook/addon-a11y` is included by default — use it when reviewing new components.

## Linting/formatting

Biome (via the `ultracite` preset — `ultracite/biome/core`, `/react`, `/tanstack`) is configured in the root `biome.json`: tabs, double quotes, organize-imports-on-save, plus a stricter `style` rule set (no parameter reassignment, enforced `as const`, self-closing elements, etc.). Use `bun run check` / `bun run fix` rather than invoking Biome directly, and don't hand-edit generated files (`routeTree.gen.ts`, `packages/db/src/schema/auth.ts`, `src/env*.ts`, `apps/web/src/paraglide/`). Note: `biome.json` doesn't exclude `apps/web/src/paraglide/` yet, so `bun run check` lints that generated output — add `"!**/src/paraglide"` to `files.includes` (the config-protection hook blocks agents from editing `biome.json`).

`bun run check` also runs `depcruise` against `.dependency-cruiser.cjs` (Biome has no path-based architectural-boundary rule, so this runs alongside it, not instead of it). It forbids any `domain/`/`application/` path importing an `infrastructure/` path, anywhere in `apps/**`/`packages/**` — matches zero files today (no such folders exist yet; that's Phase 2's job), so it can only start failing once that layering is introduced. Run `bun run check:boundaries` to check just that rule.
