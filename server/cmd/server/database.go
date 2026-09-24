package main

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"time"

	"github.com/go-sql-driver/mysql"
)

func openDatabase(ctx context.Context, cfg databaseConfig) (*sql.DB, error) {
	dsn := mysqlDSN(cfg)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("DB接続の初期化に失敗しました：%w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("DBへの接続確認に失敗しました：%w", err)
	}

	return db, nil
}

func mysqlDSN(cfg databaseConfig) string {
	mysqlConfig := mysql.Config{
		User:                 cfg.User,
		Passwd:               cfg.Password,
		Net:                  "tcp",
		Addr:                 net.JoinHostPort(cfg.Host, cfg.Port),
		DBName:               cfg.Name,
		ParseTime:            true,
		AllowNativePasswords: true,
	}

	return mysqlConfig.FormatDSN()
}

func (c *archiveHandlingServer) getRecordingArchiveInfo(ctx context.Context, channelID, recordingID uint64) (recordingArchiveInfo, error) {
	const query = `
SELECT
  r.id,
  r.channel_id,
  r.file_path,
  ad.archive_destination_id,
  ad.web_accel_domain,
  ad.object_storage_site,
  ad.object_storage_bucket
FROM recordings r
JOIN channels ch ON ch.id = r.channel_id
JOIN archive_destinations ad ON ad.archive_destination_id = ch.archive_destination_id
WHERE r.id = ? AND r.channel_id = ?`

	var info recordingArchiveInfo
	if err := c.db.QueryRowContext(ctx, query, recordingID, channelID).Scan(
		&info.RecordingID,
		&info.ChannelID,
		&info.FilePath,
		&info.ArchiveDestinationID,
		&info.WebAccelDomain,
		&info.ObjectStorageSite,
		&info.ObjectStorageBucket,
	); err != nil {
		if err == sql.ErrNoRows {
			return recordingArchiveInfo{}, fmt.Errorf("録画情報が見つかりません：channel_id=%d recording_id=%d", channelID, recordingID)
		}
		return recordingArchiveInfo{}, fmt.Errorf("録画情報の取得に失敗しました：%w", err)
	}

	return info, nil
}

func (c *archiveHandlingServer) updateRecordingSummary(ctx context.Context, channelID, recordingID uint64, summaryText string) error {
	result, err := c.db.ExecContext(ctx, `UPDATE recordings SET summary_text = ? WHERE id = ? AND channel_id = ?`, summaryText, recordingID, channelID)
	if err != nil {
		return fmt.Errorf("要約結果のDB更新に失敗しました：%w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("要約結果のDB更新件数取得に失敗しました：%w", err)
	}
	if rows != 1 {
		return fmt.Errorf("要約結果のDB更新件数が不正です：rows=%d channel_id=%d recording_id=%d", rows, channelID, recordingID)
	}

	return nil
}

func (c *archiveHandlingServer) getArchiveDestination(ctx context.Context, archiveDestinationID string) (archiveDestinationInfo, error) {
	const query = `
SELECT
  ad.archive_destination_id,
  ad.object_storage_site,
  ad.object_storage_bucket
FROM archive_destinations ad
WHERE ad.archive_destination_id = ?`

	var info archiveDestinationInfo
	if err := c.db.QueryRowContext(ctx, query, archiveDestinationID).Scan(
		&info.ArchiveDestinationID,
		&info.ObjectStorageSite,
		&info.ObjectStorageBucket,
	); err != nil {
		if err == sql.ErrNoRows {
			return archiveDestinationInfo{}, fmt.Errorf("アーカイブ保存先が見つかりません：archive_destination_id=%q", archiveDestinationID)
		}
		return archiveDestinationInfo{}, fmt.Errorf("アーカイブ保存先の取得に失敗しました：%w", err)
	}

	return info, nil
}
