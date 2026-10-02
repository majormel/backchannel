import json
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path
import types
import unittest
from unittest.mock import patch

from backchannel.mobile_setup import (
    MobilePairingRegistry,
    clear_android_adb_proxy,
    generate_apple_profile,
    generate_qr_data,
    generate_qr_png,
    get_lan_ip,
    get_mitmproxy_cert_path,
    get_wifi_ssid,
    read_cert_pem,
    setup_android_adb,
)


class FakeQrImage:
    def save(self, output, format=None):
        output.write(b"fake-png")


class TestMobileSetup(unittest.TestCase):
    def test_wifi_ssid_uses_actual_mac_wifi_adapter(self):
        outputs = [
            "Hardware Port: Ethernet\nDevice: en0\n\nHardware Port: Wi-Fi\nDevice: en7\nEthernet Address: unused\n",
            "Current Wi-Fi Network: Studio: 5G\n",
        ]
        with patch("backchannel.mobile_setup.sys.platform", "darwin"), patch("backchannel.mobile_setup._network_command", side_effect=outputs) as command:
            self.assertEqual(get_wifi_ssid(), "Studio: 5G")
        self.assertEqual(command.call_args.args[0][-1], "en7")

    def test_wifi_ssid_mac_falls_back_to_current_network_only(self):
        data = {"SPAirPortDataType": [{"spairport_airport_interfaces": [{
            "spairport_current_network_information": {"_name": "Café WiFi"},
            "spairport_airport_other_local_wireless_networks": [{"_name": "Wrong network"}],
        }]}]}
        with patch("backchannel.mobile_setup.sys.platform", "darwin"), patch("backchannel.mobile_setup._network_command", side_effect=["", json.dumps(data)]):
            self.assertEqual(get_wifi_ssid(), "Café WiFi")

    def test_wifi_ssid_mac_rejects_redacted_disconnected_and_malformed_data(self):
        for output in [
            '{"SPAirPortDataType":[{"spairport_airport_interfaces":[{"spairport_current_network_information":{"_name":"<redacted>"}}]}]}',
            '{"SPAirPortDataType":[{"spairport_airport_interfaces":[{"spairport_airport_other_local_wireless_networks":[{"_name":"Nearby"}]}]}]}',
            "not json",
        ]:
            with self.subTest(output=output), patch("backchannel.mobile_setup.sys.platform", "darwin"), patch("backchannel.mobile_setup._network_command", side_effect=["", output]):
                self.assertIsNone(get_wifi_ssid())

    def test_wifi_ssid_linux_preserves_colons_and_ignores_nearby_networks(self):
        with patch("backchannel.mobile_setup.sys.platform", "linux"), patch("backchannel.mobile_setup._network_command", return_value=":Nearby\n*:Studio: 5G\n") as command:
            self.assertEqual(get_wifi_ssid(), "Studio: 5G")
        self.assertEqual(command.call_args.args[0][-2:], ["--rescan", "no"])

    def test_wifi_ssid_windows_does_not_use_bssid(self):
        with patch("backchannel.mobile_setup.sys.platform", "win32"), patch("backchannel.mobile_setup._network_command", return_value="    BSSID : aa:bb:cc:dd:ee:ff\n    SSID : Home WiFi\n"):
            self.assertEqual(get_wifi_ssid(), "Home WiFi")

    def test_wifi_ssid_detection_errors_fall_back_to_manual_entry(self):
        for error in [FileNotFoundError(), PermissionError(), subprocess.TimeoutExpired("nmcli", 3)]:
            with self.subTest(error=error), patch("backchannel.mobile_setup.sys.platform", "linux"), patch("backchannel.mobile_setup.subprocess.run", side_effect=error):
                self.assertIsNone(get_wifi_ssid())

    def test_get_lan_ip_returns_string(self):
        value = get_lan_ip()
        self.assertIsInstance(value, str)
        self.assertTrue(value)

    def test_generate_qr_data_structure(self):
        data = generate_qr_data("192.168.1.10", 8080, 8800)
        self.assertEqual(
            data,
            {
                "v": 1,
                "host": "192.168.1.10",
                "proxy_port": 8080,
                "cert_url": "http://192.168.1.10:8800/cert",
                "profile_url": "http://192.168.1.10:8800/mobileconfig",
                "wifi_profile_url_template": "http://192.168.1.10:8800/mobileconfig?mode=wifi&ssid={ssid}",
                "dashboard_url": "http://192.168.1.10:8800",
            },
        )

    def test_generate_qr_png_returns_none_when_qrcode_missing(self):
        with patch.dict(sys.modules, {"qrcode": None}):
            png = generate_qr_png("abc")
        self.assertIsNone(png)

    def test_generate_qr_png_returns_bytes_when_qrcode_available(self):
        fake_qrcode = types.SimpleNamespace(make=lambda _data: FakeQrImage())
        with patch.dict(sys.modules, {"qrcode": fake_qrcode}):
            png = generate_qr_png("abc")
        self.assertEqual(png, b"fake-png")

    def test_mobile_pairing_registry_tracks_download_progress(self):
        registry = MobilePairingRegistry()
        with patch("backchannel.mobile_setup.time.time", return_value=1000.0):
            pairing = registry.create("192.168.1.20", 49152, 8080, "Studio WiFi", ttl_seconds=600)

        self.assertEqual(pairing.as_dict(now=1001.0)["status"], "ready")
        self.assertEqual(pairing.profile_url, f"http://192.168.1.20:49152/pair/{pairing.token}")

        with patch("backchannel.mobile_setup.time.time", return_value=1002.0):
            updated = registry.mark_downloaded(pairing.token, "192.168.1.44")

        self.assertIsNotNone(updated)
        self.assertEqual(pairing.as_dict(now=1003.0)["status"], "downloaded")
        self.assertEqual(pairing.client_ip, "192.168.1.44")

    def test_mobile_pairing_registry_rejects_expired_pairing(self):
        registry = MobilePairingRegistry()
        with patch("backchannel.mobile_setup.time.time", return_value=1000.0):
            pairing = registry.create("192.168.1.20", 49152, 8080, "Studio WiFi", ttl_seconds=60)
        with patch("backchannel.mobile_setup.time.time", return_value=1061.0):
            self.assertIsNone(registry.get_active(pairing.token))
            self.assertIsNone(registry.mark_downloaded(pairing.token, "192.168.1.44"))
        self.assertEqual(pairing.as_dict(now=1061.0)["status"], "expired")

    def test_generate_apple_profile_defaults_to_certificate_profile(self):
        profile = generate_apple_profile("10.0.0.2", 8080)
        parsed = plistlib.loads(profile.encode("utf-8"))
        self.assertEqual(parsed["PayloadDisplayName"], "backchannel Certificate")
        self.assertEqual(parsed["PayloadContent"], [])
        self.assertNotIn("com.apple.wifi.managed", profile)
        self.assertNotIn("10.0.0.2", profile)
        self.assertNotIn("8080", profile)

    def test_generate_apple_profile_with_cert(self):
        with patch("backchannel.mobile_setup.ssl.PEM_cert_to_DER_cert", return_value=b"\x01\x02\x03") as pem_to_der:
            profile = generate_apple_profile("10.0.0.2", 8080, cert_pem="pem")
        pem_to_der.assert_called_once_with("pem")
        parsed = plistlib.loads(profile.encode("utf-8"))
        self.assertEqual(parsed["PayloadDisplayName"], "backchannel Certificate")
        self.assertEqual(parsed["PayloadContent"][0]["PayloadType"], "com.apple.security.root")
        self.assertEqual(parsed["PayloadContent"][0]["PayloadContent"], b"\x01\x02\x03")

    def test_generate_apple_profile_with_wifi_payload(self):
        with patch("backchannel.mobile_setup.ssl.PEM_cert_to_DER_cert", return_value=b"\x01\x02\x03"):
            profile = generate_apple_profile("10.0.0.2", 8080, cert_pem="pem", wifi_ssid="Arena WiFi")
        parsed = plistlib.loads(profile.encode("utf-8"))
        payload_types = [payload["PayloadType"] for payload in parsed["PayloadContent"]]
        self.assertEqual(parsed["PayloadDisplayName"], "backchannel Wi-Fi Setup")
        self.assertEqual(payload_types, ["com.apple.security.root", "com.apple.wifi.managed"])
        wifi_payload = parsed["PayloadContent"][1]
        self.assertEqual(wifi_payload["SSID_STR"], "Arena WiFi")
        self.assertEqual(wifi_payload["ProxyServer"], "10.0.0.2")
        self.assertEqual(wifi_payload["ProxyServerPort"], 8080)

    def test_read_cert_pem_nonexistent_path(self):
        with patch("backchannel.mobile_setup.get_mitmproxy_cert_path", return_value=None):
            value = read_cert_pem()
        self.assertIsNone(value)

    def test_setup_android_adb_command_building(self):
        with patch("backchannel.mobile_setup.get_mitmproxy_cert_path", return_value=Path("/tmp/mitmproxy-ca-cert.pem")):
            with patch("backchannel.mobile_setup.subprocess.run") as run_mock:
                run_mock.return_value = subprocess.CompletedProcess(args=[], returncode=0)
                result = setup_android_adb("10.0.0.2", 8080, device_id="device-123")

        expected_set_proxy = [
            "adb",
            "-s",
            "device-123",
            "shell",
            "settings",
            "put",
            "global",
            "http_proxy",
            "10.0.0.2:8080",
        ]
        self.assertTrue(result["success"])
        self.assertIsNone(result["error"])
        self.assertEqual(result["commands_run"][0], expected_set_proxy)
        self.assertEqual(
            result["certificate_copy_command"],
            ["adb", "-s", "device-123", "push", "/tmp/mitmproxy-ca-cert.pem", "/sdcard/Download/mitmproxy-ca-cert.pem"],
        )
        self.assertEqual(result["clear_proxy_command"][-1], ":0")
        self.assertTrue(result["cleanup_required"])
        run_mock.assert_called_once_with(expected_set_proxy, check=True, capture_output=True, text=True)

    def test_clear_android_adb_proxy(self):
        with patch("backchannel.mobile_setup.subprocess.run") as run_mock:
            run_mock.return_value = subprocess.CompletedProcess(args=[], returncode=0)
            result = clear_android_adb_proxy(device_id="device-123")

        expected = [
            "adb",
            "-s",
            "device-123",
            "shell",
            "settings",
            "put",
            "global",
            "http_proxy",
            ":0",
        ]
        self.assertTrue(result["success"])
        self.assertEqual(result["commands_run"], [expected])
        run_mock.assert_called_once_with(expected, check=True, capture_output=True, text=True)

    def test_get_mitmproxy_cert_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            cert_dir = base / ".mitmproxy"
            cert_dir.mkdir(parents=True, exist_ok=True)
            cert_path = cert_dir / "mitmproxy-ca-cert.pem"
            cert_path.write_text("pem", encoding="utf-8")
            with patch("backchannel.mobile_setup.Path.home", return_value=base):
                detected = get_mitmproxy_cert_path()
        self.assertEqual(detected, cert_path)


if __name__ == "__main__":
    unittest.main()
