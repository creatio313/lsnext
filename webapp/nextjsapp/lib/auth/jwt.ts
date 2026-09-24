import { SignJWT, jwtVerify } from "jose";
import {
  AUTH_COOKIE_NAME,
  getJwtSecret,
  isSecureCookie,
} from "@/lib/auth/config";

const encoder = new TextEncoder();

export type AuthTokenPayload = {
  sub: string;
  loginId: string;
  email: string;
  role: "admin" | "user";
  displayName: string;
};

export async function signAuthToken(
  payload: AuthTokenPayload,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(encoder.encode(getJwtSecret()));
}

export async function verifyAuthToken(
  token: string,
): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(getJwtSecret()));
  const loginId = String(payload.loginId);

  return {
    sub: String(payload.sub),
    loginId,
    email: typeof payload.email === "string" ? payload.email : "",
    role: payload.role === "admin" ? "admin" : "user",
    displayName: String(payload.displayName),
  };
}

export const authCookieOptions = {
  httpOnly: true,
  secure: isSecureCookie(),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24,
};

export { AUTH_COOKIE_NAME };
