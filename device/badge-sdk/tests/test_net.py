import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs the fake requests module)
from testing.fakes import FakeResponse

from sb import net
from sb import pairing
from sb.pairing import PairingError

CONFIG = {"gateway": "https://api.example.com", "cert_sha256": "a" * 64}


class FakeWlan:
    def __init__(self, connected=False, status=0, raises=None):
        self.connected = connected
        self._status = status
        self.raises = raises
        self.active_calls = []
        self.connect_calls = []

    def active(self, on):
        self.active_calls.append(on)

    def connect(self, ssid, password):
        self.connect_calls.append((ssid, password))

    def isconnected(self):
        if self.raises:
            raise self.raises
        return self.connected

    def status(self):
        return self._status


def _port(wlan=None, config=None):
    port = net.DevicePort(config=config or dict(CONFIG), wlan_factory=lambda: wlan or FakeWlan())
    return port


class TestWifi(unittest.TestCase):
    def setUp(self):
        sys.modules.pop("secrets", None)

    def tearDown(self):
        sys.modules.pop("secrets", None)

    def _install_secrets(self, **attrs):
        import types

        module = types.ModuleType("secrets")
        for key, value in attrs.items():
            setattr(module, key, value)
        sys.modules["secrets"] = module

    def test_missing_secrets_module_raises_missing_credentials(self):
        with self.assertRaises(pairing.MissingCredentials):
            net.wifi_credentials()

    def test_secrets_without_an_ssid_raises_missing_credentials(self):
        self._install_secrets(WIFI_PASSWORD="hunter2")
        with self.assertRaises(pairing.MissingCredentials):
            net.wifi_credentials()

    def test_reads_the_pimoroni_names(self):
        self._install_secrets(WIFI_SSID="badges", WIFI_PASSWORD="hunter2")
        self.assertEqual(net.wifi_credentials(), ("badges", "hunter2"))

    def test_reads_the_bare_names_as_a_fallback(self):
        self._install_secrets(SSID="badges", PASSWORD="hunter2")
        self.assertEqual(net.wifi_credentials(), ("badges", "hunter2"))

    def test_open_network_has_an_empty_password(self):
        self._install_secrets(WIFI_SSID="badges")
        self.assertEqual(net.wifi_credentials(), ("badges", ""))

    def test_finds_secrets_in_the_system_directory(self):
        # The installed image keeps secrets.py in /system and puts only the
        # running app's directory on sys.path. A bare import misses it, which
        # reads as a badge with no WiFi while the credentials are on the drive.
        system = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, system)
        with open(os.path.join(system, "secrets.py"), "w") as f:
            f.write('WIFI_SSID = "badges"\nWIFI_PASSWORD = "hunter2"\n')

        original_dir, original_path = net.SYSTEM_DIR, list(sys.path)
        net.SYSTEM_DIR = system
        self.addCleanup(lambda: setattr(net, "SYSTEM_DIR", original_dir))
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), original_path))

        self.assertEqual(net.wifi_credentials(), ("badges", "hunter2"))

    def test_begin_activates_and_connects(self):
        self._install_secrets(WIFI_SSID="badges", WIFI_PASSWORD="hunter2")
        wlan = FakeWlan()
        port = _port(wlan)
        port.wifi_begin()
        self.assertEqual(wlan.active_calls, [True])
        self.assertEqual(wlan.connect_calls, [("badges", "hunter2")])

    def test_status_before_begin_is_failed(self):
        self.assertEqual(_port().wifi_status(), pairing.WIFI_FAILED)

    def test_connected_interface_reports_connected(self):
        self._install_secrets(WIFI_SSID="badges")
        wlan = FakeWlan(connected=True)
        port = _port(wlan)
        port.wifi_begin()
        self.assertEqual(port.wifi_status(), pairing.WIFI_CONNECTED)

    def test_negative_status_is_a_failure(self):
        self._install_secrets(WIFI_SSID="badges")
        wlan = FakeWlan(connected=False, status=-3)
        port = _port(wlan)
        port.wifi_begin()
        self.assertEqual(port.wifi_status(), pairing.WIFI_FAILED)

    def test_in_progress_status_is_connecting(self):
        self._install_secrets(WIFI_SSID="badges")
        wlan = FakeWlan(connected=False, status=1)
        port = _port(wlan)
        port.wifi_begin()
        self.assertEqual(port.wifi_status(), pairing.WIFI_CONNECTING)

    def test_reset_deactivates_and_drops_the_interface(self):
        self._install_secrets(WIFI_SSID="badges")
        wlan = FakeWlan()
        port = _port(wlan)
        port.wifi_begin()
        port.wifi_reset()
        self.assertEqual(wlan.active_calls, [True, False])
        self.assertEqual(port.wifi_status(), pairing.WIFI_FAILED)


class TestPairingCalls(unittest.TestCase):
    def tearDown(self):
        fakes.fake_requests.handler = None
        fakes.fake_requests.calls = []

    def test_start_posts_the_identity_body(self):
        fakes.fake_requests.handler = lambda *a: FakeResponse(200, {"user_code": "AAAA-BBBB"})
        port = _port()
        body = port.start("uid-1", "1.2.0", "1.0.0")
        self.assertEqual(body["user_code"], "AAAA-BBBB")
        call = fakes.fake_requests.calls[-1]
        # The function is deployed as `device-start`, and the gateway routes
        # on the function name, so a `/device/start` path resolves to a function
        # named `device` and 404s. This assertion previously encoded the wrong
        # path, which is why the suite stayed green while no badge could pair
        # against a real deployment.
        self.assertEqual(call["url"], "https://api.example.com/device-start")
        self.assertEqual(json.loads(call["data"]), {"badge_uid": "uid-1", "fw": "1.2.0", "sdk": "1.0.0"})

    def test_no_authorization_header_is_sent(self):
        # There is no badge token yet, and these are the only two endpoints
        # that do not want one.
        fakes.fake_requests.handler = lambda *a: FakeResponse(200, {"user_code": "A"})
        _port().start("uid-1", "fw", "sdk")
        self.assertNotIn("Authorization", fakes.fake_requests.calls[-1]["headers"])

    def test_202_pending_becomes_a_pairing_error(self):
        fakes.fake_requests.handler = lambda *a: FakeResponse(
            202, {"error": "authorization_pending", "message": "waiting for approval"}
        )
        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")
        self.assertEqual(ctx.exception.code, pairing.PENDING)

    def test_retry_after_is_read_from_the_top_level(self):
        # The gateway puts retry_after beside error, not inside detail. A
        # reader that looks under detail silently ignores every backoff the
        # server asks for.
        fakes.fake_requests.handler = lambda *a: FakeResponse(
            429, {"error": "slow_down", "retry_after": 30, "detail": {"retry_after": 1}}
        )
        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")
        self.assertEqual(ctx.exception.retry_after, 30)

    def test_expired_token_carries_its_code(self):
        fakes.fake_requests.handler = lambda *a: FakeResponse(
            400, {"error": "expired_token", "message": "device code has expired"}
        )
        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")
        self.assertEqual(ctx.exception.code, pairing.EXPIRED_TOKEN)
        self.assertEqual(ctx.exception.message, "device code has expired")

    def test_transport_failure_becomes_a_network_error(self):
        def boom(*args):
            raise OSError("ECONNRESET")

        fakes.fake_requests.handler = boom
        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")
        self.assertEqual(ctx.exception.code, "network")

    def test_error_body_that_is_not_an_object_still_raises(self):
        fakes.fake_requests.handler = lambda *a: FakeResponse(500, ["oops"])
        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")
        self.assertEqual(ctx.exception.code, "http_500")

    def test_response_is_always_closed(self):
        response = FakeResponse(200, {"user_code": "A"})
        fakes.fake_requests.handler = lambda *a: response
        _port().start("uid", "fw", "sdk")
        self.assertTrue(response.closed)


class TestPinning(unittest.TestCase):
    def tearDown(self):
        fakes.fake_requests.handler = None

    def test_matching_fingerprint_passes(self):
        import hashlib

        cert = b"der-bytes"
        cfg = {"gateway": "https://api.example.com", "cert_sha256": hashlib.sha256(cert).hexdigest()}
        fakes.fake_requests.handler = lambda *a: FakeResponse(200, {"ok": True}, peer_cert=cert)
        self.assertEqual(_port(config=cfg).poll("c"), {"ok": True})

    def test_mismatched_fingerprint_is_refused(self):
        cfg = {"gateway": "https://api.example.com", "cert_sha256": "b" * 64}
        fakes.fake_requests.handler = lambda *a: FakeResponse(
            200, {"ok": True}, peer_cert=b"der-bytes"
        )
        with self.assertRaises(PairingError) as ctx:
            _port(config=cfg).poll("c")
        self.assertEqual(ctx.exception.code, "certificate")

    def test_unverifiable_peer_passes_when_pinning_is_not_required(self):
        fakes.fake_requests.handler = lambda *a: FakeResponse(200, {"ok": True})
        self.assertEqual(_port().poll("c"), {"ok": True})

    def test_unverifiable_peer_is_refused_when_pinning_is_required(self):
        cfg = {"gateway": "https://api.example.com", "cert_sha256": "b" * 64, "require_pin": True}
        fakes.fake_requests.handler = lambda *a: FakeResponse(200, {"ok": True})
        with self.assertRaises(PairingError) as ctx:
            _port(config=cfg).poll("c")
        self.assertEqual(ctx.exception.code, "certificate")

    def test_require_pin_without_a_configured_fingerprint_is_refused(self):
        cfg = {"gateway": "https://api.example.com", "require_pin": True}
        fakes.fake_requests.handler = lambda *a: FakeResponse(
            200, {"ok": True}, peer_cert=b"der-bytes"
        )
        with self.assertRaises(PairingError):
            _port(config=cfg).poll("c")


class TestTokenFile(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "token.json")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_writes_the_token_as_json(self):
        token = {"badge_token": "t", "badge_id": "b", "handle": "prashant"}
        _port().save_token(token, path=self.path)
        with open(self.path) as f:
            self.assertEqual(json.load(f), token)

    def test_overwrites_a_previous_pairing(self):
        port = _port()
        port.save_token({"badge_token": "old", "badge_id": "b", "handle": None}, path=self.path)
        port.save_token({"badge_token": "new", "badge_id": "b", "handle": None}, path=self.path)
        with open(self.path) as f:
            self.assertEqual(json.load(f)["badge_token"], "new")

    def test_leaves_no_temp_file_behind(self):
        _port().save_token({"badge_token": "t", "badge_id": "b", "handle": None}, path=self.path)
        self.assertEqual(os.listdir(self.dir), ["token.json"])


class TestIsPaired(unittest.TestCase):
    """The branch the whole app turns on: pairing screen or sync screen.

    Getting this wrong in either direction is a badge that cannot be
    recovered from its own UI, so every shape the file can be in is covered
    rather than only the two happy ones."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "token.json")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _write(self, text):
        with open(self.path, "w") as f:
            f.write(text)

    def test_no_token_file_is_not_paired(self):
        self.assertFalse(net.is_paired(self.path))

    def test_a_saved_token_is_paired(self):
        _port().save_token(
            {"badge_token": "t", "badge_id": "b", "handle": "prashant"}, path=self.path
        )
        self.assertTrue(net.is_paired(self.path))

    def test_a_truncated_file_is_not_paired(self):
        self._write('{"badge_token": "t"')
        self.assertFalse(net.is_paired(self.path))

    def test_a_token_file_without_a_token_is_not_paired(self):
        self._write(json.dumps({"badge_id": "b", "handle": "prashant"}))
        self.assertFalse(net.is_paired(self.path))

    def test_an_empty_token_is_not_paired(self):
        self._write(json.dumps({"badge_token": "", "badge_id": "b"}))
        self.assertFalse(net.is_paired(self.path))

    def test_a_json_document_that_is_not_an_object_is_not_paired(self):
        self._write(json.dumps(["badge_token"]))
        self.assertFalse(net.is_paired(self.path))


class TestTokenMigration(unittest.TestCase):
    """A badge paired by an older build wrote its token to /badge. The token
    moved to /state, and a badge in the field must not lose its pairing over
    the move."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.new = os.path.join(self.dir, "state", "token.json")
        self.legacy = os.path.join(self.dir, "badge", "token.json")
        os.makedirs(os.path.dirname(self.legacy))
        os.makedirs(os.path.dirname(self.new))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _write(self, path, token):
        with open(path, "w") as f:
            f.write(json.dumps(token))

    def test_a_legacy_token_moves_to_the_new_path(self):
        self._write(self.legacy, {"badge_token": "t", "badge_id": "b", "handle": None})

        net._migrate_token(self.new, self.legacy)

        self.assertTrue(os.path.exists(self.new))
        self.assertFalse(os.path.exists(self.legacy))
        self.assertTrue(net.is_paired(self.new))

    def test_a_token_already_in_place_wins_and_the_legacy_is_left_alone(self):
        self._write(self.new, {"badge_token": "new", "badge_id": "b", "handle": None})
        self._write(self.legacy, {"badge_token": "old", "badge_id": "b", "handle": None})

        net._migrate_token(self.new, self.legacy)

        with open(self.new) as f:
            self.assertEqual(json.load(f)["badge_token"], "new")
        self.assertTrue(os.path.exists(self.legacy))

    def test_nothing_to_migrate_is_a_no_op(self):
        net._migrate_token(self.new, self.legacy)
        self.assertFalse(os.path.exists(self.new))


class TestVersions(unittest.TestCase):
    def test_firmware_version_is_always_a_string(self):
        self.assertIsInstance(net.firmware_version(), str)

    def test_sdk_version_is_always_a_string(self):
        self.assertIsInstance(net.SDK_VERSION, str)


if __name__ == "__main__":
    unittest.main()
