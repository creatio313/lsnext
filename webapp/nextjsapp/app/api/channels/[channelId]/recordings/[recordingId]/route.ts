import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { enqueueArchiveCleanup } from "@/lib/archive-cleanup";

export const runtime = "nodejs";

type RecordingRow = RowDataPacket & {
  id: number;
  channel_id: number;
  file_path: string;
  summary_text: string | null;
  is_summary_enabled: number;
  archive_destination_id: string | null;
  is_owner: number;
  web_accel_domain: string;
  created_at: string;
};

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getArchiveUrl(filePath: string, webAccelDomain: string) {
  const host = webAccelDomain.trim();
  if (!host) throw new Error("アーカイブ保存先のさくらのウェブアクセラレータドメインが設定されていません。");

  const base = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
  const path = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return new URL(path, `${base.origin}/`).toString();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; recordingId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) return NextResponse.json({ error: "未認証です。" }, { status: 401 });

    const { channelId: channelIdText, recordingId: recordingIdText } = await context.params;
    const channelId = parsePositiveInteger(channelIdText);
    const recordingId = parsePositiveInteger(recordingIdText);
    if (!channelId || !recordingId) return NextResponse.json({ error: "不正な録画IDです。" }, { status: 400 });

    const pool = getDbPool();
    const [recordings] = await pool.execute<RecordingRow[]>(
      `SELECT r.id, r.channel_id, r.file_path, r.summary_text, c.is_summary_enabled, c.archive_destination_id,
          c.owner_id = ? AS is_owner, ad.web_accel_domain, r.created_at
       FROM recordings r
       INNER JOIN channels c ON c.id = r.channel_id
      INNER JOIN archive_destinations ad ON ad.archive_destination_id = c.archive_destination_id
       LEFT JOIN channel_allowed_users cau ON cau.channel_id = c.id AND cau.user_id = ?
       WHERE r.id = ? AND r.channel_id = ? AND (c.owner_id = ? OR cau.user_id IS NOT NULL)
       LIMIT 1`,
      [session.userId, session.userId, recordingId, channelId, session.userId],
    );
    const recording = recordings[0];
    if (!recording) return NextResponse.json({ error: "録画が見つかりません。" }, { status: 404 });

    const response = NextResponse.json({
      recording: {
        id: recording.id,
        channelId: recording.channel_id,
        url: getArchiveUrl(recording.file_path, recording.web_accel_domain),
        isOwner: Boolean(recording.is_owner),
        isSummaryEnabled: Boolean(recording.is_summary_enabled),
        summaryText: recording.summary_text,
        createdAt: recording.created_at,
      },
    });
    response.cookies.set("hls_channel_id", String(channelId), { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 3600 });
    return response;
  } catch (error) {
    console.error("録画取得失敗", error);
    return NextResponse.json({ error: "録画の取得に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ channelId: string; recordingId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) return NextResponse.json({ error: "未認証です。" }, { status: 401 });

    const { channelId: channelIdText, recordingId: recordingIdText } = await context.params;
    const channelId = parsePositiveInteger(channelIdText);
    const recordingId = parsePositiveInteger(recordingIdText);
    if (!channelId || !recordingId) return NextResponse.json({ error: "不正な録画IDです。" }, { status: 400 });

    const pool = getDbPool();
    const [recordings] = await pool.execute<RecordingRow[]>(
      `SELECT r.id, r.channel_id, r.file_path, c.archive_destination_id,
              r.summary_text, c.is_summary_enabled, 1 AS is_owner, ad.web_accel_domain, r.created_at
       FROM recordings r
       INNER JOIN channels c ON c.id = r.channel_id
       LEFT JOIN archive_destinations ad ON ad.archive_destination_id = c.archive_destination_id
       WHERE r.id = ? AND r.channel_id = ? AND c.owner_id = ?
       LIMIT 1`,
      [recordingId, channelId, session.userId],
    );
    const recording = recordings[0];
    if (!recording) return NextResponse.json({ error: "録画が見つかりません。" }, { status: 404 });

    await enqueueArchiveCleanup({
      channelId,
      archiveDestinationId: recording.archive_destination_id,
      filePaths: recording.file_path ? [recording.file_path] : [],
    });

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE r FROM recordings r
       INNER JOIN channels c ON c.id = r.channel_id
       WHERE r.id = ? AND r.channel_id = ? AND c.owner_id = ?`,
      [recordingId, channelId, session.userId],
    );
    if (result.affectedRows !== 1) return NextResponse.json({ error: "録画が見つかりません。" }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("録画削除失敗", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "録画削除に失敗しました。" }, { status: 500 });
  }
}