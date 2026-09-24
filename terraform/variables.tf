variable "access_token" {
  type        = string
  description = "プロジェクトのアクセストークン"
  sensitive   = true
}

variable "access_token_secret" {
  type        = string
  description = "プロジェクトのアクセストークンシークレット"
  sensitive   = true
}

variable "zone" {
  type        = string
  description = "リソースを構築するゾーン"
  default     = "is1c"
}

variable "apprun_dedicated_lets_encrypt_email" {
  type        = string
  description = "AppRun専用クラスタのLet's Encrypt証明書用のメールアドレス"
  sensitive   = true
}

variable "ai_engine_api_key" {
  type        = string
  description = "さくらのAI EngineのAPIキー"
  sensitive   = true
}

/**
 * 要変更
 */
variable "container_registry_resource_id" {
  type        = string
  description = "コンテナレジストリのリソースID"
  default     = "123456789012"
}

variable "container_username" {
  type        = string
  description = "コンテナレジストリのユーザ名"
  sensitive   = true
}

variable "container_password" {
  type        = string
  description = "コンテナレジストリのパスワード"
  sensitive   = true
}

variable "database_icon" {
  type        = string
  description = "データベースアイコンのID"
  default     = "113602453019"
}

variable "database_ip" {
  type        = string
  description = "データベースに割り当てられるIPアドレス"
  default     = "192.168.1.11"
}

variable "database_username" {
  type        = string
  description = "データベースのユーザ名"
  default     = "lsnext"
}

variable "database_password" {
  type        = string
  description = "データベースのパスワード"
  sensitive   = true
}

variable "database_port" {
  type        = number
  description = "データベースのポート番号"
  sensitive   = true
}

variable "database_source_ranges" {
  type        = list(string)
  description = "データベースアクセスを許可する送信元CIDR範囲"
  default     = ["192.168.1.64/26", "10.0.0.2/32"]
}

variable "jwt_secret" {
  type        = string
  description = "JWTシークレット"
  sensitive   = true
}

variable "ls_api_token" {
  type        = string
  description = "ImageFlux Live StreamingのAPIトークン"
  sensitive   = true
}

/**
 * 要変更
 */
variable "lsnext_domain" {
  type        = string
  description = "ライブ配信アプリのドメイン"
  default     = "example.jp"
}
/**
 * 要変更
 */
variable "lsnext_archive_domain" {
  type        = string
  description = "アーカイブ配信のドメイン"
  default     = "archive.jp"
}

/**
 * 要変更
 */
variable "lsnext_app_image" {
  type        = string
  description = "アプリ用のDockerイメージ"
  default     = "lsnext_app:v1"
}

/**
 * 要変更
 */
variable "lsnext_mqhandler_image" {
  type        = string
  description = "MQハンドラのDockerイメージ"
  default     = "lsnext_mqhandler:v1"
}

/**
 * 要変更
 */
variable "objst_jp_north_1_access_key_id" {
  type        = string
  description = "オブジェクトストレージ石狩第一サイトアクセスキーID"
  default     = "ABCDE12345FGHIJ67890"
}

variable "objst_jp_east_1_access_key_id" {
  type        = string
  description = "オブジェクトストレージ東京第一サイトアクセスキーID"
  default     = "ABCDE12345FGHIJ67890"
}

variable "objst_jp_north_1_secret_access_key" {
  type        = string
  description = "オブジェクトストレージ石狩第一サイトシークレットアクセスキー"
  sensitive   = true
}

variable "objst_jp_east_1_secret_access_key" {
  type        = string
  description = "オブジェクトストレージ東京第一サイトシークレットアクセスキー"
  sensitive   = true
}

variable "seg_internal_ip" {
  type        = string
  description = "SEGに割り当てられる内部IPアドレス"
  default     = "192.168.1.2"
}

/**
 * 要変更
 */
variable "service_principal_id" {
  type        = string
  description = "サービスプリンシパルのID（AppRun）"
  default     = "123456789012"
}

variable "simple_mq_queue_name" {
  type        = string
  description = "シンプルMQのキュー名"
  default     = "lsnext-queue"
}

variable "simple_mq_queue_key" {
  type        = string
  description = "シンプルMQのキューのAPIキー"
  sensitive   = true
}

variable "vpn_icon" {
  type        = string
  description = "VPNルータのアイコンのID"
  default     = "112300511393"
}

variable "vpn_internal_ip" {
  type        = string
  description = "VPNルータに割り当てられる内部IPアドレス"
  default     = "192.168.1.1"
}

variable "vpn_peer_public_key" {
  type        = string
  description = "WireGuardピアの公開鍵"
  sensitive   = true
}
