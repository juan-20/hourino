import type { AuthRepository } from "../domain/ports/auth-repository";

export class ResetPasswordService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(input: { token: string; newPassword: string }): Promise<void> {
		return this.authRepository.resetPassword(input);
	}
}
