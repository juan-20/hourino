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
	const runtimeUrl = database.pooledConnectionUri.pipe(
		Output.map(Redacted.make)
	);

	return {
		runtimeEnv: { DATABASE_URL: runtimeUrl },
	};
});

export const databaseEnv = managedDatabase.pipe(
	Effect.map(({ runtimeEnv }) => runtimeEnv)
);

export const databaseBindings = {
	DATABASE_URL: databaseEnv.pipe(
		Effect.map(({ DATABASE_URL }) => DATABASE_URL)
	),
};

export const databaseProviders = Layer.mergeAll(
	Neon.providers(),
	Prisma.providers()
);

// One shared dataset across every stage — NOT `hourino-${stage}-logs`. Axiom's
// free/Personal plan caps an account at 3 datasets total; a per-stage dataset
// name means every new stage (dev, preview, a teammate's name, ...) tries to
// create a brand-new dataset, and once the account is at its cap, Axiom
// rejects the create with a bare 400 Bad Request. Sharing one fixed dataset
// name means later deploys update the same dataset instead of trying to
// create a new one, regardless of how many stages get deployed.
const SHARED_AXIOM_DATASET_NAME = "hourino-logs";

export const observability = Effect.gen(function* () {
	const dataset = yield* Axiom.Dataset("logs", {
		description: "hourino application logs",
		kind: "axiom:events:v1",
		name: SHARED_AXIOM_DATASET_NAME,
	});
	const ingest = yield* Axiom.ApiToken("logs-ingest", {
		datasetCapabilities: {
			[SHARED_AXIOM_DATASET_NAME]: {
				ingest: ["create"],
			},
		},
		name: "hourino-logs-ingest",
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

export const observabilityEnv = observability.pipe(
	Effect.map(({ runtimeEnv }) => runtimeEnv)
);

export const server = Prisma.Compute(
	"server",
	Effect.gen(function* () {
		const project = yield* prismaProject;
		const resolvedDatabaseEnv = yield* databaseEnv;
		const resolvedObservabilityEnv = yield* observabilityEnv;

		return {
			build: {
				framework: "bun",
				type: "auto",
			},
			destroyOldDeployment: true,
			dev: {
				command: "bun run dev:bare",
				port: 3000,
			},
			entrypoint: "src/index.ts",
			env: {
				...resolvedDatabaseEnv,
				BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
				BETTER_AUTH_URL: Config.String("BETTER_AUTH_URL"),
				CORS_ORIGIN: Config.String("CORS_ORIGIN"),
				GOOGLE_CLIENT_ID: Config.String("GOOGLE_CLIENT_ID"),
				GOOGLE_CLIENT_SECRET: Config.Redacted("GOOGLE_CLIENT_SECRET"),
				POLAR_ACCESS_TOKEN: Config.Redacted("POLAR_ACCESS_TOKEN"),
				POLAR_SUCCESS_URL: Config.String("POLAR_SUCCESS_URL"),
				RESEND_API_KEY: Config.Redacted("RESEND_API_KEY"),
				RESEND_FROM_EMAIL: Config.String("RESEND_FROM_EMAIL"),
				...resolvedObservabilityEnv,
			},
			healthCheck: { path: "/" },
			path: "../../apps/server",
			port: 3000,
			project,
		};
	})
);

export default Alchemy.Stack(
	"hourino",
	{
		providers: Layer.mergeAll(
			Cloudflare.providers(),
			databaseProviders,
			Axiom.providers()
		),
		state: Cloudflare.state(),
	},
	Effect.gen(function* () {
		const observabilityResources = yield* observability;
		const serverWorker = yield* server;
		const webWorker = yield* Cloudflare.Website.Vite("web", {
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "single-page-application",
			},
			dev: {
				port: 3001,
			},
			env: {
				VITE_SERVER_URL: serverWorker.url.as<string>(),
			},
			rootDir: "../../apps/web",
		});

		return {
			axiomDataset: observabilityResources.dataset.name,
			server: serverWorker.url,
			web: webWorker.url,
		};
	})
);
