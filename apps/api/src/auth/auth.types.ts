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
  // যে লগইন-সেশনের জন্য টোকেনটা ইস্যু হয়েছে। সেশন মুছে গেলে (logout/refresh/
  // revoke) টোকেনও সঙ্গে সঙ্গে অচল হয়, মেয়াদ শেষের অপেক্ষা করতে হয় না।
  sid: string;
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