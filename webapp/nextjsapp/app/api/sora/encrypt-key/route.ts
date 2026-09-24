import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

type ChannelAccessRow = RowDataPacket & { owner_id: number; allowed_user_id: number | null };
type EncryptKeyResponse = { encrypt_key?: unknown };

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) return new NextResponse(null, { status: 404 });

    const kid = request.nextUrl.searchParams.get("kid")?.trim() ?? "";
    const channelIdText = request.nextUrl.searchParams.get("channelId") ?? request.cookies.get("hls_channel_id")?.value ?? "";
    const channelId = Number(channelIdText);
    if (!/^[0-9a-fA-F]{32}$/.test(kid) || !Number.isInteger(channelId) || channelId <= 0) {
      return new NextResponse(null, { status: 404 });
    }

    const pool = getDbPool();
    const [channels] = await pool.execute<ChannelAccessRow[]>(
      `SELECT c.owner_id, cau.user_id AS allowed_user_id
       FROM channels c
       LEFT JOIN channel_allowed_users cau ON cau.channel_id = c.id AND cau.user_id = ?
       WHERE c.id = ? LIMIT 1`,
      [session.userId, channelId],
    );
    const channel = channels[0];
    if (!channel || (channel.owner_id !== session.userId && !channel.allowed_user_id)) {
      return new NextResponse(null, { status: 404 });
    }

    const response = await callImageFluxLiveStreaming<EncryptKeyResponse>(
      "ImageFlux_20200707.GetEncryptKey",
      { kid },
    );
    if (typeof response.encrypt_key !== "string" || !/^[0-9a-fA-F]{32}$/.test(response.encrypt_key)) {
      return new NextResponse(null, { status: 502 });
    }

    return new NextResponse(Buffer.from(response.encrypt_key, "hex"), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("HLS暗号鍵取得失敗", error);
    return new NextResponse(null, { status: 404 });
  }
}