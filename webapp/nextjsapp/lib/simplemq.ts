const SIMPLE_MQ_API_ORIGIN = "https://simplemq.tk1b.api.sacloud.jp";

export type SimpleMqMessage =
  | { type: "recording_summary"; channelId: number; recordingId: number }
  | { type: "archive_cleanup"; channelId: number; archiveDestinationId: string | null; filePaths: string[] };

function getSimpleMqConfiguration() {
  const queueName = process.env.SIMPLE_MQ_QUEUE_NAME?.trim();
  const queueKey = process.env.SIMPLE_MQ_QUEUE_KEY?.trim();

  if (!queueName || !queueKey) {
    throw new Error("シンプルMQの設定が不足しています。SIMPLE_MQ_QUEUE_NAME と SIMPLE_MQ_QUEUE_KEY を設定してください。");
  }

  return { queueName, queueKey };
}

export async function enqueueSimpleMqMessage(message: SimpleMqMessage) {
  const { queueName, queueKey } = getSimpleMqConfiguration();
  const response = await fetch(`${SIMPLE_MQ_API_ORIGIN}/v1/queues/${encodeURIComponent(queueName)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${queueKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: Buffer.from(JSON.stringify(message), "utf8").toString("base64") }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`シンプルMQへのメッセージ登録に失敗しました。HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
}