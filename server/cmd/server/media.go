package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// アーカイブのURLをさくらのウェブアクセラレータのドメイン+パスの形式で構築する
func buildArchiveURL(domain, filePath string) (string, error) {
	// DBに保存されたfile_pathはオブジェクトキー相当なので、先頭/末尾の余分な区切りを正規化する。
	archivePath := strings.Trim(path.Clean("/"+strings.TrimSpace(filePath)), "/")
	if archivePath == "" || archivePath == "." {
		return "", fmt.Errorf("file_pathからアーカイブパスを取得できません：%q", filePath)
	}

	// archive_destinations.web_accel_domainにはスキームなしの値が入ることも許容する。
	normalizedDomain := strings.TrimRight(strings.TrimSpace(domain), "/")
	if normalizedDomain == "" {
		return "", fmt.Errorf("archive.http_domainが設定されていません")
	}
	if !strings.HasPrefix(normalizedDomain, "http://") && !strings.HasPrefix(normalizedDomain, "https://") {
		normalizedDomain = "https://" + normalizedDomain
	}

	// Webアクセラレータのドメインと録画ファイルパスを結合し、.m3u8取得用URLにする。
	return normalizedDomain + "/" + archivePath, nil
}

// 指定URLからテキストを取得する。.m3u8の取得に使うため、レスポンス本文はそのまま文字列として返す。
func fetchText(ctx context.Context, httpClient *http.Client, targetURL string) (string, error) {
	// 呼び出し元のコンテキストをHTTPリクエストへ渡し、MQ処理停止時に取得も中断できるようにする。
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return "", fmt.Errorf("GETリクエストの生成に失敗しました：%w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GETリクエストに失敗しました：%w", err)
	}
	defer resp.Body.Close()

	// エラー時も本文に詳細が含まれる可能性があるため、ステータス判定前に読み切る。
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("レスポンスの読み取りに失敗しました：%w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("GETリクエストがエラーを返却しました：status=%d", resp.StatusCode)
	}

	return string(body), nil
}

// FFmpegへ渡すために、取得した.m3u8をローカル作業ディレクトリへ書き出す。
func prepareLocalPlaylist(playlist, playlistURL, keyProxyURL, workDir string) (string, error) {
	// 先に鍵URIと.ts参照を書き換え、FFmpegがこのサーバ経由で復号鍵を取れる状態にする。
	rewritten, err := rewritePlaylist(playlist, playlistURL, keyProxyURL)
	if err != nil {
		return "", err
	}

	// FFmpegにはHTTP上の元.m3u8ではなく、書き換え済みのローカル.m3u8を入力させる。
	playlistPath := filepath.Join(workDir, "archive.m3u8")
	if err := os.WriteFile(playlistPath, []byte(rewritten), 0600); err != nil {
		return "", fmt.Errorf("ローカル.m3u8の書き込みに失敗しました：%w", err)
	}

	return playlistPath, nil
}

// HLSプレイリスト内の暗号鍵URIとメディアセグメントURIを、このワーカーで処理できる形へ書き換える。
func rewritePlaylist(playlist, playlistURL, keyProxyURL string) (string, error) {
	// 相対パスの.tsを絶対URLへ解決するため、元.m3u8のURLを基準URLとして保持する。
	baseURL, err := url.Parse(playlistURL)
	if err != nil {
		return "", fmt.Errorf(".m3u8 URLの解析に失敗しました：%w", err)
	}
	// 鍵URIはローカル鍵中継サーバへ向け、kidだけを引き継ぐ。
	keyBaseURL := strings.TrimRight(keyProxyURL, "/")

	// CRLFとLFの差を吸収してから1行ずつ処理する。
	lines := strings.Split(strings.ReplaceAll(playlist, "\r\n", "\n"), "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "#EXT-X-KEY:"):
			// 暗号化HLSではEXT-X-KEY内のURIにkidが付くため、そのkidでImageFluxから鍵を取得する。
			kid, err := extractKIDFromKeyLine(trimmed)
			if err != nil {
				return "", err
			}
			lines[i] = replaceAttributeValue(line, "URI", keyBaseURL+"/encrypt_key?kid="+url.QueryEscape(kid))
		case trimmed == "" || strings.HasPrefix(trimmed, "#"):
			// コメント行やHLSタグ行は、EXT-X-KEY以外はそのまま残す。
			continue
		default:
			// セグメント行は相対パスのままだとローカル.m3u8基準になってしまうため、Webアクセラレータの絶対URLにする。
			absoluteURL, err := resolveMediaURL(baseURL, trimmed)
			if err != nil {
				return "", err
			}
			lines[i] = absoluteURL
		}
	}

	return strings.Join(lines, "\n"), nil
}

// EXT-X-KEY行のURI属性からkidクエリパラメータを取り出す。
func extractKIDFromKeyLine(line string) (string, error) {
	// HLSの属性リストからURI="..."だけを抽出する。METHODなど他属性はここでは参照しない。
	uri, ok := extractAttributeValue(line, "URI")
	if !ok {
		return "", fmt.Errorf("EXT-X-KEYにURI属性がありません：%s", line)
	}

	// 既存の会員認証API URLに付与されたkidだけを、新しいローカル鍵URIへ引き継ぐ。
	parsed, err := url.Parse(uri)
	if err != nil {
		return "", fmt.Errorf("EXT-X-KEY URIの解析に失敗しました：%w", err)
	}
	kid := strings.TrimSpace(parsed.Query().Get("kid"))
	if kid == "" {
		return "", fmt.Errorf("EXT-X-KEY URIにkidがありません：%s", uri)
	}

	return kid, nil
}

// .m3u8の場所を基準に、相対または絶対のセグメントURIを絶対URLへ解決する。
func resolveMediaURL(baseURL *url.URL, mediaPath string) (string, error) {
	parsed, err := url.Parse(mediaPath)
	if err != nil {
		return "", fmt.Errorf("メディアパスの解析に失敗しました：%w", err)
	}
	return baseURL.ResolveReference(parsed).String(), nil
}

// HLS属性リストから attribute="value" 形式の値を取り出すための最小限の補助関数。
func extractAttributeValue(line, attribute string) (string, bool) {
	prefix := attribute + "=\""
	start := strings.Index(line, prefix)
	if start < 0 {
		return "", false
	}
	start += len(prefix)
	end := strings.Index(line[start:], "\"")
	if end < 0 {
		return "", false
	}
	return line[start : start+end], true
}

// HLS属性リストの attribute="value" 形式の値だけを差し替える。
func replaceAttributeValue(line, attribute, value string) string {
	prefix := attribute + "=\""
	start := strings.Index(line, prefix)
	if start < 0 {
		return line
	}
	start += len(prefix)
	end := strings.Index(line[start:], "\"")
	if end < 0 {
		return line
	}
	return line[:start] + value + line[start+end:]
}

// ffmpegでアーカイブURLから音声を抽出しつつ、指定秒数ごとにmp3分割する。
func extractMP3SegmentsFromArchive(ctx context.Context, archiveURL, workDir string) ([]string, error) {
	// AI Engineの文字起こし上限に収めるため、長い録画は一定秒数ごとのMP3に分割する。
	segmentPattern := filepath.Join(workDir, "part-%03d.mp3")
	args := []string{
		"-y",
		"-protocol_whitelist", "file,http,https,tcp,tls,crypto,data",
		"-i", archiveURL,
		"-vn",
		"-f", "segment",
		"-segment_time", fmt.Sprintf("%d", int(maxAudioDurationSeconds)),
		"-reset_timestamps", "1",
		"-acodec", "libmp3lame",
		"-ar", "16000",
		"-ac", "1",
		segmentPattern,
	}
	if err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return nil, fmt.Errorf("アーカイブからの音声分割生成に失敗しました：%w", err)
	}

	// FFmpegが生成した分割ファイルを名前順に並べ、録画の時系列順で文字起こしできるようにする。
	splitFiles, err := filepath.Glob(filepath.Join(workDir, "part-*.mp3"))
	if err != nil {
		return nil, fmt.Errorf("分割ファイルの列挙に失敗しました：%w", err)
	}
	if len(splitFiles) == 0 {
		return nil, fmt.Errorf("音声分割の結果が空です")
	}
	sort.Strings(splitFiles)

	return splitFiles, nil
}

// 外部コマンドを実行し、失敗時はデバッグしやすいように末尾の出力をエラーへ含める。
func runCommand(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if len(output) > 4096 {
			output = output[len(output)-4096:]
		}
		return fmt.Errorf("外部コマンドが失敗しました：command=%s args=%v err=%w output=%s", name, args, err, string(output))
	}
	return nil
}
