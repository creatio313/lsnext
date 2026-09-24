data "sakura_object_storage_site" "ishikari" {
  display_name = "石狩第1サイト"
}

resource "sakura_object_storage_bucket" "lsnext_archive_bucket" {
  name    = "lsnext-archive"
  site_id = data.sakura_object_storage_site.ishikari.id
}

resource "sakura_object_storage_bucket" "lsnext_log_bucket" {
  name    = "lsnext-log"
  site_id = data.sakura_object_storage_site.ishikari.id
}

resource "sakura_object_storage_permission" "lsnext_archive_bucket_r_permission" {
  name = "ライブ配信システムバケットRead権限"
  bucket_controls = [{
    bucket    = sakura_object_storage_bucket.lsnext_archive_bucket.name
    can_read  = true
    can_write = false
  }]
  site_id = data.sakura_object_storage_site.ishikari.id
}

resource "sakura_object_storage_permission" "lsnext_archive_bucket_rw_permission" {
  name = "ライブ配信システムバケットReadWrite権限"
  bucket_controls = [{
    bucket    = sakura_object_storage_bucket.lsnext_archive_bucket.name
    can_read  = true
    can_write = true
  }]
  site_id = data.sakura_object_storage_site.ishikari.id
}

resource "sakura_object_storage_permission" "lsnext_log_bucket_rw_permission" {
  name = "アクセスログバケットReadWrite権限"
  bucket_controls = [{
    bucket    = sakura_object_storage_bucket.lsnext_log_bucket.name
    can_read  = true
    can_write = true
  }]
  site_id = data.sakura_object_storage_site.ishikari.id
}

resource "sakura_webaccel" "lsnext_archive_webaccel" {
  name        = "ライブ配信アプリ"
  domain_type = "own_domain"
  domain      = var.lsnext_archive_domain
  cors_rules = [{
    allow_all       = false
    allowed_origins = ["https://${var.lsnext_domain}"]
  }]
  request_protocol = "https-redirect"
  origin_parameters = {
    type                   = "bucket"
    access_key_wo          = sakura_object_storage_permission.lsnext_archive_bucket_r_permission.access_key
    secret_access_key_wo   = sakura_object_storage_permission.lsnext_archive_bucket_r_permission.secret_key
    bucket_name            = sakura_object_storage_bucket.lsnext_archive_bucket.name
    credentials_wo_version = 1
    use_document_index     = true
    endpoint               = join("", ["s3.", data.sakura_object_storage_site.ishikari.endpoint])
    region                 = data.sakura_object_storage_site.ishikari.region
  }

  logging = {
    enabled                = true
    bucket_name            = sakura_object_storage_bucket.lsnext_log_bucket.name
    access_key_wo          = sakura_object_storage_permission.lsnext_log_bucket_rw_permission.access_key
    secret_access_key_wo   = sakura_object_storage_permission.lsnext_log_bucket_rw_permission.secret_key
    credentials_wo_version = 1
    endpoint               = join("", ["s3.", data.sakura_object_storage_site.ishikari.endpoint])
    region                 = data.sakura_object_storage_site.ishikari.region
  }
  default_cache_ttl = 334
  normalize_ae      = "gzip"
}