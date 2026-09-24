import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

// Side-effect import: registers the browser-language strategy before any getLocale() call.
import "./lib/i18n";
import Loader from "./components/loader";
import { getLocale } from "./paraglide/runtime";
import { routeTree } from "./routeTree.gen";
import { queryClient, trpc } from "./utils/trpc";

const router = createRouter({
	context: { queryClient, trpc },
	defaultPendingComponent: () => <Loader />,
	defaultPreload: "intent",
	routeTree,
	scrollRestoration: true,
	Wrap({ children }: { children: React.ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
	interface StaticDataRouteOption {
		/**
		 * Which page chrome __root renders instead of the app header:
		 * "marketing" routes bring their own nav, "auth" routes use AuthShell.
		 */
		chrome?: "auth" | "marketing";
	}
}

document.documentElement.lang = getLocale();

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}
