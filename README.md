# hourino

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Fastify, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Fastify** - Fast, low-overhead web framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Running the project

There are two ways to run `hourino` locally.

### Option A — Cloud lane (Alchemy + Neon)

Alchemy provisions a real Neon database, passes its connection credentials directly to the running app, and manages database deployment in the same stack as the consuming app. You do not need to copy a hosted `DATABASE_URL` into the app environment.

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

### Option B — Local lane (docker-compose Postgres + Redis)

For fully offline iteration, or to try the Redis-backed background-worker path once it lands, run everything against local containers instead:

```bash
bun run docker:up                                      # start Postgres + Redis
cp apps/server/.env.local.example apps/server/.env.local  # then fill in BETTER_AUTH_SECRET / POLAR_ACCESS_TOKEN
cp apps/web/.env.local.example apps/web/.env.local
cp packages/db/.env.local.example packages/db/.env.local
bun run db:migrate                                      # apply checked-in migrations to the local Postgres
bun run dev:local                                        # starts web + server directly, no Alchemy
```

`.env.local` files are gitignored — only the `.env.local.example` templates are committed. Stop the containers with `bun run docker:down`.

## Database Setup

Generate and commit migration SQL with `bun run db:generate`. Deployment applies checked-in migrations after provisioning the database. `db:push` (schema push without a migration file) is for local iteration against the docker-compose Postgres only — it refuses to run against a non-localhost `DATABASE_URL` or `NODE_ENV=production`.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@hourino/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

For Cloudflare, Alchemy loads and validates deployment inputs with `varlock/auto-load` in its Node/Bun deployment process. Worker code reads native bindings; web clients use the framework's public env API through `src/env.public.ts` where needed. Alchemy supplies resource URLs and managed database credentials. In-Worker Varlock protections are deferred until an official Alchemy integration is available; see [the non-Wrangler deployment guidance](https://varlock.dev/integrations/cloudflare/#non-wrangler-deploy-tools-alchemy-sst-pulumi).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Alchemy

- Target: web on Cloudflare + server on Prisma + Axiom observability
- Configure provider accounts: `cd packages/infra && bunx alchemy profile edit`
- Dev (stage `dev`): bun run dev
- Deploy (stage `prd`): bun run deploy
- Destroy: bun run destroy:dev / bun run destroy:prd

`alchemy profile edit` stores the selected Axiom, Cloudflare, Neon, PlanetScale, and/or Prisma provider profiles under `~/.alchemy`; no provider-specific setup command is required by this scaffold.

There are two stages: `dev` (`bun run dev`, local processes with their own Neon database) and `prd` (`bun run deploy`). The scripts pick the stage via `ALCHEMY_STAGE`; don't deploy to `dev`, because Alchemy dev mode replaces that stage's server with a local process.

Shared secrets live in `packages/infra/.env`; per-stage values (`BETTER_AUTH_URL`, `CORS_ORIGIN`, `POLAR_SUCCESS_URL`) go in `packages/infra/.env.dev` / `.env.prd`, which override it for their stage.

Alchemy creates a stage-specific Axiom dataset and a least-privilege ingest token. `dev` injects the credentials into the observed apps without writing the token to an env file.

### Production origins

- Required after the first `prd` deploy: set `CORS_ORIGIN` in `packages/infra/.env.prd` to the exact deployed web origin, then deploy again.
- Prisma + Better Auth: after the first `prd` deploy, set `BETTER_AUTH_URL` in `packages/infra/.env.prd` to the returned server URL, then deploy again.

## Git Hooks and Formatting

- Run checks: `bun run check`

## Project Structure

```
hourino/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Fastify, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode (cloud lane, Alchemy + Neon)
- `bun run dev:local`: Start web + server directly against docker-compose Postgres/Redis (local lane)
- `bun run docker:up` / `docker:down`: Start/stop the local Postgres + Redis containers
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: TypeScript project-reference build (`db`/`auth`/`api`/`apps/server`) plus type checks for `ui`/`infra`/`web`
- `bun run db:push`: Push schema changes to database (local Postgres only — guarded against non-local/production targets)
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting/linting plus the dependency-cruiser architectural-boundary check
- `bun run check:boundaries`: Run just the dependency-cruiser architectural-boundary check

## Better Auth Schema Generation

After changing auth plugins or schema options, run `bun run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
