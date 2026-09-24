import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import {
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  decodeChallengeCookie,
  webAuthnConfig,
} from "@/lib/auth/webauthn";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  login_id: string;
};

type ExistingPasskeyRow = RowDataPacket & {
  user_id: number;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const challengeCookie = request.cookies.get(
      WEBAUTHN_CHALLENGE_COOKIE_NAME,
    )?.value;

    if (!challengeCookie) {
      return NextResponse.json(
        { error: "登録チャレンジが見つかりません。" },
        { status: 400 },
      );
    }

    const challenge = decodeChallengeCookie(challengeCookie);
    if (!challenge || challenge.userId !== session.userId) {
      return NextResponse.json(
        { error: "無効な登録チャレンジです。" },
        { status: 400 },
      );
    }

    const passkeyName = challenge.passkeyName?.trim();
    if (!passkeyName) {
      return NextResponse.json(
        { error: "パスキー名称が不正です。" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { registrationResponse?: unknown };
    if (!body.registrationResponse) {
      return NextResponse.json(
        { error: "登録情報が必要です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();

    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, login_id FROM users WHERE id = ? LIMIT 1",
      [session.userId],
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: "利用者が見つかりません。" },
        { status: 404 },
      );
    }

    const user = users[0];

    const verification = await verifyRegistrationResponse({
      response: body.registrationResponse as Parameters<
        typeof verifyRegistrationResponse
      >[0]["response"],
      expectedChallenge: challenge.challenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.expectedRPID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "パスキー登録の検証に失敗しました。" },
        { status: 400 },
      );
    }

    const credentialId = verification.registrationInfo.credential.id;
    const publicKey = verification.registrationInfo.credential.publicKey;
    const counter = verification.registrationInfo.credential.counter;

    const [existingRows] = await pool.execute<ExistingPasskeyRow[]>(
      "SELECT user_id FROM passkeys WHERE credential_id = ? LIMIT 1",
      [credentialId],
    );

    if (existingRows.length > 0 && existingRows[0].user_id !== user.id) {
      return NextResponse.json(
        { error: "このパスキーは別の利用者に紐づいています。" },
        { status: 409 },
      );
    }

    await pool.execute<ResultSetHeader>(
      "INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, last_used_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE name = VALUES(name), public_key = VALUES(public_key), sign_count = VALUES(sign_count), last_used_at = CURRENT_TIMESTAMP",
      [
        user.id,
        passkeyName,
        credentialId,
        Buffer.from(publicKey).toString("base64url"),
        counter,
      ],
    );

    await pool.execute<ResultSetHeader>(
      "UPDATE users SET is_passkey_enabled = 1 WHERE id = ?",
      [user.id],
    );

    const response = NextResponse.json({ registered: true });
    response.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error("パスキー登録失敗", error);
    return NextResponse.json(
      { error: "パスキー登録に失敗しました。" },
      { status: 500 },
    );
  }
}
