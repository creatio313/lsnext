import { notFound } from "next/navigation";
import { ChannelDetailPanel } from "../../_components/channel-detail-panel";

type ChannelDetailPageProps = {
  params: Promise<{ channelId: string }>;
};

export default async function ChannelDetailPage({ params }: ChannelDetailPageProps) {
  const { channelId: channelIdText } = await params;
  const channelId = Number.parseInt(channelIdText, 10);

  if (!Number.isInteger(channelId) || channelId <= 0) {
    notFound();
  }

  return <ChannelDetailPanel channelId={channelId} />;
}