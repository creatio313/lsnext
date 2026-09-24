import { notFound } from "next/navigation";
import { WatchRoomPanel } from "../../../_components/watch-room-panel";

type WatchPageProps = { params: Promise<{ channelId: string }> };

export default async function WatchPage({ params }: WatchPageProps) {
  const { channelId: channelIdText } = await params;
  const channelId = Number.parseInt(channelIdText, 10);
  if (!Number.isInteger(channelId) || channelId <= 0) notFound();
  return <WatchRoomPanel channelId={channelId} />;
}