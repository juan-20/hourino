import type { AuthRepository } from "../domain/ports/auth-repository";

export class LogoutService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(headers: Headers): Promise<{ cookies: string[] }> {
		return this.authRepository.signOut(headers);
	}
}
