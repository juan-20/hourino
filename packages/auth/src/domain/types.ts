export interface AuthUser {
	email: string;
	emailVerified: boolean;
	id: string;
	image: string | null;
	name: string;
}

export interface AuthSession {
	expiresAt: Date;
	id: string;
}
