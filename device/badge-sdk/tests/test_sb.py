import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs fake requests before sb is imported)
import sb
from testing.fakes import FakeResponse


PINNED_CERT = b"pretend-der-bytes"
PINNED_SHA256 = hashlib.sha256(PINNED_CERT).hexdigest()


class SbTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.config_path = os.path.join(self.tmp, "config.json")
        self.token_path = os.path.join(self.tmp, "token.json")
        self.write_config()
        with open(self.token_path, "w") as f:
            json.dump({"badge_token": "tok-123", "badge_id": "b-1", "handle": "prashant"}, f)
        sb._reset()
        sb._set_paths(self.config_path, self.token_path)
        fakes.fake_requests.calls = []
        fakes.fake_requests.handler = lambda method, url, headers, data: FakeResponse(200, {})

    def write_config(self, **overrides):
        cfg = {"gateway": "https://api.example.com/", "cert_sha256": PINNED_SHA256}
        cfg.update(overrides)
        with open(self.config_path, "w") as f:
            json.dump(cfg, f)
        sb._reset()
        sb._set_paths(self.config_path, self.token_path)

    def respond(self, status, payload, peer_cert=None):
        fakes.fake_requests.handler = lambda method, url, headers, data: FakeResponse(
            status, payload, peer_cert=peer_cert
        )

    def last_call(self):
        self.assertTrue(fakes.fake_requests.calls, "expected at least one HTTP call")
        return fakes.fake_requests.calls[-1]


class TestHeadersAndUrls(SbTestCase):
    def test_every_call_sends_badge_token_and_app_slug(self):
        sb._set_app_slug("github-mini")
        self.respond(200, {})
        sb.deck()
        headers = self.last_call()["headers"]
        self.assertEqual(headers["Authorization"], "Bearer tok-123")
        self.assertEqual(headers["X-App-Slug"], "github-mini")

    def test_app_slug_defaults_to_unknown(self):
        self.respond(200, {})
        sb.deck()
        self.assertEqual(self.last_call()["headers"]["X-App-Slug"], "unknown")


class TestQueryEncoding(SbTestCase):
    def test_special_characters_are_percent_encoded(self):
        self.respond(200, [])
        sb.deck({"q": "a&b=c#d e"})
        self.assertEqual(
            self.last_call()["url"],
            "https://api.example.com/gateway/deck?q=a%26b%3Dc%23d%20e",
        )

    def test_keys_are_encoded_too(self):
        self.respond(200, [])
        sb.deck({"a b": "1"})
        self.assertTrue(self.last_call()["url"].endswith("?a%20b=1"))

    def test_non_ascii_values_are_utf8_percent_encoded(self):
        self.respond(200, [])
        sb.deck({"q": "café"})
        self.assertTrue(self.last_call()["url"].endswith("?q=caf%C3%A9"))

    def test_injected_query_cannot_add_a_parameter(self):
        self.respond(200, [])
        sb.deck({"sort": "updated&per_page=100"})
        url = self.last_call()["url"]
        self.assertEqual(url.count("&"), 0)
        self.assertTrue(url.endswith("?sort=updated%26per_page%3D100"))


class TestErrorMapping(SbTestCase):
    def test_401_raises_not_paired(self):
        self.respond(401, {"error": "unauthorized"})
        with self.assertRaises(sb.NotPaired):
            sb.deck()

    def test_404_not_connected(self):
        self.respond(404, {"error": "not_connected"})
        with self.assertRaises(sb.NotConnected):
            sb.deck()

    def test_429_rate_limited_carries_retry_after(self):
        self.respond(429, {"error": "rate_limited", "retry_after": 17})
        with self.assertRaises(sb.RateLimited) as ctx:
            sb.deck()
        self.assertEqual(ctx.exception.retry_after, 17)

    def test_other_status_raises_sdk_error(self):
        self.respond(500, {"error": "boom"})
        with self.assertRaises(sb.SdkError):
            sb.deck()

    def test_429_with_non_dict_body_still_raises_rate_limited(self):
        self.respond(429, ["garbage"])
        with self.assertRaises(sb.RateLimited) as ctx:
            sb.deck()
        self.assertEqual(ctx.exception.retry_after, 5)

    def test_transport_failure_raises_network_error(self):
        def boom(method, url, headers, data):
            raise OSError("wifi down")

        fakes.fake_requests.handler = boom
        with self.assertRaises(sb.NetworkError):
            sb.deck()

    def test_404_without_error_field_raises_not_found(self):
        self.respond(404, {})
        with self.assertRaises(sb.NotFound):
            sb.deck()

    def test_missing_token_file_raises_not_paired(self):
        os.remove(self.token_path)
        sb._reset()
        with self.assertRaises(sb.NotPaired):
            sb.deck()


class TestWrites(SbTestCase):
    """The four functions that send something upward.

    Everything else in this module asks a question. These answer one, and the
    three properties below are the ones a write has that a read did not: it
    carries a body, it is retried by a badge that cannot tell a lost request
    from a lost response, and a repeat carrying different content is refused
    rather than applied.
    """

    def test_poll_answer_posts_a_json_body_with_the_badge_token(self):
        self.respond(200, {"your_choice": "a"})

        sb._set_app_slug("poll-app")
        sb.poll_answer("q-1", "a")

        call = self.last_call()
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["url"], "https://api.example.com/gateway/poll/answer")
        self.assertEqual(json.loads(call["data"]), {"question_id": "q-1", "choice": "a"})
        self.assertEqual(call["headers"]["Authorization"], "Bearer tok-123")
        self.assertEqual(call["headers"]["X-App-Slug"], "poll-app")
        self.assertEqual(call["headers"]["Content-Type"], "application/json")

    def test_a_write_body_names_no_user(self):
        # The acting user is the token's and nothing else. A body carrying one
        # would be rejected by the gateway's strict schema, and this is the
        # assertion that the badge never tries.
        self.respond(200, {})

        sb.trivia_answer("q-1", "b")

        body = json.loads(self.last_call()["data"])
        self.assertEqual(sorted(body.keys()), ["choice", "question_id"])

    def test_trivia_answer_posts_to_its_own_route(self):
        self.respond(200, {"was_correct": True})

        sb.trivia_answer("q-2", "c")

        call = self.last_call()
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["url"], "https://api.example.com/gateway/trivia/answer")
        self.assertEqual(json.loads(call["data"]), {"question_id": "q-2", "choice": "c"})

    def test_the_verdict_comes_back_from_the_write_itself(self):
        self.respond(200, {"was_correct": True, "correct_option": "c", "your_score": 2})

        answer = sb.trivia_answer("q-2", "c")

        self.assertTrue(answer["was_correct"])
        self.assertEqual(answer["your_score"], 2)

    def test_reads_send_no_body_at_all(self):
        self.respond(200, {"question": None})

        sb.poll()

        call = self.last_call()
        self.assertEqual(call["method"], "GET")
        self.assertIsNone(call["data"])

    def test_the_read_routes_are_the_write_routes_without_the_answer(self):
        self.respond(200, {})
        sb.poll()
        self.assertEqual(self.last_call()["url"], "https://api.example.com/gateway/poll")
        sb.trivia()
        self.assertEqual(self.last_call()["url"], "https://api.example.com/gateway/trivia")
        sb.trivia_leaderboard()
        self.assertEqual(
            self.last_call()["url"], "https://api.example.com/gateway/trivia/leaderboard"
        )

    def test_sparkle_gets_the_gateway_route_and_sends_no_body(self):
        self.respond(200, {"sparkle": None})

        sb.sparkle()

        call = self.last_call()
        self.assertEqual(call["method"], "GET")
        self.assertEqual(call["url"], "https://api.example.com/gateway/sparkle")
        self.assertIsNone(call["data"])

    def test_mad_score_posts_only_the_downtime(self):
        self.respond(200, {"current": {"rank": 4, "down_ms": 984}})

        result = sb.mad_score(984)

        call = self.last_call()
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["url"], "https://api.example.com/gateway/mad/score")
        self.assertEqual(json.loads(call["data"]), {"down_ms": 984})
        self.assertEqual(result["current"]["rank"], 4)

    def test_mad_leaderboard_is_a_bodyless_read(self):
        self.respond(200, {"top": [], "you": None})

        sb.mad_leaderboard()

        call = self.last_call()
        self.assertEqual(call["method"], "GET")
        self.assertEqual(call["url"], "https://api.example.com/gateway/mad/leaderboard")
        self.assertIsNone(call["data"])

    def test_battery_readings_ride_along_on_the_question(self):
        self.respond(200, {})

        sb.trivia({"battery": 4.1, "charging": None})

        url = self.last_call()["url"]
        self.assertIn("battery=4.1", url)
        self.assertNotIn("charging", url, "a reading the badge could not take was sent anyway")


class TestConflict(SbTestCase):
    def test_409_raises_conflict_and_not_a_bare_sdk_error(self):
        # A badge on conference WiFi retries constantly, and this is how it
        # tells a vote the server already holds from a request that never
        # arrived. Only the second is worth resending.
        self.respond(409, {"error": "already_answered", "message": "this badge has answered"})

        with self.assertRaises(sb.Conflict):
            sb.poll_answer("q-1", "b")

    def test_conflict_is_an_sdk_error_so_a_broad_except_still_catches_it(self):
        self.respond(409, {"error": "already_answered"})

        with self.assertRaises(sb.SdkError):
            sb.trivia_answer("q-1", "b")

    def test_conflict_is_not_a_network_error(self):
        # These used to be the same exception, and they are opposite
        # instructions: one says resend, the other says stop.
        self.respond(409, {"error": "already_answered"})

        with self.assertRaises(sb.Conflict):
            try:
                sb.poll_answer("q-1", "b")
            except sb.NetworkError:
                self.fail("a refused answer was reported as a lost one")

    def test_a_conflict_with_an_empty_body_still_raises_conflict(self):
        self.respond(409, {})

        with self.assertRaises(sb.Conflict):
            sb.poll_answer("q-1", "b")

    def test_a_rate_limited_write_carries_the_servers_interval(self):
        # Read from the top level of the envelope, not from detail, because the
        # apps back off on this number rather than on one of their own.
        self.respond(429, {"error": "rate_limited", "retry_after": 9, "detail": {"retry_after": 1}})

        with self.assertRaises(sb.RateLimited) as ctx:
            sb.poll_answer("q-1", "a")

        self.assertEqual(ctx.exception.retry_after, 9)

    def test_a_write_that_never_completes_raises_network_error(self):
        # The case the whole idempotency rule exists to make survivable: the
        # badge cannot tell whether this one arrived.
        def boom(method, url, headers, data):
            raise OSError("wifi down")

        fakes.fake_requests.handler = boom

        with self.assertRaises(sb.NetworkError):
            sb.trivia_answer("q-1", "a")


class TestCertificatePinning(SbTestCase):
    def test_matching_fingerprint_passes(self):
        self.respond(200, {"handle": "prashant"}, peer_cert=PINNED_CERT)
        self.assertEqual(sb.deck(), {"handle": "prashant"})

    def test_matching_fingerprint_passes_with_uppercase_pin(self):
        self.write_config(cert_sha256=PINNED_SHA256.upper())
        self.respond(200, {}, peer_cert=PINNED_CERT)
        self.assertEqual(sb.deck(), {})

    def test_mismatched_fingerprint_raises_certificate_error(self):
        self.respond(200, {"handle": "prashant"}, peer_cert=b"attacker-der-bytes")
        with self.assertRaises(sb.CertificateError):
            sb.deck()

    def test_certificate_error_is_an_sdk_error(self):
        self.respond(200, {}, peer_cert=b"attacker-der-bytes")
        with self.assertRaises(sb.SdkError):
            sb.deck()

    def test_mismatch_is_raised_before_the_payload_reaches_the_applet(self):
        self.respond(200, {"slides": [{"id": "poisoned"}]}, peer_cert=b"attacker-der-bytes")
        with self.assertRaises(sb.CertificateError):
            sb.deck()

    def test_unavailable_peer_cert_falls_back_when_pin_not_required(self):
        # Stock urequests exposes no socket. Without require_pin the SDK
        # continues on the port's own verification.
        self.respond(200, {"handle": "prashant"})
        self.assertEqual(sb.deck(), {"handle": "prashant"})

    def test_unavailable_peer_cert_fails_closed_when_pin_required(self):
        self.write_config(require_pin=True)
        self.respond(200, {"handle": "prashant"})
        with self.assertRaises(sb.CertificateError):
            sb.deck()

    def test_socket_without_a_certificate_fails_closed_when_pin_required(self):
        self.write_config(require_pin=True)
        self.respond(200, {}, peer_cert=b"")
        with self.assertRaises(sb.CertificateError):
            sb.deck()

    def test_required_pin_without_configured_fingerprint_fails_closed(self):
        self.write_config(require_pin=True, cert_sha256="")
        self.respond(200, {}, peer_cert=PINNED_CERT)
        with self.assertRaises(sb.CertificateError):
            sb.deck()

    def test_pin_is_enforced_even_when_not_required(self):
        self.write_config()
        self.respond(200, {}, peer_cert=b"attacker-der-bytes")
        with self.assertRaises(sb.CertificateError):
            sb.deck()


if __name__ == "__main__":
    unittest.main()
