import type {
	AuthMutationResult,
	AuthRepository,
	SignUpInput,
} from "../domain/ports/auth-repository";

export class RegisterUserService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(input: SignUpInput, headers: Headers): Promise<AuthMutationResult> {
		return this.authRepository.signUp(input, headers);
	}
}
