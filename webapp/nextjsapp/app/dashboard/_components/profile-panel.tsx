"use client";

import { useState } from "react";
import {
  StatusNotification,
  type StatusNotificationTone,
} from "../../_components/status-notification";
import { readErrorMessage } from "./read-error-message";

type ProfilePanelProps = {
  currentDisplayName: string;
  currentEmail: string;
  onProfileUpdated: (profile: { displayName: string; email: string }) => void;
};

export function ProfilePanel({
  currentDisplayName,
  currentEmail,
  onProfileUpdated,
}: ProfilePanelProps) {
  //プロフィール情報
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [email, setEmail] = useState(currentEmail);
  //状態管理
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [statusTone, setStatusTone] = useState<StatusNotificationTone>("info");

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function showStatus(message: string, tone: StatusNotificationTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDisplayName = displayName.trim();
    const nextEmail = email.trim();

    if (!nextDisplayName) {
      showStatus("表示名を入力してください。", "error");
      return;
    }

    if (!nextEmail) {
      showStatus("メールアドレスを入力してください。", "error");
      return;
    }

    if (nextDisplayName.length > 255) {
      showStatus("表示名は255文字以内で入力してください。", "error");
      return;
    }

    if (!isValidEmail(nextEmail)) {
      showStatus("メールアドレスの形式が正しくありません。", "error");
      return;
    }

    setIsSaving(true);
    showStatus("プロフィールを更新中...", "info");

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: nextDisplayName,
          email: nextEmail,
        }),
      });

      const data = (await response.json()) as {
        updated?: boolean;
        user?: { displayName?: string; email?: string };
        error?: string;
      };

      if (
        !response.ok ||
        !data.updated ||
        !data.user?.displayName ||
        !data.user?.email
      ) {
        throw new Error(
          readErrorMessage(data, "プロフィールの更新に失敗しました。"),
        );
      }

      const updatedName = data.user.displayName;
      const updatedEmail = data.user.email;
      setDisplayName(updatedName);
      setEmail(updatedEmail);
      onProfileUpdated({ displayName: updatedName, email: updatedEmail });
      showStatus("プロフィールを更新しました。", "success");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "プロフィールの更新に失敗しました。";
      showStatus(message, "error");
    } finally {
      setIsSaving(false);
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
          <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">プロフィール</h2>
          <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">
            表示名とメールアドレスを変更できます。
          </p>
        </div>

        <form className="md:col-span-2" onSubmit={updateProfile}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
            <div className="col-span-full">
              <label
                htmlFor="display-name"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                表示名
              </label>
              <div className="mt-2">
                <input
                  id="display-name"
                  type="text"
                  required
                  maxLength={255}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="表示名を入力"
                />
              </div>
            </div>

            <div className="col-span-full">
              <label
                htmlFor="email"
                className="block text-sm/6 font-medium text-gray-900 dark:text-white"
              >
                メールアドレス
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex">
            <button
              type="submit"
              disabled={isSaving}
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
