import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

type StreamType = "webrtc" | "webrtc_to_hls";

type ChannelSummaryRow = RowDataPacket & {
  id: number;
  name: string;
  description: string | null;
  stream_type: StreamType;
  is_recording_enabled: number;
  is_summary_enabled: number;
  is_live_end: number;
  archive_destination_id: string | null;
  imageflux_channel_id: string | null;
  imageflux_sora_url: string | null;
  created_at: string;
  updated_at: string;
};

type RecordingSummaryRow = RowDataPacket & {
  id: number;
  channel_id: number;
  file_path: string;
  created_at: string;
};

type PlaylistUrlsResponse = {
  hls?: Array<{
    playlist_url?: unknown;
  }>;
};

type CreateMultistreamChannelResponse = {
  channel_id: string;
  sora_url: string;
};

type CreateChannelRequest = {
  name?: string;
  description?: string;
  streamType?: StreamType;
  isRecordingEnabled?: boolean;
  isSummaryEnabled?: boolean;
  allowedUserIds?: unknown[];
  hlsSettings?: unknown[];
  archiveDestinationId?: string;
};

type HlsSetting = {
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  videoBps: number;
  audioBps: number;
};

const IMAGEFLUX_AUDIO_BPS = [
  32000,
  40000,
  48000,
  56000,
  64000,
  80000,
  96000,
  112000,
  128000,
  160000,
  192000,
  224000,
  256000,
  320000,
] as const;

function isStreamType(value: unknown): value is StreamType {
  return value === "webrtc" || value === "webrtc_to_hls";
}

function readNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function validateIntegerRange(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label}は${min}〜${max}の整数で指定してください。`;
  }

  return null;
}

function readHlsSettings(body: CreateChannelRequest) {
  const source = Array.isArray(body.hlsSettings) ? body.hlsSettings : [];

  return source.map((setting) => {
    const values = setting && typeof setting === "object" ? setting as Record<string, unknown> : {};
    return {
      videoWidth: readNumber(values.videoWidth),
      videoHeight: readNumber(values.videoHeight),
      videoFps: readNumber(values.videoFps),
      videoBps: readNumber(values.videoBps),
      audioBps: readNumber(values.audioBps),
    };
  });
}

function validateHlsSettings(hlsSettings: HlsSetting[]) {
  if (hlsSettings.length === 0) {
    return "HLS設定を1件以上指定してください。";
  }

  for (const [index, setting] of hlsSettings.entries()) {
    const prefix = `HLS設定${index + 1}件目の`;
    const validationError =
      validateIntegerRange(setting.videoWidth, 160, 4096, `${prefix}幅`) ??
      validateIntegerRange(setting.videoHeight, 160, 4096, `${prefix}高さ`) ??
      validateIntegerRange(setting.videoFps, 3, 60, `${prefix}フレームレート`) ??
      validateIntegerRange(setting.videoBps, 15000, 15000000, `${prefix}映像bps`) ??
      (IMAGEFLUX_AUDIO_BPS.includes(setting.audioBps as typeof IMAGEFLUX_AUDIO_BPS[number])
        ? null
        : `${prefix}音声ビットレートはImageFlux Live Streamingで利用可能な値を選択してください。`);

    if (validationError) return validationError;
  }

  return null;
}

function readAllowedUserIds(value: unknown, ownerId: number) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0 && id !== ownerId))];
}

/***
 * ImageFlux Live Streamingの認証WebhookのURLを決定する。
 * 環境変数にあればそのまま利用。
 * ない場合は、アプリのURLにAPIのパスを追加して生成する。
 */
function getAuthWebhookUrl() {
  const explicitUrl = process.env.IMAGEFLUX_LS_AUTH_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const appOrigin = process.env.APP_URL?.trim();
  if (!appOrigin) return "";

  return new URL("/api/sora/auth/webhook", appOrigin).toString();
}

function getEventWebhookUrl() {
  const explicitUrl = process.env.IMAGEFLUX_LS_EVENT_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const appOrigin = process.env.APP_URL?.trim();
  if (!appOrigin) {
    throw new Error("イベントWebhook URLの設定が不足しています。IMAGEFLUX_LS_EVENT_WEBHOOK_URL または APP_URL を設定してください。");
  }

  return new URL("/api/sora/event-webhook", appOrigin).toString();
}

function getEncryptKeyUri() {
  const explicitUrl = process.env.IMAGEFLUX_LS_ENCRYPT_KEY_URI?.trim();
  if (explicitUrl) return explicitUrl;

  const appOrigin = process.env.APP_URL?.trim();
  if (!appOrigin) return "";

  return new URL("/api/sora/encrypt-key", appOrigin).toString();
}

async function syncAllowedUsers(
  connection: Awaited<ReturnType<ReturnType<typeof getDbPool>["getConnection"]>>,
  channelId: number,
  ownerId: number,
  allowedUserIds: number[],
) {
  await connection.execute("DELETE FROM channel_allowed_users WHERE channel_id = ?", [channelId]);

  if (allowedUserIds.length === 0) return;

  const [users] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE id IN (?) AND id <> ?",
    [allowedUserIds, ownerId],
  );
  const validUserIds = users.map((user) => Number(user.id));

  if (validUserIds.length === 0) return;

  await connection.query(
    "INSERT INTO channel_allowed_users (channel_id, user_id) VALUES ?",
    [validUserIds.map((userId) => [channelId, userId])],
  );
}

function toChannelSummary(channel: ChannelSummaryRow, metadata?: {
  livePlaylistUrls: string[];
  recordings: Array<{ id: number; filePath: string; createdAt: string }>;
}) {
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    streamType: channel.stream_type,
    isRecordingEnabled: Boolean(channel.is_recording_enabled),
    isSummaryEnabled: Boolean(channel.is_summary_enabled),
    isLiveEnd: Boolean(channel.is_live_end),
    archiveDestinationId: channel.archive_destination_id,
    imagefluxChannelId: channel.imageflux_channel_id,
    imagefluxSoraUrl: channel.imageflux_sora_url,
    createdAt: channel.created_at,
    updatedAt: channel.updated_at,
    livePlaylistUrls: metadata?.livePlaylistUrls ?? [],
    recordings: metadata?.recordings ?? [],
  };
}

async function loadWatchMetadata(channels: ChannelSummaryRow[]) {
  const pool = getDbPool();
  const channelIds = channels.map((channel) => channel.id);
  const recordingsByChannelId = new Map<number, RecordingSummaryRow[]>();

  if (channelIds.length > 0) {
    const [recordings] = await pool.query<RecordingSummaryRow[]>(
      "SELECT id, channel_id, file_path, created_at FROM recordings WHERE channel_id IN (?) AND file_path <> '' ORDER BY created_at DESC, id DESC",
      [channelIds],
    );
    for (const recording of recordings) {
      const channelRecordings = recordingsByChannelId.get(recording.channel_id) ?? [];
      channelRecordings.push(recording);
      recordingsByChannelId.set(recording.channel_id, channelRecordings);
    }
  }

  const metadata = await Promise.all(channels.map(async (channel) => {
    let livePlaylistUrls: string[] = [];
    if (channel.stream_type === "webrtc_to_hls" && channel.imageflux_channel_id && !channel.is_live_end) {
      try {
        const response = await callImageFluxLiveStreaming<PlaylistUrlsResponse>(
          "ImageFlux_20200207.ListPlaylistURLs",
          { channel_id: channel.imageflux_channel_id },
        );
        livePlaylistUrls = (response.hls ?? [])
          .map((playlist) => playlist.playlist_url)
          .filter((url): url is string => typeof url === "string" && url.trim() !== "");
      } catch (error) {
        console.error("プレイリストURL取得失敗", error);
      }
    }

    return [channel.id, {
      livePlaylistUrls,
      recordings: (recordingsByChannelId.get(channel.id) ?? []).map((recording) => ({
        id: recording.id,
        filePath: recording.file_path,
        createdAt: recording.created_at,
      })),
    }] as const;
  }));

  return new Map(metadata);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const pool = getDbPool();
    const isWatchScope = request.nextUrl.searchParams.get("scope") === "watch";
    const [channels] = isWatchScope
      ? await pool.execute<ChannelSummaryRow[]>(
        "SELECT c.id, c.name, c.description, c.stream_type, c.is_recording_enabled, c.is_summary_enabled, c.is_live_end, c.archive_destination_id, c.imageflux_channel_id, c.imageflux_sora_url, c.created_at, c.updated_at FROM channels AS c LEFT JOIN channel_allowed_users AS cau ON cau.channel_id = c.id AND cau.user_id = ? WHERE c.owner_id = ? OR cau.user_id IS NOT NULL ORDER BY c.created_at DESC, c.id DESC",
        [session.userId, session.userId],
      )
      : await pool.execute<ChannelSummaryRow[]>(
        "SELECT id, name, description, stream_type, is_recording_enabled, is_summary_enabled, is_live_end, archive_destination_id, imageflux_channel_id, imageflux_sora_url, created_at, updated_at FROM channels WHERE owner_id = ? ORDER BY created_at DESC, id DESC",
        [session.userId],
      );

    if (!isWatchScope) {
      return NextResponse.json({ channels: channels.map((channel) => toChannelSummary(channel)) });
    }

    const metadataByChannelId = await loadWatchMetadata(channels);
    return NextResponse.json({
      channels: channels.map((channel) => toChannelSummary(channel, metadataByChannelId.get(channel.id))),
    });
  } catch (error) {
    console.error("配信一覧取得失敗", error);
    return NextResponse.json(
      { error: "配信一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const body = await request.json() as CreateChannelRequest;
    const name = body.name?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    const streamType = body.streamType;
    const isRecordingEnabled = body.isRecordingEnabled === true;
    const isSummaryEnabled = body.isSummaryEnabled === true;
    const allowedUserIds = readAllowedUserIds(body.allowedUserIds, session.userId);
    let archiveDestinationIdForChannel: string | null = null;

    if (!name) {
      return NextResponse.json({ error: "チャンネル名称は必須です。" }, { status: 400 });
    }

    if (name.length > 255) {
      return NextResponse.json({ error: "チャンネル名称は255文字以内で入力してください。" }, { status: 400 });
    }

    if (!isStreamType(streamType)) {
      return NextResponse.json(
        { error: "配信方式は小規模超低遅延配信または大規模配信を選択してください。" },
        { status: 400 },
      );
    }

    if (!isRecordingEnabled && isSummaryEnabled) {
      return NextResponse.json(
        { error: "録画を有効にした場合のみ要約を有効にできます。" },
        { status: 400 },
      );
    }

    const needsHls = streamType === "webrtc_to_hls" || isRecordingEnabled;
    const imageFluxTarget = needsHls
      ? "ImageFlux_20200316.CreateMultistreamChannelWithHLS"
      : "ImageFlux_20200316.CreateMultistreamChannel";
    const imageFluxBody: Record<string, unknown> = {
      auth_webhook_url: getAuthWebhookUrl(),
      event_webhook_url: getEventWebhookUrl(),
      environment: 0,
    };

    if (needsHls) {
      const hlsSettings = readHlsSettings(body);
      const archiveDestinationId = body.archiveDestinationId?.trim() ?? "";
      const validationError = validateHlsSettings(hlsSettings);

      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      if (isRecordingEnabled && !archiveDestinationId) {
        return NextResponse.json(
          { error: "録画を有効にする場合は録画保存先を選択してください。" },
          { status: 400 },
        );
      }

      if (isRecordingEnabled) {
        const pool = getDbPool();
        const [destinations] = await pool.execute<RowDataPacket[]>(
          "SELECT archive_destination_id FROM archive_destinations WHERE archive_destination_id = ? LIMIT 1",
          [archiveDestinationId],
        );
        if (destinations.length === 0) {
          return NextResponse.json(
            { error: "選択した録画保存先が見つかりません。" },
            { status: 400 },
          );
        }
        archiveDestinationIdForChannel = archiveDestinationId;
      }

      imageFluxBody.encrypt_key_uri = getEncryptKeyUri();
      imageFluxBody.hls = hlsSettings.map((setting) => ({
          durationSeconds: 2,
          startTimeOffset: -2,
          video: {
            width: setting.videoWidth,
            height: setting.videoHeight,
            fps: setting.videoFps,
            bps: setting.videoBps,
          },
          audio: {
            bps: setting.audioBps,
          },
          ...(isRecordingEnabled ? { archive: { archive_destination_id: archiveDestinationId } } : {}),
        }));
    }

    const imageFluxChannel = await callImageFluxLiveStreaming<CreateMultistreamChannelResponse>(
      imageFluxTarget,
      imageFluxBody,
    );

    const pool = getDbPool();
    const connection = await pool.getConnection();
    let channelId: number;

    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO channels (name, description, owner_id, stream_type, is_recording_enabled, is_summary_enabled, is_live_end, archive_destination_id, imageflux_channel_id, imageflux_sora_url) VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?)",
        [
          name,
          description || null,
          session.userId,
          streamType,
          isRecordingEnabled,
          isSummaryEnabled,
          archiveDestinationIdForChannel,
          imageFluxChannel.channel_id,
          imageFluxChannel.sora_url,
        ],
      );
      channelId = result.insertId;
      await syncAllowedUsers(connection, channelId, session.userId, allowedUserIds);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      created: true,
      channel: {
        id: channelId,
        name,
        description: description || null,
        streamType,
        isRecordingEnabled,
        isSummaryEnabled,
        isLiveEnd: false,
        archiveDestinationId: archiveDestinationIdForChannel,
        imagefluxChannelId: imageFluxChannel.channel_id,
        imagefluxSoraUrl: imageFluxChannel.sora_url,
        allowedUserIds,
      },
    });
  } catch (error) {
    console.error("配信追加失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "配信追加に失敗しました。" },
      { status: 500 },
    );
  }
}