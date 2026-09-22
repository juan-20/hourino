import { describe, expect, it } from "vitest";

import { LoginService } from "../application/login.service";
import { ResetPasswordService } from "../application/reset-password.service";
import { InvalidOrExpiredResetTokenError } from "../domain/errors";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";

const EMAIL = "ada@example.com";
const OLD_PASSWORD = "correct-horse";
const NEW_PASSWORD = "battery-staple";

async function setup() {
	const repository = new FakeAuthRepository();
	await repository.signUp(
		{ email: EMAIL, name: "Ada", password: OLD_PASSWORD },
		new Headers()
	);
	await repository.requestPasswordReset({
		email: EMAIL,
		redirectTo: "http://localhost:3001/reset-password",
	});

	return { repository, service: new ResetPasswordService(repository) };
}

describe("ResetPasswordService", () => {
	it("changes the password for a valid token", async () => {
		const { repository, service } = await setup();
		const token = repository.lastResetToken() ?? "";

		await service.execute({ newPassword: NEW_PASSWORD, token });

		const login = new LoginService(repository);
		await expect(
			login.execute({ email: EMAIL, password: NEW_PASSWORD }, new Headers())
		).resolves.toMatchObject({ user: { email: EMAIL } });
	});

	it("propagates InvalidOrExpiredResetTokenError for an unknown token", async () => {
		const { service } = await setup();

		const rejection = service.execute({
			newPassword: NEW_PASSWORD,
			token: "not-a-real-token",
		});

		await expect(rejection).rejects.toBeInstanceOf(
			InvalidOrExpiredResetTokenError
		);
		await expect(rejection).rejects.toMatchObject({
			code: "INVALID_RESET_TOKEN",
		});
	});

	it("invalidates the token after a successful reset", async () => {
		const { repository, service } = await setup();
		const token = repository.lastResetToken() ?? "";
		await service.execute({ newPassword: NEW_PASSWORD, token });

		await expect(
			service.execute({ newPassword: "another-password", token })
		).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
	});
});
