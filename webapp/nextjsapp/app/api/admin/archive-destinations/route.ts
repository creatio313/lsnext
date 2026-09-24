import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

const SAKURA_OBJECT_STORAGE_SITES = {
  "jp-north-1": "s3.isk01.sakurastorage.jp",
  "jp-east-1": "s3.tky01.sakurastorage.jp",
} as const;

type SakuraObjectStorageRegion = keyof typeof SAKURA_OBJECT_STORAGE_SITES;

// アーカイブ保存先追加の応答構造
type CreateArchiveDestinationResponse = {
  archive_destination_id: string;
};

function isSakuraObjectStorageRegion(value: string): value is SakuraObjectStorageRegion {
  return value in SAKURA_OBJECT_STORAGE_SITES;
}

function toBucketUri(bucketName: string, path: string) {
  return `s3://${bucketName}/${path.replace(/^\/+/, "")}`;
}

async function requireAdmin(request: NextRequest) {
  const session = await getAuthSession(request);
  if (!session) {
    return NextResponse.json({ error: "未認証です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "管理者のみ録画保存先を操作できます。" },
      { status: 403 },
    );
  }

  return null;
}

export async function POST(request: NextRequest) {
  //ImageFlux Live Streaming APIで録画保存先を追加し、返却する。
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await request.json() as {
      bucketName?: string;
      path?: string;
      awsRegion?: string;
      awsAccessKeyId?: string;
      awsSecretAccessKey?: string;
      webAccelDomain?: string;
    };

    const bucketName = body.bucketName?.trim() ?? "";
    const path = body.path?.trim() ?? "";
    const awsRegion = body.awsRegion?.trim() ?? "";
    const awsAccessKeyId = body.awsAccessKeyId?.trim() ?? "";
    const awsSecretAccessKey = body.awsSecretAccessKey ?? "";
    const webAccelDomain = body.webAccelDomain?.trim() ?? "";

    if (!bucketName || !awsRegion || !awsAccessKeyId || !awsSecretAccessKey || !webAccelDomain) {
      return NextResponse.json(
        { error: "バケット名・リージョン・アクセスキーID・シークレットアクセスキー・さくらのウェブアクセラレータドメインは必須です。" },
        { status: 400 },
      );
    }

    if (!isSakuraObjectStorageRegion(awsRegion)) {
      return NextResponse.json(
        { error: "リージョンには石狩第1サイトまたは東京第1サイトを選択してください。" },
        { status: 400 },
      );
    }

    if (path.startsWith("/")) {
      return NextResponse.json(
        { error: "path の先頭に / は入力しないでください。" },
        { status: 400 },
      );
    }

    const data = await callImageFluxLiveStreaming<CreateArchiveDestinationResponse>(
      "ImageFlux_20190205.CreateArchiveDestination",
      {
        bucket_uri: toBucketUri(bucketName, path),
        aws_end_point: SAKURA_OBJECT_STORAGE_SITES[awsRegion],
        aws_region: awsRegion,
        aws_access_key_id: awsAccessKeyId,
        aws_secret_access_key: awsSecretAccessKey,
      },
    );

    const pool = getDbPool();
    await pool.execute(
      "INSERT INTO archive_destinations (archive_destination_id, object_storage_site, object_storage_bucket, web_accel_domain) VALUES (?, ?, ?, ?)",
      [data.archive_destination_id, awsRegion, bucketName, webAccelDomain],
    );

    return NextResponse.json({
      ...data,
      object_storage_site: awsRegion,
      object_storage_bucket: bucketName,
      web_accel_domain: webAccelDomain,
    });
  } catch (error) {
    console.error("録画保存先追加失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "録画保存先追加に失敗しました。" },
      { status: 500 },
    );
  }
}