import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type UserOptionRow = RowDataPacket & {
  id: number;
  login_id: string;
  display_name: string;
  email: string;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const pool = getDbPool();
    const [users] = await pool.execute<UserOptionRow[]>(
      "SELECT id, login_id, display_name, email FROM users WHERE id <> ? ORDER BY display_name ASC, login_id ASC",
      [session.userId],
    );

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        loginId: user.login_id,
        displayName: user.display_name,
        email: user.email,
      })),
    });
  } catch (error) {
    console.error("利用者候補一覧取得失敗", error);
    return NextResponse.json(
      { error: "利用者候補一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}