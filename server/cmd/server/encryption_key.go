package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
)

type encryptKeyProxy struct {
	server *http.Server
	url    string
}

func startEncryptKeyProxy(ctx context.Context, httpClient *http.Client, imageFluxToken string) (*encryptKeyProxy, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("ローカルリスナーの作成に失敗しました：%w", err)
	}

	mux := http.NewServeMux()
	server := &http.Server{Handler: mux}
	proxy := &encryptKeyProxy{
		server: server,
		url:    "http://" + listener.Addr().String(),
	}

	mux.HandleFunc("/encrypt_key", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		kid := strings.TrimSpace(r.URL.Query().Get("kid"))
		if kid == "" {
			http.Error(w, "kid is required", http.StatusBadRequest)
			return
		}

		key, err := fetchEncryptKey(r.Context(), httpClient, imageFluxToken, kid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(key)
	})

	go func() {
		<-ctx.Done()
		_ = proxy.Close()
	}()
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Printf("復号鍵中継サーバが異常終了しました：%v\n", err)
		}
	}()

	return proxy, nil
}

func (p *encryptKeyProxy) URL() string {
	return p.url
}

func (p *encryptKeyProxy) Close() error {
	return p.server.Close()
}

func fetchEncryptKey(ctx context.Context, httpClient *http.Client, imageFluxToken, kid string) ([]byte, error) {
	body, err := json.Marshal(map[string]string{"kid": kid})
	if err != nil {
		return nil, fmt.Errorf("GetEncryptKeyリクエストJSON化に失敗しました：%w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, imageFluxLiveAPIURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("GetEncryptKeyリクエストの生成に失敗しました：%w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sora-Target", "ImageFlux_20200707.GetEncryptKey")
	req.Header.Set("Authorization", "Bearer "+imageFluxToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GetEncryptKey API呼び出しに失敗しました：%w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("GetEncryptKeyレスポンスの読み取りに失敗しました：%w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GetEncryptKey APIがエラーを返却しました：status=%d", resp.StatusCode)
	}

	var parsed struct {
		EncryptKey string `json:"encrypt_key"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("GetEncryptKeyレスポンスのJSON解析に失敗しました：%w", err)
	}

	key, err := hex.DecodeString(strings.TrimSpace(parsed.EncryptKey))
	if err != nil {
		return nil, fmt.Errorf("encrypt_keyのhexデコードに失敗しました：%w", err)
	}
	if len(key) != 16 {
		return nil, fmt.Errorf("encrypt_keyのバイト長が不正です：got=%d want=16", len(key))
	}

	return key, nil
}
