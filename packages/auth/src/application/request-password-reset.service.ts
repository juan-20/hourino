import type { AuthRepository } from "../domain/ports/auth-repository";

export class RequestPasswordResetService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(input: { email: string; redirectTo: string }): Promise<void> {
		return this.authRepository.requestPasswordReset(input);
	}
}
