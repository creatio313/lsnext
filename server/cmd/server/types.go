package main

import (
	"database/sql"
	"net/http"
)

const (
	// URL系
	simpleMQBaseURL        = "https://simplemq.tk1b.api.sacloud.jp"
	defaultAIEngineBaseURL = "https://api.ai.sakura.ad.jp"
	imageFluxLiveAPIURL    = "https://live-api.imageflux.jp/"
	jpNorth1S3Endpoint     = "s3.isk01.sakurastorage.jp"
	jpEast1S3Endpoint      = "s3.tky01.sakurastorage.jp"

	//既定設定値
	defaultTranscriptionModel = "whisper-large-v3-turbo"
	defaultSummaryModel       = "llm-jp-3.1-8x13b-instruct4"
	maxAudioDurationSeconds   = 25 * 60
	maxAudioSizeBytes         = 30 * 1024 * 1024
)

type appConfig struct {
	SimpleMQ      simpleMQConfig
	AIEngine      aiEngineConfig
	ImageFlux     imageFluxConfig
	Database      databaseConfig
	ObjectStorage objectStorageConfig
}

type simpleMQConfig struct {
	QueueKey           string
	QueueName          string
	PollInterval       string
	ErrorRetryInterval string
}

type aiEngineConfig struct {
	BaseURL            string
	APIKey             string
	TranscriptionModel string
	SummaryModel       string
}

type imageFluxConfig struct {
	LiveStreamingAPIToken string
}

type databaseConfig struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
}

type objectStorageConfig struct {
	Credentials map[string]objectStorageCredential
}

type objectStorageCredential struct {
	AccessKeyID     string
	SecretAccessKey string
}

type archiveHandlingServer struct {
	simpleMQQueueKey   string
	queueName          string
	aiEngineBaseURL    string
	aiEngineAPIKey     string
	transcriptModel    string
	summaryModel       string
	imageFluxAPIToken  string
	db                 *sql.DB
	objectStorageCreds map[string]objectStorageCredential
	httpClient         *http.Client
}

// シンプルMQのメッセージ受信応答
type simpleMQReceiveResponse struct {
	Result   string      `json:"result"`
	Messages []mqMessage `json:"messages"`
}

// シンプルMQのメッセージ応答のうちメッセージ部分（配列要素）
type mqMessage struct {
	ID                  string `json:"id"`
	Content             string `json:"content"`
	CreatedAt           int64  `json:"created_at"`
	UpdatedAt           int64  `json:"updated_at"`
	ExpiresAt           int64  `json:"expires_at"`
	AcquiredAt          int64  `json:"acquired_at"`
	VisibilityTimeoutAt int64  `json:"visibility_timeout_at"`
}

type mqPayload struct {
	Type                 string   `json:"type"`
	ChannelID            uint64   `json:"channelId"`
	RecordingID          uint64   `json:"recordingId,omitempty"`
	ArchiveDestinationID string   `json:"archiveDestinationId,omitempty"`
	FilePaths            []string `json:"filePaths,omitempty"`
}

type recordingArchiveInfo struct {
	RecordingID          uint64
	ChannelID            uint64
	FilePath             string
	ArchiveDestinationID string
	WebAccelDomain       string
	ObjectStorageSite    string
	ObjectStorageBucket  string
}

type archiveDestinationInfo struct {
	ArchiveDestinationID string
	ObjectStorageSite    string
	ObjectStorageBucket  string
}
