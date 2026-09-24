"use client";

import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  ComputerDesktopIcon,
  NoSymbolIcon,
  PaperAirplaneIcon,
  PauseIcon,
  SignalIcon,
  StopIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
// SoraのJavaScript SDK
import type {
  ConnectionPublisher,
  DataChannelDirection,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  AudioCodecType,
  VideoCodecType,
} from "sora-js-sdk";
import { StatusNotification, type StatusNotificationTone } from "../../_components/status-notification";

type StreamType = "webrtc" | "webrtc_to_hls";

type ChannelDetail = {
  id: number;
  name: string;
  description: string | null;
  streamType: StreamType;
  isRecordingEnabled: boolean;
  isSummaryEnabled: boolean;
  isLiveEnd: boolean;
  imagefluxChannelId: string | null;
  imagefluxSoraUrl: string | null;
  allowedUserIds: number[];
  recordings: Array<{ id: number; filePath: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
};

type ChannelDetailApiResult = {
  channel?: ChannelDetail;
  error?: string;
};

type SoraTokenApiResult = {
  accessToken?: string;
  clientId?: string;
  displayName?: string;
  imagefluxChannelId?: string;
  soraUrl?: string;
  error?: string;
};

type SendonlyConnectionInfo = {
  accessToken: string;
  clientId: string;
  displayName: string;
  imagefluxChannelId: string;
  soraUrl: string;
};

type StreamEndApiResult = {
  ended?: boolean;
  error?: string;
};

type ConnectionStatus = "idle" | "connecting" | "live" | "pausing" | "ending" | "ended";

type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  sentAt: string;
  isSelf: boolean;
};

type ChatPayload = {
  type: "chat";
  sender: string;
  body: string;
  sentAt: string;
};

// チャット用 DataChannel のラベル。
// 送受信・接続判定・送信処理で同じ値を参照するため、タイプミス防止の目的で定数化する。
const CHAT_LABEL = "#chat";

// API のエラー形式をこの画面で統一して扱うための小さなヘルパー。
// 各 fetch ごとに同じ分岐を書かないように切り出している。
function apiErrorMessage(data: { error?: string }, fallback: string) {
  return data.error ?? fallback;
}

// 接続数が変わるイベントかどうかを判定する。
function isConnectionCountEvent(
  event: SignalingNotifyMessage,
): event is SignalingNotifyConnectionCreated | SignalingNotifyConnectionUpdated | SignalingNotifyConnectionDestroyed {
  return event.event_type === "connection.created" || event.event_type === "connection.updated" || event.event_type === "connection.destroyed";
}

// DataChannel で受信したバイナリをチャット形式へ安全に変換する。
function readChatPayload(data: ArrayBuffer): ChatPayload | null {
  try {
    const text = new TextDecoder().decode(data);
    const parsed = JSON.parse(text) as Partial<ChatPayload>;

    // チャットの要件を満たさない場合は無視する。
    if (parsed.type !== "chat" || typeof parsed.sender !== "string" || typeof parsed.body !== "string" || typeof parsed.sentAt !== "string") {
      return null;
    }

    return {
      type: "chat",
      sender: parsed.sender,
      body: parsed.body,
      sentAt: parsed.sentAt,
    };
  } catch {
    return null;
  }
}

function formatChatTime(sentAt: string) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function getVideoConstraints(): MediaTrackConstraints {
  return {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  };
}

type StreamRoomPanelProps = {
  channelId: number;
};

export function StreamRoomPanel({ channelId }: StreamRoomPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const connectionRef = useRef<ConnectionPublisher | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<ConnectionStatus>("idle");
  const displayNameRef = useRef("配信者");

  // コンポーネントの状態管理用のフック群。
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [connectionStatus, setConnectionStatusValue] = useState<ConnectionStatus>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [isChatReady, setIsChatReady] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  // JSX 側の条件式を読みやすくするため、画面状態の派生値を先にまとめて計算する。
  const isConnected = connectionStatus === "live";
  const isBusy = connectionStatus === "connecting" || connectionStatus === "pausing" || connectionStatus === "ending";
  const canStart = Boolean(channel && !channel.isLiveEnd && !isConnected && !isBusy);
  const canPause = isConnected && !isBusy;
  const canEnd = Boolean(channel && !channel.isLiveEnd && connectionStatus !== "ending");
  const canToggleScreenShare = isConnected && !isBusy;
  const connectionStatusLabel = connectionStatus === "live" ? "配信中" : connectionStatus === "ended" ? "終了済み" : isBusy ? "処理中" : "未接続";

  // statusRef と state を同時に更新して、イベント内参照のズレを防ぐための更新関数。
  // 直接 setState すると非同期更新のタイミング差が出るため、意図を固定する目的で切り出している。
  function setConnectionStatus(nextStatus: ConnectionStatus) {
    statusRef.current = nextStatus;
    setConnectionStatusValue(nextStatus);
  }

  function notify(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  // ローカル映像の後始末をまとめた関数。
  // MediaStream 停止と video 要素の srcObject 解除を必ずセットで行うため切り出している。
  const detachLocalStream = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  // Sora 接続の切断とローカル状態の初期化を一括で行う関数。
  // 失敗時の catch、画面離脱、終了時で共通利用するため再利用可能な単位にしている。
  const disconnectSora = useCallback(async () => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    setIsChatReady(false);
    setParticipantCount(0);

    if (connection) {
      await connection.disconnect().catch(() => undefined);
    }
    detachLocalStream();
  }, [detachLocalStream]);

  // 配信詳細の再取得処理。
  // 初回表示と将来の再読込フローで共通利用しやすいように useCallback で関数化している。
  const loadChannel = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`);
      const data = await response.json() as ChannelDetailApiResult;
      if (!response.ok || !data.channel) throw new Error(apiErrorMessage(data, "配信情報の取得に失敗しました。"));
      setChannel(data.channel);
      if (data.channel.isLiveEnd) setConnectionStatus("ended");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信情報の取得に失敗しました。", "error");
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  // マウント直後に配信情報を読み込み、アンマウント時には確実に接続を解放する。
  // useEffect の責務を「開始と終了のライフサイクル管理」に限定するため分離している。
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadChannel();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      void disconnectSora();
    };
  }, [disconnectSora, loadChannel]);

  // サーバ発行トークンを含む sendonly 接続情報を取得する関数。
  // startStreaming の責務を接続シーケンスに集中させるため、API 呼び出しを切り出している。
  async function getSendonlyConnectionInfo(): Promise<SendonlyConnectionInfo> {
    const response = await fetch(`/api/channels/${channelId}/sora-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "sendonly" }),
    });
    const data = await response.json() as SoraTokenApiResult;

    if (!response.ok || !data.accessToken || !data.clientId || !data.displayName || !data.imagefluxChannelId || !data.soraUrl) {
      throw new Error(apiErrorMessage(data, "Sora接続情報の取得に失敗しました。"));
    }

    return {
      accessToken: data.accessToken,
      clientId: data.clientId,
      displayName: data.displayName,
      imagefluxChannelId: data.imagefluxChannelId,
      soraUrl: data.soraUrl,
    };
  }

  // 取得する映像・音声デバイス設定を1か所に寄せた関数。
  // 解像度や FPS 調整を後から変更しやすくするため、getUserMedia 呼び出しを分離している。
  async function createInputStream() {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: getVideoConstraints(),
    });
  }

  async function startScreenShare() {
    const connection = connectionRef.current;
    const stream = mediaStreamRef.current;
    if (!canToggleScreenShare || !connection || !stream || isScreenSharing) return;

    let screenStream: MediaStream | null = null;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("共有する画面映像を取得できませんでした。");
      screenTrack.onended = () => {
        void stopScreenShare();
      };
      screenStreamRef.current = screenStream;
      await connection.replaceVideoTrack(stream, screenTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setIsScreenSharing(true);
      notify("画面共有を開始しました。", "success");
    } catch (caught) {
      screenStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      if (screenStreamRef.current === screenStream) screenStreamRef.current = null;
      notify(caught instanceof Error ? caught.message : "画面共有の開始に失敗しました。", "error");
    }
  }

  async function stopScreenShare() {
    const connection = connectionRef.current;
    const stream = mediaStreamRef.current;
    const screenStream = screenStreamRef.current;
    if (!screenStream && !isScreenSharing) return;

    screenStream?.getTracks().forEach((track) => {
      track.onended = null;
    });

    let cameraStream: MediaStream | null = null;
    try {
      if (!connection || !stream) throw new Error("Sora接続が見つかりません。");
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: getVideoConstraints(), audio: false });
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("カメラ映像を取得できませんでした。");
      await connection.replaceVideoTrack(stream, cameraTrack);
      screenStream?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setIsScreenSharing(false);
      notify("画面共有を停止しました。", "success");
    } catch (caught) {
      cameraStream?.getTracks().forEach((track) => track.stop());
      notify(caught instanceof Error ? caught.message : "画面共有の停止に失敗しました。", "error");
    }
  }

  // 配信開始のオーケストレーション本体。
  // 事前情報取得、デバイス取得、Sora 接続、各イベント購読を1つの操作としてまとめている。
  async function startStreaming() {
    if (!canStart) return;
    setConnectionStatus("connecting");
    try {
      const connectionInfo = await getSendonlyConnectionInfo();
      displayNameRef.current = connectionInfo.displayName;
      const stream = await createInputStream();
      mediaStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const { default: Sora } = await import("sora-js-sdk");
      // 第2引数はデバッグログ有効化フラグ。通常運用では false 固定。
      const sora = Sora.connection(connectionInfo.soraUrl, false);
      const connection = sora.sendonly(connectionInfo.imagefluxChannelId, undefined, {
        audio: true,
        audioCodecType: "OPUS" as AudioCodecType,
        video: true,
        videoCodecType: "VP9" as VideoCodecType,
        clientId: connectionInfo.clientId,
        dataChannelSignaling: true,
        ignoreDisconnectWebSocket: false,
        // ここは権限情報ではなく通知表示向けの補助情報。
        // 正本メタデータはサーバ Webhook 側で付与する設計にしている。
        signalingNotifyMetadata: {
          display_name: connectionInfo.displayName,
        },
        dataChannels: [
          {
            label: CHAT_LABEL,
            direction: "sendrecv" as DataChannelDirection,
            ordered: true,
            maxPacketLifeTime: 5000,
          },
        ],
      });
      // 認証トークンは metadata 経由で渡し、サーバ Webhook 側で検証する。
      connection.metadata = {
        access_token: connectionInfo.accessToken,
      };
      // Sora の接続数通知をそのまま表示し、connected/notify 間の表示誤差を避ける。
      connection.on("connected", (event) => {
        setParticipantCount(Math.max(0, event.channel_connections));
      });
      // notify は入退室などの都度イベント。接続数の追従更新に使う。
      connection.on("notify", (event) => {
        if (isConnectionCountEvent(event)) {
          setParticipantCount(Math.max(0, event.channel_connections));
        }
      });
      // チャット用 DataChannel が利用可能になったタイミングで送信を解禁する。
      connection.on("datachannel", (event) => {
        if (event.datachannel.label === CHAT_LABEL) setIsChatReady(true);
      });
      // 受信メッセージを画面表示用の ChatMessage に変換して追加する。
      connection.on("message", (event) => {
        if (event.label !== CHAT_LABEL) return;
        const payload = readChatPayload(event.data);
        if (!payload) return;
        setChatMessages((current) => [
          ...current,
          { id: `${payload.sentAt}-${current.length}`, sender: payload.sender, body: payload.body, sentAt: payload.sentAt, isSelf: false },
        ]);
      });
      // 切断時は状態を戻し、UI が「配信中」のまま残らないようにする。
      connection.on("disconnect", (event) => {
        setIsChatReady(false);
        setParticipantCount(0);
        if (statusRef.current === "live") {
          notify(event.reason ? `Sora接続が切断されました: ${event.reason}` : "Sora接続が切断されました。", "info");
          setConnectionStatus("idle");
        }
      });

      connectionRef.current = connection;
      await connection.connect(stream);
      setConnectionStatus("live");
      notify("配信を開始しました。", "success");
    } catch (caught) {
      await disconnectSora();
      setConnectionStatus("idle");
      notify(caught instanceof Error ? caught.message : "配信開始に失敗しました。", "error");
    }
  }

  // 一時停止は「切断 + 待機状態へ戻す」の操作として扱う。
  // start/end と分けることでボタン操作の意図を明確にするため関数を分離している。
  async function pauseStreaming() {
    if (!canPause) return;
    setConnectionStatus("pausing");
    await disconnectSora();
    setConnectionStatus("idle");
    notify("配信を一時停止しました。", "success");
  }

  // 配信終了は確認ダイアログ付きの破壊的操作。
  // 切断後に終了 API を呼び、成功時は再開不可の状態を UI に反映する。
  async function endStreaming() {
    if (!canEnd || !window.confirm("配信を終了しますか？　再配信はできません。")) return;
    setConnectionStatus("ending");
    try {
      await disconnectSora();
      const response = await fetch(`/api/channels/${channelId}/end`, { method: "POST" });
      const data = await response.json() as StreamEndApiResult;
      if (!response.ok || !data.ended) throw new Error(apiErrorMessage(data, "配信終了に失敗しました。"));
      setChannel((current) => current ? { ...current, isLiveEnd: true, imagefluxChannelId: null, imagefluxSoraUrl: null } : current);
      setConnectionStatus("ended");
      notify("配信を終了しました。", "success");
    } catch (caught) {
      setConnectionStatus("idle");
      notify(caught instanceof Error ? caught.message : "配信終了に失敗しました。", "error");
    }
  }

  // チャット送信処理。
  // submit イベントから入力検証・ペイロード生成・送信・自己メッセージ表示までを1単位にまとめる。
  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatText.trim();
    const connection = connectionRef.current;
    if (!body || !connection || !isChatReady) return;

    const sentAt = new Date().toISOString();
    const sender = displayNameRef.current;
    const payload: ChatPayload = { type: "chat", sender, body, sentAt };
    await connection.sendMessage(CHAT_LABEL, new TextEncoder().encode(JSON.stringify(payload)));
    setChatMessages((current) => [...current, { id: `${sentAt}-self`, sender, body, sentAt, isSelf: true }]);
    setChatText("");
  }

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />
    <div className="mb-6 flex items-center justify-between">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
      <ArrowLeftIcon className="size-4" />配信一覧へ戻る</Link>
      <div className="inline-flex size-9 items-center justify-center rounded-full bg-white text-gray-400 shadow-xs ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-500 dark:ring-white/10" aria-label={connectionStatusLabel} title={connectionStatusLabel}>
        <SignalIcon className={isConnected ? "size-5 text-emerald-500" : "size-5"} />
      </div>
    </div>

    {isLoading ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : !channel ? <p className="text-sm text-gray-600 dark:text-gray-400">配信が見つかりません。</p> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 overflow-hidden rounded-lg bg-gray-950 shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
        <div className="relative aspect-video bg-gray-950">
          <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
          {!isConnected && <div className="absolute inset-0 grid place-items-center bg-gray-950/90 px-6 text-center">
            <div>
              <VideoPlaceholderIcon />
              <h1 className="mt-4 text-xl font-semibold text-white">{channel.name}</h1>
              <p className="mt-2 text-sm text-gray-300">カメラとマイクを接続して配信を開始します。</p>
            </div>
          </div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-gray-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-300"><UserGroupIcon className="size-4" />接続数 {participantCount}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void startStreaming()} disabled={!canStart} className="inline-flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label="配信開始" title="配信開始"><SignalIcon className="size-5" /></button>
            <button type="button" onClick={() => void (isScreenSharing ? stopScreenShare() : startScreenShare())} disabled={!canToggleScreenShare} className="inline-flex size-10 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label={isScreenSharing ? "画面共有停止" : "画面共有"} title={isScreenSharing ? "画面共有停止" : "画面共有"}><ComputerDesktopIcon className="size-5" /></button>
            <button type="button" onClick={() => void pauseStreaming()} disabled={!canPause} className="inline-flex size-10 items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label="一時停止" title="一時停止"><PauseIcon className="size-5" /></button>
            <button type="button" onClick={() => void endStreaming()} disabled={!canEnd} className="inline-flex size-10 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label="配信終了" title="配信終了"><StopIcon className="size-5" /></button>
          </div>
        </div>
      </section>

      <aside className="flex min-h-[520px] flex-col rounded-lg bg-white shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:ring-white/10">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <ChatBubbleLeftRightIcon className="size-5" />
            チャット
          </h2>
          {!isChatReady && <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <NoSymbolIcon className="size-4" />
            未接続
            </span>
          }
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {chatMessages.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">チャットがここに表示されます。</p> : chatMessages.map((message) => <div key={message.id} className={message.isSelf ? "ml-8 rounded-lg bg-indigo-600 px-3 py-2 text-white" : "mr-8 rounded-lg bg-gray-100 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100"}>
            <div className="flex items-center justify-between gap-3 text-xs font-medium opacity-80"><span>{message.sender}</span><time dateTime={message.sentAt}>{formatChatTime(message.sentAt)}</time></div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</div>
          </div>)}
        </div>
        <form onSubmit={sendChatMessage} className="border-t border-gray-200 p-3 dark:border-white/10">
          <label htmlFor="chat-message" className="sr-only">チャットメッセージ</label>
          <div className="flex gap-2">
            <input id="chat-message" value={chatText} onChange={(event) => setChatText(event.target.value)} disabled={!isChatReady} maxLength={500} placeholder="メッセージを入力" />
            <button type="submit" disabled={!chatText.trim() || !isChatReady} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label="送信" title="送信"><PaperAirplaneIcon className="size-5" /></button>
          </div>
        </form>
      </aside>
    </div>}
  </main>;
}

// プレースホルダー表示を独立した小コンポーネントにして、メイン JSX の見通しを保つ。
function VideoPlaceholderIcon() {
  return <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-white">
    <SignalIcon className="size-8" />
  </div>;
}
