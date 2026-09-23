import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/landing/hero";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_marketing/")({
	component: LandingPage,
	head: () => ({
		meta: [
			{ title: m.meta_title() },
			{ content: m.meta_description(), name: "description" },
		],
	}),
});

function LandingPage() {
	return <Hero />;
}
