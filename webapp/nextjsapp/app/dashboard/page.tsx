"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DashboardHeader,
  type DashboardTab,
} from "./_components/dashboard-header";
import { StatusNotification } from "../_components/status-notification";
import { ProfilePanel } from "./_components/profile-panel";
import { SettingsPanel } from "./_components/settings-panel";
import { ManagementPanel } from "./_components/management-panel";
import { StreamingPanel } from "./_components/streaming-panel";
import { WatchPanel } from "./_components/watch-panel";

type SessionUser = {
  id: number;
  loginId: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
};

type SessionResponse = {
  authenticated: boolean;
  user?: SessionUser;
};

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("streaming");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    /***
     * 利用者がダッシュボードにアクセスした際に、セッション情報を取得して認証状態を確認する。
     */
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { method: "GET" });
        const data = (await response.json()) as SessionResponse;

        if (!isMounted) {
          return;
        }

        if (!response.ok || !data.authenticated || !data.user) {
          router.replace("/");
          return;
        }

        setUser(data.user);
      } catch {
        if (isMounted) {
          router.replace("/");
        }
      } finally {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  /***
   * ログアウト処理を実行する。ログアウトに成功した場合はトップページにリダイレクトする。
   * httpOnlyで発行したCookieであるため、サーバ側APIでセッションを破棄する必要がある。
   */
  async function logout() {
    setError(null);
    setIsLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "ログアウトに失敗しました。");
      }

      router.replace("/");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "ログアウトに失敗しました。";
      setError(message);
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isLoadingSession) {
    return (
      <main>
        <p className="text-sm text-slate-300">セッション確認中...</p>
        <div className="rounded-md bg-blue-500/10 p-4 outline outline-blue-500/20">
          <div className="flex">
            <div className="shrink-0">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                data-slot="icon"
                aria-hidden="true"
                className="size-5 text-blue-400"
              >
                <path
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                  clipRule="evenodd"
                  fillRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1 md:flex md:justify-between">
              <p className="text-sm text-blue-300">セッション確認中...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <DashboardHeader
        activeTab={activeTab}
        canViewAdmin={user.role === "admin"}
        displayName={user.displayName}
        email={user.email}
        isLoggingOut={isLoggingOut}
        onSelectTab={setActiveTab}
        onLogout={() => {
          void logout();
        }}
      />
      <main className="mx-auto max-w-7xl">
        {activeTab === "streaming" && <StreamingPanel />}

        {activeTab === "watch" && (
          <WatchPanel />
        )}

        {activeTab === "admin" && user.role === "admin" && (
          <ManagementPanel />
        )}

        {activeTab === "profile" && (
          <ProfilePanel
            currentDisplayName={user.displayName}
            currentEmail={user.email}
            onProfileUpdated={({ displayName, email }) => {
              setUser((previous) => {
                if (!previous) {
                  return previous;
                }

                return { ...previous, displayName, email };
              });
            }}
          />
        )}

        {activeTab === "settings" && <SettingsPanel />}

        <StatusNotification
          message={error ?? ""}
          tone="error"
          onClose={() => setError(null)}
        />
      </main>
    </>
  );
}
