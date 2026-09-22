import type { Database } from "@hourino/db";

import { GetSessionService } from "./application/get-session.service";
import { LoginService } from "./application/login.service";
import { LogoutService } from "./application/logout.service";
import { RegisterUserService } from "./application/register-user.service";
import { RequestPasswordResetService } from "./application/request-password-reset.service";
import { ResetPasswordService } from "./application/reset-password.service";
import type { EmailSender } from "./domain/ports/email-sender";
import { type AuthConfig, createAuth } from "./index";
import { BetterAuthRepository } from "./infrastructure/better-auth-repository";
import { createResendEmailSender } from "./infrastructure/resend-email-sender";

export interface AuthServices {
	getSession: GetSessionService;
	login: LoginService;
	logout: LogoutService;
	registerUser: RegisterUserService;
	requestPasswordReset: RequestPasswordResetService;
	resetPassword: ResetPasswordService;
}

/**
 * Composition root for the auth package: wires the Better Auth instance,
 * the repository adapter and the application services together.
 *
 * This file (and `index.ts`) are the only places allowed to import from both
 * `domain/`/`application/` and `infrastructure/` — see `.dependency-cruiser.cjs`.
 */
export interface AuthServicesDeps {
	/**
	 * Overrides the real Resend-backed sender. Tests pass a fake here so the
	 * password-reset flows never reach Resend's API (and so constructing the
	 * services never needs a real API key).
	 */
	emailSender?: EmailSender;
}

export function createAuthServices(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
	deps: AuthServicesDeps = {}
) {
	const emailSender =
		deps.emailSender ??
		createResendEmailSender({
			apiKey: env.RESEND_API_KEY,
			fromEmail: env.RESEND_FROM_EMAIL,
		});
	const auth = createAuth(env, database, desktopOrigins, { emailSender });
	const authRepository = new BetterAuthRepository(auth);

	const services: AuthServices = {
		getSession: new GetSessionService(authRepository),
		login: new LoginService(authRepository),
		logout: new LogoutService(authRepository),
		registerUser: new RegisterUserService(authRepository),
		requestPasswordReset: new RequestPasswordResetService(authRepository),
		resetPassword: new ResetPasswordService(authRepository),
	};

	return { auth, services };
}
