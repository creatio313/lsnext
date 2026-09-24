-- live_streaming_app.archive_destinations definition

CREATE TABLE `archive_destinations` (
  `archive_destination_id` varchar(64) NOT NULL COMMENT 'アーカイブ保存先ID',
  `object_storage_site` enum('jp-north-1','jp-east-1') NOT NULL COMMENT 'オブジェクトストレージのサイト',
  `object_storage_bucket` varchar(255) NOT NULL COMMENT 'オブジェクトストレージのバケット',
  `web_accel_domain` varchar(255) NOT NULL COMMENT 'アーカイブ保存先IDに紐づくさくらのウェブアクセラレータのドメイン',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`archive_destination_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='アーカイブ保存先情報';


-- live_streaming_app.users definition

CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `login_id` varchar(255) NOT NULL COMMENT '利用者ID（ログイン用）',
  `display_name` varchar(255) NOT NULL COMMENT '表示名',
  `email` varchar(255) NOT NULL COMMENT 'メールアドレス',
  `role` enum('admin','user') NOT NULL DEFAULT 'user' COMMENT 'ロール（管理者/利用者）',
  `password_hash` varchar(255) NOT NULL COMMENT 'パスワードハッシュ',
  `is_passkey_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'パスキー有効化フラグ',
  `created_by` bigint(20) unsigned DEFAULT NULL COMMENT 'この利用者を追加した管理者ID',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `login_id` (`login_id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_created_by` (`created_by`),
  CONSTRAINT `fk_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='利用者情報';


-- 初期管理者（ログインID: root、パスワード: root）
INSERT INTO `users` (
  `login_id`,
  `display_name`,
  `email`,
  `role`,
  `password_hash`,
  `is_passkey_enabled`,
  `created_by`
) VALUES (
  'root',
  'root',
  'root@example.invalid',
  'admin',
  '$2b$12$Y7e8ni95UiZLVhX2w.Qg1ucsvtdvxRWZHyY8i2mxpR9D1GBGhdA3y',
  0,
  NULL
);


-- live_streaming_app.channels definition

CREATE TABLE `channels` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT 'チャンネル名称',
  `description` text DEFAULT NULL COMMENT '説明',
  `owner_id` bigint(20) unsigned NOT NULL COMMENT 'チャンネル所有者（利用者ID）',
  `stream_type` enum('webrtc','webrtc_to_hls') NOT NULL COMMENT '配信方式',
  `is_recording_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '録画有効化フラグ',
  `is_summary_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '要約有効化フラグ',
  `is_live_end` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ライブ配信終了フラグ',
  `archive_destination_id` varchar(64) DEFAULT NULL COMMENT 'アーカイブ保存先ID',
  `imageflux_channel_id` varchar(64) DEFAULT NULL COMMENT 'ImageFluxチャンネルID',
  `imageflux_sora_url` varchar(1024) DEFAULT NULL COMMENT 'ImageFluxのSoraサーバURL（配信終了後NULL化あり）',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_channels_owner_id` (`owner_id`),
  KEY `fk_channels_archive_destination_id` (`archive_destination_id`),
  CONSTRAINT `fk_channels_archive_destination_id` FOREIGN KEY (`archive_destination_id`) REFERENCES `archive_destinations` (`archive_destination_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_channels_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ライブ配信チャンネル';


-- live_streaming_app.passkeys definition

CREATE TABLE `passkeys` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL COMMENT '利用者ID',
  `name` varchar(255) NOT NULL COMMENT 'パスキーの名称',
  `credential_id` varchar(255) NOT NULL COMMENT 'パスキーのクレデンシャルID',
  `public_key` text NOT NULL COMMENT '公開鍵情報',
  `sign_count` int(10) unsigned NOT NULL DEFAULT 0 COMMENT '署名カウンター',
  `created_at` datetime DEFAULT current_timestamp(),
  `last_used_at` datetime DEFAULT NULL COMMENT '最終利用日時',
  PRIMARY KEY (`id`),
  UNIQUE KEY `credential_id` (`credential_id`),
  KEY `fk_passkeys_user_id` (`user_id`),
  CONSTRAINT `fk_passkeys_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='パスキー認証情報';


-- live_streaming_app.recordings definition

CREATE TABLE `recordings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `channel_id` bigint(20) unsigned NOT NULL COMMENT 'チャンネルID',
  `file_path` varchar(1024) NOT NULL COMMENT '録画ファイルの保存パス',
  `summary_text` text DEFAULT NULL COMMENT 'AI要約テキスト',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_recordings_channel_id` (`channel_id`),
  CONSTRAINT `fk_recordings_channel_id` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='録画情報';


-- live_streaming_app.channel_allowed_users definition

CREATE TABLE `channel_allowed_users` (
  `channel_id` bigint(20) unsigned NOT NULL COMMENT 'チャンネルID',
  `user_id` bigint(20) unsigned NOT NULL COMMENT '招待された利用者ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '招待日時',
  PRIMARY KEY (`channel_id`,`user_id`),
  KEY `fk_channel_allowed_users_user_id` (`user_id`),
  CONSTRAINT `fk_channel_allowed_users_channel_id` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_channel_allowed_users_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='チャンネルアクセス許可リスト';