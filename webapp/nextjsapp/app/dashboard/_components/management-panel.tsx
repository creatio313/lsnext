"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowPathIcon,
  KeyIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  StatusNotification,
  type StatusNotificationTone,
} from "../../_components/status-notification";
import { SelectField } from "./form-controls";

type UserRole = "admin" | "user";
type UserSummary = {
  id: number;
  loginId: string;
  displayName: string;
  email: string;
  role: UserRole;
  isPasskeyEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  isCurrentUser: boolean;
};
type ArchiveDestinationSummary = {
  archive_destination_id: string;
  bucket_uri: string;
};
type UserModalMode = "create" | "edit" | null;
type ArchiveDestinationModalMode = "create" | null;
type UserApiResult = {
  created?: boolean;
  updated?: boolean;
  deleted?: boolean;
  reset?: boolean;
  generatedPassword?: string;
  users?: UserSummary[];
  user?: UserSummary;
  error?: string;
};
type ArchiveDestinationListApiResult = {
  destinations?: ArchiveDestinationSummary[];
  error?: string;
};
type ArchiveDestinationCreateApiResult = {
  archive_destination_id?: string;
  object_storage_site?: string;
  object_storage_bucket?: string;
  web_accel_domain?: string;
  error?: string;
};
type ApiErrorResult = {
  error?: string;
};

const SAKURA_OBJECT_STORAGE_REGIONS = [
  { value: "jp-north-1", label: "石狩第1サイト" },
  { value: "jp-east-1", label: "東京第1サイト" },
];

function userErrorMessage(data: UserApiResult, fallback: string) {
  return data.error ?? fallback;
}

function apiErrorMessage(data: ApiErrorResult, fallback: string) {
  return data.error ?? fallback;
}

function readArchiveDestinations(data: ArchiveDestinationListApiResult) {
  if (!Array.isArray(data.destinations) || !data.destinations.every((destination) => destination.archive_destination_id && destination.bucket_uri)) {
    throw new Error("アーカイブ保存先一覧の応答形式が正しくありません。");
  }

  return data.destinations;
}

export function ManagementPanel() {
  /***
   * 利用者
   */
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [archiveDestinations, setArchiveDestinations] = useState<ArchiveDestinationSummary[]>([]);
  /***
   * 画面制御用
   */
  const [isLoading, setIsLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [busyArchiveDestinationId, setBusyArchiveDestinationId] = useState<string | null>(null);
  const [userModalMode, setUserModalMode] = useState<UserModalMode>(null);
  const [archiveDestinationModalMode, setArchiveDestinationModalMode] = useState<ArchiveDestinationModalMode>(null);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [isUserSubmitting, setIsUserSubmitting] = useState(false);
  const [isArchiveDestinationsLoading, setIsArchiveDestinationsLoading] = useState(false);
  const [isArchiveDestinationSubmitting, setIsArchiveDestinationSubmitting] = useState(false);
  /***
   * フォーム入力値
   */
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [archiveBucketName, setArchiveBucketName] = useState("");
  const [archivePath, setArchivePath] = useState("");
  const [archiveAwsRegion, setArchiveAwsRegion] = useState("jp-north-1");
  const [archiveAwsAccessKeyId, setArchiveAwsAccessKeyId] = useState("");
  const [archiveAwsSecretAccessKey, setArchiveAwsSecretAccessKey] = useState("");
  const [archiveWebAccelDomain, setArchiveWebAccelDomain] = useState("");
  /***
   * ステータス通知
   */
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");
  /***
   * 認証情報
   */
  const [credentials, setCredentials] = useState<{ loginId: string; role: UserRole; password: string } | null>(null);

  const credentialsText = useMemo(() => credentials ? [
    "認証情報",
    `ログインID：${credentials.loginId}`,
    `ロール：${credentials.role}`,
    `パスワード：${credentials.password}`,
  ].join("\n") : "", [credentials]);

  function notify(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  function closeUserModal() {
    setUserModalMode(null);
    setEditingUser(null);
    setLoginId("");
    setDisplayName("");
    setEmail("");
    setRole("user");
  }

  function closeArchiveDestinationModal() {
    setArchiveDestinationModalMode(null);
    setArchiveBucketName("");
    setArchivePath("");
    setArchiveAwsRegion("jp-north-1");
    setArchiveAwsAccessKeyId("");
    setArchiveAwsSecretAccessKey("");
    setArchiveWebAccelDomain("");
  }

  function openCreateUserModal() {
    closeUserModal();
    setUserModalMode("create");
  }

  function openCreateArchiveDestinationModal() {
    closeArchiveDestinationModal();
    setArchiveDestinationModalMode("create");
  }

  function openEditUserModal(user: UserSummary) {
    setEditingUser(user);
    setLoginId(user.loginId);
    setDisplayName(user.displayName);
    setEmail(user.email);
    setRole(user.role);
    setUserModalMode("edit");
  }

  const loadUsers = useCallback(async () => {
    // 利用者一覧を取得する。初回ロード時に利用者一覧が空の場合、画面が真っ白になるのを防ぐため、Promise.resolve()で一旦待機する。
    await Promise.resolve();
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json() as UserApiResult;
      if (!response.ok || !data.users) throw new Error(userErrorMessage(data, "利用者一覧の取得に失敗しました。"));
      setUsers(data.users);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "利用者一覧の取得に失敗しました。");
      setStatusTone("error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadArchiveDestinations = useCallback(async () => {
    // アーカイブ保存先一覧を取得する。初回ロード時にアーカイブ保存先一覧が空の場合、画面が真っ白になるのを防ぐため、Promise.resolve()で一旦待機する。
    await Promise.resolve();
    setIsArchiveDestinationsLoading(true);
    try {
      const response = await fetch("/api/archive-destinations");
      const data = await response.json() as ArchiveDestinationListApiResult;
      if (!response.ok) throw new Error(apiErrorMessage(data, "録画保存先一覧の取得に失敗しました。"));
      setArchiveDestinations(readArchiveDestinations(data));
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "録画保存先一覧の取得に失敗しました。");
      setStatusTone("error");
    } finally {
      setIsArchiveDestinationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch("/api/admin/users")
      .then(async (response) => {
        const data = await response.json() as UserApiResult;
        if (!response.ok || !data.users) {
          throw new Error(userErrorMessage(data, "利用者一覧の取得に失敗しました。"));
        }
        if (isActive) setUsers(data.users);
      })
      .catch((caught: unknown) => {
        if (!isActive) return;
        setStatus(caught instanceof Error ? caught.message : "利用者一覧の取得に失敗しました。");
        setStatusTone("error");
      });

    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch("/api/archive-destinations")
      .then(async (response) => {
        const data = await response.json() as ArchiveDestinationListApiResult;
        if (!response.ok) {
          throw new Error(apiErrorMessage(data, "録画保存先一覧の取得に失敗しました。"));
        }
        if (isActive) setArchiveDestinations(readArchiveDestinations(data));
      })
      .catch((caught: unknown) => {
        if (!isActive) return;
        setStatus(caught instanceof Error ? caught.message : "録画保存先一覧の取得に失敗しました。");
        setStatusTone("error");
      });

    return () => { isActive = false; };
  }, []);

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    // 利用者追加・編集のフォーム送信処理
    event.preventDefault();
    // 編集モードで編集対象の利用者が存在しない場合は処理を中断する。
    if (userModalMode === "edit" && !editingUser) return;
    setIsUserSubmitting(true);
    try {
      // 利用者追加・編集のAPIを呼び出す条件分岐付き処理。
      const isCreate = userModalMode === "create";
      const response = await fetch(isCreate ? "/api/admin/users" : `/api/admin/users/${editingUser?.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, displayName, email, role }),
      });
      const data = await response.json() as UserApiResult;
      if (!response.ok || (isCreate ? !data.created : !data.updated)) {
        throw new Error(userErrorMessage(data, isCreate ? "利用者追加に失敗しました。" : "利用者更新に失敗しました。"));
      }
      if (isCreate && data.generatedPassword) {
        setCredentials({ loginId, role, password: data.generatedPassword });
      }
      closeUserModal();
      await loadUsers();
      notify(isCreate ? "利用者を追加しました。" : "利用者情報を更新しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "利用者情報の保存に失敗しました。", "error");
    } finally {
      setIsUserSubmitting(false);
    }
  }

  async function submitArchiveDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsArchiveDestinationSubmitting(true);
    try {
      const response = await fetch("/api/admin/archive-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: archiveBucketName,
          path: archivePath,
          awsRegion: archiveAwsRegion,
          awsAccessKeyId: archiveAwsAccessKeyId,
          awsSecretAccessKey: archiveAwsSecretAccessKey,
          webAccelDomain: archiveWebAccelDomain,
        }),
      });
      const data = await response.json() as ArchiveDestinationCreateApiResult;
      if (!response.ok || !data.archive_destination_id) throw new Error(apiErrorMessage(data, "録画保存先追加に失敗しました。"));
      closeArchiveDestinationModal();
      await loadArchiveDestinations();
      notify("録画保存先を追加しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "録画保存先追加に失敗しました。", "error");
    } finally {
      setIsArchiveDestinationSubmitting(false);
    }
  }

  async function deleteUser(user: UserSummary) {
    // 利用者削除の確認ダイアログを表示し、ユーザーが削除を承認した場合に削除処理を実行する。
    if (!window.confirm(`利用者「${user.displayName}（${user.loginId}）」を削除しますか？`)) return;
    setBusyUserId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json() as UserApiResult;
      if (!response.ok || !data.deleted) throw new Error(userErrorMessage(data, "利用者削除に失敗しました。"));
      await loadUsers();
      notify("利用者を削除しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "利用者削除に失敗しました。", "error");
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteArchiveDestination(destination: ArchiveDestinationSummary) {
    // 録画保存先削除の確認ダイアログを表示し、ユーザーが削除を承認した場合に削除処理を実行する。
    if (!window.confirm(`録画保存先「${destination.bucket_uri}」を削除しますか？`)) return;
    setBusyArchiveDestinationId(destination.archive_destination_id);
    try {
      const response = await fetch(`/api/admin/archive-destinations/${encodeURIComponent(destination.archive_destination_id)}`, { method: "DELETE" });
      const data = await response.json() as ApiErrorResult;
      if (!response.ok) throw new Error(apiErrorMessage(data, "録画保存先削除に失敗しました。"));
      await loadArchiveDestinations();
      notify("録画保存先を削除しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "録画保存先削除に失敗しました。", "error");
    } finally {
      setBusyArchiveDestinationId(null);
    }
  }

  async function resetPassword(user: UserSummary) {
    // 利用者のパスワードを再発行する。
    if (!window.confirm(`利用者「${user.displayName}（${user.loginId}）」のパスワードを再発行しますか？`)) return;
    setBusyUserId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password/reset`, { method: "POST" });
      const data = await response.json() as UserApiResult;
      if (!response.ok || !data.reset || !data.generatedPassword) throw new Error(userErrorMessage(data, "パスワード再発行に失敗しました。"));
      setCredentials({ loginId: user.loginId, role: user.role, password: data.generatedPassword });
      notify("パスワードを再発行しました。", "success");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "パスワード再発行に失敗しました。", "error");
    } finally {
      setBusyUserId(null);
    }
  }

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(credentialsText);
      notify("認証情報をクリップボードにコピーしました。", "success");
    } catch {
      notify("クリップボードへのコピーに失敗しました。", "error");
    }
  }

  return <>
    <StatusNotification message={status} tone={statusTone} onClose={() => setStatus("")} />
    <section className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
      <div>
        <h1 className="text-base/7 font-semibold text-gray-900 dark:text-white">利用者管理</h1>
        <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">利用者の追加、アカウント情報の編集、削除を行います。</p>
      </div>
      <div className="md:col-span-2">
        <div className="flex items-center justify-end gap-3 sm:max-w-4xl">
          <button type="button" onClick={() => void loadUsers()} disabled={isLoading} className="inline-flex size-9 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:text-white" aria-label="利用者一覧を再読み込み" title="再読み込み">
            <ArrowPathIcon className={`size-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={openCreateUserModal} className="inline-flex size-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label="利用者追加" title="利用者追加">
            <UserPlusIcon className="size-5" />
          </button>
        </div>
        <div className="mt-8 overflow-x-auto sm:max-w-4xl">
          {isLoading && users.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : users.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">利用者がいません。</p> :
            <table>
              <thead><tr><th scope="col">利用者</th><th scope="col">メールアドレス</th><th scope="col">ロール</th><th scope="col">認証方式</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{users.map((user) => <tr key={user.id}>
                <td><div>{user.displayName}</div><div className="text-xs font-normal text-gray-500 dark:text-gray-400">{user.loginId}</div></td>
                <td>{user.email}</td><td>{user.role}</td><td>{user.isPasskeyEnabled ? "パスキー" : "パスワード"}</td>
                <td className="py-4 pr-4 pl-3 text-right sm:pr-0"><div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => openEditUserModal(user)} disabled={busyUserId === user.id} className="inline-flex text-slate-500 hover:text-slate-700 disabled:opacity-60 dark:text-slate-300 dark:hover:text-slate-200" aria-label={`${user.displayName} を編集`} title="編集"><PencilSquareIcon className="size-5" /></button>
                  <button type="button" onClick={() => void resetPassword(user)} disabled={busyUserId === user.id} className="inline-flex text-amber-500 hover:text-amber-600 disabled:opacity-60 dark:text-amber-400" aria-label={`${user.displayName} のパスワードを再発行`} title="パスワード再発行"><KeyIcon className="size-5" /></button>
                  <button type="button" onClick={() => void deleteUser(user)} disabled={busyUserId === user.id || user.isCurrentUser} className="inline-flex text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400" aria-label={`${user.displayName} を削除`} title={user.isCurrentUser ? "自分自身は削除できません。" : "削除"}><TrashIcon className="size-5" /></button>
                </div></td>
              </tr>)}</tbody>
            </table>}
        </div>
      </div>
    </section>

    <section className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 border-t border-gray-200 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8 dark:border-white/10">
      <div>
        <h1 className="text-base/7 font-semibold text-gray-900 dark:text-white">録画保存先</h1>
        <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">録画保存先を管理します。</p>
      </div>
      <div className="md:col-span-2">
        <div className="flex items-center justify-end gap-3 sm:max-w-4xl">
          <button type="button" onClick={() => void loadArchiveDestinations()} disabled={isArchiveDestinationsLoading} className="inline-flex size-9 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-60 dark:text-gray-400 dark:hover:text-white" aria-label="アーカイブ保存先一覧を再読み込み" title="再読み込み">
            <ArrowPathIcon className={`size-5 ${isArchiveDestinationsLoading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={openCreateArchiveDestinationModal} className="inline-flex size-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label="保存先追加" title="保存先追加">
            <PlusIcon className="size-5" />
          </button>
        </div>
        <div className="mt-8 overflow-x-auto sm:max-w-4xl">
          {isArchiveDestinationsLoading && archiveDestinations.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">読み込み中...</p> : archiveDestinations.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">アーカイブ保存先がありません。</p> :
            <table>
              <thead><tr><th scope="col">ID</th><th scope="col">バケットURI</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{archiveDestinations.map((destination) => <tr key={destination.archive_destination_id}>
                <td>{destination.archive_destination_id}</td>
                <td>{destination.bucket_uri}</td>
                <td className="py-4 pr-4 pl-3 text-right sm:pr-0"><button type="button" onClick={() => void deleteArchiveDestination(destination)} disabled={busyArchiveDestinationId === destination.archive_destination_id} className="inline-flex text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400" aria-label={`${destination.bucket_uri} を削除`} title="削除"><TrashIcon className="size-5" /></button></td>
              </tr>)}</tbody>
            </table>}
        </div>
      </div>
    </section>

    <Dialog open={userModalMode !== null} onClose={closeUserModal} className="relative z-10">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <DialogPanel transition className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">{userModalMode === "create" ? "利用者を追加" : "利用者を編集"}</DialogTitle>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{userModalMode === "create" ? "初期パスワードは追加後に自動発行されます。" : "アカウント情報とロールを更新します。"}</p>
                </div>
                  <button type="button" onClick={closeUserModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="閉じる" title="閉じる"><XMarkIcon className="size-6" /></button>
            </div>
          <form className="mt-6 space-y-4" onSubmit={submitUser}>
            <div><label htmlFor="user-login-id" className="block text-sm/6 font-medium text-gray-900 dark:text-white">ログインID</label><input id="user-login-id" required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._-]+" value={loginId} onChange={(event) => setLoginId(event.target.value)} className="mt-2" /></div>
            <div><label htmlFor="user-display-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">表示名</label><input id="user-display-name" required maxLength={255} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2" /></div>
            <div><label htmlFor="user-email" className="block text-sm/6 font-medium text-gray-900 dark:text-white">メールアドレス</label><input id="user-email" type="email" required maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2" /></div>
            <div><SelectField id="user-role" label="ロール" value={role} onChange={(value) => setRole(value as UserRole)} disabled={editingUser?.isCurrentUser}><option value="user">user（一般利用者）</option><option value="admin">admin（管理者）</option></SelectField>{editingUser?.isCurrentUser && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">自分自身のロールは変更できません。</p>}</div>
            <div className="pt-2 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button type="submit" disabled={isUserSubmitting} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500 disabled:opacity-60">{isUserSubmitting ? "保存中..." : userModalMode === "create" ? "追加" : "更新"}</button>
                <button type="button" data-autofocus onClick={closeUserModal} disabled={isUserSubmitting} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">キャンセル</button>
            </div>
          </form>
        </DialogPanel>
        </div>
      </div>
    </Dialog>

    <Dialog open={archiveDestinationModalMode !== null} onClose={closeArchiveDestinationModal} className="relative z-10">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <DialogPanel transition className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">録画保存先を追加</DialogTitle>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">オブジェクトストレージの情報を入力します。</p>
                </div>
                <button type="button" onClick={closeArchiveDestinationModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="閉じる" title="閉じる"><XMarkIcon className="size-6" /></button>
            </div>
          <form className="mt-6 space-y-4" onSubmit={submitArchiveDestination}>
            <SelectField id="archive-region" label="サイト" value={archiveAwsRegion} onChange={setArchiveAwsRegion}>{SAKURA_OBJECT_STORAGE_REGIONS.map((region) => <option key={region.value} value={region.value}>{region.label}</option>)}</SelectField>
            <div><label htmlFor="archive-bucket-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">バケット</label><input id="archive-bucket-name" required maxLength={255} value={archiveBucketName} onChange={(event) => setArchiveBucketName(event.target.value)} className="mt-2" /></div>
            <div><label htmlFor="archive-path" className="block text-sm/6 font-medium text-gray-900 dark:text-white">フォルダパス（任意）</label><input id="archive-path" maxLength={1024} placeholder="archives/live/" pattern="[^/].*|" value={archivePath} onChange={(event) => setArchivePath(event.target.value)} className="mt-2" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">ルート先頭の / は不要です。</p></div>
            <div><label htmlFor="archive-access-key-id" className="block text-sm/6 font-medium text-gray-900 dark:text-white">アクセスキーID</label><input id="archive-access-key-id" required maxLength={255} value={archiveAwsAccessKeyId} onChange={(event) => setArchiveAwsAccessKeyId(event.target.value)} className="mt-2" /></div>
            <div><label htmlFor="archive-secret-access-key" className="block text-sm/6 font-medium text-gray-900 dark:text-white">シークレットアクセスキー</label><input id="archive-secret-access-key" type="password" required value={archiveAwsSecretAccessKey} onChange={(event) => setArchiveAwsSecretAccessKey(event.target.value)} className="mt-2" /></div>
            <div><label htmlFor="archive-web-accel-domain" className="block text-sm/6 font-medium text-gray-900 dark:text-white">さくらのウェブアクセラレータドメイン</label><input id="archive-web-accel-domain" required maxLength={255} placeholder="xxxxxxxx.user.webaccel.jp" value={archiveWebAccelDomain} onChange={(event) => setArchiveWebAccelDomain(event.target.value)} className="mt-2" /></div>
            <div className="pt-2 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button type="submit" disabled={isArchiveDestinationSubmitting} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500 disabled:opacity-60">{isArchiveDestinationSubmitting ? "追加中..." : "追加"}</button>
                <button type="button" data-autofocus onClick={closeArchiveDestinationModal} disabled={isArchiveDestinationSubmitting} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">キャンセル</button>
            </div>
          </form>
        </DialogPanel>
        </div>
      </div>
    </Dialog>

    <Dialog open={credentials !== null} onClose={() => setCredentials(null)} className="relative z-10">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto"><div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <DialogPanel transition className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">認証情報</DialogTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">この情報は閉じると再表示できません。利用者へ安全に共有してください。</p>
            </div>
            <button type="button" onClick={() => setCredentials(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="閉じる" title="閉じる"><XMarkIcon className="size-6" /></button>
          </div>
          <textarea readOnly value={credentialsText} rows={4} className="mt-6" aria-label="認証情報" />
          <div className="mt-5 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
            <button type="button" onClick={() => void copyCredentials()} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500 disabled:opacity-60">コピー</button>
            <button type="button" data-autofocus onClick={() => setCredentials(null)} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">閉じる</button>
          </div>
        </DialogPanel>
      </div></div>
    </Dialog>
  </>;
}