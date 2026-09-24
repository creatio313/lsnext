"use client";

import { ArrowLeftIcon, DocumentTextIcon, FilmIcon, TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HlsVideo } from "./hls-video";

type RecordingResult = { recording?: { url: string; createdAt: string; isOwner: boolean; isSummaryEnabled: boolean; summaryText: string | null }; error?: string };

export function RecordingWatchPanel({ channelId, recordingId }: { channelId: number; recordingId: number }) {
  const [recording, setRecording] = useState<RecordingResult["recording"]>();
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void fetch(`/api/channels/${channelId}/recordings/${recordingId}`)
      .then(async (response) => {
        const data = await response.json() as RecordingResult;
        // HTTPエラーまたは録画情報がない場合は再生処理を中断する。
        if (!response.ok || !data.recording) throw new Error(data.error ?? "録画の取得に失敗しました。");
        setRecording(data.recording);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "録画の取得に失敗しました。"));
  }, [channelId, recordingId]);

  async function deleteRecording() {
    if (!recording || !window.confirm("この録画を削除しますか？")) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/channels/${channelId}/recordings/${recordingId}`, { method: "DELETE" });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "録画削除に失敗しました。");
      window.location.href = `/dashboard/channels/${channelId}/recordings`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "録画削除に失敗しました。");
      setIsDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={`/dashboard/channels/${channelId}/recordings`}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-4" />
        録画一覧へ戻る
      </Link>

      {/* 録画取得に失敗した場合はエラーを優先して表示する。 */}
      {error ? (
        <p className="mt-8 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : !recording ? (
        /* 取得中は再生領域の代わりに読み込み状態を表示する。 */
        <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
          読み込み中...
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 overflow-hidden rounded-lg bg-gray-950 shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
            <HlsVideo src={recording.url} autoPlay />
            <div className="flex items-center gap-2 border-t border-white/10 bg-gray-900 px-4 py-3 text-sm text-white">
              <FilmIcon className="size-5" />
              <span>録画視聴</span>
              {recording.isOwner && (
                <button type="button" onClick={() => void deleteRecording()} disabled={isDeleting} className="ml-auto inline-flex text-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50" aria-label="録画を削除" title="削除">
                  <TrashIcon className="size-5" />
                </button>
              )}
            </div>
          </section>

          <aside className="flex min-h-[520px] flex-col rounded-lg bg-white shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:ring-white/10">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-white/10">
              <DocumentTextIcon className="size-5 text-gray-500 dark:text-gray-400" />
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">AI要約</h1>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {recording.isSummaryEnabled && recording.summaryText?.trim() ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-200">{recording.summaryText}</p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">この録画の要約はありません。</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}