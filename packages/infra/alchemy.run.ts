import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Neon from "alchemy/Neon";
import * as Output from "alchemy/Output";
import * as Prisma from "alchemy/Prisma";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import "varlock/auto-load";

export const prismaProject = Prisma.Project("project", {
  createDatabase: false,
  region: "us-east-1",
});

const managedDatabase = Effect.gen(function* () {
  const database = yield* Neon.Project("database", {
    migrations: "../../packages/db/src/migrations",
  });
  const runtimeUrl = database.pooledConnectionUri.pipe(Output.map(Redacted.make));

  return {
    runtimeEnv: { DATABASE_URL: runtimeUrl },
  };
});

export const databaseEnv = managedDatabase.pipe(Effect.map(({ runtimeEnv }) => runtimeEnv));

export const databaseBindings = {
  DATABASE_URL: databaseEnv.pipe(Effect.map(({ DATABASE_URL }) => DATABASE_URL)),
};

export const databaseProviders = Layer.mergeAll(Neon.providers(), Prisma.providers());

export const observability = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;
  const datasetName = `hourino-${stage}-logs`;

  const dataset = yield* Axiom.Dataset("logs", {
    name: datasetName,
    kind: "axiom:events:v1",
    description: "hourino application logs",
  });
  const ingest = yield* Axiom.ApiToken("logs-ingest", {
    name: `hourino-${stage}-logs-ingest`,
    datasetCapabilities: {
      [datasetName]: {
        ingest: ["create"],
      },
    },
  });

  return {
    dataset,
    runtimeEnv: {
      AXIOM_API_KEY: ingest.token,
      AXIOM_DATASET: dataset.name,
      AXIOM_EDGE_URL: dataset.edgeDeploymentUrl,
    },
  };
});

export const observabilityEnv = observability.pipe(Effect.map(({ runtimeEnv }) => runtimeEnv));

export const server = Prisma.Compute(
  "server",
  Effect.gen(function* () {
    const project = yield* prismaProject;
    const resolvedDatabaseEnv = yield* databaseEnv;
    const resolvedObservabilityEnv = yield* observabilityEnv;

    return {
      project,
      path: "../../apps/server",
      build: {
        type: "auto",
        framework: "bun",
      },
      entrypoint: "src/index.ts",
      port: 3000,
      env: {
        ...resolvedDatabaseEnv,
        CORS_ORIGIN: Config.String("CORS_ORIGIN"),
        BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
        BETTER_AUTH_URL: Config.String("BETTER_AUTH_URL"),
        POLAR_ACCESS_TOKEN: Config.Redacted("POLAR_ACCESS_TOKEN"),
        POLAR_SUCCESS_URL: Config.String("POLAR_SUCCESS_URL"),
        ...resolvedObservabilityEnv,
      },
      healthCheck: { path: "/" },
      destroyOldDeployment: true,
      dev: {
        command: "bun run dev:bare",
        port: 3000,
      },
    };
  }),
);

export default Alchemy.Stack(
  "hourino",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), databaseProviders, Axiom.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const observabilityResources = yield* observability;
    const serverWorker = yield* server;
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      rootDir: "../../apps/web",
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "single-page-application",
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
      },
      dev: {
        port: 3001,
      },
    });

    return {
      web: webWorker.url,
      server: serverWorker.url,
      axiomDataset: observabilityResources.dataset.name,
    };
  }),
);
