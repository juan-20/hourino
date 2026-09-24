import { polarClient } from "@polar-sh/better-auth/client";
import { queryOptions } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";

import { ENV } from "../env.public";

export const authClient = createAuthClient({
	baseURL: ENV.VITE_SERVER_URL,
	plugins: [polarClient()],
});

const SESSION_STALE_MS = 5 * 60_000;

/**
 * Session lookup for route guards. Cached, because the `/_auth` guard runs on
 * every navigation (each calendar prev/next is one) and an uncached lookup
 * put a server round trip in front of every one. Only signed-in results are
 * kept: the guard drops a signed-out result, and sign-out clears it.
 */
export const sessionQueryOptions = queryOptions({
	queryFn: () => authClient.getSession(),
	queryKey: ["auth", "session"],
	staleTime: SESSION_STALE_MS,
});
