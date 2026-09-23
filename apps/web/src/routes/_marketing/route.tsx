import { createFileRoute, Outlet } from "@tanstack/react-router";

import { MarketingNav } from "@/components/landing/marketing-nav";

export const Route = createFileRoute("/_marketing")({
	component: MarketingLayout,
	// Tells __root to skip the app Header; marketing pages bring their own nav.
	staticData: { chrome: "marketing" },
});

function MarketingLayout() {
	return (
		<div className="flex min-h-[100dvh] flex-col">
			<MarketingNav />
			<main className="flex-1">
				<Outlet />
			</main>
		</div>
	);
}
