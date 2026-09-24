import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
} from "@/lib/auth/jwt";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  login_id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  password_hash: string | null;
  is_passkey_enabled: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      loginId?: string;
      password?: string;
    };
    const loginId = body.loginId?.trim();
    const password = body.password ?? "";

    if (!loginId || !password) {
      return NextResponse.json(
        { error: "ログインIDとパスワードが必要です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, login_id, email, display_name, role, password_hash, is_passkey_enabled FROM users WHERE login_id = ? LIMIT 1",
      [loginId],
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: "無効な認証情報です。" },
        { status: 401 },
      );
    }

    const user = users[0];

    if (Boolean(user.is_passkey_enabled)) {
      return NextResponse.json(
        { error: "このアカウントではパスキー認証が必要です。" },
        { status: 403 },
      );
    }

    if (!user.password_hash) {
      return NextResponse.json(
        { error: "このアカウントではパスワードが設定されていません。" },
        { status: 401 },
      );
    }

    const verified = await bcrypt.compare(password, user.password_hash);
    if (!verified) {
      return NextResponse.json(
        { error: "無効な認証情報です。" },
        { status: 401 },
      );
    }

    const token = await signAuthToken({
      sub: String(user.id),
      loginId: user.login_id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    });

    const response = NextResponse.json({
      authenticated: true,
      method: "password",
      user: {
        id: user.id,
        loginId: user.login_id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
    return response;
  } catch (error) {
    console.error("パスワード認証失敗", error);
    return NextResponse.json(
      { error: "パスワード認証に失敗しました。" },
      { status: 500 },
    );
  }
}
