import { notFound } from "next/navigation";
import { StreamRoomPanel } from "../../../_components/stream-room-panel";

type StreamPageProps = {
  params: Promise<{ channelId: string }>;
};

export default async function StreamPage({ params }: StreamPageProps) {
  const { channelId: channelIdText } = await params;
  const channelId = Number.parseInt(channelIdText, 10);

  if (!Number.isInteger(channelId) || channelId <= 0) {
    notFound();
  }

  return <StreamRoomPanel channelId={channelId} />;
}
