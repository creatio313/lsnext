export const AUTH_COOKIE_NAME = "imlapp_auth";
export const WEBAUTHN_CHALLENGE_COOKIE_NAME = "imlapp_webauthn_challenge";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRETが設定されていません。");
  }

  return secret;
}

export function getWebAuthnRpId(): string {
  return (
    process.env.WEBAUTHN_RP_ID ??
    "localhost"
  );
}

export function getWebAuthnOrigin(): string {
  return (
    process.env.WEBAUTHN_ORIGIN ??
    "http://localhost:3000"
  );
}

export function getWebAuthnRpName(): string {
  return (
    process.env.WEBAUTHN_RP_NAME ?? "ImageFlux Live Streaming Webapp on sacloud"
  );
}

export function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}
