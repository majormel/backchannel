import base64
from dataclasses import dataclass
from io import BytesIO
import json
import os
from pathlib import Path
import plistlib
import secrets
import socket
import ssl
import subprocess
import sys
import threading
import time
from uuid import uuid4


@dataclass
class MobilePairing:
    token: str
    host: str
    pairing_port: int
    proxy_port: int
    wifi_ssid: str
    created_at: float
    expires_at: float
    downloaded_at: float | None = None
    client_ip: str | None = None

    @property
    def profile_url(self) -> str:
        return f"http://{self.host}:{self.pairing_port}/pair/{self.token}"

    def as_dict(self, now: float | None = None) -> dict:
        current_time = time.time() if now is None else now
        if current_time >= self.expires_at:
            status = "expired"
        elif self.downloaded_at is not None:
            status = "downloaded"
        else:
            status = "ready"
        return {
            "token": self.token,
            "profile_url": self.profile_url,
            "host": self.host,
            "pairing_port": self.pairing_port,
            "proxy_port": self.proxy_port,
            "wifi_ssid": self.wifi_ssid,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "downloaded_at": self.downloaded_at,
            "client_ip": self.client_ip,
            "status": status,
        }


class MobilePairingRegistry:
    def __init__(self):
        self._pairings: dict[str, MobilePairing] = {}
        self._lock = threading.Lock()

    def create(
        self,
        host: str,
        pairing_port: int,
        proxy_port: int,
        wifi_ssid: str,
        ttl_seconds: int = 600,
    ) -> MobilePairing:
        now = time.time()
        pairing = MobilePairing(
            token=secrets.token_urlsafe(24),
            host=host,
            pairing_port=pairing_port,
            proxy_port=proxy_port,
            wifi_ssid=wifi_ssid,
            created_at=now,
            expires_at=now + max(60, ttl_seconds),
        )
        with self._lock:
            self._pairings[pairing.token] = pairing
            self._prune_locked(now)
        return pairing

    def get(self, token: str) -> MobilePairing | None:
        with self._lock:
            return self._pairings.get(token)

    def get_active(self, token: str) -> MobilePairing | None:
        now = time.time()
        with self._lock:
            pairing = self._pairings.get(token)
            if pairing is None or now >= pairing.expires_at:
                return None
            return pairing

    def mark_downloaded(self, token: str, client_ip: str | None) -> MobilePairing | None:
        now = time.time()
        with self._lock:
            pairing = self._pairings.get(token)
            if pairing is None or now >= pairing.expires_at:
                return None
            pairing.downloaded_at = now
            pairing.client_ip = client_ip
            return pairing

    def clear(self) -> None:
        with self._lock:
            self._pairings.clear()

    def _prune_locked(self, now: float) -> None:
        cutoff = now - 3600
        expired_tokens = [token for token, pairing in self._pairings.items() if pairing.expires_at < cutoff]
        for token in expired_tokens:
            self._pairings.pop(token, None)


mobile_pairings = MobilePairingRegistry()


def get_lan_ip() -> str:
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            client.connect(("8.8.8.8", 80))
            return str(client.getsockname()[0])
        finally:
            client.close()
    except OSError:
        return "127.0.0.1"


def _network_command(args: list[str], timeout: int = 3) -> str:
    try:
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "LC_ALL": "C"},
        )
        return result.stdout if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError, UnicodeError):
        return ""


def get_wifi_ssid() -> str | None:
    """Read the host's connected Wi-Fi name without scanning or changing settings.

    Missing tools, disconnected adapters, and OS privacy redaction all fall back
    to manual entry. Never substitute a saved or nearby network for the current one.
    """
    def available(value: str) -> str | None:
        if isinstance(value, str) and value and value.lower() not in {"<redacted>", "<hidden>", "--"} and len(value.encode("utf-8")) <= 32:
            return value
        return None

    if sys.platform == "darwin":
        ports = _network_command(["/usr/sbin/networksetup", "-listallhardwareports"])
        for block in ports.split("\n\n"):
            if "Hardware Port: Wi-Fi\n" not in block and "Hardware Port: AirPort\n" not in block:
                continue
            for line in block.splitlines():
                if not line.startswith("Device: "):
                    continue
                output = _network_command(["/usr/sbin/networksetup", "-getairportnetwork", line.removeprefix("Device: ")])
                for prefix in ("Current Wi-Fi Network: ", "Current AirPort Network: "):
                    if output.startswith(prefix) and (ssid := available(output.removeprefix(prefix).rstrip("\r\n"))):
                        return ssid
        # Recent macOS releases may omit the name from networksetup.
        output = _network_command(["/usr/sbin/system_profiler", "SPAirPortDataType", "-json"], timeout=5)
        try:
            for entry in json.loads(output).get("SPAirPortDataType", []):
                for interface in entry.get("spairport_airport_interfaces", []):
                    name = interface.get("spairport_current_network_information", {}).get("_name", "")
                    if ssid := available(name):
                        return ssid
        except (ValueError, TypeError, AttributeError):
            pass
    elif sys.platform.startswith("linux"):
        output = _network_command(["nmcli", "--terse", "--escape", "no", "--fields", "IN-USE,SSID", "device", "wifi", "list", "--rescan", "no"])
        for line in output.splitlines():
            if line.startswith("*:") and (ssid := available(line[2:])):
                return ssid
    elif sys.platform == "win32":
        output = _network_command(["netsh", "wlan", "show", "interfaces"])
        for line in output.splitlines():
            key, separator, value = line.partition(":")
            if separator and key.strip() == "SSID" and (ssid := available(value.strip())):
                return ssid
    return None


def get_mitmproxy_cert_path() -> Path | None:
    cert_path = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.pem"
    if cert_path.exists():
        return cert_path
    return None


def read_cert_pem() -> str | None:
    cert_path = get_mitmproxy_cert_path()
    if cert_path is None:
        return None
    try:
        return cert_path.read_text(encoding="utf-8")
    except OSError:
        return None


def generate_qr_data(host: str, proxy_port: int, dashboard_port: int) -> dict:
    return {
        "v": 1,
        "host": host,
        "proxy_port": proxy_port,
        "cert_url": f"http://{host}:{dashboard_port}/cert",
        "profile_url": f"http://{host}:{dashboard_port}/mobileconfig",
        "wifi_profile_url_template": f"http://{host}:{dashboard_port}/mobileconfig?mode=wifi&ssid={{ssid}}",
        "dashboard_url": f"http://{host}:{dashboard_port}",
    }


def generate_qr_png(data: str) -> bytes | None:
    try:
        import qrcode
    except Exception:
        return None
    try:
        image = qrcode.make(data)
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()
    except Exception:
        return None


def generate_apple_profile(host: str, proxy_port: int, cert_pem: str | None = None, wifi_ssid: str | None = None) -> str:
    payloads = []
    if cert_pem:
        try:
            der_cert = ssl.PEM_cert_to_DER_cert(cert_pem)
            payloads.append(
                {
                    "PayloadType": "com.apple.security.root",
                    "PayloadVersion": 1,
                    "PayloadIdentifier": "com.backchannel.proxy.cert",
                    "PayloadUUID": str(uuid4()),
                    "PayloadDisplayName": "backchannel Certificate",
                    "PayloadContent": der_cert,
                }
            )
        except (ValueError, ssl.SSLError):
            pass
    if wifi_ssid:
        payloads.append(
            {
                "PayloadType": "com.apple.wifi.managed",
                "PayloadVersion": 1,
                "PayloadIdentifier": "com.backchannel.proxy.wifi",
                "PayloadUUID": str(uuid4()),
                "PayloadDisplayName": "backchannel Wi-Fi Proxy",
                "SSID_STR": wifi_ssid,
                "ProxyType": "Manual",
                "ProxyServer": host,
                "ProxyServerPort": proxy_port,
            }
        )
    profile = {
        "PayloadContent": payloads,
        "PayloadDisplayName": "backchannel Wi-Fi Setup" if wifi_ssid else "backchannel Certificate",
        "PayloadIdentifier": "com.backchannel.proxy",
        "PayloadType": "Configuration",
        "PayloadUUID": str(uuid4()),
        "PayloadVersion": 1,
    }
    return plistlib.dumps(profile, fmt=plistlib.FMT_XML, sort_keys=False).decode("utf-8")


def setup_android_adb(host: str, proxy_port: int, device_id: str | None = None) -> dict:
    adb_prefix = ["adb"]
    if device_id:
        adb_prefix.extend(["-s", device_id])
    cert_path = get_mitmproxy_cert_path()
    if cert_path is None:
        cert_path = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.pem"
    set_proxy_cmd = adb_prefix + ["shell", "settings", "put", "global", "http_proxy", f"{host}:{proxy_port}"]
    push_cert_cmd = adb_prefix + ["push", str(cert_path), "/sdcard/Download/mitmproxy-ca-cert.pem"]
    clear_proxy_cmd = adb_prefix + ["shell", "settings", "put", "global", "http_proxy", ":0"]
    try:
        subprocess.run(set_proxy_cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        return {"success": False, "commands_run": [], "certificate_copy_command": push_cert_cmd, "clear_proxy_command": clear_proxy_cmd, "error": str(exc)}
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if isinstance(exc.stderr, str) else ""
        return {"success": False, "commands_run": [], "certificate_copy_command": push_cert_cmd, "clear_proxy_command": clear_proxy_cmd, "error": stderr or str(exc)}
    except subprocess.SubprocessError as exc:
        return {"success": False, "commands_run": [], "certificate_copy_command": push_cert_cmd, "clear_proxy_command": clear_proxy_cmd, "error": str(exc)}
    return {
        "success": True,
        "commands_run": [set_proxy_cmd],
        "certificate_copy_command": push_cert_cmd,
        "clear_proxy_command": clear_proxy_cmd,
        "cleanup_required": True,
        "error": None,
    }


def clear_android_adb_proxy(device_id: str | None = None) -> dict:
    adb_prefix = ["adb"]
    if device_id:
        adb_prefix.extend(["-s", device_id])
    command = adb_prefix + ["shell", "settings", "put", "global", "http_proxy", ":0"]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        return {"success": False, "commands_run": [], "error": str(exc)}
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if isinstance(exc.stderr, str) else ""
        return {"success": False, "commands_run": [], "error": stderr or str(exc)}
    except subprocess.SubprocessError as exc:
        return {"success": False, "commands_run": [], "error": str(exc)}
    return {"success": True, "commands_run": [command], "error": None}
