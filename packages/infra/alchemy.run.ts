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

export const observability = Effect.gen(function* () {
	const { stage } = yield* Alchemy.Stack;
	const datasetName = `hourino-${stage}-logs`;

	const dataset = yield* Axiom.Dataset("logs", {
		description: "hourino application logs",
		kind: "axiom:events:v1",
		name: datasetName,
	});
	const ingest = yield* Axiom.ApiToken("logs-ingest", {
		datasetCapabilities: {
			[datasetName]: {
				ingest: ["create"],
			},
		},
		name: `hourino-${stage}-logs-ingest`,
	});

	return {
		dataset,
		runtimeEnv: {
			AXIOM_API_KEY: ingest.token,
			AXIOM_DATASET: dataset.name,
			AXIOM_EDGE_URL: dataset.edgeDeploymentUrl,
		},
	};
}).pipe(
	// Axiom is optional remote log shipping, not required for the app to run —
	// evlog's Axiom drain already degrades gracefully with no dataset/apiKey
	// (see the "[evlog/axiom] Missing dataset or apiKey" warning). A failure
	// provisioning it (e.g. an Axiom-side account/API issue) must never block
	// deploying the actual server/web resources. `catchCause`, not
	// `orElseSucceed`, is required here: Axiom's BadRequest surfaces as a
	// defect (an unexpected thrown error), not a typed Effect failure, and
	// `orElseSucceed` explicitly does not recover from defects.
	Effect.catchCause(() =>
		Effect.succeed({
			dataset: undefined,
			runtimeEnv: {},
		})
	)
);

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
			axiomDataset: observabilityResources.dataset?.name,
			server: serverWorker.url,
			web: webWorker.url,
		};
	})
);
