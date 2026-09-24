"use client";

import { useEffect, useRef, useState } from "react";

type HlsVideoProps = {
  src: string;
  autoPlay?: boolean;
};

const HLS_CONFIG = {
  manifestLoadingTimeOut: 3000,
  manifestLoadingMaxRetry: 10,
  manifestLoadingMaxRetryTimeout: 3000,
  levelLoadingTimeOut: 3000,
  levelLoadingMaxRetry: 10,
  levelLoadingMaxRetryTimeout: 3000,
  fragLoadingTimeOut: 3000,
  fragLoadingMaxRetry: 10,
  fragLoadingMaxRetryTimeout: 3000,
  liveBackBufferLength: 0,
};

export function HlsVideo({ src, autoPlay = false }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let hls: import("hls.js").default | null = null;
    let active = true;

    async function attachPlayer() {
      const video = videoRef.current;
      if (!video) return;

      const { default: Hls } = await import("hls.js");
      if (!active) return;

      if (Hls.isSupported()) {
        hls = new Hls(HLS_CONFIG);
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setError("HLS動画を再生できませんでした。");
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        setError("このブラウザはHLS再生に対応していません。");
      }
    }

    const video = videoRef.current;
    void attachPlayer().catch(() => setError("HLSプレイヤーの読み込みに失敗しました。"));
    return () => {
      active = false;
      hls?.destroy();
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [src]);

  return (
    <div className="relative aspect-video bg-gray-950">
      <video ref={videoRef} autoPlay={autoPlay} playsInline controls className="h-full w-full object-contain" />
      {error && <p className="absolute inset-x-4 bottom-4 rounded-md bg-black/75 px-3 py-2 text-center text-sm text-white">{error}</p>}
    </div>
  );
}