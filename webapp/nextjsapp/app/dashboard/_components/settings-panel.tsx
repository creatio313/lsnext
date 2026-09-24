"use client";

import {
  CheckCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import {
  StatusNotification,
  type StatusNotificationTone,
} from "../../_components/status-notification";
import { toJstString } from "@/lib/date-time";
import { readErrorMessage } from "./read-error-message";

type PasskeySummary = {
  passkeyId: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type PasskeyApiResult = {
  passkeys?: PasskeySummary[];
  error?: string;
};

export function SettingsPanel() {
  const [isWorking, setIsWorking] = useState(false);
  /***
   * パスキー関連
   */
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [isPasskeysLoading, setIsPasskeysLoading] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [passkeyNameEdits, setPasskeyNameEdits] = useState<
    Record<number, string>
  >({});
  const [editingPasskeyId, setEditingPasskeyId] = useState<number | null>(null);
  const [savingPasskeyId, setSavingPasskeyId] = useState<number | null>(null);
  /***
   * パスワード関連
   */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [status, setStatus] = useState<string>("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  function showStatus(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  const loadPasskeys = useCallback(async () => {
    setIsPasskeysLoading(true);
    //パスキー取ってくるだけ
    try {
      const response = await fetch("/api/auth/passkeys", { method: "GET" });
      const data = (await response.json()) as PasskeyApiResult;

      if (!response.ok || !Array.isArray(data.passkeys)) {
        throw new Error(data.error ?? "パスキー一覧の取得に失敗しました。");
      }

      const loadedPasskeys = data.passkeys;
      setPasskeys(loadedPasskeys);
      setPasskeyNameEdits(
        loadedPasskeys.reduce<Record<number, string>>((acc, passkey) => {
          acc[passkey.passkeyId] = passkey.name;
          return acc;
        }, {}),
      );
      setEditingPasskeyId((currentEditingPasskeyId) =>
        currentEditingPasskeyId !== null &&
        !loadedPasskeys.some(
          (passkey) => passkey.passkeyId === currentEditingPasskeyId,
        )
          ? null
          : currentEditingPasskeyId,
      );
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスキー一覧の取得に失敗しました。";
      showStatus(message, "error");
    } finally {
      setIsPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadPasskeys());
  }, [loadPasskeys]);
  //パスキー登録の処理
  async function registerPasskey() {
    const passkeyName = newPasskeyName.trim();
    if (!passkeyName) {
      showStatus("パスキー名称を入力してください。", "error");
      return;
    }

    setIsWorking(true);

    try {
      const initResponse = await fetch("/api/auth/passkeys/register/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkeyName }),
      });

      const initData = (await initResponse.json()) as {
        options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
        error?: string;
      };

      if (!initResponse.ok || !initData.options) {
        throw new Error(initData.error ?? "パスキー登録初期化に失敗しました。");
      }

      const registrationResponse = await startRegistration({
        optionsJSON: initData.options,
      });

      const verifyResponse = await fetch("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationResponse }),
      });

      const verifyData = (await verifyResponse.json()) as {
        registered?: boolean;
        error?: string;
      };

      if (!verifyResponse.ok || !verifyData.registered) {
        throw new Error(verifyData.error ?? "パスキー登録に失敗しました。");
      }

      await loadPasskeys();
      setNewPasskeyName("");
      showStatus("パスキーを登録しました。", "success");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスキー登録に失敗しました。";
      showStatus(message, "error");
    } finally {
      setIsWorking(false);
    }
  }
  //パスキー名称更新の処理
  async function updatePasskeyName(passkeyId: number) {
    const name = (passkeyNameEdits[passkeyId] ?? "").trim();
    if (!name) {
      showStatus("パスキー名称を入力してください。", "error");
      return;
    }

    setSavingPasskeyId(passkeyId);

    try {
      const response = await fetch(`/api/auth/passkeys/${passkeyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = (await response.json()) as {
        updated?: boolean;
        error?: string;
      };

      if (!response.ok || !data.updated) {
        throw new Error(data.error ?? "パスキー名称の更新に失敗しました。");
      }

      await loadPasskeys();
      setEditingPasskeyId(null);
      showStatus("パスキー名称を更新しました。", "success");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスキー名称の更新に失敗しました。";
      showStatus(message, "error");
    } finally {
      setSavingPasskeyId(null);
    }
  }

  /***
   * パスキー名称変更・キャンセル画面制御用関数
   */
  function beginPasskeyEdit(passkey: PasskeySummary) {
    setPasskeyNameEdits((previous) => ({
      ...previous,
      [passkey.passkeyId]: previous[passkey.passkeyId] ?? passkey.name,
    }));
    setEditingPasskeyId(passkey.passkeyId);
  }
  function cancelPasskeyEdit(passkey: PasskeySummary) {
    setPasskeyNameEdits((previous) => ({
      ...previous,
      [passkey.passkeyId]: passkey.name,
    }));
    setEditingPasskeyId(null);
  }

  //パスキー削除の処理。全削除の場合はパスワード認証に戻る旨を通知。
  async function deletePasskey(passkeyId: number) {
    if (!window.confirm("このパスキーを削除しますか？")) {
      return;
    }

    setIsWorking(true);

    try {
      const response = await fetch(`/api/auth/passkeys/${passkeyId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as {
        deleted?: boolean;
        fallbackToPassword?: boolean;
        error?: string;
      };

      if (!response.ok || !data.deleted) {
        throw new Error(data.error ?? "パスキー削除に失敗しました。");
      }

      await loadPasskeys();
      showStatus(
        data.fallbackToPassword
          ? "すべてのパスキーを削除しました。次回ログインはパスワード認証になります。"
          : "パスキーを削除しました。",
        "success",
      );
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスキー削除に失敗しました。";
      showStatus(message, "error");
    } finally {
      setIsWorking(false);
    }
  }

  //パスワード変更の処理
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPassword = newPassword.trim();
    if (nextPassword !== confirmPassword) {
      showStatus("新しいパスワード（確認）が一致しません。", "error");
      return;
    }

    setIsWorking(true);

    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword: nextPassword,
        }),
      });

      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          readErrorMessage(data, "パスワード変更に失敗しました。"),
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showStatus("パスワードを変更しました。", "success");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスワード変更に失敗しました。";
      showStatus(message, "error");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <StatusNotification
        message={status}
        tone={statusTone}
        onClose={() => setStatus("")}
      />
      <section className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">パスキー管理</h2>
          <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">
            アカウントのパスキーを追加、削除、名称変更できます。<br></br>
            パスキーをすべて削除すると、次回ログインはパスワード認証になります。
          </p>
        </div>
        <form
          className="md:col-span-2"
          onSubmit={(event) => {
            event.preventDefault();
            void registerPasskey();
          }}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
            <div className="col-span-full">
              <label
                htmlFor="passkey-name"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                パスキー名称
              </label>
              <div className="mt-2">
                <input
                  id="passkey-name"
                  name="passkey_name"
                  type="text"
                  autoComplete="off"
                  required
                  value={newPasskeyName}
                  onChange={(event) => setNewPasskeyName(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
            >
              追加
            </button>
          </div>
        </form>
        <div className="md:col-span-2 md:col-start-2">
          <div className="overflow-x-auto sm:max-w-xl">
            <table>
              <thead>
                <tr>
                  <th scope="col">パスキー名称</th>
                  <th scope="col">作成日時</th>
                  <th scope="col">最終利用日時</th>
                  <th scope="col"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {isPasskeysLoading ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center">
                      パスキーを読み込み中...
                    </td>
                  </tr>
                ) : passkeys.map((passkey) => {
                  const isEditing = editingPasskeyId === passkey.passkeyId;
                  const isSaving = savingPasskeyId === passkey.passkeyId;

                  return (
                    <tr key={passkey.passkeyId}>
                      <td>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={passkeyNameEdits[passkey.passkeyId] ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPasskeyNameEdits((previous) => ({
                                  ...previous,
                                  [passkey.passkeyId]: value,
                                }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void updatePasskeyName(passkey.passkeyId);
                                }
                              }}
                              aria-label="パスキー名称"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void updatePasskeyName(passkey.passkeyId);
                              }}
                              disabled={isSaving}
                              className="inline-flex items-center text-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`${passkey.name} を保存`}
                            >
                              <CheckCircleIcon className="size-6" />
                              <span className="sr-only">
                                {isSaving ? "保存中" : `${passkey.name} を保存`}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                cancelPasskeyEdit(passkey);
                              }}
                              disabled={isSaving}
                              className="inline-flex items-center text-slate-300 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`${passkey.name} の編集をキャンセル`}
                            >
                              <XCircleIcon className="size-6" />
                              <span className="sr-only">
                                {passkey.name} の編集をキャンセル
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="whitespace-nowrap">
                              {passkey.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                beginPasskeyEdit(passkey);
                              }}
                              disabled={isWorking}
                              className="inline-flex items-center text-slate-300 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`${passkey.name} を編集`}
                            >
                              <PencilSquareIcon className="size-5" />
                              <span className="sr-only">
                                {passkey.name} を編集
                              </span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td>{toJstString(passkey.createdAt)}</td>
                      <td>{toJstString(passkey.lastUsedAt)}</td>
                      <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                        <button
                          type="button"
                          onClick={() => {
                            void deletePasskey(passkey.passkeyId);
                          }}
                          disabled={isWorking}
                          className="inline-flex items-center text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`${passkey.name} を削除`}
                        >
                          <TrashIcon className="size-5" />
                          <span className="sr-only">{passkey.name} を削除</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
            パスワード変更
          </h2>
          <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">
            アカウントのパスワードを更新します。
          </p>
        </div>
        <form className="md:col-span-2" onSubmit={changePassword}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
            <div className="col-span-full">
              <label
                htmlFor="current-password"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                現在のパスワード
              </label>
              <div className="mt-2">
                <input
                  id="current-password"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
            </div>

            <div className="col-span-full">
              <label
                htmlFor="new-password"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                新しいパスワード
              </label>
              <div className="mt-2">
                <input
                  id="new-password"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
            </div>

            <div className="col-span-full">
              <label
                htmlFor="confirm-password"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                パスワードの確認
              </label>
              <div className="mt-2">
                <input
                  id="confirm-password"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
            >
              変更
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
