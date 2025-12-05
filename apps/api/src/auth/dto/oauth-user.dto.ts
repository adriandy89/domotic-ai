export interface OAuthUserDto {
    provider: 'google' | 'microsoft' | 'github';
    providerId: string;
    email: string;
    firstName: string;
    lastName: string;
    picture?: string;
}
