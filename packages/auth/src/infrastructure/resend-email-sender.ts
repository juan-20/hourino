import { Resend } from "resend";

import type { EmailSender } from "../domain/ports/email-sender";

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/**
 * `userName`/`resetUrl` are interpolated into an HTML email body — both must
 * be escaped, since `userName` comes straight from the user-supplied sign-up
 * `name` field with no character restrictions.
 */
function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function createResendEmailSender(config: {
	apiKey: string;
	fromEmail: string;
}): EmailSender {
	const resend = new Resend(config.apiKey);

	return {
		async sendPasswordReset({ to, resetUrl, userName }) {
			const safeName = escapeHtml(userName);
			const safeUrl = escapeHtml(resetUrl);
			const { error } = await resend.emails.send({
				from: config.fromEmail,
				html: `<p>Hi ${safeName},</p><p>Click the link below to reset your password:</p><p><a href="${safeUrl}">${safeUrl}</a></p>`,
				subject: "Reset your Hourino password",
				to,
			});

			if (error) {
				throw new Error(`Failed to send reset email: ${error.message}`);
			}
		},
	};
}
