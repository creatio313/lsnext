data "sakura_apprun_dedicated_worker_service_classes" "lsnext" {}
data "sakura_apprun_dedicated_lb_service_classes" "lsnext" {}

resource "sakura_apprun_dedicated_cluster" "lsnext_cluster" {
  name                 = "LSNEXTAPPS_CL"
  service_principal_id = var.service_principal_id
  lets_encrypt_email   = var.apprun_dedicated_lets_encrypt_email

  ports = [
    {
      port     = 80
      protocol = "http"
    },
    {
      port     = 443
      protocol = "https"
    },
  ]
}

resource "sakura_apprun_dedicated_auto_scaling_group" "lsnext_group" {
  cluster_id = sakura_apprun_dedicated_cluster.lsnext_cluster.id
  interfaces = [{
    connects_to_lb  = true
    interface_index = 0
    upstream        = sakura_vswitch.switch_for_database.id
    default_gateway = var.vpn_internal_ip
    ip_pool = [{
      start = "192.168.1.64"
      end   = "192.168.1.127"
    }]
    netmask          = 24
    packet_filter_id = sakura_packet_filter.worker_switch.id
  }]
  max_nodes                 = 3
  min_nodes                 = 1
  name                      = "LSNEXTAPPS_AG"
  worker_service_class_path = data.sakura_apprun_dedicated_worker_service_classes.lsnext.classes[0].path
  zone                      = var.zone
  name_servers              = sakura_seg.seg_for_apprun_dedicated.server_ip_addresses
}

resource "sakura_apprun_dedicated_lb" "lsnext_lb" {
  auto_scaling_group_id = sakura_apprun_dedicated_auto_scaling_group.lsnext_group.id
  cluster_id            = sakura_apprun_dedicated_cluster.lsnext_cluster.id

  interfaces = [{
    interface_index  = 0
    upstream         = "shared"
    packet_filter_id = sakura_packet_filter.lb_eth.id
    },
    {
      interface_index = 1
      upstream        = sakura_vswitch.switch_for_database.id
      default_gateway = var.vpn_internal_ip
      ip_pool = [{
        start = "192.168.1.128"
        end   = "192.168.1.254"
      }]
      netmask          = 24
      packet_filter_id = sakura_packet_filter.lb_switch.id
  }]

  name               = "LSNEXTAPPS_LB"
  service_class_path = data.sakura_apprun_dedicated_lb_service_classes.lsnext.classes[1].path
}

resource "sakura_apprun_dedicated_application" "lsnext_app" {
  cluster_id = sakura_apprun_dedicated_cluster.lsnext_cluster.id
  name       = "LSNEXTAPP"
}

resource "sakura_apprun_dedicated_version" "lsnext_appv" {
  application_id = sakura_apprun_dedicated_application.lsnext_app.id
  cpu            = 200
  memory         = 200
  image          = "${data.sakura_container_registry.lsnext_container_registry.fqdn}/${var.lsnext_app_image}"
  scaling_mode   = "cpu"
  env_vars = [
    {
      key   = "APP_URL"
      value = "https://${var.lsnext_domain}"
    },
    {
      key   = "DB_HOST"
      value = var.database_ip
    },
    {
      key   = "DB_PORT"
      value = var.database_port
    },
    {
      key   = "DB_NAME"
      value = var.database_username
    },
    {
      key   = "DB_USER"
      value = var.database_username
    },
    {
      key   = "SIMPLE_MQ_QUEUE_NAME"
      value = var.simple_mq_queue_name
    },
    {
      key   = "WEBAUTHN_RP_ID"
      value = var.lsnext_domain
    },
    {
      key   = "WEBAUTHN_ORIGIN"
      value = "https://${var.lsnext_domain}"
    },
    {
      key   = "WEBAUTHN_RP_NAME"
      value = "Live on Sacloud"
    },
  ]
  secret_vars = [
    {
      key              = "DB_PASSWORD"
      value_wo         = var.database_password
      value_wo_version = 1
    },
    {
      key              = "JWT_SECRET"
      value_wo         = var.jwt_secret
      value_wo_version = 1
    },
    {
      key              = "IMAGEFLUX_LS_API_TOKEN"
      value_wo         = var.ls_api_token
      value_wo_version = 1
    },
    {
      key              = "SIMPLE_MQ_QUEUE_KEY"
      value_wo         = var.simple_mq_queue_key
      value_wo_version = 1
    },
  ]
  exposed_ports = [
    {
      target_port = 8080
      health_check = {
        interval_seconds = 30
        path             = "/healthz"
        timeout_seconds  = 5
      }
      host             = [var.lsnext_domain]
      lb_port          = 443
      use_lets_encrypt = true
    },
  ]
  max_scale                = 3
  min_scale                = 1
  registry_password        = var.container_password
  registry_password_action = "new"
  registry_username        = var.container_username
  scale_in_threshold       = 30
  scale_out_threshold      = 60
}

resource "sakura_apprun_dedicated_application" "lsnext_mqhandler" {
  cluster_id = sakura_apprun_dedicated_cluster.lsnext_cluster.id
  name       = "LSNEXTMQHANDLER"
}

resource "sakura_apprun_dedicated_version" "lsnext_mqhandlerv" {
  application_id = sakura_apprun_dedicated_application.lsnext_mqhandler.id
  cpu            = 200
  memory         = 500
  image          = "${data.sakura_container_registry.lsnext_container_registry.fqdn}/${var.lsnext_mqhandler_image}"
  scaling_mode   = "cpu"
  env_vars = [
    {
      key   = "DB_HOST"
      value = var.database_ip
    },
    {
      key   = "DB_PORT"
      value = var.database_port
    },
    {
      key   = "DB_NAME"
      value = var.database_username
    },
    {
      key   = "DB_USER"
      value = var.database_username
    },
    {
      key   = "OBJST_JP_NORTH_1_ACCESS_KEY_ID"
      value = var.objst_jp_north_1_access_key_id
    },
    {
      key   = "OBJST_JP_EAST_1_ACCESS_KEY_ID"
      value = var.objst_jp_east_1_access_key_id
    },
    {
      key   = "SIMPLE_MQ_QUEUE_NAME"
      value = var.simple_mq_queue_name
    }
  ]
  secret_vars = [
    {
      key              = "AI_ENGINE_API_KEY"
      value_wo         = var.ai_engine_api_key
      value_wo_version = 1
    },
    {
      key              = "DB_PASSWORD"
      value_wo         = var.database_password
      value_wo_version = 1
    },
    {
      key              = "IMAGEFLUX_LS_API_TOKEN"
      value_wo         = var.ls_api_token
      value_wo_version = 1
    },
    {
      key              = "OBJST_JP_NORTH_1_SECRET_ACCESS_KEY"
      value_wo         = var.objst_jp_north_1_secret_access_key
      value_wo_version = 1
    },
    {
      key              = "OBJST_JP_EAST_1_SECRET_ACCESS_KEY"
      value_wo         = var.objst_jp_east_1_secret_access_key
      value_wo_version = 1
    },
    {
      key              = "SIMPLE_MQ_QUEUE_KEY"
      value_wo         = var.simple_mq_queue_key
      value_wo_version = 1
    },
  ]
  exposed_ports = [
    {
      target_port = 8090
      health_check = {
        interval_seconds = 30
        path             = "/healthz"
        timeout_seconds  = 5
      }
    },
  ]
  max_scale                = 3
  min_scale                = 1
  registry_password        = var.container_password
  registry_password_action = "new"
  registry_username        = var.container_username
  scale_in_threshold       = 30
  scale_out_threshold      = 60
}