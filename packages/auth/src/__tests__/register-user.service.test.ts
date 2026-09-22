import { describe, expect, it } from "vitest";

import { RegisterUserService } from "../application/register-user.service";
import { EmailAlreadyExistsError, WeakPasswordError } from "../domain/errors";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";

function setup() {
	const repository = new FakeAuthRepository();
	return { repository, service: new RegisterUserService(repository) };
}

describe("RegisterUserService", () => {
	it("delegates to the repository and returns the created user with cookies", async () => {
		const { service } = setup();

		const result = await service.execute(
			{
				email: "Ada@example.com",
				name: "Ada Lovelace",
				password: "correct-horse",
			},
			new Headers()
		);

		expect(result.user).toMatchObject({
			email: "ada@example.com",
			emailVerified: false,
			image: null,
			name: "Ada Lovelace",
		});
		expect(result.token).toBeTypeOf("string");
		expect(result.cookies).toHaveLength(1);
		expect(result.cookies[0]).toContain("fake_session=");
	});

	it("propagates EmailAlreadyExistsError for a duplicate email", async () => {
		const { service } = setup();
		const input = {
			email: "ada@example.com",
			name: "Ada",
			password: "correct-horse",
		};
		await service.execute(input, new Headers());

		await expect(service.execute(input, new Headers())).rejects.toBeInstanceOf(
			EmailAlreadyExistsError
		);
	});

	it("propagates WeakPasswordError for a too-short password", async () => {
		const { service } = setup();

		const rejection = service.execute(
			{ email: "grace@example.com", name: "Grace", password: "short" },
			new Headers()
		);

		await expect(rejection).rejects.toBeInstanceOf(WeakPasswordError);
		await expect(rejection).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
	});

	it("registers the user in the repository so a session can be read back", async () => {
		const { repository, service } = setup();

		const { token } = await service.execute(
			{ email: "ada@example.com", name: "Ada", password: "correct-horse" },
			new Headers()
		);

		const session = await repository.getSession(
			FakeAuthRepository.headersWithSession(token ?? "")
		);
		expect(session?.user.email).toBe("ada@example.com");
	});
});
