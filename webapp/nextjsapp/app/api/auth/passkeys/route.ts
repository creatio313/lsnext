import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type PasskeyRow = RowDataPacket & {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const pool = getDbPool();
    const [rows] = await pool.execute<PasskeyRow[]>(
      "SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC",
      [session.userId],
    );

    const passkeys = rows.map((row) => ({
      passkeyId: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));

    return NextResponse.json({ passkeys });
  } catch (error) {
    console.error("パスキー一覧取得失敗", error);
    return NextResponse.json(
      { error: "パスキー一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}
