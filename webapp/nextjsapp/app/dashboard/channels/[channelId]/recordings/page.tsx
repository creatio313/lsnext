import { notFound } from "next/navigation";
import { RecordingListPanel } from "../../../_components/recording-list-panel";

type RecordingsPageProps = { params: Promise<{ channelId: string }> };

export default async function RecordingsPage({ params }: RecordingsPageProps) {
  const { channelId: channelIdText } = await params;
  const channelId = Number.parseInt(channelIdText, 10);
  if (!Number.isInteger(channelId) || channelId <= 0) notFound();
  return <RecordingListPanel channelId={channelId} />;
}