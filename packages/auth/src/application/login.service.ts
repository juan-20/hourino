import type {
	AuthMutationResult,
	AuthRepository,
	SignInInput,
} from "../domain/ports/auth-repository";

export class LoginService {
	private readonly authRepository: AuthRepository;

	constructor(authRepository: AuthRepository) {
		this.authRepository = authRepository;
	}

	execute(input: SignInInput, headers: Headers): Promise<AuthMutationResult> {
		return this.authRepository.signIn(input, headers);
	}
}
