import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages";

import { LocaleToggle } from "./landing/locale-toggle";
import { LogoMark } from "./logo";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const links = [{ label: m.nav_calendar(), to: "/calendar" }] as const;

	return (
		<div className="border-border border-b-2">
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex items-center gap-4 text-lg">
					<Link
						aria-label={m.nav_home()}
						className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						to="/"
					>
						<LogoMark className="size-8" />
					</Link>
					{links.map(({ to, label }) => (
						<Link
							// TanStack sets aria-current="page" on the active link.
							className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[current=page]:font-bold"
							key={to}
							to={to}
						>
							{label}
						</Link>
					))}
				</nav>
				<div className="flex items-center gap-2">
					<LocaleToggle />
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</div>
	);
}
