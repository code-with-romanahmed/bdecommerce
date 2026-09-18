export interface AuthUser {
  id: number;
  organizationId: number;
  phone: string;
  email: string | null;
  name: string | null;
}

export interface JwtPayload {
  sub: number;
  organizationId: number;
  phone: string;
}
