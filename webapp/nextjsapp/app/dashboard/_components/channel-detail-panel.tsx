"use client";

import { Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import { ArrowLeftIcon, SignalIcon, TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AllowedUsersInput, ToggleSwitch, type UserOption } from "./form-controls";
import { StatusNotification, type StatusNotificationTone } from "../../_components/status-notification";
import { toJstString } from "@/lib/date-time";

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
  createdAt: string;
  updatedAt: string;
};

type ChannelDetailApiResult = {
  channel?: ChannelDetail;
  updated?: boolean;
  deleted?: boolean;
  error?: string;
};

type TransferChannelApiResult = {
  transferred?: boolean;
  error?: string;
};

type UserListApiResult = {
  users?: UserOption[];
  error?: string;
};

// 配信方式のラベル
const STREAM_TYPE_LABELS: Record<StreamType, string> = {
  webrtc: "小規模超低遅延配信",
  webrtc_to_hls: "大規模配信",
};

function apiErrorMessage(data: { error?: string }, fallback: string) {
  return data.error ?? fallback;
}

type ChannelDetailPanelProps = {
  channelId: number;
};

export function ChannelDetailPanel({ channelId }: ChannelDetailPanelProps) {
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  // 編集値
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSummaryEnabled, setIsSummaryEnabled] = useState(false);
  const [allowedUserIds, setAllowedUserIds] = useState<number[]>([]);
  const [newOwner, setNewOwner] = useState<UserOption | null>(null);
  // 画面制御用
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // ステータス通知
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  function notify(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  function applyChannel(nextChannel: ChannelDetail) {
    setChannel(nextChannel);
    setName(nextChannel.name);
    setDescription(nextChannel.description ?? "");
    setIsSummaryEnabled(nextChannel.isRecordingEnabled ? nextChannel.isSummaryEnabled : false);
    setAllowedUserIds(nextChannel.allowedUserIds);
  }

  // 要約の有効化状態を変更する
  function changeSummaryEnabled(nextIsSummaryEnabled: boolean) {
    if (!channel?.isRecordingEnabled) {
      setIsSummaryEnabled(false);
      return;
    }

    setIsSummaryEnabled(nextIsSummaryEnabled);
  }

  useEffect(() => {
    let isActive = true;

    async function load() {
      setIsLoading(true);
      try {
        const [channelResponse, usersResponse] = await Promise.all([
          fetch(`/api/channels/${channelId}`),
          fetch("/api/users"),
        ]);
        const channelData = await channelResponse.json() as ChannelDetailApiResult;
        const usersData = await usersResponse.json() as UserListApiResult;

        if (!channelResponse.ok || !channelData.channel) {
          throw new Error(apiErrorMessage(channelData, "配信詳細の取得に失敗しました。"));
        }

        if (!usersResponse.ok || !usersData.users) {
          throw new Error(apiErrorMessage(usersData, "利用者候補一覧の取得に失敗しました。"));
        }

        if (!isActive) return;
        applyChannel(channelData.channel);
        setUsers(usersData.users);
      } catch (caught) {
        if (!isActive) return;
        notify(caught instanceof Error ? caught.message : "配信詳細の取得に失敗しました。", "error");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void load();

    return () => { isActive = false; };
  }, [channelId]);

  async function submitChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newOwner && !window.confirm(`配信情報を更新した後、配信「${channel?.name ?? name}」の所有権を ${newOwner.displayName}（@${newOwner.loginId}）へ譲渡します。譲渡後はこの配信を管理できません。よろしいですか？`)) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isSummaryEnabled: channel?.isRecordingEnabled ? isSummaryEnabled : false, allowedUserIds }),
      });
      const data = await response.json() as ChannelDetailApiResult;
      if (!response.ok || !data.updated || !data.channel) throw new Error(apiErrorMessage(data, "配信更新に失敗しました。"));
      applyChannel(data.channel);

      if (newOwner) {
        const transferResponse = await fetch(`/api/channels/${channelId}/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newOwnerId: newOwner.id }),
        });
        const transferData = await transferResponse.json() as TransferChannelApiResult;
        if (!transferResponse.ok || !transferData.transferred) {
          notify(`配信情報は更新しましたが、所有権を譲渡できませんでした。${apiErrorMessage(transferData, "もう一度お試しください。")}`, "error");
          return;
        }

        router.replace("/dashboard");
        router.refresh();
        return;
      }

      notify("配信を更新しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信更新に失敗しました。", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteChannel() {
    if (!channel || !window.confirm(`配信「${channel.name}」を削除しますか？ImageFlux Live Streamingのチャンネルも削除されます。`)) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
      const data = await response.json() as ChannelDetailApiResult;
      if (!response.ok || !data.deleted) throw new Error(apiErrorMessage(data, "配信削除に失敗しました。"));
      router.push("/dashboard");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信削除に失敗しました。", "error");
      setIsDeleting(false);
    }
  }

  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />
    <div className="mb-8 flex items-center justify-between gap-4">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />配信一覧へ戻る</Link>
      {channel && <button type="button" onClick={() => void deleteChannel()} disabled={isDeleting || isSubmitting} className="inline-flex text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400" aria-label={`${channel.name} を削除`} title="削除"><TrashIcon className="size-5" /></button>}
    </div>

    {isLoading ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : !channel ? <p className="text-sm text-gray-600 dark:text-gray-400">配信が見つかりません。</p> : <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
      <div>
        <h1 className="text-base/7 font-semibold text-gray-900 dark:text-white">配信詳細</h1>
        <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">配信情報と視聴可能な利用者を編集します。</p>
        <div className="mt-6 border-t border-gray-100 dark:border-white/10">
            <dl className="divide-y divide-gray-100 dark:divide-white/10">
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                    <dt className="text-sm/6 font-medium text-gray-900 dark:text-gray-100">配信方式</dt>
                    <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400">{STREAM_TYPE_LABELS[channel.streamType]}</dd>
                </div>
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                    <dt className="text-sm/6 font-medium text-gray-900 dark:text-gray-100">録画</dt>
                    <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400">{channel.isRecordingEnabled ? "有効" : "無効"}</dd>
                </div>
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                    <dt className="text-sm/6 font-medium text-gray-900 dark:text-gray-100">配信可否</dt>
                    <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400">{channel.isLiveEnd ? "不可" : "可"}</dd>
                </div>
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                    <dt className="text-sm/6 font-medium text-gray-900 dark:text-gray-100">作成日時</dt>
                    <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400">{toJstString(channel.createdAt)}</dd>
                </div>
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                    <dt className="text-sm/6 font-medium text-gray-900 dark:text-gray-100">チャンネルID</dt>
                    <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400 break-all">{channel.imagefluxChannelId ?? "-"}</dd>
                </div>
            </dl>
        </div>
      </div>
      <form className="md:col-span-2" onSubmit={submitChannel}>
        <div className="space-y-6 sm:max-w-3xl">
            <div>
                <div className="flex items-center gap-3">
                    <label htmlFor="detail-channel-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">チャンネル名称</label>
                    {!channel.isLiveEnd && <Link href={`/dashboard/channels/${channel.id}/stream`} className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${channel.name} の配信画面`} title="配信画面"><SignalIcon className="size-5" /></Link>}</div><input id="detail-channel-name" required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} className="mt-2" />
                </div>
            <div>
            <label htmlFor="detail-channel-description" className="block text-sm/6 font-medium text-gray-900 dark:text-white">説明</label>
            <textarea id="detail-channel-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2" /></div>
            <ToggleSwitch id="detail-channel-summary" label="要約" checked={isSummaryEnabled} disabled={!channel.isRecordingEnabled} onChange={changeSummaryEnabled} />
            {!channel.isRecordingEnabled && <p className="text-sm text-gray-500 dark:text-gray-400">録画を有効にした配信のみ要約を有効にできます。</p>}
            <AllowedUsersInput id="detail-channel-allowed-users" label="視聴可能な利用者" users={users} selectedUserIds={allowedUserIds} isLoading={isLoading} onChange={setAllowedUserIds} />
            <div className="border-t border-gray-200 pt-6 dark:border-white/10">
              <Listbox value={newOwner} onChange={setNewOwner} disabled={isSubmitting || isDeleting || users.length === 0}>
                <Label className="block text-sm/6 font-medium text-gray-900 dark:text-white">新しい所有者</Label>
                <div className="relative mt-2">
                  <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus-visible:outline-indigo-500">
                    <span className="col-start-1 row-start-1 flex min-w-0 gap-2 pr-6">
                      {newOwner ? <>
                        <span className="truncate">{newOwner.displayName}</span>
                        <span className="truncate text-gray-500 dark:text-gray-400">@{newOwner.loginId}</span>
                      </> : <span className="text-gray-500 dark:text-gray-400">譲渡しない</span>}
                    </span>
                    <ChevronUpDownIcon aria-hidden="true" className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400" />
                  </ListboxButton>
                  <ListboxOptions transition className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 outline-black/5 data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
                    <ListboxOption value={null} className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden dark:text-white dark:data-focus:bg-indigo-500">
                      <span className="block truncate font-normal group-data-selected:font-semibold">譲渡しない</span>
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-not-data-selected:hidden group-data-focus:text-white dark:text-indigo-400"><CheckIcon aria-hidden="true" className="size-5" /></span>
                    </ListboxOption>
                    {users.map((user) => <ListboxOption key={user.id} value={user} className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden dark:text-white dark:data-focus:bg-indigo-500">
                      <div className="flex min-w-0 gap-2">
                        <span className="truncate font-normal group-data-selected:font-semibold">{user.displayName}</span>
                        <span className="truncate text-gray-500 group-data-focus:text-indigo-200 dark:text-gray-400 dark:group-data-focus:text-indigo-100">@{user.loginId}</span>
                      </div>
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-not-data-selected:hidden group-data-focus:text-white dark:text-indigo-400"><CheckIcon aria-hidden="true" className="size-5" /></span>
                    </ListboxOption>)}
                  </ListboxOptions>
                </div>
              </Listbox>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">譲渡後、この配信は管理できません。</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-white/10">
                <Link href="/dashboard" className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">キャンセル</Link>
                <button type="submit" disabled={isSubmitting || isDeleting} className="inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-60">{isSubmitting ? "保存中..." : "保存"}</button>
            </div>
        </div>
      </form>
    </div>}
  </main>;
}