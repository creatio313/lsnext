import type { ResultSetHeader } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
} from "@/lib/auth/jwt";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const body = (await request.json()) as {
      displayName?: string;
      email?: string;
    };
    const displayName = body.displayName?.trim() ?? "";
    const email = body.email?.trim() ?? "";

    if (!displayName) {
      return NextResponse.json(
        { error: "表示名は必須です。" },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "メールアドレスは必須です。" },
        { status: 400 },
      );
    }

    if (displayName.length > 255) {
      return NextResponse.json(
        { error: "表示名は255文字以内で入力してください。" },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "メールアドレスの形式が正しくありません。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    await pool.execute<ResultSetHeader>(
      "UPDATE users SET display_name = ?, email = ? WHERE id = ?",
      [displayName, email, session.userId],
    );

    const token = await signAuthToken({
      sub: String(session.userId),
      loginId: session.loginId,
      email,
      role: session.role,
      displayName,
    });

    const response = NextResponse.json({
      updated: true,
      user: {
        id: session.userId,
        loginId: session.loginId,
        email,
        role: session.role,
        displayName,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
    return response;
  } catch (error) {
    const mysqlError = error as { code?: string };
    if (mysqlError.code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        {
          error:
            "メールアドレスが既に登録されています。別の値を指定してください。",
        },
        { status: 409 },
      );
    }

    console.error("表示名更新失敗", error);
    return NextResponse.json(
      { error: "プロフィールの更新に失敗しました。" },
      { status: 500 },
    );
  }
}
