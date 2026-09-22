import { describe, expect, it } from "vitest";

import { GetSessionService } from "../application/get-session.service";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";

describe("GetSessionService", () => {
	it("returns null when the request carries no session cookie", async () => {
		const service = new GetSessionService(new FakeAuthRepository());

		expect(await service.execute(new Headers())).toBeNull();
	});

	it("returns null for an unknown session token", async () => {
		const service = new GetSessionService(new FakeAuthRepository());

		expect(
			await service.execute(FakeAuthRepository.headersWithSession("nope"))
		).toBeNull();
	});

	it("returns the user and session for a valid session cookie", async () => {
		const repository = new FakeAuthRepository();
		const service = new GetSessionService(repository);
		const { token } = await repository.signUp(
			{
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "correct-horse",
			},
			new Headers()
		);

		const result = await service.execute(
			FakeAuthRepository.headersWithSession(token ?? "")
		);

		expect(result?.user).toMatchObject({
			email: "ada@example.com",
			name: "Ada Lovelace",
		});
		expect(result?.session.id).toBeTypeOf("string");
		expect(result?.session.expiresAt).toBeInstanceOf(Date);
	});
});
