import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth/config";

const encoder = new TextEncoder();

export type SoraConnectionRole = "sendonly" | "recvonly" | "sendrecv";

export type SoraConnectionTokenPayload = {
  tokenUse: "sora";
  userId: number;
  loginId: string;
  displayName: string;
  channelId: number;
  imagefluxChannelId: string;
  soraRole: SoraConnectionRole;
};

export async function signSoraConnectionToken(
  payload: SoraConnectionTokenPayload,
) {
  return new SignJWT({
    tokenUse: payload.tokenUse,
    userId: payload.userId,
    loginId: payload.loginId,
    displayName: payload.displayName,
    channelId: payload.channelId,
    imagefluxChannelId: payload.imagefluxChannelId,
    soraRole: payload.soraRole,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(encoder.encode(getJwtSecret()));
}

/***
 * JWTの値と有効性を調べ、安全な形にして返却する。
 */
export async function verifySoraConnectionToken(
  token: string,
): Promise<SoraConnectionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(getJwtSecret()));
    const soraRole = payload.soraRole;

    // 値検証
    if (
      payload.tokenUse !== "sora" ||
      typeof payload.loginId !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.imagefluxChannelId !== "string" ||
      (soraRole !== "sendonly" && soraRole !== "recvonly" && soraRole !== "sendrecv")
    ) {
      return null;
    }

    const userId = Number(payload.userId);
    const channelId = Number(payload.channelId);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(channelId) || channelId <= 0) {
      return null;
    }

    return {
      tokenUse: "sora",
      userId,
      loginId: payload.loginId,
      displayName: payload.displayName,
      channelId,
      imagefluxChannelId: payload.imagefluxChannelId,
      soraRole,
    };
  } catch {
    return null;
  }
}
