import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
} from "@/lib/auth/jwt";
import { getDbPool } from "@/lib/db";
import {
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  decodeChallengeCookie,
  decodePublicKey,
  webAuthnConfig,
} from "@/lib/auth/webauthn";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  login_id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  is_passkey_enabled: number;
};

type PasskeyRow = RowDataPacket & {
  id: number;
  user_id: number;
  credential_id: string;
  public_key: string;
  sign_count: number;
};

type AuthenticationResponseLike = {
  id: string;
};

function isAuthenticationResponseLike(
  value: unknown,
): value is AuthenticationResponseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      loginId?: string;
      authenticationResponse?: unknown;
    };

    const loginId = body.loginId?.trim();
    const authenticationResponse = body.authenticationResponse;

    if (!loginId || !isAuthenticationResponseLike(authenticationResponse)) {
      return NextResponse.json(
        { error: "ログインIDと認証情報が必要です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();

    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, login_id, email, display_name, role, is_passkey_enabled FROM users WHERE login_id = ? LIMIT 1",
      [loginId],
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: "無効な認証情報です。" },
        { status: 401 },
      );
    }

    const user = users[0];

    if (!Boolean(user.is_passkey_enabled)) {
      return NextResponse.json(
        { error: "このアカウントではパスキー認証が無効です。" },
        { status: 403 },
      );
    }

    const challengeCookie = request.cookies.get(
      WEBAUTHN_CHALLENGE_COOKIE_NAME,
    )?.value;

    if (!challengeCookie) {
      return NextResponse.json(
        { error: "認証チャレンジが見つかりません。" },
        { status: 400 },
      );
    }

    const challenge = decodeChallengeCookie(challengeCookie);
    if (
      !challenge ||
      challenge.loginId !== user.login_id ||
      challenge.userId !== user.id
    ) {
      return NextResponse.json(
        { error: "無効な認証チャレンジです。" },
        { status: 400 },
      );
    }

    const [passkeys] = await pool.execute<PasskeyRow[]>(
      "SELECT id, user_id, credential_id, public_key, sign_count FROM passkeys WHERE user_id = ?",
      [user.id],
    );

    const matchedPasskey = passkeys.find(
      (pk) => pk.credential_id === authenticationResponse.id,
    );
    if (!matchedPasskey) {
      return NextResponse.json(
        { error: "不明なパスキー認証情報です。" },
        { status: 401 },
      );
    }

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse as Parameters<
        typeof verifyAuthenticationResponse
      >[0]["response"],
      expectedChallenge: challenge.challenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.expectedRPID,
      credential: {
        id: matchedPasskey.credential_id,
        publicKey: decodePublicKey(matchedPasskey.public_key) as Parameters<
          typeof verifyAuthenticationResponse
        >[0]["credential"]["publicKey"],
        counter: matchedPasskey.sign_count,
      },
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "パスキー認証に失敗しました。" },
        { status: 401 },
      );
    }

    await pool.execute(
      "UPDATE passkeys SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
      [verification.authenticationInfo.newCounter, matchedPasskey.id],
    );

    const token = await signAuthToken({
      sub: String(user.id),
      loginId: user.login_id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    });

    const response = NextResponse.json({
      authenticated: true,
      method: "passkey",
      user: {
        id: user.id,
        loginId: user.login_id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
    response.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE_NAME);

    return response;
  } catch (error) {
    console.error("パスキー認証失敗", error);
    return NextResponse.json(
      { error: "パスキー認証に失敗しました。" },
      { status: 500 },
    );
  }
}
