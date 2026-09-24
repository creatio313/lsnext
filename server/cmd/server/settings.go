package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

func loadConfigFromEnv() (appConfig, error) {
	cfg := appConfig{
		SimpleMQ: simpleMQConfig{
			QueueKey:           env("SIMPLE_MQ_QUEUE_KEY"),
			QueueName:          env("SIMPLE_MQ_QUEUE_NAME"),
			PollInterval:       env("SIMPLE_MQ_POLL_INTERVAL"),
			ErrorRetryInterval: env("SIMPLE_MQ_ERROR_RETRY_INTERVAL"),
		},
		AIEngine: aiEngineConfig{
			BaseURL:            envOrDefault("AI_ENGINE_BASE_URL", defaultAIEngineBaseURL),
			APIKey:             env("AI_ENGINE_API_KEY"),
			TranscriptionModel: envOrDefault("AI_TRANSCRIPTION_MODEL", defaultTranscriptionModel),
			SummaryModel:       envOrDefault("AI_SUMMARY_MODEL", defaultSummaryModel),
		},
		ImageFlux: imageFluxConfig{
			LiveStreamingAPIToken: env("IMAGEFLUX_LS_API_TOKEN"),
		},
		Database: databaseConfig{
			Host:     env("DB_HOST"),
			Port:     envOrDefault("DB_PORT", "3306"),
			Name:     env("DB_NAME"),
			User:     env("DB_USER"),
			Password: env("DB_PASSWORD"),
		},
		ObjectStorage: objectStorageConfig{
			Credentials: map[string]objectStorageCredential{
				"jp-north-1": {
					AccessKeyID:     env("OBJST_JP_NORTH_1_ACCESS_KEY_ID"),
					SecretAccessKey: env("OBJST_JP_NORTH_1_SECRET_ACCESS_KEY"),
				},
				"jp-east-1": {
					AccessKeyID:     env("OBJST_JP_EAST_1_ACCESS_KEY_ID"),
					SecretAccessKey: env("OBJST_JP_EAST_1_SECRET_ACCESS_KEY"),
				},
			},
		},
	}

	if err := validateConfig(cfg); err != nil {
		return appConfig{}, err
	}

	return cfg, nil
}

func newArchiveHandlingServer(ctx context.Context, cfg appConfig) (*archiveHandlingServer, error) {
	db, err := openDatabase(ctx, cfg.Database)
	if err != nil {
		return nil, err
	}

	return &archiveHandlingServer{
		simpleMQQueueKey:   cfg.SimpleMQ.QueueKey,
		queueName:          cfg.SimpleMQ.QueueName,
		aiEngineBaseURL:    cfg.AIEngine.BaseURL,
		aiEngineAPIKey:     cfg.AIEngine.APIKey,
		transcriptModel:    cfg.AIEngine.TranscriptionModel,
		summaryModel:       cfg.AIEngine.SummaryModel,
		imageFluxAPIToken:  cfg.ImageFlux.LiveStreamingAPIToken,
		db:                 db,
		objectStorageCreds: cfg.ObjectStorage.Credentials,
		httpClient:         &http.Client{Timeout: 120 * time.Second},
	}, nil
}

func (c *archiveHandlingServer) close() {
	if c.db != nil {
		if err := c.db.Close(); err != nil {
			fmt.Printf("DB接続のクローズに失敗しました：%v\n", err)
		}
	}
}

func validateConfig(cfg appConfig) error {
	missing := make([]string, 0)
	for name, value := range map[string]string{
		"SIMPLE_MQ_QUEUE_KEY":    cfg.SimpleMQ.QueueKey,
		"SIMPLE_MQ_QUEUE_NAME":   cfg.SimpleMQ.QueueName,
		"AI_ENGINE_API_KEY":      cfg.AIEngine.APIKey,
		"IMAGEFLUX_LS_API_TOKEN": cfg.ImageFlux.LiveStreamingAPIToken,
		"DB_HOST":                cfg.Database.Host,
		"DB_NAME":                cfg.Database.Name,
		"DB_USER":                cfg.Database.User,
		"DB_PASSWORD":            cfg.Database.Password,
	} {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("必須環境変数が不足しています：%s", strings.Join(missing, ", "))
	}

	if !hasObjectStorageCredential(cfg.ObjectStorage.Credentials) {
		return fmt.Errorf("OBJST_JP_NORTH_1_ACCESS_KEY_ID/OBJST_JP_NORTH_1_SECRET_ACCESS_KEYまたはOBJST_JP_EAST_1_ACCESS_KEY_ID/OBJST_JP_EAST_1_SECRET_ACCESS_KEYのいずれか一式が必要です。")
	}

	return nil
}

func hasObjectStorageCredential(credentials map[string]objectStorageCredential) bool {
	for _, credential := range credentials {
		if strings.TrimSpace(credential.AccessKeyID) != "" && strings.TrimSpace(credential.SecretAccessKey) != "" {
			return true
		}
	}
	return false
}

func env(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func envOrDefault(name, fallback string) string {
	if value := env(name); value != "" {
		return value
	}
	return fallback
}
