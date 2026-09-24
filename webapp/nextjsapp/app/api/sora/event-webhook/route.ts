import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { enqueueSimpleMqMessage } from "@/lib/simplemq";

export const runtime = "nodejs";

type ImageFluxEventWebhook = {
  channel_id?: unknown;
  type?: unknown;
  data?: unknown;
};

type ArchiveCreatedData = {
  current_file_path?: unknown;
  file_type?: unknown;
};

type ChannelRow = RowDataPacket & {
  id: number;
  is_summary_enabled: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  console.log(rawBody);

  let body: ImageFluxEventWebhook;
  try {
    body = JSON.parse(rawBody) as ImageFluxEventWebhook;
  } catch (error) {
    console.error("ImageFlux Live StreamingイベントWebhookのJSON解析失敗", error);
    return new NextResponse(null, { status: 400 });
  }

  if (body.type !== "imageflux.archive_created") {
    return new NextResponse(null, { status: 200 });
  }

  const data = isObject(body.data) ? body.data as ArchiveCreatedData : null;
  const imageFluxChannelId = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
  const filePath = typeof data?.current_file_path === "string" ? data.current_file_path.trim() : "";

  if (data?.file_type !== "m3u8" || !imageFluxChannelId || !filePath) {
    return new NextResponse(null, { status: 200 });
  }

  try {
    const pool = getDbPool();
    const [channels] = await pool.execute<ChannelRow[]>(
      "SELECT id, is_summary_enabled FROM channels WHERE imageflux_channel_id = ? LIMIT 1",
      [imageFluxChannelId],
    );
    const channel = channels[0];

    if (!channel) {
      console.error("ImageFlux Live StreamingイベントWebhookに対応するチャンネルが見つかりません", imageFluxChannelId);
      return new NextResponse(null, { status: 404 });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO recordings (channel_id, file_path)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM recordings WHERE channel_id = ? AND file_path = ?
       )`,
      [channel.id, filePath, channel.id, filePath],
    );

    if (channel.is_summary_enabled && result.affectedRows > 0) {
      const [recordings] = await pool.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM recordings WHERE channel_id = ? AND file_path = ? ORDER BY id DESC LIMIT 1",
        [channel.id, filePath],
      );
      const recording = recordings[0];
      if (!recording) throw new Error("登録した録画情報を取得できませんでした。");

      await enqueueSimpleMqMessage({ type: "recording_summary", channelId: channel.id, recordingId: recording.id });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("ImageFlux Live StreamingイベントWebhookの保存失敗", error);
    return new NextResponse(null, { status: 500 });
  }
}