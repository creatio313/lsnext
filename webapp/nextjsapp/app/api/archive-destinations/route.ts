import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";
import { callImageFluxLiveStreaming } from "@/lib/imageflux/live-streaming";

export const runtime = "nodejs";

type ArchiveDestination = {
  archive_destination_id: string;
  bucket_uri: string;
};

type ArchiveDestinationRow = RowDataPacket & {
  archive_destination_id: string;
};

type ListArchiveDestinationsResponse = {
  destinations: ArchiveDestination[];
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    const pool = getDbPool();
    const [archiveDestinationRows] = await pool.execute<ArchiveDestinationRow[]>(
      "SELECT archive_destination_id FROM archive_destinations ORDER BY created_at DESC, archive_destination_id DESC",
    );

    const imageFluxData = await callImageFluxLiveStreaming<ListArchiveDestinationsResponse>(
      "ImageFlux_20190205.ListArchiveDestinations",
      {},
    );
    const imageFluxDestinationsById = new Map(
      imageFluxData.destinations.map((destination) => [destination.archive_destination_id, destination]),
    );

    const destinations = archiveDestinationRows.map((destinationRow) => {
      const destination = imageFluxDestinationsById.get(destinationRow.archive_destination_id);
      if (!destination) {
        throw new Error("DBとImageFlux Live Streamingの録画保存先一覧が同期していません。");
      }

      return destination;
    });

    return NextResponse.json({ destinations });
  } catch (error) {
    console.error("録画保存先一覧取得失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "録画保存先一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}