data "sakura_container_registry" "lsnext_container_registry" {
  id = var.container_registry_resource_id
}

data "sakura_simple_mq" "lsnext_simple_mq" {
  name = var.simple_mq_queue_name
}

resource "sakura_database" "lsnext_database" {
  name        = "ライブ配信システムデータベース"
  description = "ライブ配信システムデータベース。MariaDB 10.11を使用。"

  backup = {
    days_of_week = ["mon"]
    time         = "04:00"
  }

  network_interface = {
    vswitch_id    = sakura_vswitch.switch_for_database.id
    ip_address    = var.database_ip
    netmask       = 24
    gateway       = sakura_vpn_router.standard_vpn_router.private_network_interface[0].ip_addresses[0]
    port          = var.database_port
    source_ranges = var.database_source_ranges
  }

  username            = var.database_username
  password_wo         = var.database_password
  password_wo_version = 1

  database_type    = "mariadb"
  database_version = "10.11"

  disk = {
    encryption_algorithm = "aes256_xts"
    kms_key_id           = sakura_kms.database_key.id
  }

  icon_id = var.database_icon

  monitoring_suite = {
    enabled = true
  }

  parameters = {
    event_scheduler              = "OFF"
    innodb_buffer_pool_size      = 134217728
    log_warnings                 = 2
    long_query_time              = 10
    max_allowed_packet           = 16777216
    max_connections              = 100
    query_alloc_block_size       = 8192
    query_cache_limit            = 1048576
    query_cache_min_res_unit     = 4096
    query_cache_size             = 536870912
    query_cache_type             = 0
    query_cache_wlock_invalidate = "OFF"
    query_prealloc_size          = 8192
    slow_query_log               = "ON"
    sort_buffer_size             = 2097152
    sql_mode                     = "STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"
    tmpdir                       = "/tmp"
  }

  plan = "10g"
  tags = ["lsnext"]
  zone = var.zone
}

resource "sakura_kms" "database_key" {
  name        = "データ基盤暗号化用鍵"
  description = "データベースを暗号化するためのKMS鍵。"
  key_origin  = "generated"
  tags        = ["lsnext"]
}

resource "sakura_packet_filter" "lb_eth" {
  name        = "ロードバランサ外部用パケットフィルタ"
  description = "ロードバランサ外部用のパケットフィルタ。非HTTPアクセスをブロックするためのフィルタルールを定義。"

  zone = var.zone
}

resource "sakura_packet_filter" "lb_switch" {
  name        = "ロードバランサ内部NIC用パケットフィルタ"
  description = "ロードバランサ内部NIC用のパケットフィルタ。内部通信を制御するためのフィルタルールを定義。"

  zone = var.zone
}

resource "sakura_packet_filter" "worker_switch" {
  name        = "ワーカ用パケットフィルタ"
  description = "ワーカ用のパケットフィルタ。内部通信を制御するためのフィルタルールを定義。"
  zone        = var.zone
}

resource "sakura_packet_filter_rules" "lb_eth_rules" {
  packet_filter_id = sakura_packet_filter.lb_eth.id
  zone             = var.zone

  expression = [
    # 外部からのWebアクセス許可
    {
      protocol         = "tcp"
      destination_port = "80"
    },
    {
      protocol         = "tcp"
      destination_port = "443"
    },
    # 自発的な外部通信（API呼び出し等）の戻りパケットを許可（エフェメラルポート）
    {
      protocol         = "tcp"
      destination_port = "32768-65535"
    },
    {
      protocol         = "udp"
      destination_port = "32768-65535"
    },
    # ICMPとフラグメントは許可（必要な通信のため）
    {
      protocol = "icmp"
    },
    {
      protocol = "fragment"
    },
    # 上記以外をすべて拒否 (さくらのクラウドはデフォルト許可のため必須)
    {
      protocol    = "ip"
      allow       = false
      description = "Deny ALL"
    }
  ]
}

resource "sakura_packet_filter_rules" "lb_switch_rules" {
  packet_filter_id = sakura_packet_filter.lb_switch.id
  zone             = var.zone

  expression = [
    # ワーカからのアクセスを許可
    {
      protocol       = "ip"
      source_network = "192.168.1.64/26"
    },
    # 自発的な外部通信（API呼び出し等）の戻りパケットを許可（エフェメラルポート）
    {
      protocol         = "tcp"
      destination_port = "32768-65535"
    },
    {
      protocol         = "udp"
      destination_port = "32768-65535"
    },
    # ICMPとフラグメントは許可（必要な通信のため）
    {
      protocol = "icmp"
    },
    {
      protocol = "fragment"
    },
    # 上記以外をすべて拒否 (さくらのクラウドはデフォルト許可のため必須)
    {
      protocol    = "ip"
      allow       = false
      description = "Deny ALL"
    }
  ]
}

resource "sakura_packet_filter_rules" "worker_switch_rules" {
  packet_filter_id = sakura_packet_filter.worker_switch.id
  zone             = var.zone

  expression = [
    # ロードバランサからのアクセスを許可
    {
      protocol         = "tcp"
      source_network   = "192.168.1.128/26"
      destination_port = "8080"
    },
    {
      protocol         = "tcp"
      destination_port = "32768-65535"
    },
    {
      protocol         = "udp"
      destination_port = "32768-65535"
    },
    # ICMPとフラグメントは許可（必要な通信のため）
    {
      protocol = "icmp"
    },
    {
      protocol = "fragment"
    },
    # 上記以外をすべて拒否 (さくらのクラウドはデフォルト許可のため必須)
    {
      protocol    = "ip"
      allow       = false
      description = "Deny ALL"
    }
  ]
}

resource "sakura_seg" "seg_for_apprun_dedicated" {
  netmask             = 24
  server_ip_addresses = [var.seg_internal_ip]
  vswitch_id          = sakura_vswitch.switch_for_database.id
  zone                = sakura_vswitch.switch_for_database.zone

  endpoint_setting = {
    apprun_dedicated_control_enabled = true
    container_registry_endpoints     = [data.sakura_container_registry.lsnext_container_registry.fqdn]
    monitoring_suite_endpoints       = [sakura_monitoring_suite_log_storage.lsnext_log_storage.endpoints.ingester.address, sakura_monitoring_suite_metric_storage.lsnext_metric_storage.endpoints.address]
    object_storage_endpoints         = ["s3.${data.sakura_object_storage_site.ishikari.endpoint}"]
    ai_engine_endpoints              = ["api.ai.sakura.ad.jp"]
  }
  monitoring_suite_enabled = true
}

resource "sakura_simple_monitor" "lsnext_simple_monitor" {
  description = "ライブ配信システムの稼働状況を監視する。"

  target  = var.lsnext_domain
  enabled = true

  delay_loop = 60
  timeout    = 10

  max_check_attempts = 3
  retry_interval     = 10

  health_check = {
    protocol        = "https"
    port            = 443
    path            = "/healthz"
    contains_string = "ok"
    status          = "200"
    host_header     = var.lsnext_domain
    sni             = false
    verify_sni      = false
    http2           = false
  }

  tags = ["lsnext"]

  notify_email_enabled = true
  notify_email_html    = false
  notify_slack_enabled = false

  monitoring_suite = {
    enabled = true
  }
}

resource "sakura_vswitch" "switch_for_database" {
  name        = "データベース接続用スイッチ"
  description = "データベースと接続するためのスイッチ。"

  icon_id = var.database_icon
  tags    = ["lsnext"]
  zone    = var.zone
}

resource "sakura_vpn_router" "standard_vpn_router" {
  name        = "外部接続用VPNルータ"
  description = "外部接続用VPNルータ。データベースへの安全な接続を提供。"

  firewall = [{
    interface_index = 1
    direction       = "receive"
    expression = [
      {
        protocol            = "tcp"
        source_network      = "192.168.1.64/26"
        source_port         = ""
        destination_network = ""
        destination_port    = "443"
        allow               = true
        logging             = true
        description         = "AppRunワーカーから外部APIへのHTTPS通信を許可する。"
      },
      {
        protocol            = "tcp"
        source_network      = "192.168.1.0/24"
        source_port         = ""
        destination_network = var.database_ip
        destination_port    = "3306"
        allow               = true
        logging             = true
        description         = "VPNで接続したクライアントにデータベースアプライアンスへの接続を許可する。"
      },
      {
        protocol            = "ip"
        source_network      = ""
        source_port         = ""
        destination_network = ""
        destination_port    = ""
        allow               = false
        logging             = true
        description         = "その他のアクセスを拒否する。"
    }]
  }]

  icon_id             = var.vpn_icon
  internet_connection = true

  monitoring_suite = {
    enabled = true
  }

  plan = "standard"

  private_network_interface = [{
    index        = 1
    vswitch_id   = sakura_vswitch.switch_for_database.id
    ip_addresses = [var.vpn_internal_ip]
    netmask      = 24
  }]

  scheduled_maintenance = {
    day_of_week = "mon"
    hour        = 4
  }

  wire_guard = {
    ip_address = "10.0.0.1/24"
    peer = [
      {
        name       = "VPNクライアント"
        ip_address = "10.0.0.2"
        public_key = var.vpn_peer_public_key
      },
    ]
  }

  tags = ["lsnext"]

  version = 2
  zone    = var.zone
}
