import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { signSoraConnectionToken } from "@/lib/auth/sora-connection-token";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type ChannelRow = RowDataPacket & {
  id: number;
  owner_id: number;
  stream_type: "webrtc" | "webrtc_to_hls";
  is_live_end: number;
  imageflux_channel_id: string | null;
  imageflux_sora_url: string | null;
};

// 選択可能なロールを定義
type SoraTokenRequest = {
  role?: "sendonly" | "recvonly" | "sendrecv";
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

    // リクエストボディから希望するロールを取得する。
    const body = await request.json().catch(() => ({})) as SoraTokenRequest;
    const requestedRole = body.role ?? "sendonly";

    if (requestedRole !== "sendonly" && requestedRole !== "recvonly") {
      return NextResponse.json({ error: "Sora接続ロールが不正です。" }, { status: 400 });
    }

    // DBからチャンネル情報を取得する
    const pool = getDbPool();
    const [channels] = await pool.execute<ChannelRow[]>(
      `SELECT c.id, c.owner_id, c.stream_type, c.is_live_end, c.imageflux_channel_id, c.imageflux_sora_url
       FROM channels c
       LEFT JOIN channel_allowed_users cau ON cau.channel_id = c.id AND cau.user_id = ?
       WHERE c.id = ? AND (c.owner_id = ? OR cau.user_id IS NOT NULL)
       LIMIT 1`,
      [session.userId, channelId, session.userId],
    );
    const channel = channels[0];

    if (!channel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }
    if (requestedRole === "recvonly" && channel.stream_type !== "webrtc") {
      return NextResponse.json({ error: "この配信方式のライブ視聴には対応していません。" }, { status: 409 });
    }
    // 配信が終了済み、またはSora接続情報がない場合は409
    if (channel.is_live_end || !channel.imageflux_channel_id || !channel.imageflux_sora_url) {
      return NextResponse.json({ error: "この配信は終了済みです。" }, { status: 409 });
    }

    // 配信接続用のトークンを発行。シークレットはログイン認証のものと同じ。
    const accessToken = await signSoraConnectionToken({
      tokenUse: "sora",
      userId: session.userId,
      loginId: session.loginId,
      displayName: session.displayName,
      channelId,
      imagefluxChannelId: channel.imageflux_channel_id,
      soraRole: requestedRole,
    });

    return NextResponse.json({
      accessToken,
      clientId: session.loginId,
      displayName: session.displayName,
      imagefluxChannelId: channel.imageflux_channel_id,
      soraUrl: channel.imageflux_sora_url,
    });
  } catch (error) {
    console.error("配信接続トークン発行失敗", error);
    return NextResponse.json(
      { error: "配信接続トークンの発行に失敗しました。" },
      { status: 500 },
    );
  }
}
