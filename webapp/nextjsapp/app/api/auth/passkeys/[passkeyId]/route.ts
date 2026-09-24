import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type CountRow = RowDataPacket & {
  total: number;
};

async function parsePasskeyId(paramsPromise: Promise<{ passkeyId: string }>) {
  const params = await paramsPromise;
  const passkeyId = Number.parseInt(params.passkeyId, 10);
  if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
    return null;
  }

  return passkeyId;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ passkeyId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const passkeyId = await parsePasskeyId(context.params);
    if (!passkeyId) {
      return NextResponse.json(
        { error: "不正なパスキーIDです。" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "パスキー名称は必須です。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [updateResult] = await pool.execute<ResultSetHeader>(
      "UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?",
      [name, passkeyId, session.userId],
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json(
        { error: "更新対象のパスキーが見つかりません。" },
        { status: 404 },
      );
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("パスキー名称更新失敗", error);
    return NextResponse.json(
      { error: "パスキー名称の更新に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ passkeyId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const passkeyId = await parsePasskeyId(context.params);
    if (!passkeyId) {
      return NextResponse.json(
        { error: "不正なパスキーIDです。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();

    const [deleteResult] = await pool.execute<ResultSetHeader>(
      "DELETE FROM passkeys WHERE id = ? AND user_id = ?",
      [passkeyId, session.userId],
    );

    if (deleteResult.affectedRows === 0) {
      return NextResponse.json(
        { error: "削除対象のパスキーが見つかりません。" },
        { status: 404 },
      );
    }

    const [countRows] = await pool.execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM passkeys WHERE user_id = ?",
      [session.userId],
    );

    const passkeyCount = countRows[0]?.total ?? 0;

    if (passkeyCount === 0) {
      await pool.execute<ResultSetHeader>(
        "UPDATE users SET is_passkey_enabled = 0 WHERE id = ?",
        [session.userId],
      );
    }

    return NextResponse.json({
      deleted: true,
      passkeyCount,
      fallbackToPassword: passkeyCount === 0,
    });
  } catch (error) {
    console.error("パスキー削除失敗", error);
    return NextResponse.json(
      { error: "パスキー削除に失敗しました。" },
      { status: 500 },
    );
  }
}
