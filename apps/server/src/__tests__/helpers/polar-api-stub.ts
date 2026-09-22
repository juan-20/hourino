const CREATED = 201;
const OK = 200;

interface PolarCustomerBody {
	email?: string;
	external_id?: string | null;
	name?: string | null;
}

/**
 * Minimal `Customer` payload matching `@polar-sh/sdk`'s inbound zod schema
 * (`CustomerIndividual$inboundSchema`) — the SDK validates every response, so
 * omitting `type` or `avatar_url` fails with "Response validation failed".
 */
function polarCustomer(body: PolarCustomerBody) {
	return {
		avatar_url: "https://example.invalid/avatar.png",
		billing_address: null,
		created_at: new Date().toISOString(),
		deleted_at: null,
		email: body.email ?? "customer@example.com",
		email_verified: false,
		external_id: body.external_id ?? null,
		id: "cus_integration_test",
		locale: null,
		metadata: {},
		modified_at: null,
		name: body.name ?? null,
		organization_id: "org_integration_test",
		tax_id: null,
		type: "individual",
	};
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}

	return input.url;
}

function jsonResponse(payload: unknown, status: number): Response {
	return new Response(JSON.stringify(payload), {
		headers: { "content-type": "application/json" },
		status,
	});
}

/**
 * Better Auth's Polar plugin runs with `createCustomerOnSignUp: true`, so EVERY
 * sign-up makes a live `GET /v1/customers` + `POST /v1/customers` round-trip to
 * Polar's sandbox — which 401s with a dummy access token and turns sign-up into
 * a 500. (The plan assumed Polar was only contacted by checkout/portal routes;
 * it is not.) This intercepts just `*.polar.sh` and leaves every other fetch —
 * including none that Better Auth's email/password flows make — untouched.
 *
 * Returns a disposer that restores the original `fetch`.
 */
export function installPolarApiStub(): () => void {
	const realFetch = globalThis.fetch;

	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = requestUrl(input);

		if (!url.includes("polar.sh")) {
			return realFetch(input, init);
		}

		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();

		if (method === "GET") {
			// No pre-existing customer — the plugin then creates one.
			return Promise.resolve(
				jsonResponse(
					{ items: [], pagination: { max_page: 1, total_count: 0 } },
					OK
				)
			);
		}

		let body: PolarCustomerBody = {};
		try {
			body = JSON.parse(String(init?.body ?? "{}")) as PolarCustomerBody;
		} catch {
			body = {};
		}

		return Promise.resolve(jsonResponse(polarCustomer(body), CREATED));
	}) as typeof fetch;

	return () => {
		globalThis.fetch = realFetch;
	};
}
