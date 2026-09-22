export interface EmailSender {
	sendPasswordReset: (input: {
		to: string;
		resetUrl: string;
		userName: string;
	}) => Promise<void>;
}
