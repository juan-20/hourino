import { buttonVariants } from "@hourino/ui/components/button";
import { Skeleton } from "@hourino/ui/components/skeleton";
import { cn } from "@hourino/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

import { CalendarDemo } from "./calendar-demo";

// tw-animate-css entry, gated by motion-safe so reduced-motion users get the final state instantly.
const ENTER =
	"motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:duration-500";

function HeroCta() {
	const { data: session, isPending } = authClient.useSession();

	// Same-size placeholder while the session resolves, so signed-in visitors never
	// see "Start tracking" flip to "Open dashboard" (and nothing shifts).
	if (isPending) {
		return <Skeleton className="h-11 w-40" />;
	}

	return (
		<Link
			className={cn(buttonVariants(), "h-11 px-5 text-sm")}
			to={session ? "/dashboard" : "/signup"}
		>
			{session ? m.nav_open_dashboard() : m.hero_cta_start()}
		</Link>
	);
}

export function Hero() {
	return (
		<section className="grain">
			<div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-10 pb-16 sm:pt-16 lg:grid-cols-2 lg:gap-14 lg:pt-20">
				<div className={cn("flex flex-col items-start gap-6", ENTER)}>
					<h1 className="text-balance font-bold text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-[2.5rem] xl:text-[2.75rem]">
						{m.hero_title()}{" "}
						<mark className="rounded-sm bg-accent box-decoration-clone px-1.5 text-accent-foreground dark:bg-primary dark:text-primary-foreground">
							{m.hero_title_mark()}
						</mark>
					</h1>
					<p className="max-w-[42ch] text-lg text-muted-foreground leading-relaxed">
						{m.hero_subtext()}
					</p>
					<HeroCta />
				</div>
				{/* Above the .grain layer (z-index 1) so the texture never sits on interactive data. */}
				<div className={cn("relative z-[2] motion-safe:delay-150", ENTER)}>
					<CalendarDemo />
				</div>
			</div>
		</section>
	);
}
