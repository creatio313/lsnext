"use client";

import { ArrowPathIcon, FilmIcon, PlayIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toJstString } from "@/lib/date-time";
import { StatusNotification, type StatusNotificationTone } from "../../_components/status-notification";

type StreamType = "webrtc" | "webrtc_to_hls";

type WatchChannel = {
  id: number;
  name: string;
  streamType: StreamType;
  createdAt: string;
  isLiveEnd: boolean;
  livePlaylistUrls: string[];
  recordings: Array<{ id: number; filePath: string; createdAt: string }>;
};

type ChannelListApiResult = {
  channels?: WatchChannel[];
  error?: string;
};

function apiErrorMessage(data: ChannelListApiResult, fallback: string) {
  return data.error ?? fallback;
}

function canWatchLive(channel: WatchChannel) {
  return (
    !channel.isLiveEnd &&
    (channel.streamType === "webrtc" || (channel.streamType === "webrtc_to_hls" && channel.livePlaylistUrls.length > 0))
  );
}

export function WatchPanel() {
  const [channels, setChannels] = useState<WatchChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  function notify(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  const loadChannels = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    try {
      const response = await fetch("/api/channels?scope=watch");
      const data = await response.json() as ChannelListApiResult;
      if (!response.ok || !data.channels) {
        throw new Error(apiErrorMessage(data, "視聴可能な配信一覧の取得に失敗しました。"));
      }
      setChannels(data.channels);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "視聴可能な配信一覧の取得に失敗しました。", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadChannels();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadChannels]);

  return (
    <>
      <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />
      <section className="max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void loadChannels()}
            disabled={isLoading}
            className="inline-flex size-9 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:text-white"
            aria-label="視聴可能な配信一覧を再読み込み"
            title="再読み込み"
          >
            <ArrowPathIcon className={`size-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-8 overflow-x-auto">
          {isLoading && channels.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : channels.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">視聴可能な配信がありません。</p> :
            <table>
              <thead><tr><th scope="col">チャンネル名称</th><th scope="col"><span className="sr-only">ライブ視聴</span></th><th scope="col"><span className="sr-only">録画視聴</span></th><th scope="col">作成日時</th></tr></thead>
              <tbody>{channels.map((channel) => <tr key={channel.id}>
                <td>{channel.name}</td>
                <td>{canWatchLive(channel) && <Link href={`/dashboard/channels/${channel.id}/watch`} className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${channel.name} のライブ視聴ページ`} title="ライブ視聴"><PlayIcon className="size-5" /></Link>}</td>
                <td>{channel.recordings.length > 0 && <Link href={`/dashboard/channels/${channel.id}/recordings`} className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${channel.name} の録画ページ`} title="録画視聴"><FilmIcon className="size-5" /></Link>}</td>
                <td>{toJstString(channel.createdAt)}</td>
              </tr>)}</tbody>
            </table>}
        </div>
      </section>
    </>
  );
}
