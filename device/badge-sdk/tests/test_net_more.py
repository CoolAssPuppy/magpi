# The failure half of net.py: a radio that never joins, a port that cannot
# show a certificate, a body that will not parse, a token file that cannot be
# written, and the firmware fallbacks that only run where a module is missing.
#
# test_net.py covers the paths a working badge takes. These are the ones a
# badge takes on a bad day, which is when the SDK has to be right about which
# error it raises: pairing.py branches on the code, and the wrong one puts a
# wearer in front of a screen that cannot tell them the fix.

import json
import os
import shutil
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401,E402  (installs the fake requests module)

from _isolation import load_module, refused_imports, swapped_modules  # noqa: E402
from _ports import HashlibThatFails  # noqa: E402
from _ports import OlderPortSocket  # noqa: E402
from _ports import Response  # noqa: E402
from _ports import SocketThatNeverAnswers  # noqa: E402
from _ports import SocketThatRaises  # noqa: E402
from _ports import SocketWithACertificate  # noqa: E402
from _ports import SocketWithoutACertificate  # noqa: E402
from sb import net  # noqa: E402
from sb.pairing import MissingCredentials  # noqa: E402
from sb.pairing import PairingError  # noqa: E402
import sb.pairing as pairing  # noqa: E402

NET_SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sb", "net.py")
CONFIG = {"gateway": "https://api.example.com", "cert_sha256": "a" * 64}
CERT = b"pretend-der-bytes"


def _port(wlan=None, config=None):
    return net.DevicePort(config=config or dict(CONFIG), wlan_factory=lambda: wlan)


class Wlan:
    """A radio that can fail at each of the three places a real one does."""

    def __init__(self, connected=False, status=0, isconnected_error=None, status_error=None):
        self.connected = connected
        self._status = status
        self._isconnected_error = isconnected_error
        self._status_error = status_error
        self.active_calls = []
        self.connect_calls = []
        self.active_error = None

    def active(self, on):
        if self.active_error is not None and not on:
            raise self.active_error
        self.active_calls.append(on)

    def connect(self, ssid, password):
        self.connect_calls.append((ssid, password))

    def isconnected(self):
        if self._isconnected_error is not None:
            raise self._isconnected_error
        return self.connected

    def status(self):
        if self._status_error is not None:
            raise self._status_error
        return self._status


class FakeNetwork:
    """The MicroPython `network` module, as much of it as _default_wlan uses."""

    STA_IF = "sta-if"

    def __init__(self):
        self.built = []

    def WLAN(self, interface):
        self.built.append(interface)
        return Wlan()


class SdkWithoutAVersion(types.ModuleType):
    """An SDK build that cannot answer for its own version."""

    def __getattr__(self, name):
        raise RuntimeError("this build cannot report a version")


class SecretsMixin(unittest.TestCase):
    def setUp(self):
        sys.modules.pop("secrets", None)
        self.addCleanup(lambda: sys.modules.pop("secrets", None))

    def install_secrets(self, **attrs):
        module = types.ModuleType("secrets")
        for key, value in attrs.items():
            setattr(module, key, value)
        sys.modules["secrets"] = module

    def system_dir_with(self, body):
        system = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, system, True)
        with open(os.path.join(system, "secrets.py"), "w") as f:
            f.write(body)
        original = net.SYSTEM_DIR
        net.SYSTEM_DIR = system
        self.addCleanup(lambda: setattr(net, "SYSTEM_DIR", original))
        return system


class TestFirmwareFallbacks(unittest.TestCase):
    """Imports that exist on the host and not on a badge, and the other way
    round. Every one of these branches only runs where a module is absent, so
    the module has to be taken away to prove the fallback works."""

    def test_urequests_stands_in_for_requests(self):
        urequests = types.ModuleType("urequests")
        module = load_module(
            NET_SOURCE,
            "net_on_a_urequests_port",
            refused=("requests",),
            provided={"urequests": urequests},
        )
        self.assertIs(module.requests, urequests)

    def test_uhashlib_stands_in_for_hashlib(self):
        uhashlib = types.ModuleType("uhashlib")
        module = load_module(
            NET_SOURCE,
            "net_on_a_uhashlib_port",
            refused=("hashlib",),
            provided={"uhashlib": uhashlib},
        )
        self.assertIs(module.hashlib, uhashlib)

    def test_a_build_with_no_hashing_at_all_still_imports(self):
        # No sha256 means no fingerprint, which the pin check reads as an
        # unverifiable peer rather than a crash three frames later.
        module = load_module(NET_SOURCE, "net_without_hashing", refused=("hashlib", "uhashlib"))
        self.assertIsNone(module.hashlib)
        self.assertIsNone(module._hexdigest(b"anything"))

    def test_reports_an_unknown_sdk_version_when_the_sdk_cannot_name_one(self):
        with swapped_modules(sb=SdkWithoutAVersion("sb")):
            module = load_module(NET_SOURCE, "net_without_a_version")
        self.assertEqual(module.SDK_VERSION, "unknown")

    def test_falls_back_to_the_implementation_version_when_uname_is_absent(self):
        with swapped_modules(os=types.ModuleType("os")):
            version = net.firmware_version()
        self.assertIsInstance(version, str)
        self.assertNotEqual(version, "unknown")

    def test_reports_unknown_when_nothing_can_name_a_firmware(self):
        with swapped_modules(os=types.ModuleType("os"), sys=types.ModuleType("sys")):
            version = net.firmware_version()
        self.assertEqual(version, "unknown")


class TestConfigFile(unittest.TestCase):
    def test_reads_the_gateway_config_off_the_drive(self):
        directory = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, directory, True)
        path = os.path.join(directory, "config.json")
        with open(path, "w") as f:
            json.dump({"gateway": "https://api.example.com"}, f)

        self.assertEqual(net.load_config(path), {"gateway": "https://api.example.com"})


class TestCredentialFailures(SecretsMixin):
    def test_a_secrets_file_that_does_not_run_asks_for_one_over_usb(self):
        self.system_dir_with("WIFI_SSID = (\n")

        with self.assertRaises(MissingCredentials) as ctx:
            net.wifi_credentials()

        self.assertIn("USB", str(ctx.exception))

    def test_a_secrets_file_with_only_a_password_names_the_missing_ssid(self):
        self.system_dir_with('WIFI_PASSWORD = "hunter2"\n')

        with self.assertRaises(MissingCredentials) as ctx:
            net.wifi_credentials()

        self.assertIn("WIFI_SSID", str(ctx.exception))

    def test_a_build_with_no_importable_secrets_reads_the_system_drive(self):
        # The installed image has no importable `secrets`; CPython does, which
        # is why the missing-module branch never runs on the host by itself.
        self.system_dir_with('WIFI_SSID = "badges"\nWIFI_PASSWORD = "hunter2"\n')

        with refused_imports("secrets"):
            self.assertEqual(net.wifi_credentials(), ("badges", "hunter2"))


class TestRadioFailures(SecretsMixin):
    def test_an_interface_that_cannot_say_whether_it_joined_has_failed(self):
        self.install_secrets(WIFI_SSID="badges")
        wlan = Wlan(isconnected_error=OSError("radio gone"))
        port = _port(wlan)
        port.wifi_begin()

        self.assertEqual(port.wifi_status(), pairing.WIFI_FAILED)

    def test_an_interface_with_no_status_to_report_is_still_connecting(self):
        # A port whose status() is missing or throws has not said the join
        # failed, so the machine's own timeout owns the decision rather than
        # this reading it as a failure and resetting a radio mid-join.
        self.install_secrets(WIFI_SSID="badges")
        wlan = Wlan(status_error=OSError("not supported"))
        port = _port(wlan)
        port.wifi_begin()

        self.assertEqual(port.wifi_status(), pairing.WIFI_CONNECTING)

    def test_resetting_before_the_radio_was_ever_started_is_a_no_op(self):
        port = _port(Wlan())
        port.wifi_reset()

        self.assertEqual(port.wifi_status(), pairing.WIFI_FAILED)

    def test_an_interface_that_refuses_to_shut_down_is_still_dropped(self):
        # A reset that raises would otherwise strand the port holding a dead
        # interface it never retries.
        self.install_secrets(WIFI_SSID="badges")
        wlan = Wlan()
        wlan.active_error = OSError("cannot deactivate")
        port = _port(wlan)
        port.wifi_begin()

        port.wifi_reset()

        self.assertEqual(port.wifi_status(), pairing.WIFI_FAILED)

    def test_a_build_with_no_radio_says_so_rather_than_crashing(self):
        self.install_secrets(WIFI_SSID="badges")
        original = net.network
        net.network = None
        self.addCleanup(lambda: setattr(net, "network", original))
        port = net.DevicePort(config=dict(CONFIG))

        with self.assertRaises(MissingCredentials) as ctx:
            port.wifi_begin()

        self.assertIn("network interface", str(ctx.exception))

    def test_the_default_interface_is_the_station_side_of_the_radio(self):
        # A badge joins an access point; it never becomes one.
        self.install_secrets(WIFI_SSID="badges", WIFI_PASSWORD="hunter2")
        radio = FakeNetwork()
        original = net.network
        net.network = radio
        self.addCleanup(lambda: setattr(net, "network", original))
        port = net.DevicePort(config=dict(CONFIG))

        port.wifi_begin()

        self.assertEqual(radio.built, [FakeNetwork.STA_IF])


class TestPinningEdges(unittest.TestCase):
    """Ports differ in what they will tell the SDK about the peer. Every one
    of these has to end as a pass or a PairingError, never an AttributeError
    from inside the check."""

    def _verify(self, response, **cfg):
        config = {"gateway": "https://api.example.com"}
        config.update(cfg)
        return net.verify_peer(config, response)

    def test_a_socket_with_no_certificate_to_offer_is_unverifiable(self):
        response = Response(sock=SocketWithoutACertificate())

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="a" * 64, require_pin=True)

        self.assertEqual(ctx.exception.code, "certificate")

    def test_a_port_whose_getpeercert_takes_no_argument_is_still_checked(self):
        import hashlib

        response = Response(sock=OlderPortSocket(CERT))

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="b" * 64)

        self.assertEqual(ctx.exception.code, "certificate")
        # And the same socket passes against the right pin, so the retry reads
        # the certificate rather than merely surviving the TypeError.
        self.assertIsNone(self._verify(response, cert_sha256=hashlib.sha256(CERT).hexdigest()))

    def test_a_socket_that_refuses_both_spellings_is_unverifiable(self):
        response = Response(sock=SocketThatNeverAnswers())

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="a" * 64, require_pin=True)

        self.assertEqual(ctx.exception.code, "certificate")

    def test_a_socket_that_throws_on_the_first_ask_is_unverifiable(self):
        response = Response(sock=SocketThatRaises())

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="a" * 64, require_pin=True)

        self.assertEqual(ctx.exception.code, "certificate")

    def test_a_certificate_with_no_pin_to_check_it_against_passes(self):
        # No cert_sha256 and no require_pin is the shipped default, and it must
        # not turn a readable certificate into a refusal.
        response = Response(sock=SocketWithACertificate(CERT))

        self.assertIsNone(self._verify(response))

    def test_a_build_that_cannot_hash_refuses_when_pinning_is_required(self):
        original = net.hashlib
        net.hashlib = HashlibThatFails()
        self.addCleanup(lambda: setattr(net, "hashlib", original))
        response = Response(sock=SocketWithACertificate(CERT))

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="a" * 64, require_pin=True)

        self.assertEqual(ctx.exception.code, "certificate")

    def test_a_build_that_cannot_hash_passes_when_pinning_is_not_required(self):
        original = net.hashlib
        net.hashlib = HashlibThatFails()
        self.addCleanup(lambda: setattr(net, "hashlib", original))
        response = Response(sock=SocketWithACertificate(CERT))

        self.assertIsNone(self._verify(response, cert_sha256="a" * 64))

    def test_a_pin_of_the_wrong_length_does_not_match(self):
        # A truncated cert_sha256 must fail the comparison rather than index
        # past the end of the shorter string.
        response = Response(sock=SocketWithACertificate(CERT))

        with self.assertRaises(PairingError) as ctx:
            self._verify(response, cert_sha256="abcd")

        self.assertEqual(ctx.exception.code, "certificate")


class TestCallFailures(unittest.TestCase):
    def tearDown(self):
        fakes.fake_requests.handler = None
        fakes.fake_requests.calls = []

    def test_a_body_that_will_not_parse_is_a_network_error(self):
        response = Response(json_error=ValueError("unterminated object"))
        fakes.fake_requests.handler = lambda *a: response

        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")

        self.assertEqual(ctx.exception.code, "network")
        self.assertTrue(response.closed, "a failed call left the socket open")

    def test_an_accepted_response_that_is_not_an_object_is_a_bad_response(self):
        fakes.fake_requests.handler = lambda *a: fakes.FakeResponse(200, ["not", "an", "object"])

        with self.assertRaises(PairingError) as ctx:
            _port().poll("device-code")

        self.assertEqual(ctx.exception.code, "bad_response")

    def test_handing_off_after_pairing_does_nothing(self):
        # It called machine.soft_reset() once, which did nothing on the badge
        # and swallowed the exception, leaving a paired wearer on the code
        # screen. BadgeApp hands off to itself now.
        self.assertIsNone(_port().launch())


class TestForgettingTheToken(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.path = os.path.join(self.dir, "token.json")

    def _write(self):
        with open(self.path, "w") as f:
            f.write(json.dumps({"badge_token": "t", "badge_id": "b", "handle": None}))

    def test_a_dead_pairing_is_deleted_from_the_drive(self):
        self._write()

        self.assertTrue(net.forget_token(self.path))
        self.assertFalse(net.is_paired(self.path))

    def test_forgetting_a_badge_that_was_never_paired_removes_nothing(self):
        self.assertFalse(net.forget_token(self.path))

    def test_a_build_with_no_filesystem_module_forgets_nothing(self):
        self._write()

        with refused_imports("os"):
            self.assertFalse(net.forget_token(self.path))

        self.assertTrue(os.path.exists(self.path), "the token was removed anyway")


class TestMigrationFailures(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.legacy = os.path.join(self.dir, "badge-token.json")
        with open(self.legacy, "w") as f:
            f.write(json.dumps({"badge_token": "t", "badge_id": "b", "handle": None}))

    def test_a_move_that_cannot_be_made_leaves_the_old_token_alone(self):
        # The destination sits under a path component that is a file, so both
        # the mkdir and the rename fail. A badge that cannot migrate keeps the
        # pairing it has rather than losing it to a half-finished move.
        blocker = os.path.join(self.dir, "not-a-directory")
        with open(blocker, "w") as f:
            f.write("")

        net._migrate_token(os.path.join(blocker, "token.json"), self.legacy)

        self.assertTrue(os.path.exists(self.legacy))

    def test_a_build_with_no_filesystem_module_migrates_nothing(self):
        with refused_imports("os"):
            net._migrate_token(os.path.join(self.dir, "token.json"), self.legacy)

        self.assertTrue(os.path.exists(self.legacy))


class TestWritingTheToken(unittest.TestCase):
    def test_a_bare_filename_is_written_in_the_working_directory(self):
        # save_token splits a directory off the path to make it. A path with no
        # directory part has nothing to make, and must not be read as "/".
        directory = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, directory, True)
        origin = os.getcwd()
        self.addCleanup(os.chdir, origin)
        os.chdir(directory)

        _port().save_token({"badge_token": "t", "badge_id": "b", "handle": None}, path="token.json")

        self.assertEqual(sorted(os.listdir(directory)), ["token.json"])

    def test_a_build_with_no_filesystem_module_makes_no_directories(self):
        with refused_imports("os"):
            self.assertIsNone(net._ensure_dir("/state"))


if __name__ == "__main__":
    unittest.main()
