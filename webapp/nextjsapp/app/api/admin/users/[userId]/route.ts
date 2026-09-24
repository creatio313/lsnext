import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";
import { enqueueArchiveCleanup } from "@/lib/archive-cleanup";

export const runtime = "nodejs";

type UserRole = "admin" | "user";

type UserRoleRow = RowDataPacket & {
  login_id: string;
  display_name: string;
  email: string;
  role: UserRole;
};

type CountRow = RowDataPacket & {
  total: number;
};

type ChannelRow = RowDataPacket & {
  id: number;
  imageflux_channel_id: string | null;
  is_live_end: number;
  archive_destination_id: string | null;
};

type RecordingFilePathRow = RowDataPacket & {
  channel_id: number;
  file_path: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function parseUserId(paramsPromise: Promise<{ userId: string }>) {
  const params = await paramsPromise;
  const userId = Number.parseInt(params.userId, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "管理者のみロール変更できます。" },
        { status: 403 },
      );
    }

    const userId = await parseUserId(context.params);
    if (!userId) {
      return NextResponse.json(
        { error: "不正な利用者IDです。" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      loginId?: string;
      displayName?: string;
      email?: string;
      role?: UserRole;
    };

    const pool = getDbPool();
    const [targetRows] = await pool.execute<UserRoleRow[]>(
      "SELECT login_id, display_name, email, role FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "対象の利用者が見つかりません。" },
        { status: 404 },
      );
    }

    const currentUser = targetRows[0];
    const loginId = body.loginId?.trim() ?? currentUser.login_id;
    const displayName = body.displayName?.trim() ?? currentUser.display_name;
    const email = body.email?.trim() ?? currentUser.email;
    const nextRole = body.role ?? currentUser.role;

    if (!loginId || !displayName || !email) {
      return NextResponse.json(
        { error: "ログインID・表示名・メールアドレスは必須です。" },
        { status: 400 },
      );
    }

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(loginId)) {
      return NextResponse.json(
        {
          error: "ログインIDは3〜64文字の英数字と . _ - のみ使用できます。",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "メールアドレスの形式が正しくありません。" },
        { status: 400 },
      );
    }

    if (nextRole !== "admin" && nextRole !== "user") {
      return NextResponse.json(
        { error: "ロールは admin または user を指定してください。" },
        { status: 400 },
      );
    }

    const currentRole = currentUser.role;
    if (session.userId === userId && nextRole !== "admin") {
      return NextResponse.json(
        { error: "自分自身の管理者権限は解除できません。" },
        { status: 400 },
      );
    }

    if (currentRole === "admin" && nextRole === "user") {
      const [adminRows] = await pool.execute<CountRow[]>(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'",
      );
      const adminCount = adminRows[0]?.total ?? 0;

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "最後の管理者のロールは変更できません。" },
          { status: 400 },
        );
      }
    }

    try {
      await pool.execute<ResultSetHeader>(
        "UPDATE users SET login_id = ?, display_name = ?, email = ?, role = ? WHERE id = ?",
        [loginId, displayName, email, nextRole, userId],
      );
    } catch (error) {
      const mysqlError = error as { code?: string };
      if (mysqlError.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          {
            error:
              "ログインIDまたはメールアドレスが既に登録されています。別の値を指定してください。",
          },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      updated: true,
      user: { id: userId, loginId, displayName, email, role: nextRole },
    });
  } catch (error) {
    console.error("利用者ロール変更失敗", error);
    return NextResponse.json(
      { error: "利用者ロールの変更に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "管理者のみ利用者を削除できます。" },
        { status: 403 },
      );
    }

    const userId = await parseUserId(context.params);
    if (!userId) {
      return NextResponse.json(
        { error: "不正な利用者IDです。" },
        { status: 400 },
      );
    }

    if (session.userId === userId) {
      return NextResponse.json(
        { error: "自分自身は削除できません。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [targetRows] = await pool.execute<UserRoleRow[]>(
      "SELECT role FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "対象の利用者が見つかりません。" },
        { status: 404 },
      );
    }

    if (targetRows[0].role === "admin") {
      const [adminRows] = await pool.execute<CountRow[]>(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'",
      );
      const adminCount = adminRows[0]?.total ?? 0;

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "最後の管理者は削除できません。" },
          { status: 400 },
        );
      }
    }

    const [ownedChannels] = await pool.execute<ChannelRow[]>(
      "SELECT id, imageflux_channel_id, is_live_end, archive_destination_id FROM channels WHERE owner_id = ?",
      [userId],
    );

    const [recordings] = await pool.execute<RecordingFilePathRow[]>(
      `SELECT r.channel_id, r.file_path
       FROM recordings r
       INNER JOIN channels c ON c.id = r.channel_id
       WHERE c.owner_id = ? AND r.file_path <> ''`,
      [userId],
    );
    const filePathsByChannelId = new Map<number, string[]>();
    for (const recording of recordings) {
      const filePaths = filePathsByChannelId.get(recording.channel_id) ?? [];
      filePaths.push(recording.file_path);
      filePathsByChannelId.set(recording.channel_id, filePaths);
    }

    for (const channel of ownedChannels) {
      if (channel.imageflux_channel_id && !channel.is_live_end) {
        await callImageFluxLiveStreaming(
          "ImageFlux_20180501.DeleteChannel",
          { channel_id: channel.imageflux_channel_id },
        );
      }

      const filePaths = filePathsByChannelId.get(channel.id) ?? [];
      await enqueueArchiveCleanup({
        channelId: channel.id,
        archiveDestinationId: channel.archive_destination_id,
        filePaths,
      });
    }

    const connection = await pool.getConnection();
    let result: ResultSetHeader;

    try {
      await connection.beginTransaction();

      await connection.execute(
        "DELETE FROM channel_allowed_users WHERE user_id = ? OR channel_id IN (SELECT id FROM channels WHERE owner_id = ?)",
        [userId, userId],
      );

      await connection.execute(
        "DELETE FROM recordings WHERE channel_id IN (SELECT id FROM channels WHERE owner_id = ?)",
        [userId],
      );

      await connection.execute(
        "DELETE FROM channels WHERE owner_id = ?",
        [userId],
      );

      [result] = await connection.execute<ResultSetHeader>(
        "DELETE FROM users WHERE id = ?",
        [userId],
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: "対象の利用者が見つかりません。" },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("利用者削除失敗", error);
    return NextResponse.json(
      { error: "利用者の削除に失敗しました。" },
      { status: 500 },
    );
  }
}
