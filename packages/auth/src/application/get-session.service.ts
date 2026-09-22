import type { AuthRepository } from "../domain/ports/auth-repository";
import type { AuthSession, AuthUser } from "../domain/types";

export class GetSessionService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(
		headers: Headers
	): Promise<{ user: AuthUser; session: AuthSession } | null> {
		return this.authRepository.getSession(headers);
	}
}
