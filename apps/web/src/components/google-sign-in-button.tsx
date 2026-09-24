import "@fontsource/roboto/500.css";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

// Module scope: no closure over props/state, so it stays referentially stable.
// callbackURL must be an ABSOLUTE url pointing at the web app's own origin —
// Better Auth resolves a relative path against its own baseURL (the backend),
// so "/calendar" would land the browser on the server after the Google
// OAuth redirect, not on the frontend.
function signInWithGoogle() {
	return authClient.signIn.social({
		callbackURL: `${window.location.origin}/calendar`,
		provider: "google",
	});
}

/*
 * Google's own button spec (Sign in with Google branding guidelines,
 * "gsi-material-button"), not the app's design system: Google requires its
 * exact colors, Roboto Medium 14px, the official multicolor "G" mark, a 40px
 * height and 4px corners, so this is the one documented exception to the
 * "every color through a semantic token" rule (see packages/ui/DESIGN.md).
 * Light theme: white fill, #747775 stroke, #1F1F1F text. Dark theme: #131314
 * fill, #8E918F stroke, #E3E3E3 text. Hover/press add Google's state layer.
 */
const BUTTON_CLASS =
	"relative inline-flex h-10 w-full min-w-min max-w-[400px] cursor-pointer select-none items-center justify-center overflow-hidden whitespace-nowrap rounded-[4px] border border-[#747775] bg-white px-3 font-medium text-[#1f1f1f] text-sm tracking-[0.25px] outline-none transition-[background-color,border-color,box-shadow] duration-200 [font-family:Roboto,arial,sans-serif] hover:shadow-[0_1px_2px_0_rgba(60,64,67,0.30),0_1px_3px_1px_rgba(60,64,67,0.15)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:shadow-none";

// Google's state layer: 8% on hover, 12% while pressed or focused.
const STATE_LAYER_CLASS =
	"pointer-events-none absolute inset-0 bg-[#303030] opacity-0 transition-opacity duration-200 group-hover:opacity-[0.08] group-focus-visible:opacity-[0.12] group-active:opacity-[0.12] motion-reduce:transition-none dark:bg-white";

/** Google's official "G" logo, exactly as Google's button generator ships it. */
function GoogleLogo() {
	return (
		<svg
			aria-hidden="true"
			className="block size-5 shrink-0"
			viewBox="0 0 48 48"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
				fill="#EA4335"
			/>
			<path
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
				fill="#4285F4"
			/>
			<path
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
				fill="#FBBC05"
			/>
			<path
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
				fill="#34A853"
			/>
			<path d="M0 0h48v48H0z" fill="none" />
		</svg>
	);
}

interface GoogleSignInButtonProps {
	/** Google's approved wording: "Sign in with Google" vs "Sign up with Google". */
	intent?: "signin" | "signup";
}

export function GoogleSignInButton({
	intent = "signin",
}: GoogleSignInButtonProps) {
	return (
		<button
			className={`group ${BUTTON_CLASS}`}
			onClick={signInWithGoogle}
			type="button"
		>
			<span aria-hidden="true" className={STATE_LAYER_CLASS} />
			<span className="relative flex items-center gap-2.5">
				<GoogleLogo />
				<span>
					{intent === "signup" ? m.google_signup() : m.google_signin()}
				</span>
			</span>
		</button>
	);
}
