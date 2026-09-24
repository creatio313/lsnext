import { generateAuthenticationOptions } from "@simplewebauthn/server";
import {
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  getWebAuthnOrigin,
  getWebAuthnRpId,
  isSecureCookie,
} from "@/lib/auth/config";

export type LoginChallengePayload = {
  challenge: string;
  loginId: string;
  userId: number;
  passkeyName?: string;
};

export async function buildAuthenticationOptions(credentialIds: string[]) {
  return generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    userVerification: "preferred",
    allowCredentials: credentialIds.map((id) => ({
      id,
      type: "public-key",
    })),
  });
}

export function encodeChallengeCookie(payload: LoginChallengePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeChallengeCookie(
  value: string,
): LoginChallengePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.challenge === "string" &&
      typeof parsed?.loginId === "string" &&
      typeof parsed?.userId === "number" &&
      (typeof parsed?.passkeyName === "undefined" ||
        typeof parsed?.passkeyName === "string")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function decodePublicKey(base64UrlKey: string): Uint8Array {
  return Buffer.from(base64UrlKey, "base64url");
}

export const webAuthnChallengeCookieOptions = {
  httpOnly: true,
  secure: isSecureCookie(),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 5,
};

export const webAuthnConfig = {
  expectedOrigin: getWebAuthnOrigin(),
  expectedRPID: getWebAuthnRpId(),
};

export { WEBAUTHN_CHALLENGE_COOKIE_NAME };
