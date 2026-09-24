resource "sakura_monitoring_suite_log_storage" "lsnext_log_storage" {
  name                  = "ライブ配信システム"
  description           = "ライブ配信システムのログを保存するためのログストレージ"
  classification        = "shared"
  is_system             = false
  retention_period_days = 30
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_apprun_dedicated_lb" {
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "lb_access_logs"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_apprun_dedicated_container" {
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "container_logs"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_apprun_dedicated_agent" {
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "agent_logs"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_container_registry" {
  resource_id    = var.container_registry_resource_id
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "container-registry"
  variant        = "access_log"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_database" {
  resource_id    = sakura_database.lsnext_database.id
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "database"
  variant        = "systemlog"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_simple_monitor" {
  resource_id    = sakura_simple_monitor.lsnext_simple_monitor.id
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "simplemonitor"
  variant        = "monitoring_log"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_simple_mq" {
  resource_id    = data.sakura_simple_mq.lsnext_simple_mq.id
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "simplemq"
  variant        = "simplemq_log"
}
resource "sakura_monitoring_suite_log_routing" "lsnext_log_routing_vpn_router" {
  resource_id    = sakura_vpn_router.standard_vpn_router.id
  storage_id     = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  publisher_code = "vpcrouter"
  variant        = "log"
}
resource "sakura_monitoring_suite_metric_storage" "lsnext_metric_storage" {
  name        = "ライブ配信システム"
  description = "ライブ配信システムのメトリクスを保存するためのメトリクスストレージ"
  is_system   = false
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_apprun_dedicated_node" {
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "node_metrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_apprun_dedicated_container" {
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "container_metrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_apprun_dedicated_lb" {
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "apprun-dedicated"
  variant        = "lb_metrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_database" {
  resource_id    = sakura_database.lsnext_database.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "database"
  variant        = "systemmetrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_monitoring_suite_log" {
  resource_id    = sakura_monitoring_suite_log_storage.lsnext_log_storage.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "monitoring-suite"
  variant        = "usage"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_monitoring_suite_metric" {
  resource_id    = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "monitoring-suite"
  variant        = "usage"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_monitoring_seg" {
  resource_id    = sakura_seg.seg_for_apprun_dedicated.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "seg"
  variant        = "seg-metrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_monitoring_simple_mq" {
  resource_id    = data.sakura_simple_mq.lsnext_simple_mq.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "simplemq"
  variant        = "simplemq_metrics"
}
resource "sakura_monitoring_suite_metric_routing" "lsnext_metric_routing_monitoring_vpn_router" {
  resource_id    = sakura_vpn_router.standard_vpn_router.id
  storage_id     = sakura_monitoring_suite_metric_storage.lsnext_metric_storage.id
  publisher_code = "vpcrouter"
  variant        = "metrics"
}