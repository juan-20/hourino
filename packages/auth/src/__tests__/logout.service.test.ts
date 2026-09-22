import { describe, expect, it } from "vitest";

import { LogoutService } from "../application/logout.service";
import { FakeAuthRepository } from "./fakes/fake-auth-repository";

describe("LogoutService", () => {
	it("clears the session so it can no longer be resolved", async () => {
		const repository = new FakeAuthRepository();
		const service = new LogoutService(repository);
		const { token } = await repository.signUp(
			{ email: "ada@example.com", name: "Ada", password: "correct-horse" },
			new Headers()
		);
		const headers = FakeAuthRepository.headersWithSession(token ?? "");

		expect(await repository.getSession(headers)).not.toBeNull();

		const result = await service.execute(headers);

		expect(result.cookies[0]).toContain("Max-Age=0");
		expect(await repository.getSession(headers)).toBeNull();
	});

	it("is a no-op that still returns clearing cookies when unauthenticated", async () => {
		const repository = new FakeAuthRepository();
		const service = new LogoutService(repository);

		const result = await service.execute(new Headers());

		expect(result.cookies).toHaveLength(1);
	});
});
