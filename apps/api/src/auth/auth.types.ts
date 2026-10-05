export interface AuthUser {
  id: number;
  organizationId: number;
  phone: string | null;
  email: string | null;
  name: string | null;
}

export interface JwtPayload {
  sub: number;
  organizationId: number;
  phone: string | null;
}

// Issued after a Google/Facebook ID token has been verified but no
// matching/linkable local account was found yet, so we still need a
// phone number (OTP-verified) before creating or linking the account.
// This is NOT an access token — it carries no `sub` and must never be
// accepted by JwtAuthGuard.
export interface OAuthTempTokenPayload {
  purpose: 'oauth_complete';
  provider: 'GOOGLE' | 'FACEBOOK';
  providerUserId: string;
  email: string | null;
  name: string | null;
}