import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { verifySoraConnectionToken } from "@/lib/auth/sora-connection-token";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type SoraWebhookRequest = {
  channel_id?: string;
  role?: "sendonly" | "sendrecv" | "recvonly";
  client_id?: string;
  metadata?: {
    access_token?: unknown;
  };
  authn_metadata?: {
    access_token?: unknown;
  };
};

type ChannelAccessRow = RowDataPacket & {
  id: number;
  owner_id: number;
  is_live_end: number;
  imageflux_channel_id: string | null;
  allowed_user_id: number | null;
};

// 認証拒否時のレスポンスを返す
function reject(reason: string) {
  return NextResponse.json({ allowed: false, reason: reason.slice(0, 100) });
}

// リクエストボディからアクセストークンを取得する
function readAccessToken(body: SoraWebhookRequest) {
  const token = body.metadata?.access_token ?? body.authn_metadata?.access_token;
  return typeof token === "string" ? token : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SoraWebhookRequest;
    const accessToken = readAccessToken(body);

    // アクセストークンが存在しない場合は拒否する
    if (!accessToken) return reject("MISSING_TOKEN");

    // アクセストークンが有効かどうかを検証する
    const token = await verifySoraConnectionToken(accessToken);
    if (!token) return reject("INVALID_TOKEN");

    if (body.channel_id !== token.imagefluxChannelId) return reject("CHANNEL_MISMATCH");
    if (body.client_id && body.client_id !== token.loginId) return reject("CLIENT_MISMATCH");

    // DBからチャンネル情報を取得する（アクセス可能かどうかを確認するために、チャンネルの所有者と許可されたユーザーを結合して取得する）
    const pool = getDbPool();
    const [channels] = await pool.execute<ChannelAccessRow[]>(
      `SELECT c.id, c.owner_id, c.is_live_end, c.imageflux_channel_id, cau.user_id AS allowed_user_id
       FROM channels c
       LEFT JOIN channel_allowed_users cau ON cau.channel_id = c.id AND cau.user_id = ?
       WHERE c.id = ? LIMIT 1`,
      [token.userId, token.channelId],
    );
    const channel = channels[0];

    // チャンネルが存在しない、またはアクセストークンのチャンネルIDと一致しない場合は拒否する
    if (!channel || channel.imageflux_channel_id !== token.imagefluxChannelId) return reject("CHANNEL_NOT_FOUND");
    if (channel.is_live_end) return reject("LIVE_ENDED");

    // 許認可フラグ
    const isOwner = channel.owner_id === token.userId;
    const isAllowedViewer = Boolean(channel.allowed_user_id);
    const role = body.role ?? "recvonly";

    // 送信者接続（sendonly/sendrecv）の場合は、チャンネルの所有者か、許可された視聴者でない場合は拒否する
    if ((role === "sendonly" || role === "sendrecv") && (!isOwner || token.soraRole !== role)) {
      return reject("SEND_ROLE_NOT_ALLOWED");
    }

    // 受信者接続（recvonly）の場合は、要求ロールの一致検証
    if (role === "recvonly" && token.soraRole !== "recvonly") {
      return reject("ROLE_MISMATCH");
    }

    // 受信者接続（recvonly）の場合は、チャンネルの所有者でもなく、許可された視聴者でもない場合は拒否する
    if (role === "recvonly" && !isOwner && !isAllowedViewer) {
      return reject("VIEWER_NOT_ALLOWED");
    }

    return NextResponse.json({
        allowed: true,
        client_id: token.loginId,
        data_channel_signaling: true,
        signaling_notify: true,
        data_channels:[
            {
                label: "#chat",
                direction: "sendrecv",
                ordered: true,
                max_packet_life_time: 5000,
            },
        ],
        event_metadata: {
            user_id: token.userId,
            login_id: token.loginId,
            display_name: token.displayName,
        },
        signaling_notify_metadata: {
            user_id: token.userId,
            login_id: token.loginId,
            display_name: token.displayName,
        },
    });
  } catch (error) {
    console.error("Sora認証Webhook失敗", error);
    return reject("AUTH_WEBHOOK_ERROR");
  }
}
