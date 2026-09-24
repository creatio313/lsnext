"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LoginStep = "identify" | "password" | "passkey";

type InitResponse =
  | {
      nextStep: "password";
      loginId: string;
    }
  | {
      nextStep: "passkey";
      loginId: string;
      options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
    };
/***
 * /api/auth/login/initAPIの応答検証。次のステップがパスワード認証かパスキー認証かを判定し、必要な情報が含まれているかを確認する。
 */
function isInitResponse(value: unknown): value is InitResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as { nextStep?: unknown; loginId?: unknown };
  return (
    (data.nextStep === "password" || data.nextStep === "passkey") &&
    typeof data.loginId === "string"
  );
}
/***
 * API応答からエラーメッセージを抽出する。応答がオブジェクトであり、"error"プロパティが存在する場合はその値を返す。それ以外の場合はフォールバックメッセージを返す。
 */
function readErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    return String((data as { error?: unknown }).error ?? fallback);
  }

  return fallback;
}

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("identify");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passkeyOptions, setPasskeyOptions] = useState<
    Parameters<typeof startAuthentication>[0]["optionsJSON"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // コンポーネントがマウントされているかどうかを追跡するためのフラグ。非同期処理中にコンポーネントがアンマウントされた場合、状態更新を防ぐために使用する。
    let isMounted = true;

    // 認証済みの場合はダッシュボードにリダイレクトする。
    async function redirectIfAuthenticated() {
      try {
        const response = await fetch("/api/auth/session", { method: "GET" });
        const data = (await response.json()) as {
          authenticated?: boolean;
        };

        if (isMounted && response.ok && data.authenticated) {
          router.replace("/dashboard");
        }
      } catch {
        // ログイン画面でのセッション確認失敗は無視する。
      }
    }

    void redirectIfAuthenticated();

    return () => {
      isMounted = false;
    };
  }, [router]);
  /***
   * ログインフローの開始。利用者IDを送信し、次のステップ（パスワード認証またはパスキー認証）を決定する。
   */
  async function beginLoginFlow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId }),
      });

      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          readErrorMessage(data, "ログイン初期化に失敗しました。"),
        );
      }

      if (!isInitResponse(data)) {
        throw new Error("不正な応答です。");
      }

      setLoginId(data.loginId);

      if (data.nextStep === "password") {
        setStep("password");
        return;
      }

      setStep("passkey");
      setPasskeyOptions(data.options);
      await runPasskeyLogin(data.options, data.loginId);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "ログインに失敗しました。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }
  /***
   * パスワード認証の送信。利用者IDとパスワードを送信し、認証結果に応じてダッシュボードにリダイレクトする。
   */
  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });

      const data = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };

      if (!response.ok || !data.authenticated) {
        throw new Error(data.error ?? "パスワード認証に失敗しました。");
      }

      router.push("/dashboard");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスワード認証に失敗しました。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }
  /***
   * パスキー認証の実行。WebAuthnを使用してパスキー認証を行い、認証結果に応じてダッシュボードにリダイレクトする。
   */
  async function runPasskeyLogin(
    options: Parameters<typeof startAuthentication>[0]["optionsJSON"],
    currentLoginId: string,
  ) {
    setError(null);
    setIsLoading(true);

    try {
      const authenticationResponse = await startAuthentication({
        optionsJSON: options,
      });

      const response = await fetch("/api/auth/login/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: currentLoginId,
          authenticationResponse,
        }),
      });

      const data = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };

      if (!response.ok || !data.authenticated) {
        throw new Error(data.error ?? "パスキー認証に失敗しました。");
      }

      router.push("/dashboard");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "パスキー認証に失敗しました。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900 dark:text-white">
          ログイン
        </h2>
      </div>
      <section className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {step === "identify" && (
          <form className="space-y-6" onSubmit={beginLoginFlow}>
            <div>
              <label
                htmlFor="loginId"
                className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
              >
                ID
              </label>
              <div className="mt-2">
                <input
                  id="loginId"
                  type="text"
                  name="loginId"
                  required
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                />
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
              >
                {isLoading ? "確認中..." : "次へ"}
              </button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form className="space-y-6" onSubmit={submitPassword}>
            <div>
              <label
                htmlFor="password"
                className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
              >
                パスワード
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
            >
              {isLoading ? "認証中..." : "ログイン"}
            </button>
          </form>
        )}

        {step === "passkey" && (
          <div className="space-y-6">
            <p className="text-sm text-slate-300">パスキー認証を行います。</p>
            <button
              type="button"
              onClick={() => {
                if (passkeyOptions) {
                  void runPasskeyLogin(passkeyOptions, loginId);
                }
              }}
              disabled={isLoading || !passkeyOptions}
              className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500"
            >
              {isLoading ? "処理中..." : "パスキーでログイン"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-10 rounded-md bg-red-50 p-4 dark:bg-red-500/15 dark:outline dark:outline-red-500/25">
            <div className="flex">
              <div className="shrink-0">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  data-slot="icon"
                  aria-hidden="true"
                  className="size-5 text-red-400"
                >
                  <path
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                    clipRule="evenodd"
                    fillRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  {error}
                </h3>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
