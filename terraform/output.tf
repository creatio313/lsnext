output "wire_guard_public_key" {
  description = "VPNルータのWireGuard公開鍵"
  value       = sakura_vpn_router.standard_vpn_router.wire_guard.public_key
}

output "vpn_public_ip" {
  description = "VPNルータのパブリックIPアドレス"
  value       = sakura_vpn_router.standard_vpn_router.public_ip
}

output "webaccel_cname" {
  description = "ウェブアクセラレータ向けに設定するCNAMEレコードの値"
  value       = sakura_webaccel.lsnext_archive_webaccel.cname_record_value
}