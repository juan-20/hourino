import type { EmailSender } from "@hourino/auth/domain/ports/email-sender";

export interface SentPasswordReset {
	resetUrl: string;
	to: string;
	userName: string;
}

export interface FakeEmailSender extends EmailSender {
	clear: () => void;
	lastResetToken: () => string | undefined;
	readonly sent: SentPasswordReset[];
}

/**
 * Captures password-reset mails instead of reaching Resend, and exposes the
 * reset token so `resetPassword` can be driven with a genuine,
 * Better-Auth-issued one.
 *
 * Verified shape of the URL Better Auth 1.7.5 passes to `sendResetPassword`:
 *
 *   http://localhost:3000/api/auth/reset-password/<token>?callbackURL=<redirectTo>
 *
 * i.e. the token is the LAST PATH SEGMENT, not a `?token=` query param. (The
 * browser only sees `?token=` because that server route redirects to
 * `callbackURL` with the token appended.)
 */
export function createFakeEmailSender(): FakeEmailSender {
	const sent: SentPasswordReset[] = [];

	return {
		clear() {
			sent.length = 0;
		},
		lastResetToken() {
			const last = sent.at(-1);
			if (!last) {
				return;
			}

			const url = new URL(last.resetUrl);
			return (
				url.searchParams.get("token") ??
				url.pathname.split("/").filter(Boolean).at(-1)
			);
		},
		sendPasswordReset(input) {
			sent.push(input);
			return Promise.resolve();
		},
		sent,
	};
}
