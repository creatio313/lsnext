"use client";

import { 
  ArrowLeftIcon, 
  ChatBubbleLeftRightIcon, 
  NoSymbolIcon, 
  PaperAirplaneIcon, 
  PlayIcon, 
  SignalIcon, 
  StopIcon 
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionSubscriber, DataChannelDirection } from "sora-js-sdk";
import { StatusNotification, type StatusNotificationTone } from "../../_components/status-notification";
import { HlsVideo } from "./hls-video";

type ChannelInfo = { id: number; name: string; streamType: "webrtc" | "webrtc_to_hls"; isLiveEnd: boolean; imagefluxChannelId: string | null; livePlaylistUrls: string[] };
type ChannelApiResult = { channel?: ChannelInfo; error?: string };
type SoraTokenResult = { accessToken?: string; clientId?: string; displayName?: string; imagefluxChannelId?: string; soraUrl?: string; error?: string };
type ChatPayload = { type: "chat"; sender: string; body: string; sentAt: string };
type ChatMessage = ChatPayload & { id: string; isSelf: boolean };

const CHAT_LABEL = "#chat";

function readChatPayload(data: ArrayBuffer): ChatPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data)) as Partial<ChatPayload>;
    if (parsed.type !== "chat" || typeof parsed.sender !== "string" || typeof parsed.body !== "string" || typeof parsed.sentAt !== "string") return null;
    return { type: "chat", sender: parsed.sender, body: parsed.body, sentAt: parsed.sentAt };
  } catch {
    return null;
  }
}

function formatChatTime(sentAt: string) {
  const date = new Date(sentAt);
  return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function WatchRoomPanel({ channelId }: { channelId: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connectionRef = useRef<ConnectionSubscriber | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);

  // 画面制御用
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isChatReady, setIsChatReady] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [displayName, setDisplayName] = useState("視聴者");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  const notify = (message: string, tone: StatusNotificationTone) => { setStatus(message); setStatusTone(tone); };

  const disconnect = useCallback(async () => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    setIsChatReady(false);
    setIsConnected(false);
    if (connection) await connection.disconnect().catch(() => undefined);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`/api/channels/${channelId}`)
      .then(async (response) => {
        const data = await response.json() as ChannelApiResult;
        if (!response.ok || !data.channel) throw new Error(data.error ?? "配信情報の取得に失敗しました。");
        if (active) setChannel(data.channel);
      })
      .catch((error: unknown) => { if (active) notify(error instanceof Error ? error.message : "配信情報の取得に失敗しました。", "error"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; void disconnect(); };
  }, [channelId, disconnect]);

  async function connect() {
    if (!channel || channel.isLiveEnd || isConnecting || isConnected) return;
    setIsConnecting(true);
    try {
      const response = await fetch(`/api/channels/${channelId}/sora-token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "recvonly" }) });
      const token = await response.json() as SoraTokenResult;
      if (!response.ok || !token.accessToken || !token.clientId || !token.displayName || !token.imagefluxChannelId || !token.soraUrl) throw new Error(token.error ?? "Sora接続情報の取得に失敗しました。");
      setDisplayName(token.displayName);
      const { default: Sora } = await import("sora-js-sdk");
      const sora = Sora.connection(token.soraUrl, false);
      const connection = sora.recvonly(token.imagefluxChannelId, undefined, { dataChannelSignaling: true, ignoreDisconnectWebSocket: false, clientId: token.clientId, dataChannels: [{ label: CHAT_LABEL, direction: "sendrecv" as DataChannelDirection, ordered: true, maxPacketLifeTime: 5000 }] });
      connection.metadata = { access_token: token.accessToken };
      connection.on("track", (event) => { const stream = event.streams[0]; if (stream && videoRef.current) videoRef.current.srcObject = stream; });
      connection.on("datachannel", (event) => { if (event.datachannel.label === CHAT_LABEL) setIsChatReady(true); });
      connection.on("message", (event) => { if (event.label !== CHAT_LABEL) return; const payload = readChatPayload(event.data); if (!payload) return; setChatMessages((current) => [...current, { ...payload, id: `${payload.sentAt}-${current.length}`, isSelf: false }]); });
      connection.on("disconnect", () => { setIsChatReady(false); setIsConnected(false); });
      connectionRef.current = connection;
      await connection.connect();
      setIsConnected(true);
      notify("視聴を開始しました。", "success");
    } catch (error) { await disconnect(); notify(error instanceof Error ? error.message : "視聴の開始に失敗しました。", "error");
    } finally { setIsConnecting(false); }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatText.trim();
    const connection = connectionRef.current;
    if (!body || !connection || !isChatReady) return;
    const sentAt = new Date().toISOString();
    await connection.sendMessage(CHAT_LABEL, new TextEncoder().encode(JSON.stringify({ type: "chat", sender: displayName, body, sentAt })));
    setChatMessages((current) => [...current, { type: "chat", sender: displayName, body, sentAt, id: `${sentAt}-self`, isSelf: true }]);
    setChatText("");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />

      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeftIcon className="size-4" />
          視聴一覧へ戻る
        </Link>
        <div
          className="inline-flex size-9 items-center justify-center rounded-full bg-white text-gray-400 shadow-xs ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-500 dark:ring-white/10"
          aria-label={isConnected ? "視聴中" : "未接続"}
          title={isConnected ? "視聴中" : "未接続"}
        >
          <SignalIcon className={isConnected ? "size-5 text-emerald-500" : "size-5"} />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p>
      ) : !channel ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">配信が見つかりません。</p>
      ) : channel.streamType === "webrtc_to_hls" ? (
        /* WebRTC の映像を HLS に変換して配信するチャンネル */
        <section className="max-w-5xl overflow-hidden rounded-lg bg-gray-950 shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
          <HlsVideo src={channel.livePlaylistUrls[0] ?? ""} autoPlay />
          <div className="border-t border-white/10 bg-gray-900 px-4 py-3">
            <h1 className="text-lg font-semibold text-white">{channel.name}</h1>
            <p className="mt-1 text-sm text-gray-300">ライブ配信</p>
          </div>
        </section>
      ) : (
        /* WebRTC に直接接続してライブ映像とチャットを表示するチャンネル */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 overflow-hidden rounded-lg bg-gray-950 shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
            <div className="relative aspect-video bg-gray-950">
              <video ref={videoRef} autoPlay playsInline controls className="h-full w-full object-contain" />
              {!isConnected && (
                <div className="absolute inset-0 grid place-items-center bg-gray-950/90 px-6 text-center">
                  <div>
                    <SignalIcon className="mx-auto size-12 text-gray-400" />
                    <h1 className="mt-4 text-xl font-semibold text-white">{channel.name}</h1>
                    <p className="mt-2 text-sm text-gray-300">接続してライブ配信を視聴します。</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-white/10 bg-gray-900 px-4 py-3">
              <button
                type="button"
                onClick={() => void (isConnected ? disconnect().then(() => notify("視聴を終了しました。", "info")) : connect())}
                disabled={isConnecting || (channel.isLiveEnd && !isConnected)}
                className={isConnected ? "inline-flex size-10 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50" : "inline-flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"}
                aria-label={isConnected ? "視聴切断" : "視聴開始"}
                title={isConnected ? "視聴切断" : "視聴開始"}
              >
                {isConnected ? <StopIcon className="size-5" /> : <PlayIcon className="size-5" />}
              </button>
            </div>
          </section>

          <aside className="flex min-h-[520px] flex-col rounded-lg bg-white shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:ring-white/10">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <ChatBubbleLeftRightIcon className="size-5" />
                チャット
              </h2>
              {!isChatReady && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <NoSymbolIcon className="size-4" />
                  未接続
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">チャットがここに表示されます。</p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={message.isSelf ? "ml-8 rounded-lg bg-indigo-600 px-3 py-2 text-white" : "mr-8 rounded-lg bg-gray-100 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100"}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs font-medium opacity-80">
                      <span>{message.sender}</span>
                      <time dateTime={message.sentAt}>{formatChatTime(message.sentAt)}</time>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendChatMessage} className="border-t border-gray-200 p-3 dark:border-white/10">
              <label htmlFor="watch-chat-message" className="sr-only">チャットメッセージ</label>
              <div className="flex gap-2">
                <input
                  id="watch-chat-message"
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  disabled={!isChatReady}
                  maxLength={500}
                  placeholder="メッセージを入力"
                />
                <button
                  type="submit"
                  disabled={!chatText.trim() || !isChatReady}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="送信"
                  title="送信"
                >
                  <PaperAirplaneIcon className="size-5" />
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}