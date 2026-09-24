import { notFound } from "next/navigation";
import { RecordingWatchPanel } from "../../../../_components/recording-watch-panel";

type RecordingPageProps = { params: Promise<{ channelId: string; recordingId: string }> };

export default async function RecordingPage({ params }: RecordingPageProps) {
  const { channelId: channelIdText, recordingId: recordingIdText } = await params;
  const channelId = Number.parseInt(channelIdText, 10);
  const recordingId = Number.parseInt(recordingIdText, 10);
  if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(recordingId) || recordingId <= 0) notFound();
  return <RecordingWatchPanel channelId={channelId} recordingId={recordingId} />;
}