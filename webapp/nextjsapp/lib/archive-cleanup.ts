import { enqueueSimpleMqMessage } from "@/lib/simplemq";

type ArchiveCleanupInput = {
  channelId: number;
  archiveDestinationId: string | null;
  filePaths: string[];
};

export async function enqueueArchiveCleanup({ channelId, archiveDestinationId, filePaths }: ArchiveCleanupInput) {
  if (!archiveDestinationId || filePaths.length === 0) return;

  await enqueueSimpleMqMessage({
    type: "archive_cleanup",
    channelId,
    archiveDestinationId,
    filePaths,
  });
}