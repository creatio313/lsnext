"use client";

import { ArrowLeftIcon, FilmIcon, TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toJstString } from "@/lib/date-time";

type Recording = {
  id: number;
  resolution: { width: number; height: number } | null;
  createdAt: string;
};
type Result = { channel?: { name: string; isOwner: boolean; recordings: Recording[] }; error?: string };

export function RecordingListPanel({ channelId }: { channelId: number }) {
  const [result, setResult] = useState<Result>();
  const [deletingRecordingId, setDeletingRecordingId] = useState<number | null>(null);
  useEffect(() => {
    void fetch(`/api/channels/${channelId}`).then(async (response) =>
      setResult(await response.json() as Result),
    );
  }, [channelId]);

  const channel = result?.channel;

  async function deleteRecording(recording: Recording) {
    if (!window.confirm("この録画を削除しますか？")) return;
    setDeletingRecordingId(recording.id);
    try {
      const response = await fetch(`/api/channels/${channelId}/recordings/${recording.id}`, { method: "DELETE" });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "録画削除に失敗しました。");
      setResult((current) => current?.channel ? {
        ...current,
        channel: {
          ...current.channel,
          recordings: current.channel.recordings.filter((item) => item.id !== recording.id),
        },
      } : current);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "録画削除に失敗しました。");
    } finally {
      setDeletingRecordingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-4" />
        視聴一覧へ戻る
      </Link>

      {/* データ取得前は読み込み中の表示にする。 */}
      {!result ? (
        <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
          読み込み中...
        </p>
      ) : result.error || !channel ? (
        /* APIエラーまたはチャンネル未取得時はエラーを表示する。 */
        <p className="mt-8 text-sm text-red-600 dark:text-red-400">
          {result.error ?? "録画が見つかりません。"}
        </p>
      ) : (
        /* チャンネル取得後は録画一覧を表示する。 */
        <section className="mt-8">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {channel.name}の録画
          </h1>
          {channel.recordings.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">録画がありません。</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th scope="col">録画日時</th>
                    <th scope="col">解像度</th>
                    {channel.isOwner && <th scope="col"><span className="sr-only">操作</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {channel.recordings.map((recording) => (
                    <tr key={recording.id}>
                      <td>
                        <Link
                          href={`/dashboard/channels/${channelId}/recordings/${recording.id}`}
                          className="inline-flex items-center gap-3 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                        >
                          <FilmIcon className="size-5 shrink-0" />
                          {toJstString(recording.createdAt)}
                        </Link>
                      </td>
                      <td>{recording.resolution ? `${recording.resolution.width} × ${recording.resolution.height}` : "-"}</td>
                      {channel.isOwner && (
                        <td className="py-4 pr-4 pl-3 text-right sm:pr-0">
                          <button
                            type="button"
                            onClick={() => void deleteRecording(recording)}
                            disabled={deletingRecordingId === recording.id}
                            className="inline-flex text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                            aria-label={`${toJstString(recording.createdAt)}の録画を削除`}
                            title="削除"
                          >
                            <TrashIcon className="size-5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}