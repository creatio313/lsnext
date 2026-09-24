import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

type ChannelRow = RowDataPacket & {
  id: number;
  owner_id: number;
  is_live_end: number;
  imageflux_channel_id: string | null;
};

// 配信IDをパースするだけ
async function parseChannelId(paramsPromise: Promise<{ channelId: string }>) {
  const params = await paramsPromise;
  const channelId = Number(params.channelId);
  if (!Number.isInteger(channelId) || channelId <= 0) return null;

  return channelId;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channelId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const channelId = await parseChannelId(context.params);
    if (!channelId) {
      return NextResponse.json({ error: "不正な配信IDです。" }, { status: 400 });
    }

    // DBからチャンネル情報を取得する
    const pool = getDbPool();
    const [channels] = await pool.execute<ChannelRow[]>(
      "SELECT id, owner_id, is_live_end, imageflux_channel_id FROM channels WHERE id = ? AND owner_id = ? LIMIT 1",
      [channelId, session.userId],
    );
    const channel = channels[0];

    // チャンネルが存在しない場合は404
    if (!channel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    // ImageFluxの配信チャンネルを削除する
    if (!channel.is_live_end && channel.imageflux_channel_id) {
      await callImageFluxLiveStreaming(
        "ImageFlux_20180501.DeleteChannel",
        { channel_id: channel.imageflux_channel_id },
      );
    }

    // 配信終了フラグを立てる
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE channels SET is_live_end = TRUE WHERE id = ? AND owner_id = ?",
      [channelId, session.userId],
    );

    // 更新件数が0件の場合は404
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({ ended: true });
  } catch (error) {
    console.error("配信終了失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "配信終了に失敗しました。" },
      { status: 500 },
    );
  }
}
