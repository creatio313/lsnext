const IMAGEFLUX_LS_API_ENDPOINT = "https://live-api.imageflux.jp/";

type ImageFluxErrorResponse = {
  error?: string;
  message?: string;
};

function getApiToken() {
  const token = process.env.IMAGEFLUX_LS_API_TOKEN?.trim();
  if (!token) {
    throw new Error("IMAGEFLUX_LS_API_TOKENが設定されていません。");
  }

  return token.startsWith("Bearer ") ? token.slice("Bearer ".length).trim() : token;
}

function readImageFluxError(data: unknown, fallback: string) {
  /*** エラーをそのまま返却する */
  if (data && typeof data === "object") {
    const body = data as ImageFluxErrorResponse;
    return body.error ?? body.message ?? fallback;
  }

  return fallback;
}

export async function callImageFluxLiveStreaming<TResponse>(
  target: string,
  body: Record<string, unknown>,
) {
  /***
   * ImageFlux Live Streaming APIを呼び出す汎用関数。
   * X-Sora-Targetを受けて、応答はそのまま返却する。
   */
  const response = await fetch(IMAGEFLUX_LS_API_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      "Content-Type": "application/json",
      "X-Sora-Target": target,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    throw new Error(readImageFluxError(data, "ImageFlux Live Streaming APIの呼び出しに失敗しました。"));
  }

  return data as TResponse;
}