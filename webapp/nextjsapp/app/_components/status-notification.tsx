"use client";

import { Transition } from "@headlessui/react";
import {
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect } from "react";

/***
 * 通知、完了、エラーの3種に対応する。
 */
export type StatusNotificationTone = "info" | "success" | "error";

type StatusNotificationProps = {
  message: string;
  tone?: StatusNotificationTone;
  onClose: () => void;
  autoHideMs?: number;
  ariaLive?: "assertive" | "polite";
};

export function StatusNotification({
  message,
  tone = "info",
  onClose,
  autoHideMs = 3000,
  ariaLive = "assertive",
}: StatusNotificationProps) {
  //メッセージが存在しない場合、または自動非表示の時間が0以下の場合は、タイマーを設定しない。
  useEffect(() => {
    if (!message || autoHideMs <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      onClose();
    }, autoHideMs);

    return () => clearTimeout(timer);
  }, [autoHideMs, message, onClose]);

  //メッセージの種類に応じてアイコンを変化させる。
  function renderIcon() {
    if (tone === "error") {
      return <XCircleIcon aria-hidden="true" className="size-6 text-red-400" />;
    }

    if (tone === "success") {
      return (
        <CheckCircleIcon aria-hidden="true" className="size-6 text-green-400" />
      );
    }

    return (
      <InformationCircleIcon
        aria-hidden="true"
        className="size-6 text-cyan-400"
      />
    );
  }

  return (
    <div
      aria-live={ariaLive}
      className="pointer-events-none fixed inset-0 z-50 flex items-end px-4 py-6 sm:items-start sm:p-6"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <Transition show={!!message}>
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-gray-800 dark:-outline-offset-1 dark:outline-white/10">
            <div className="p-4">
              <div className="flex items-start">
                <div className="shrink-0">{renderIcon()}</div>
                <div className="ml-3 w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{message}</p>
                </div>
                <div className="ml-4 flex shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:hover:text-white dark:focus:outline-indigo-500"
                  >
                    <span className="sr-only">閉じる</span>
                    <XMarkIcon aria-hidden="true" className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  );
}
