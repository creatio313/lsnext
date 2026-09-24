"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowPathIcon,
  FilmIcon,
  PlusIcon,
  SignalIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AllowedUsersInput, SelectField, ToggleSwitch, type UserOption } from "./form-controls";
import { StatusNotification, type StatusNotificationTone } from "../../_components/status-notification";
import { toJstString } from "@/lib/date-time";

type StreamType = "webrtc" | "webrtc_to_hls";

type ChannelSummary = {
  id: number;
  name: string;
  description: string | null;
  streamType: StreamType;
  isRecordingEnabled: boolean;
  isSummaryEnabled: boolean;
  isLiveEnd: boolean;
  imagefluxChannelId: string | null;
  imagefluxSoraUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArchiveDestinationSummary = {
  archive_destination_id: string;
  bucket_uri: string;
};

// 配信一覧取得APIの応答
type ChannelListApiResult = {
  channels?: ChannelSummary[];
  error?: string;
};

// 配信追加APIの応答
type ChannelCreateApiResult = {
  created?: boolean;
  channel?: ChannelSummary;
  error?: string;
};

// 録画保存先一覧取得APIの応答
type ArchiveDestinationListApiResult = {
  destinations?: ArchiveDestinationSummary[];
  error?: string;
};

// 利用者候補一覧取得APIの応答
type UserListApiResult = {
  users?: UserOption[];
  error?: string;
};

type HlsSetting = {
  id: number;
  videoWidth: string;
  videoHeight: string;
  videoFps: string;
  videoBps: string;
  audioBps: string;
};

// ImageFlux Live Streamingで利用可能な音声ビットレートの一覧
const IMAGEFLUX_LS_AUDIO_BPS = [
  32000,
  40000,
  48000,
  56000,
  64000,
  80000,
  96000,
  112000,
  128000,
  160000,
  192000,
  224000,
  256000,
  320000,
] as const;

// 配信方式のラベル
const STREAM_TYPE_LABELS: Record<StreamType, string> = {
  webrtc: "小規模超低遅延配信",
  webrtc_to_hls: "大規模配信",
};

function apiErrorMessage(data: { error?: string }, fallback: string) {
  return data.error ?? fallback;
}

function readArchiveDestinations(data: ArchiveDestinationListApiResult) {
  if (!Array.isArray(data.destinations) || !data.destinations.every((destination) => destination.archive_destination_id && destination.bucket_uri)) {
    throw new Error("録画保存先一覧の応答形式が正しくありません。");
  }

  return data.destinations;
}

export function StreamingPanel() {
  // 表示用一覧
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [archiveDestinations, setArchiveDestinations] = useState<ArchiveDestinationSummary[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  // 画面制御用
  const [isLoading, setIsLoading] = useState(false);
  const [isArchiveDestinationsLoading, setIsArchiveDestinationsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [busyChannelId, setBusyChannelId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 配信作成用入力値
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [streamType, setStreamType] = useState<StreamType>("webrtc");
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isSummaryEnabled, setIsSummaryEnabled] = useState(false);
  const [hlsSettings, setHlsSettings] = useState<HlsSetting[]>([
    { id: 1, videoWidth: "1920", videoHeight: "1080", videoFps: "30", videoBps: "6000000", audioBps: "128000" },
  ]);
  const [archiveDestinationId, setArchiveDestinationId] = useState("");
  const [allowedUserIds, setAllowedUserIds] = useState<number[]>([]);
  // ステータス通知用
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  // to HLS有効時または録画有効時にHLS設定を要にする。
  const needsHlsSettings = streamType === "webrtc_to_hls" || isRecordingEnabled;
  // 録画有効時に録画保存先を要にする。
  const needsArchiveDestination = isRecordingEnabled && needsHlsSettings;
  // 録画有効時に要約を有効にできる。
  const canEnableSummary = isRecordingEnabled;

  const selectedArchiveDestinationId = useMemo(() => {
    if (!needsArchiveDestination) return "";
    if (archiveDestinationId) return archiveDestinationId;
    return archiveDestinations[0]?.archive_destination_id ?? "";
  }, [archiveDestinationId, archiveDestinations, needsArchiveDestination]);

  function notify(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  function changeStreamType(nextStreamType: StreamType) {
    setStreamType(nextStreamType);
    if (!isRecordingEnabled) {
      setIsSummaryEnabled(false);
    }
  }

  function changeRecordingEnabled(nextIsRecordingEnabled: boolean) {
    setIsRecordingEnabled(nextIsRecordingEnabled);
    if (!nextIsRecordingEnabled) {
      setIsSummaryEnabled(false);
    }
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setName("");
    setDescription("");
    setStreamType("webrtc");
    setIsRecordingEnabled(false);
    setIsSummaryEnabled(false);
    setHlsSettings([{ id: 1, videoWidth: "1920", videoHeight: "1080", videoFps: "30", videoBps: "6000000", audioBps: "128000" }]);
    setArchiveDestinationId("");
    setAllowedUserIds([]);
  }

  function addHlsSetting() {
    setHlsSettings((current) => [
      ...current,
      { id: Date.now(), videoWidth: "1280", videoHeight: "720", videoFps: "30", videoBps: "4000000", audioBps: "128000" },
    ]);
  }

  function removeHlsSetting(settingId: number) {
    setHlsSettings((current) => current.length <= 1 ? current : current.filter((setting) => setting.id !== settingId));
  }

  function updateHlsSetting(settingId: number, key: keyof Omit<HlsSetting, "id">, value: string) {
    setHlsSettings((current) => current.map((setting) => setting.id === settingId ? { ...setting, [key]: value } : setting));
  }

  const loadChannels = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    try {
      const response = await fetch("/api/channels");
      const data = await response.json() as ChannelListApiResult;
      if (!response.ok || !data.channels) throw new Error(apiErrorMessage(data, "配信一覧の取得に失敗しました。"));
      setChannels(data.channels);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信一覧の取得に失敗しました。", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadArchiveDestinations = useCallback(async () => {
    await Promise.resolve();
    setIsArchiveDestinationsLoading(true);
    try {
      const response = await fetch("/api/archive-destinations");
      const data = await response.json() as ArchiveDestinationListApiResult;
      if (!response.ok) throw new Error(apiErrorMessage(data, "録画保存先一覧の取得に失敗しました。"));
      const destinations = readArchiveDestinations(data);
      setArchiveDestinations(destinations);
      setArchiveDestinationId((current) => current || destinations[0]?.archive_destination_id || "");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "録画保存先一覧の取得に失敗しました。", "error");
    } finally {
      setIsArchiveDestinationsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    await Promise.resolve();
    setIsUsersLoading(true);
    try {
      const response = await fetch("/api/users");
      const data = await response.json() as UserListApiResult;
      if (!response.ok || !data.users) throw new Error(apiErrorMessage(data, "利用者候補一覧の取得に失敗しました。"));
      setUsers(data.users);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "利用者候補一覧の取得に失敗しました。", "error");
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch("/api/channels")
      .then(async (response) => {
        const data = await response.json() as ChannelListApiResult;
        if (!response.ok || !data.channels) {
          throw new Error(apiErrorMessage(data, "配信一覧の取得に失敗しました。"));
        }
        if (isActive) setChannels(data.channels);
      })
      .catch((caught: unknown) => {
        if (!isActive) return;
        notify(caught instanceof Error ? caught.message : "配信一覧の取得に失敗しました。", "error");
      });

    return () => { isActive = false; };
  }, []);

  function openCreateModal() {
    setIsCreateModalOpen(true);
    if (users.length === 0) {
      void loadUsers();
    }
    if (archiveDestinations.length === 0) {
      void loadArchiveDestinations();
    }
  }

  async function submitChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          streamType,
          isRecordingEnabled,
          isSummaryEnabled: canEnableSummary ? isSummaryEnabled : false,
          allowedUserIds,
          hlsSettings: needsHlsSettings ? hlsSettings.map((setting) => ({
            videoWidth: Number(setting.videoWidth),
            videoHeight: Number(setting.videoHeight),
            videoFps: Number(setting.videoFps),
            videoBps: Number(setting.videoBps),
            audioBps: Number(setting.audioBps),
          })) : undefined,
          archiveDestinationId: needsArchiveDestination ? selectedArchiveDestinationId : undefined,
        }),
      });
      const data = await response.json() as ChannelCreateApiResult;
      if (!response.ok || !data.created) throw new Error(apiErrorMessage(data, "配信追加に失敗しました。"));
      closeCreateModal();
      await loadChannels();
      notify("配信を追加しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信追加に失敗しました。", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteChannel(channel: ChannelSummary) {
    if (!window.confirm(`配信「${channel.name}」を削除しますか？ ImageFlux Live Streamingのチャンネルも削除されます。`)) return;
    setBusyChannelId(channel.id);
    try {
      const response = await fetch(`/api/channels/${channel.id}`, { method: "DELETE" });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(apiErrorMessage(data, "配信削除に失敗しました。"));
      await loadChannels();
      notify("配信を削除しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "配信削除に失敗しました。", "error");
    } finally {
      setBusyChannelId(null);
    }
  }

  return <>
    <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />
    <section className="max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => void loadChannels()} disabled={isLoading} className="inline-flex size-9 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:text-white" aria-label="配信一覧を再読み込み" title="再読み込み">
          <ArrowPathIcon className={`size-5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
        <button type="button" onClick={openCreateModal} className="inline-flex size-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label="配信追加" title="配信追加">
          <PlusIcon className="size-5" />
        </button>
      </div>
      <div className="mt-8 overflow-x-auto">
        {isLoading && channels.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : channels.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">配信がありません。</p> :
          <table>
            <thead><tr><th scope="col">チャンネル名称</th><th scope="col"><span className="sr-only">ライブ配信</span></th><th scope="col"><span className="sr-only">録画視聴</span></th><th scope="col">配信方式</th><th scope="col">作成日時</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
            <tbody>{channels.map((channel) => <tr key={channel.id}>
              <td><Link href={`/dashboard/channels/${channel.id}`} className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">{channel.name}</Link>{channel.description && <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{channel.description}</div>}</td>
              <td>{!channel.isLiveEnd && <Link href={`/dashboard/channels/${channel.id}/stream`} className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${channel.name} の配信画面`} title="配信画面"><SignalIcon className="size-5" /></Link>}</td>
              <td>{channel.isRecordingEnabled && <Link href={`/dashboard/channels/${channel.id}/recordings`} className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${channel.name} の録画ページ`} title="録画視聴"><FilmIcon className="size-5" /></Link>}</td>
              <td>{STREAM_TYPE_LABELS[channel.streamType]}</td>
              <td>{toJstString(channel.createdAt)}</td>
              <td className="py-4 pr-4 pl-3 text-right sm:pr-0"><button type="button" onClick={() => void deleteChannel(channel)} disabled={busyChannelId === channel.id} className="inline-flex text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400" aria-label={`${channel.name} を削除`} title="削除"><TrashIcon className="size-5" /></button></td>
            </tr>)}</tbody>
          </table>}
      </div>
    </section>

    <Dialog open={isCreateModalOpen} onClose={closeCreateModal} className="relative z-10">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel transition className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-2xl sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">配信を追加</DialogTitle>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">新規配信を追加します。</p>
              </div>
              <button type="button" onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="閉じる" title="閉じる"><XMarkIcon className="size-6" /></button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={submitChannel}>
              <div><label htmlFor="channel-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">チャンネル名称</label><input id="channel-name" required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} className="mt-2" /></div>
              <div><label htmlFor="channel-description" className="block text-sm/6 font-medium text-gray-900 dark:text-white">説明</label><textarea id="channel-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2" /></div>
              <SelectField id="channel-stream-type" label="配信方式" value={streamType} onChange={(value) => changeStreamType(value as StreamType)}>
                <option value="webrtc">小規模超低遅延配信</option>
                <option value="webrtc_to_hls">大規模配信</option>
              </SelectField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ToggleSwitch id="channel-recording" label="録画" checked={isRecordingEnabled} onChange={changeRecordingEnabled} />
                <ToggleSwitch id="channel-summary" label="要約" checked={isSummaryEnabled} disabled={!canEnableSummary} onChange={setIsSummaryEnabled} />
              </div>
              {!canEnableSummary && <p className="text-sm text-gray-500 dark:text-gray-400">録画を有効にした場合のみ要約を有効にできます。</p>}
              <AllowedUsersInput id="channel-allowed-users" label="視聴可能な利用者" users={users} selectedUserIds={allowedUserIds} isLoading={isUsersLoading} onChange={setAllowedUserIds} />
              {needsHlsSettings && <fieldset className="    ">
                <div className="flex items-center justify-between gap-3">
                  <legend className="text-sm/6 font-medium text-gray-900 dark:text-white">HLS設定</legend>
                  <button type="button" onClick={addHlsSetting} className="inline-flex size-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs hover:bg-indigo-500" aria-label="HLS設定を追加" title="HLS設定を追加"><PlusIcon className="size-4" /></button>
                </div>
                <div className="mt-4 space-y-4">
                  {hlsSettings.map((setting, index) => <div key={setting.id} className="space-y-4 rounded-md border border-gray-200 p-3 dark:border-white/10">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div><label htmlFor={`channel-video-width-${setting.id}`} className="block text-sm/6 font-medium text-gray-900 dark:text-white">画面幅</label><input id={`channel-video-width-${setting.id}`} type="number" required min={160} max={4096} value={setting.videoWidth} onChange={(event) => updateHlsSetting(setting.id, "videoWidth", event.target.value)} className="mt-2" /></div>
                      <div><label htmlFor={`channel-video-height-${setting.id}`} className="block text-sm/6 font-medium text-gray-900 dark:text-white">画面高</label><input id={`channel-video-height-${setting.id}`} type="number" required min={160} max={4096} value={setting.videoHeight} onChange={(event) => updateHlsSetting(setting.id, "videoHeight", event.target.value)} className="mt-2" /></div>
                      <div><label htmlFor={`channel-video-fps-${setting.id}`} className="block text-sm/6 font-medium text-gray-900 dark:text-white">フレームレート</label><input id={`channel-video-fps-${setting.id}`} type="number" required min={3} max={60} value={setting.videoFps} onChange={(event) => updateHlsSetting(setting.id, "videoFps", event.target.value)} className="mt-2" /></div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div><label htmlFor={`channel-video-bps-${setting.id}`} className="block text-sm/6 font-medium text-gray-900 dark:text-white">映像ビットレート</label><input id={`channel-video-bps-${setting.id}`} type="number" required min={15000} max={15000000} value={setting.videoBps} onChange={(event) => updateHlsSetting(setting.id, "videoBps", event.target.value)} className="mt-2" /></div>
                      <SelectField id={`channel-audio-bps-${setting.id}`} label="音声ビットレート" value={setting.audioBps} onChange={(value) => updateHlsSetting(setting.id, "audioBps", value)}>
                        {IMAGEFLUX_LS_AUDIO_BPS.map((bps) => <option key={bps} value={bps}>{bps}</option>)}
                      </SelectField>
                      <div className="flex items-end justify-end"><button type="button" onClick={() => removeHlsSetting(setting.id)} disabled={hlsSettings.length <= 1} className="inline-flex size-9 items-center justify-center text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400" aria-label={`HLS設定${index + 1}を削除`} title="削除"><TrashIcon className="size-5" /></button></div>
                    </div>
                  </div>)}
                </div>
              </fieldset>}
              {needsArchiveDestination && <SelectField id="channel-archive-destination" label="録画保存先" required value={selectedArchiveDestinationId} onChange={setArchiveDestinationId} disabled={isArchiveDestinationsLoading || archiveDestinations.length === 0}>
                <option value="">{isArchiveDestinationsLoading ? "読み込み中..." : "録画保存先を選択"}</option>
                {archiveDestinations.map((destination) => <option key={destination.archive_destination_id} value={destination.archive_destination_id}>{destination.bucket_uri}</option>)}
              </SelectField>}
              <div className="pt-2 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button type="submit" disabled={isSubmitting || (needsArchiveDestination && !selectedArchiveDestinationId)} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500 disabled:opacity-60">{isSubmitting ? "追加中..." : "追加"}</button>
                <button type="button" data-autofocus onClick={closeCreateModal} disabled={isSubmitting} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">キャンセル</button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  </>;
}