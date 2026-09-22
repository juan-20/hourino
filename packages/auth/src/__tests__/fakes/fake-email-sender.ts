import type { EmailSender } from "../../domain/ports/email-sender";

export interface SentPasswordResetEmail {
	resetUrl: string;
	to: string;
	userName: string;
}

export class FakeEmailSender implements EmailSender {
	readonly sentPasswordResets: SentPasswordResetEmail[] = [];

	sendPasswordReset(input: SentPasswordResetEmail): Promise<void> {
		this.sentPasswordResets.push(input);
		return Promise.resolve();
	}

	get lastPasswordReset(): SentPasswordResetEmail | undefined {
		return this.sentPasswordResets.at(-1);
	}
}
