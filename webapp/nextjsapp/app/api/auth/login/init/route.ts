import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  buildAuthenticationOptions,
  encodeChallengeCookie,
  webAuthnChallengeCookieOptions,
} from "@/lib/auth/webauthn";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  login_id: string;
  display_name: string;
  role: "admin" | "user";
  is_passkey_enabled: number;
};

type PasskeyRow = RowDataPacket & {
  credential_id: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { loginId?: string };
    const loginId = body.loginId?.trim();

    if (!loginId) {
      return NextResponse.json(
        { error: "ログインIDは必須項目です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, login_id, display_name, role, is_passkey_enabled FROM users WHERE login_id = ? LIMIT 1",
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
      return NextResponse.json({
        nextStep: "password",
        loginId: user.login_id,
      });
    }

    const [passkeys] = await pool.execute<PasskeyRow[]>(
      "SELECT credential_id FROM passkeys WHERE user_id = ?",
      [user.id],
    );

    if (passkeys.length === 0) {
      return NextResponse.json(
        { error: "このアカウントにはパスキーが登録されていません。" },
        { status: 400 },
      );
    }

    const options = await buildAuthenticationOptions(
      passkeys.map((row) => row.credential_id),
    );

    const response = NextResponse.json({
      nextStep: "passkey",
      loginId: user.login_id,
      options,
    });

    response.cookies.set(
      WEBAUTHN_CHALLENGE_COOKIE_NAME,
      encodeChallengeCookie({
        challenge: options.challenge,
        loginId: user.login_id,
        userId: user.id,
      }),
      webAuthnChallengeCookieOptions,
    );

    return response;
  } catch (error) {
    console.error("ログイン初期化失敗", error);
    return NextResponse.json(
      { error: "ログイン初期化に失敗しました。" },
      { status: 500 },
    );
  }
}
