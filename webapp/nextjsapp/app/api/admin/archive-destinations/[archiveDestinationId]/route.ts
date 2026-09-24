import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ archiveDestinationId: string }> },
) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { archiveDestinationId } = await context.params;
    const trimmedArchiveDestinationId = archiveDestinationId.trim();
    if (!trimmedArchiveDestinationId) {
      return NextResponse.json(
        { error: "不正な録画保存先IDです。" },
        { status: 400 },
      );
    }

    const data = await callImageFluxLiveStreaming<Record<string, unknown>>(
      "ImageFlux_20190205.DeleteArchiveDestination",
      { archive_destination_id: trimmedArchiveDestinationId },
    );

    const pool = getDbPool();
    await pool.execute(
      "DELETE FROM archive_destinations WHERE archive_destination_id = ?",
      [trimmedArchiveDestinationId],
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("録画保存先削除失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "録画保存先削除に失敗しました。" },
      { status: 500 },
    );
  }
}