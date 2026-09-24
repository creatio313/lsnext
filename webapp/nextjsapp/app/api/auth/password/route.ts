import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  password_hash: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword?.trim() ?? "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "現在のパスワードと新しいパスワードが必要です。" },
        { status: 400 },
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        {
          error: "新しいパスワードは現在のパスワードと異なる値にしてください。",
        },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [users] = await pool.execute<UserRow[]>(
      "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
      [session.userId],
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: "利用者が見つかりません。" },
        { status: 404 },
      );
    }

    const user = users[0];

    if (!user.password_hash) {
      return NextResponse.json(
        { error: "このアカウントにはパスワードが設定されていません。" },
        { status: 400 },
      );
    }

    const verified = await bcrypt.compare(currentPassword, user.password_hash);
    if (!verified) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません。" },
        { status: 401 },
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await pool.execute<ResultSetHeader>(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [newPasswordHash, user.id],
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("パスワード変更失敗", error);
    return NextResponse.json(
      { error: "パスワード変更に失敗しました。" },
      { status: 500 },
    );
  }
}
