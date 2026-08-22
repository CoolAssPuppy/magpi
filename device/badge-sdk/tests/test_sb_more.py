# The SDK against a firmware or a peer that will not cooperate.
#
# test_sb.py covers the routes, the headers and the pin. These are the states
# underneath: a build with no HTTP client, a build with no sha256, a port that
# answers getpeercert three different ways, and a rate limit whose interval is
# not a number. Every one of them has to end as a named SdkError, because an
# applet catches those by type and draws a screen for each.
#
# Nothing here asserts on a badge token. The token is scoped and revocable and
# it still never belongs in a test's output.

import hashlib
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

from testing import fakes  # noqa: F401,E402  (installs fake requests before sb is imported)
import sb  # noqa: E402
from sb import net  # noqa: E402

from _isolation import load_module  # noqa: E402
from _ports import HashlibThatFails  # noqa: E402
from _ports import OlderPortSocket  # noqa: E402
from _ports import Response  # noqa: E402
from _ports import SocketThatNeverAnswers  # noqa: E402
from _ports import SocketThatRaises  # noqa: E402
from _ports import SocketWithACertificate  # noqa: E402
from _ports import SocketWithoutACertificate  # noqa: E402

SB_SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sb", "__init__.py")
PINNED_CERT = b"pretend-der-bytes"
PINNED_SHA256 = hashlib.sha256(PINNED_CERT).hexdigest()


class SbTestCase(unittest.TestCase):
    """A paired badge with a config on the drive, which is what every call
    below starts from."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.config_path = os.path.join(self.tmp, "config.json")
        self.token_path = os.path.join(self.tmp, "token.json")
        self.write_config()
        with open(self.token_path, "w") as f:
            json.dump({"badge_token": "tok-123", "badge_id": "b-1", "handle": "prashant"}, f)
        sb._reset()
        sb._set_paths(self.config_path, self.token_path)
        fakes.fake_requests.calls = []
        self.addCleanup(sb._reset)
        self.addCleanup(lambda: setattr(fakes.fake_requests, "handler", None))

    def write_config(self, **overrides):
        cfg = {"gateway": "https://api.example.com/", "cert_sha256": PINNED_SHA256}
        cfg.update(overrides)
        with open(self.config_path, "w") as f:
            json.dump(cfg, f)
        sb._reset()
        sb._set_paths(self.config_path, self.token_path)

    def respond_with(self, response):
        fakes.fake_requests.handler = lambda method, url, headers, data: response

    def use_hashlib(self, replacement):
        original = sb.hashlib
        sb.hashlib = replacement
        self.addCleanup(lambda: setattr(sb, "hashlib", original))


class TestFirmwareFallbacks(unittest.TestCase):
    """The SDK is imported by applets that only draw, so a badge with no HTTP
    client and no sha256 has to import cleanly and fail at the call instead."""

    def test_urequests_stands_in_for_requests(self):
        urequests = types.ModuleType("urequests")
        module = load_module(
            SB_SOURCE,
            "sb_on_a_urequests_port",
            refused=("requests",),
            provided={"urequests": urequests},
        )
        self.assertIs(module.requests, urequests)

    def test_a_build_with_no_http_client_still_imports(self):
        # sb.constants is imported by apps that never make a call. Refusing to
        # import here would stop a badge that only draws from starting.
        module = load_module(
            SB_SOURCE, "sb_without_an_http_client", refused=("requests", "urequests")
        )
        self.assertIsNone(module.requests)

    def test_uhashlib_stands_in_for_hashlib(self):
        uhashlib = types.ModuleType("uhashlib")
        module = load_module(
            SB_SOURCE,
            "sb_on_a_uhashlib_port",
            refused=("hashlib",),
            provided={"uhashlib": uhashlib},
        )
        self.assertIs(module.hashlib, uhashlib)

    def test_a_build_with_no_hashing_at_all_still_imports(self):
        module = load_module(SB_SOURCE, "sb_without_hashing", refused=("hashlib", "uhashlib"))
        self.assertIsNone(module.hashlib)
        self.assertIsNone(module._hexdigest(b"anything"))


class TestNoHttpClient(SbTestCase):
    def test_a_call_on_a_build_with_no_http_client_is_a_network_error(self):
        original = sb.requests
        sb.requests = None
        self.addCleanup(lambda: setattr(sb, "requests", original))

        with self.assertRaises(sb.NetworkError) as ctx:
            sb.desk()

        self.assertIn("HTTP client", str(ctx.exception))


class TestRateLimitInterval(SbTestCase):
    def test_a_retry_after_that_is_not_a_number_falls_back_to_the_default(self):
        # The apps sleep on this value. A string from the server must not
        # become a TypeError inside the error path.
        self.respond_with(Response(429, {"error": "rate_limited", "retry_after": "soon"}))

        with self.assertRaises(sb.RateLimited) as ctx:
            sb.desk()

        self.assertEqual(ctx.exception.retry_after, 5)


class TestPinningAgainstAwkwardPorts(SbTestCase):
    """What each kind of port tells the SDK about the peer, and what the SDK
    does with it. Ports differ; the answer is always a pass or a
    CertificateError and never an AttributeError from inside the check."""

    def test_a_socket_with_no_certificate_to_offer_fails_closed(self):
        self.write_config(require_pin=True)
        self.respond_with(Response(200, {}, sock=SocketWithoutACertificate()))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_port_whose_getpeercert_takes_no_argument_is_still_pinned(self):
        # Without the retry the peer reads as unavailable, which skips the pin
        # entirely on a port that could in fact have been checked.
        self.respond_with(Response(200, {"handle": "prashant"}, sock=OlderPortSocket(b"attacker")))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_port_whose_getpeercert_takes_no_argument_passes_on_a_match(self):
        self.respond_with(Response(200, {"ok": True}, sock=OlderPortSocket(PINNED_CERT)))

        self.assertEqual(sb.desk(), {"ok": True})

    def test_a_socket_that_refuses_both_spellings_fails_closed(self):
        self.write_config(require_pin=True)
        self.respond_with(Response(200, {}, sock=SocketThatNeverAnswers()))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_socket_that_throws_on_the_first_ask_fails_closed(self):
        self.write_config(require_pin=True)
        self.respond_with(Response(200, {}, sock=SocketThatRaises()))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_certificate_with_no_pin_to_check_it_against_passes(self):
        # No cert_sha256 and no require_pin is the shipped default. A readable
        # certificate must not turn that into a refusal.
        self.write_config(cert_sha256="")
        self.respond_with(Response(200, {"ok": True}, sock=SocketWithACertificate(PINNED_CERT)))

        self.assertEqual(sb.desk(), {"ok": True})

    def test_a_pin_of_the_wrong_length_does_not_match(self):
        # A truncated cert_sha256 has to fail the comparison rather than read
        # past the end of the shorter string.
        self.write_config(cert_sha256="abcd")
        self.respond_with(Response(200, {}, sock=SocketWithACertificate(PINNED_CERT)))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_build_that_cannot_hash_fails_closed_when_pinning_is_required(self):
        self.write_config(require_pin=True)
        self.use_hashlib(HashlibThatFails())
        self.respond_with(Response(200, {}, sock=SocketWithACertificate(PINNED_CERT)))

        with self.assertRaises(sb.CertificateError):
            sb.desk()

    def test_a_build_that_cannot_hash_falls_back_when_pinning_is_not_required(self):
        self.use_hashlib(HashlibThatFails())
        self.respond_with(Response(200, {"ok": True}, sock=SocketWithACertificate(PINNED_CERT)))

        self.assertEqual(sb.desk(), {"ok": True})


class TestLegacyTokenMigration(SbTestCase):
    def test_a_migration_that_fails_does_not_stop_a_paired_badge(self):
        # The move from /badge to /state is best effort. A badge whose token is
        # already where the SDK reads it must not be taken offline by a failure
        # to move a file that is not there.
        def refuse(path):
            raise OSError("read-only filesystem")

        original = net._migrate_token
        net._migrate_token = refuse
        self.addCleanup(lambda: setattr(net, "_migrate_token", original))
        self.respond_with(Response(200, {"ok": True}))

        self.assertEqual(sb.desk(), {"ok": True})


if __name__ == "__main__":
    unittest.main()
