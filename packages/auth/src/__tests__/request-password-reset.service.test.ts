import { describe, expect, it } from "vitest";

import { RequestPasswordResetService } from "../application/request-password-reset.service";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";
import { FakeEmailSender } from "./fakes/fake-email-sender";

const REDIRECT_TO = "http://localhost:3001/reset-password";

describe("RequestPasswordResetService", () => {
	it("issues a reset token for a known email", async () => {
		const repository = new FakeAuthRepository();
		const service = new RequestPasswordResetService(repository);
		await repository.signUp(
			{ email: "ada@example.com", name: "Ada", password: "correct-horse" },
			new Headers()
		);

		await service.execute({
			email: "ada@example.com",
			redirectTo: REDIRECT_TO,
		});

		expect(repository.lastResetToken()).toBeTypeOf("string");
	});

	it("resolves without issuing a token for an unknown email (no enumeration)", async () => {
		const repository = new FakeAuthRepository();
		const service = new RequestPasswordResetService(repository);

		await expect(
			service.execute({ email: "nobody@example.com", redirectTo: REDIRECT_TO })
		).resolves.toBeUndefined();
		expect(repository.lastResetToken()).toBeUndefined();
	});

	it("records the outgoing email when an EmailSender is wired up", async () => {
		const emailSender = new FakeEmailSender();

		await emailSender.sendPasswordReset({
			resetUrl: `${REDIRECT_TO}?token=abc`,
			to: "ada@example.com",
			userName: "Ada",
		});

		expect(emailSender.sentPasswordResets).toHaveLength(1);
		expect(emailSender.lastPasswordReset).toMatchObject({
			to: "ada@example.com",
			userName: "Ada",
		});
	});
});
