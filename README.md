# ImageFlux Live Streaming on さくらのクラウド

ImageFlux Live Streamingを利用したライブ配信アプリケーションです。
指定したユーザを対象にした片方向ライブ配信が可能です。チャット機能や録画機能、録画のAI要約機能も備えています。
WebアプリはNext.js、録画の要約・アーカイブ削除コンシューマはGoで動作します。

## 構築
1. AppRun専有型のサービスプリンシパルを作成し、「作成・削除」権限を付与します。
2. シンプルMQのキューを作成し、APIキーを取得します。
3. さくらのAI EngineのAPIキーを取得します。
4. オブジェクトストレージのサイトアカウントを作成し、認証情報を取得します。
5. コンテナレジストリとそのユーザを作成し、webappおよびserverのコンテナイメージをbuild、pushします。
6. WireGuardクライアントを準備し、VPNルータに設定する公開鍵を取得します。
7. Terraformで残りの基盤を構築します。
8. さくらのウェブアクセラレータのCNAMEおよびAppRun専有型のIPアドレスに、ドメインを割り振ります。
9. さくらのウェブアクセラレータのLet's Encryptを有効化、サイト自体も有効化します。
10. WireGuardを用いてVPN接続し、データベースにテーブルを作成します。
11. AppRun専有型のアプリケーションをアクティブにします。

1時間程度で片方向配信アプリが構築できます。

## 環境変数

### Next.js（webapp）

| 環境変数 | 必須性 | 既定値 | 役割 |
|---|---|---|---|
| `APP_URL` | 条件付き必須 | なし | Webhook URL とメタデータの絶対 URL を生成するアプリ公開 URL。 |
| `DATABASE_URL` | 条件付き必須 | なし | MySQL 接続 URL。設定時は分割 DB 設定より優先されます。 |
| `DB_HOST` | 条件付き必須 | なし | `DATABASE_URL` を使わない場合の MySQL ホスト。 |
| `DB_PORT` | 任意 | `3306` | `DATABASE_URL` を使わない場合の MySQL ポート。 |
| `DB_NAME` | 条件付き必須 | なし | 使用するデータベース名。 |
| `DB_USER` | 条件付き必須 | なし | MySQL ユーザー名。 |
| `DB_PASSWORD` | 任意 | 空文字 | MySQL パスワード。 |
| `JWT_SECRET` | 条件付き必須 | なし | ログインセッション JWT の署名・検証キー。 |
| `IMAGEFLUX_LS_API_TOKEN` | 条件付き必須 | なし | ImageFlux Live Streaming API の Bearer トークン。 |
| `IMAGEFLUX_LS_AUTH_WEBHOOK_URL` | 機能依存 | `APP_URL` から生成 | ImageFlux の認証 Webhook URL。 |
| `IMAGEFLUX_LS_EVENT_WEBHOOK_URL` | 機能依存 | `APP_URL` から生成 | ImageFlux のイベント Webhook URL。 |
| `IMAGEFLUX_LS_ENCRYPT_KEY_URI` | 機能依存 | `APP_URL` から生成 | 暗号化 HLS の復号鍵 URI。 |
| `SIMPLE_MQ_QUEUE_NAME` | 条件付き必須 | なし | 録画要約・アーカイブ削除メッセージの送信先キュー名。 |
| `SIMPLE_MQ_QUEUE_KEY` | 条件付き必須 | なし | Simple MQ API の Bearer 認証キー。 |
| `WEBAUTHN_RP_ID` | 任意 | `localhost` | WebAuthn の Relying Party ID。通常は公開ホスト名です。 |
| `WEBAUTHN_ORIGIN` | 任意 | `http://localhost:3000` | WebAuthn レスポンスの検証を許可する Origin。 |
| `WEBAUTHN_RP_NAME` | 任意 | `ImageFlux Live Streaming Webapp on sacloud` | パスキー登録時に表示するサービス名。 |
| `NODE_ENV` | 任意 | Next.js が設定 | `production` 時に認証 Cookie を Secure にします。 |
| `HOSTNAME` | 任意 | Docker では `0.0.0.0` | Next.js サーバの bind 先。 |
| `PORT` | 任意 | Docker では `8080` | Next.js サーバの待受ポート。 |

`DATABASE_URL` を使用しない場合は、`DB_HOST`、`DB_USER`、`DB_NAME` が必要です。

### Goサーバ（server）

| 環境変数 | 必須性 | 既定値 | 役割 |
|---|---|---|---|
| `AI_ENGINE_API_KEY` | **必須** | なし | 文字起こし・要約 API の Bearer 認証キー。 |
| `AI_ENGINE_BASE_URL` | 任意 | `https://api.ai.sakura.ad.jp` | AI Engine API の接続先。 |
| `AI_TRANSCRIPTION_MODEL` | 任意 | `whisper-large-v3-turbo` | 音声文字起こしモデル。 |
| `AI_SUMMARY_MODEL` | 任意 | `llm-jp-3.1-8x13b-instruct4` | 要約生成モデル。 |
| `DB_HOST` | **必須** | なし | MySQL ホスト。 |
| `DB_PORT` | 任意 | `3306` | MySQL ポート。 |
| `DB_NAME` | **必須** | なし | 使用するデータベース名。 |
| `DB_USER` | **必須** | なし | MySQL ユーザー名。 |
| `DB_PASSWORD` | **必須** | なし | MySQL パスワード。 |
| `IMAGEFLUX_LS_API_TOKEN` | **必須** | なし | 暗号化 HLS の復号鍵取得に使う ImageFlux API トークン。 |
| `OBJST_JP_NORTH_1_ACCESS_KEY_ID` | 条件付き必須 | なし | 石狩第 1 サイトのオブジェクトストレージアクセスキー。 |
| `OBJST_JP_NORTH_1_SECRET_ACCESS_KEY` | 条件付き必須 | なし | 石狩第 1 サイトのオブジェクトストレージシークレットキー。 |
| `OBJST_JP_EAST_1_ACCESS_KEY_ID` | 条件付き必須 | なし | 東京第 1 サイトのオブジェクトストレージアクセスキー。 |
| `OBJST_JP_EAST_1_SECRET_ACCESS_KEY` | 条件付き必須 | なし | 東京第 1 サイトのオブジェクトストレージシークレットキー。 |
| `SIMPLE_MQ_QUEUE_KEY` | **必須** | なし | Simple MQ からメッセージを取得・削除する認証キー。 |
| `SIMPLE_MQ_QUEUE_NAME` | **必須** | なし | 監視する Simple MQ キュー名。 |
| `SIMPLE_MQ_POLL_INTERVAL` | 任意 | `5s` | キューをポーリングする間隔。無効値は既定値に戻ります。 |
| `SIMPLE_MQ_ERROR_RETRY_INTERVAL` | 任意 | `60s` | MQ エラー時の再試行間隔。無効値は既定値に戻ります。 |

オブジェクトストレージは、石狩第1サイトまたは東京第1サイトのアクセスキーとシークレットキーを一組以上設定してください。