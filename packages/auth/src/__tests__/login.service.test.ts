import { describe, expect, it } from "vitest";

import { LoginService } from "../application/login.service";
import { InvalidCredentialsError } from "../domain/errors";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";

const CREDENTIALS = {
	email: "ada@example.com",
	name: "Ada Lovelace",
	password: "correct-horse",
};

async function setup() {
	const repository = new FakeAuthRepository();
	await repository.signUp(CREDENTIALS, new Headers());
	return { repository, service: new LoginService(repository) };
}

describe("LoginService", () => {
	it("returns the user, token and cookies for valid credentials", async () => {
		const { service } = await setup();

		const result = await service.execute(
			{ email: CREDENTIALS.email, password: CREDENTIALS.password },
			new Headers()
		);

		expect(result.user.email).toBe(CREDENTIALS.email);
		expect(result.token).toBeTypeOf("string");
		expect(result.cookies[0]).toContain("fake_session=");
	});

	it("propagates InvalidCredentialsError for a wrong password", async () => {
		const { service } = await setup();

		await expect(
			service.execute(
				{ email: CREDENTIALS.email, password: "wrong-password" },
				new Headers()
			)
		).rejects.toBeInstanceOf(InvalidCredentialsError);
	});

	it("propagates InvalidCredentialsError for an unknown email", async () => {
		const { service } = await setup();

		const rejection = service.execute(
			{ email: "nobody@example.com", password: CREDENTIALS.password },
			new Headers()
		);

		await expect(rejection).rejects.toBeInstanceOf(InvalidCredentialsError);
		await expect(rejection).rejects.toMatchObject({
			code: "INVALID_CREDENTIALS",
		});
	});
});
