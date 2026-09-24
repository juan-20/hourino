import { buttonVariants } from "@hourino/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages";

/**
 * Page frame for the sign-in family (login, signup, forgot/reset password).
 * These routes set `staticData: { chrome: "auth" }`, so __root renders no app
 * header; instead this shell gives a single way back to the home page and
 * centers the form card in the viewport. `.grain` is allowed here: auth
 * screens are decorative, low-density surfaces (DESIGN.md).
 */
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<div className="grain flex min-h-[100dvh] flex-col bg-background">
			<header className="px-4 pt-4 sm:px-6 sm:pt-6">
				<Link className={buttonVariants({ variant: "ghost" })} to="/">
					<ArrowLeftIcon aria-hidden="true" />
					{m.auth_back_home()}
				</Link>
			</header>
			<main className="grid flex-1 place-items-center px-4 pt-6 pb-16 sm:px-6">
				<div className="w-full max-w-md rounded-lg border-2 border-border bg-card p-6 shadow-brutal sm:p-8">
					{children}
				</div>
			</main>
		</div>
	);
}
