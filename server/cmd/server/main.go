package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	cfg, err := loadConfigFromEnv()
	if err != nil {
		log.Fatalf("環境変数の読み込みに失敗しました：%v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// サーバの初期化
	server, err := newArchiveHandlingServer(ctx, cfg)
	if err != nil {
		log.Fatalf("アーカイブ処理サーバの初期化に失敗しました：%v", err)
	}
	defer server.close()

	// シンプルMQからのメッセージ受信頻度の設定
	pollInterval := parseDurationOrDefault(cfg.SimpleMQ.PollInterval, 5*time.Second)
	errorRetryInterval := parseDurationOrDefault(cfg.SimpleMQ.ErrorRetryInterval, 60*time.Second)

	log.Printf("シンプルMQコンシューマを開始します：queue=%q poll_interval=%s", server.queueName, pollInterval)
	if err := runConsumerLoop(ctx, server, pollInterval, errorRetryInterval); err != nil && ctx.Err() == nil {
		log.Fatalf("コンシューマループが異常終了しました：%v", err)
	}

	log.Printf("シンプルMQコンシューマを終了します。")
}

// シンプルMQ確認頻度設定をパースするだけ。
func parseDurationOrDefault(value string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(value)
	if v == "" {
		return fallback
	}

	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		log.Printf("duration値%qが不正のため既定値%sを使用します。", v, fallback)
		return fallback
	}

	return d
}

/*
**
メインループ
**
*/
func runConsumerLoop(ctx context.Context, server *archiveHandlingServer, pollInterval, errorRetryInterval time.Duration) error {
	for {
		if ctx.Err() != nil {
			return nil
		}

		//シンプルMQからメッセージを受信する。エラーおよび空の場合は指定時間後に再度受信を試みる。
		msg, ok, err := server.receiveOne(ctx)
		if err != nil {
			log.Printf("メッセージ受信に失敗しました：%v", err)
			if !sleepWithContext(ctx, errorRetryInterval) {
				return nil
			}
			continue
		}
		if !ok {
			if !sleepWithContext(ctx, pollInterval) {
				return nil
			}
			continue
		}

		// メッセージの処理
		if err := handleMessage(ctx, server, msg); err != nil {
			log.Printf("シンプルMQメッセージ処理に失敗しました。次回再取得に任せます：id=%s err=%v", msg.ID, err)
			if !sleepWithContext(ctx, errorRetryInterval) {
				return nil
			}
			continue
		}

		if err := server.deleteMessage(ctx, msg.ID); err != nil {
			log.Printf("シンプルMQメッセージ削除に失敗しました。重複処理を避けるため確認が必要です：id=%s err=%v", msg.ID, err)
			if !sleepWithContext(ctx, errorRetryInterval) {
				return nil
			}
			continue
		}
	}
}

/*
**
メイン処理
**
*/
func handleMessage(ctx context.Context, server *archiveHandlingServer, msg mqMessage) error {
	//メッセージ内容を取得する
	decoded, err := base64.StdEncoding.DecodeString(msg.Content)
	if err != nil {
		return fmt.Errorf("content（base64）のデコードに失敗しました：%w", err)
	}

	var payload mqPayload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return fmt.Errorf("メッセージJSONのパースに失敗しました：%w", err)
	}

	log.Printf(
		"受信メッセージ：id=%s type=%q channel_id=%d recording_id=%d archive_destination_id=%q",
		msg.ID,
		payload.Type,
		payload.ChannelID,
		payload.RecordingID,
		payload.ArchiveDestinationID,
	)

	switch payload.Type {
	case "recording_summary":
		return handleRecordingSummary(ctx, server, payload)
	case "archive_cleanup":
		return handleArchiveCleanup(ctx, server, payload)
	default:
		return fmt.Errorf("未対応のメッセージタイプです：%q", payload.Type)
	}
}

func handleRecordingSummary(ctx context.Context, server *archiveHandlingServer, payload mqPayload) error {
	if payload.ChannelID == 0 || payload.RecordingID == 0 {
		return fmt.Errorf("recording_summaryにはchannelIdとrecordingIdが必要です：channelId=%d recordingId=%d", payload.ChannelID, payload.RecordingID)
	}

	archiveInfo, err := server.getRecordingArchiveInfo(ctx, payload.ChannelID, payload.RecordingID)
	if err != nil {
		return err
	}

	archiveURL, err := buildArchiveURL(archiveInfo.WebAccelDomain, archiveInfo.FilePath)
	if err != nil {
		return fmt.Errorf("アーカイブURLの構築に失敗しました：%w", err)
	}

	m3u8Content, err := fetchText(ctx, server.httpClient, archiveURL)
	if err != nil {
		return fmt.Errorf("m3u8の取得に失敗しました：%w", err)
	}

	//アーカイブ音声処理用の作業ディレクトリを作成する
	workDir, err := os.MkdirTemp("", "archive-audio-*")
	if err != nil {
		return fmt.Errorf("作業ディレクトリの作成に失敗しました：%w", err)
	}
	defer os.RemoveAll(workDir)

	keyServer, err := startEncryptKeyProxy(ctx, server.httpClient, server.imageFluxAPIToken)
	if err != nil {
		return fmt.Errorf("復号鍵中継サーバの開始に失敗しました：%w", err)
	}
	defer keyServer.Close()

	localPlaylist, err := prepareLocalPlaylist(m3u8Content, archiveURL, keyServer.URL(), workDir)
	if err != nil {
		return fmt.Errorf("m3u8の書き換えに失敗しました：%w", err)
	}

	// アーカイブURLから音声を抽出しつつ分割する。
	segments, err := extractMP3SegmentsFromArchive(ctx, localPlaylist, workDir)
	if err != nil {
		return fmt.Errorf("音声抽出に失敗しました：%w", err)
	}

	/***
		文字起こし
	***/
	//分割した音声ファイルを順番に文字起こしする。結果をtranscriptParts変数に追加していく。
	transcriptParts := make([]string, 0, len(segments))
	for i, segmentPath := range segments {
		text, err := server.transcribeAudio(ctx, segmentPath)
		if err != nil {
			return fmt.Errorf("文字起こしに失敗しました（part %d/%d）：%w", i+1, len(segments), err)
		}
		transcriptParts = append(transcriptParts, text)
	}

	transcriptText := strings.TrimSpace(strings.Join(transcriptParts, "\n\n"))
	if transcriptText == "" {
		return fmt.Errorf("文字起こし結果が空です：channelId=%d recordingId=%d", payload.ChannelID, payload.RecordingID)
	}

	summaryText, err := server.summarizeTranscript(ctx, transcriptText)
	if err != nil {
		return fmt.Errorf("要約生成に失敗しました：%w", err)
	}

	if err := server.updateRecordingSummary(ctx, payload.ChannelID, payload.RecordingID, summaryText); err != nil {
		return err
	}
	log.Printf("要約結果をDBへ保存しました：channel_id=%d recording_id=%d", payload.ChannelID, payload.RecordingID)

	return nil
}

func handleArchiveCleanup(ctx context.Context, server *archiveHandlingServer, payload mqPayload) error {
	if payload.ChannelID == 0 || payload.ArchiveDestinationID == "" || len(payload.FilePaths) == 0 {
		return fmt.Errorf("archive_cleanupにはchannelId、archiveDestinationId、filePathsが必要です")
	}

	destination, err := server.getArchiveDestination(ctx, payload.ArchiveDestinationID)
	if err != nil {
		return err
	}

	if err := server.deleteArchivePrefixes(ctx, destination, payload.FilePaths); err != nil {
		return err
	}
	log.Printf("アーカイブ削除を完了しました：channel_id=%d archive_destination_id=%q file_paths=%d", payload.ChannelID, payload.ArchiveDestinationID, len(payload.FilePaths))

	return nil
}

// 指定時間待機するが、コンテキストがキャンセルされたら早期に戻る。
func sleepWithContext(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
