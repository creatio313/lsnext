import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type ChannelOwnerRow = RowDataPacket & {
  owner_id: number;
};

type UserRow = RowDataPacket & {
  id: number;
};

type TransferChannelRequest = {
  newOwnerId?: unknown;
};

function parsePositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channelId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) return NextResponse.json({ error: "未認証です。" }, { status: 401 });

    const { channelId: channelIdText } = await context.params;
    const channelId = parsePositiveInteger(channelIdText);
    if (!channelId) return NextResponse.json({ error: "不正な配信IDです。" }, { status: 400 });

    const body = await request.json() as TransferChannelRequest;
    const newOwnerId = parsePositiveInteger(body.newOwnerId);
    if (!newOwnerId) return NextResponse.json({ error: "新しい所有者を指定してください。" }, { status: 400 });
    if (newOwnerId === session.userId) return NextResponse.json({ error: "現在の所有者には譲渡できません。" }, { status: 400 });

    const pool = getDbPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [channels] = await connection.execute<ChannelOwnerRow[]>(
        "SELECT owner_id FROM channels WHERE id = ? FOR UPDATE",
        [channelId],
      );
      const channel = channels[0];
      if (!channel || channel.owner_id !== session.userId) {
        await connection.rollback();
        return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
      }

      const [users] = await connection.execute<UserRow[]>(
        "SELECT id FROM users WHERE id = ? LIMIT 1",
        [newOwnerId],
      );
      if (!users[0]) {
        await connection.rollback();
        return NextResponse.json({ error: "新しい所有者が見つかりません。" }, { status: 400 });
      }

      await connection.execute(
        "DELETE FROM channel_allowed_users WHERE channel_id = ? AND user_id = ?",
        [channelId, newOwnerId],
      );
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE channels SET owner_id = ? WHERE id = ? AND owner_id = ?",
        [newOwnerId, channelId, session.userId],
      );
      if (result.affectedRows !== 1) throw new Error("チャンネル所有者を更新できませんでした。");

      await connection.commit();
      return NextResponse.json({ transferred: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("チャンネル所有権譲渡失敗", error);
    return NextResponse.json({ error: "チャンネル所有権の譲渡に失敗しました。" }, { status: 500 });
  }
}