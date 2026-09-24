import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";
import { enqueueArchiveCleanup } from "@/lib/archive-cleanup";

export const runtime = "nodejs";

type StreamType = "webrtc" | "webrtc_to_hls";

type ChannelDetailRow = RowDataPacket & {
  id: number;
  owner_id: number;
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

type AllowedUserRow = RowDataPacket & {
  user_id: number;
};

type RecordingRow = RowDataPacket & {
  id: number;
  file_path: string;
  created_at: string;
};

type RecordingFilePathRow = RowDataPacket & {
  file_path: string;
};

type PlaylistUrlsResponse = {
  hls?: Array<{ playlist_url?: unknown }>;
};

type UpdateChannelRequest = {
  name?: string;
  description?: string;
  isSummaryEnabled?: boolean;
  allowedUserIds?: unknown[];
};

async function parseChannelId(paramsPromise: Promise<{ channelId: string }>) {
  const params = await paramsPromise;
  const channelId = Number(params.channelId);
  if (!Number.isInteger(channelId) || channelId <= 0) return null;

  return channelId;
}

function readAllowedUserIds(value: unknown, ownerId: number) {
  if (!Array.isArray(value)) return [];
  // 重複を除外し、ownerId は除外する。
  return [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0 && id !== ownerId))];
}

function toChannelDetail(
  channel: ChannelDetailRow,
  ownerId: number,
  allowedUserIds: number[],
  recordings: Array<{ id: number; filePath: string; createdAt: string }>,
  livePlaylistUrls: string[],
) {
  return {
    id: channel.id,
    isOwner: channel.owner_id === ownerId,
    name: channel.name,
    description: channel.description,
    streamType: channel.stream_type,
    isRecordingEnabled: Boolean(channel.is_recording_enabled),
    isSummaryEnabled: Boolean(channel.is_summary_enabled),
    isLiveEnd: Boolean(channel.is_live_end),
    archiveDestinationId: channel.archive_destination_id,
    imagefluxChannelId: channel.imageflux_channel_id,
    imagefluxSoraUrl: channel.imageflux_sora_url,
    allowedUserIds,
    recordings,
    livePlaylistUrls,
    createdAt: channel.created_at,
    updatedAt: channel.updated_at,
  };
}
/***
 * 以下がSQLの実行部分
 */
async function loadOwnedChannel(channelId: number, ownerId: number) {
  const pool = getDbPool();
  const [channels] = await pool.execute<ChannelDetailRow[]>(
    "SELECT id, owner_id, name, description, stream_type, is_recording_enabled, is_summary_enabled, is_live_end, archive_destination_id, imageflux_channel_id, imageflux_sora_url, created_at, updated_at FROM channels WHERE id = ? AND owner_id = ? LIMIT 1",
    [channelId, ownerId],
  );

  return channels[0] ?? null;
}

async function loadWatchableChannel(channelId: number, userId: number) {
  const pool = getDbPool();
  const [channels] = await pool.execute<ChannelDetailRow[]>(
    `SELECT c.id, c.owner_id, c.name, c.description, c.stream_type, c.is_recording_enabled, c.is_summary_enabled, c.is_live_end, c.archive_destination_id, c.imageflux_channel_id, c.imageflux_sora_url, c.created_at, c.updated_at
     FROM channels c
     LEFT JOIN channel_allowed_users cau ON cau.channel_id = c.id AND cau.user_id = ?
     WHERE c.id = ? AND (c.owner_id = ? OR cau.user_id IS NOT NULL)
     LIMIT 1`,
    [userId, channelId, userId],
  );

  return channels[0] ?? null;
}

async function loadAllowedUserIds(channelId: number) {
  const pool = getDbPool();
  const [allowedUsers] = await pool.execute<AllowedUserRow[]>(
    "SELECT user_id FROM channel_allowed_users WHERE channel_id = ? ORDER BY user_id ASC",
    [channelId],
  );

  return allowedUsers.map((user) => user.user_id);
}

function getRecordingResolution(filePath: string) {
  const pathSegments = filePath.split("/").filter(Boolean);
  const renditionDirectory = pathSegments.at(-2) ?? "";
  const match = /^\d+_(\d+)x(\d+)(?:_|$)/.exec(renditionDirectory);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return null;

  return { width, height };
}

async function loadRecordings(channelId: number) {
  const pool = getDbPool();
  const [recordings] = await pool.execute<RecordingRow[]>(
    "SELECT id, file_path, created_at FROM recordings WHERE channel_id = ? AND file_path <> '' ORDER BY created_at DESC, id DESC",
    [channelId],
  );

  return recordings.map((recording) => ({
    id: recording.id,
    filePath: recording.file_path,
    resolution: getRecordingResolution(recording.file_path),
    createdAt: recording.created_at,
  }));
}
/**
 * 指定された channelId の許可されたユーザーを同期する。
 * @param connection データベース接続
 * @param channelId チャンネルID
 * @param ownerId チャンネル所有者ID
 * @param allowedUserIds 許可するユーザーIDの配列
 * 以下のような処理順序
 * 1. channel_allowed_users テーブルから指定された channelId のレコードを削除する。
 * 2. allowedUserIds 配列が空でない場合、users テーブルから有効なユーザーIDを取得する。
 * 3. 有効なユーザーIDが存在する場合、channel_allowed_users テーブルに新しいレコードを挿入する。
 */
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

export async function GET(
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

    const channel = await loadWatchableChannel(channelId, session.userId);
    if (!channel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    const [allowedUserIds, recordings, livePlaylistUrls] = await Promise.all([
      loadAllowedUserIds(channelId),
      loadRecordings(channelId),
      loadLivePlaylistUrls(channel),
    ]);

    const response = NextResponse.json({ channel: toChannelDetail(channel, session.userId, allowedUserIds, recordings, livePlaylistUrls) });
    response.cookies.set("hls_channel_id", String(channelId), { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 3600 });
    return response;
  } catch (error) {
    console.error("配信詳細取得失敗", error);
    return NextResponse.json(
      { error: "配信詳細の取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const currentChannel = await loadOwnedChannel(channelId, session.userId);
    if (!currentChannel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    const body = await request.json() as UpdateChannelRequest;
    const name = body.name?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    const isSummaryEnabled = body.isSummaryEnabled === true;
    const allowedUserIds = readAllowedUserIds(body.allowedUserIds, session.userId);

    if (!name) {
      return NextResponse.json({ error: "チャンネル名称は必須です。" }, { status: 400 });
    }

    if (name.length > 255) {
      return NextResponse.json({ error: "チャンネル名称は255文字以内で入力してください。" }, { status: 400 });
    }

    if (!currentChannel.is_recording_enabled && isSummaryEnabled) {
      return NextResponse.json(
        { error: "録画を有効にした配信のみ要約を有効にできます。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute<ResultSetHeader>(
        "UPDATE channels SET name = ?, description = ?, is_summary_enabled = ? WHERE id = ? AND owner_id = ?",
        [name, description || null, isSummaryEnabled, channelId, session.userId],
      );
      await syncAllowedUsers(connection, channelId, session.userId, allowedUserIds);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const updatedChannel = await loadOwnedChannel(channelId, session.userId);
    if (!updatedChannel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    const [updatedAllowedUserIds, updatedRecordings] = await Promise.all([
      loadAllowedUserIds(channelId),
      loadRecordings(channelId),
    ]);

    return NextResponse.json({
      updated: true,
      channel: toChannelDetail(updatedChannel, session.userId, updatedAllowedUserIds, updatedRecordings, []),
    });
  } catch (error) {
    console.error("配信更新失敗", error);
    return NextResponse.json(
      { error: "配信更新に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const channel = await loadOwnedChannel(channelId, session.userId);
    if (!channel) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    if (channel.imageflux_channel_id && !channel.is_live_end) {
      await callImageFluxLiveStreaming(
        "ImageFlux_20180501.DeleteChannel",
        { channel_id: channel.imageflux_channel_id },
      );
    }

    const pool = getDbPool();
    const [recordings] = await pool.execute<RecordingFilePathRow[]>(
      "SELECT file_path FROM recordings WHERE channel_id = ? AND file_path <> ''",
      [channelId],
    );
    await enqueueArchiveCleanup({
      channelId,
      archiveDestinationId: channel.archive_destination_id,
      filePaths: recordings.map((recording) => recording.file_path),
    });

    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM channels WHERE id = ? AND owner_id = ?",
      [channelId, session.userId],
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "配信が見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("配信削除失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "配信削除に失敗しました。" },
      { status: 500 },
    );
  }
}

async function loadLivePlaylistUrls(channel: ChannelDetailRow) {
  if (channel.stream_type !== "webrtc_to_hls" || !channel.imageflux_channel_id || channel.is_live_end) return [];

  try {
    const response = await callImageFluxLiveStreaming<PlaylistUrlsResponse>(
      "ImageFlux_20200207.ListPlaylistURLs",
      { channel_id: channel.imageflux_channel_id },
    );
    return (response.hls ?? [])
      .map((playlist) => playlist.playlist_url)
      .filter((url): url is string => typeof url === "string" && url.trim() !== "");
  } catch (error) {
    console.error("ライブプレイリストURL取得失敗", error);
    return [];
  }
}