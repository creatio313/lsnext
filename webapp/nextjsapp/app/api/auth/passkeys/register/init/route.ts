import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getWebAuthnRpId, getWebAuthnRpName } from "@/lib/auth/config";
import { getAuthSession } from "@/lib/auth/session";
import {
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  encodeChallengeCookie,
  webAuthnChallengeCookieOptions,
} from "@/lib/auth/webauthn";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  login_id: string;
  display_name: string;
};

type PasskeyRow = RowDataPacket & {
  credential_id: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const body = (await request.json()) as { passkeyName?: string };
    const passkeyName = body.passkeyName?.trim();

    if (!passkeyName) {
      return NextResponse.json(
        { error: "パスキー名称は必須です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();

    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, login_id, display_name FROM users WHERE id = ? LIMIT 1",
      [session.userId],
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: "利用者が見つかりません。" },
        { status: 404 },
      );
    }

    const user = users[0];

    const [passkeys] = await pool.execute<PasskeyRow[]>(
      "SELECT credential_id FROM passkeys WHERE user_id = ?",
      [user.id],
    );

    const userIdBytes = new TextEncoder().encode(String(user.id));

    const options = await generateRegistrationOptions({
      rpID: getWebAuthnRpId(),
      rpName: getWebAuthnRpName(),
      userID: userIdBytes,
      userName: user.login_id,
      userDisplayName: user.display_name,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: passkeys.map((row) => ({
        id: row.credential_id,
        type: "public-key",
      })),
    });

    const response = NextResponse.json({ options });

    response.cookies.set(
      WEBAUTHN_CHALLENGE_COOKIE_NAME,
      encodeChallengeCookie({
        challenge: options.challenge,
        loginId: user.login_id,
        userId: user.id,
        passkeyName,
      }),
      webAuthnChallengeCookieOptions,
    );

    return response;
  } catch (error) {
    console.error("パスキー登録初期化失敗", error);
    return NextResponse.json(
      { error: "パスキー登録の初期化に失敗しました。" },
      { status: 500 },
    );
  }
}
