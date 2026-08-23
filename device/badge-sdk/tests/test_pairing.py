import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs runtime stubs)

from sb import pairing
from sb.pairing import MissingCredentials
from sb.pairing import PairingError
from sb.pairing import PairingMachine


class FakePort:
    """Scripted PairingMachine port. Every method pops the next scripted
    outcome, so a test says exactly what the network does and when."""

    def __init__(self, wifi=None, starts=None, polls=None):
        self.wifi = list(wifi or [pairing.WIFI_CONNECTED])
        self.starts = list(starts or [])
        self.polls = list(polls or [])
        self.begins = 0
        self.resets = 0
        self.saved = []
        self.launched = 0
        self.begin_error = None
        self.save_error = None
        self.start_calls = []
        self.poll_calls = []

    def wifi_begin(self):
        self.begins += 1
        if self.begin_error is not None:
            raise self.begin_error

    def wifi_status(self):
        if len(self.wifi) > 1:
            return self.wifi.pop(0)
        return self.wifi[0] if self.wifi else pairing.WIFI_FAILED

    def wifi_reset(self):
        self.resets += 1

    def start(self, uid, fw, sdk):
        self.start_calls.append((uid, fw, sdk))
        return _unwrap(self.starts.pop(0) if self.starts else _default_start())

    def poll(self, device_code):
        self.poll_calls.append(device_code)
        return _unwrap(self.polls.pop(0) if self.polls else PairingError(pairing.PENDING))

    def save_token(self, token):
        if self.save_error is not None:
            raise self.save_error
        self.saved.append(token)

    def launch(self):
        self.launched += 1


def _unwrap(outcome):
    if isinstance(outcome, Exception):
        raise outcome
    return outcome


def _default_start(interval=5, expires_in=600):
    return {
        "user_code": "WXYZ-1234",
        "device_code": "opaque-device-code",
        "verification_uri": "https://web.example/link",
        "verification_uri_complete": "https://web.example/link?code=WXYZ-1234",
        "interval": interval,
        "expires_in": expires_in,
    }


def _approved(handle="prashant"):
    return {
        "badge_token": "badge-token-value",
        "badge_id": "badge-uuid",
        "user": {"handle": handle, "display_name": "Prashant", "avatar_url": "https://a/b.png"},
    }


def _machine(port, uid="e6614103fake0001"):
    return PairingMachine(port, uid, fw="1.2.0", sdk="1.0.0")


def _drive_to_waiting(port, machine, now=0):
    """Run the frames that take a fresh machine from boot to a code on
    screen. Returns the clock after the last frame."""
    machine.tick(now)  # wifi_begin
    now += pairing.WIFI_POLL_MS
    machine.tick(now)  # connected -> starting
    machine.tick(now)  # start call
    return now


class TestConnecting(unittest.TestCase):
    def test_starts_in_connecting_and_begins_wifi_once(self):
        port = FakePort()
        machine = _machine(port)
        self.assertEqual(machine.state, pairing.STATE_CONNECTING)
        machine.tick(0)
        self.assertEqual(port.begins, 1)
        # The status poll is gated, so an immediate second frame does no work.
        machine.tick(1)
        self.assertEqual(port.begins, 1)
        self.assertEqual(machine.state, pairing.STATE_CONNECTING)

    def test_connected_moves_to_starting(self):
        port = FakePort(wifi=[pairing.WIFI_CONNECTED])
        machine = _machine(port)
        machine.tick(0)
        self.assertEqual(machine.tick(pairing.WIFI_POLL_MS), pairing.STATE_STARTING)

    def test_missing_credentials_is_its_own_terminal_screen(self):
        port = FakePort()
        port.begin_error = MissingCredentials("secrets.py has no WIFI_SSID")
        machine = _machine(port)
        self.assertEqual(machine.tick(0), pairing.STATE_NO_CREDENTIALS)
        self.assertEqual(machine.detail, "secrets.py has no WIFI_SSID")
        # No amount of further ticks retries: nothing on the badge can fix it.
        machine.tick(10**6)
        self.assertEqual(machine.state, pairing.STATE_NO_CREDENTIALS)
        self.assertEqual(port.begins, 1)

    def test_first_wifi_failure_retries_quietly(self):
        port = FakePort(wifi=[pairing.WIFI_FAILED])
        machine = _machine(port)
        machine.tick(0)
        self.assertEqual(machine.tick(pairing.WIFI_POLL_MS), pairing.STATE_CONNECTING)
        self.assertEqual(port.resets, 1)

    def test_repeated_wifi_failure_surfaces_no_network_and_keeps_trying(self):
        port = FakePort(wifi=[pairing.WIFI_FAILED])
        machine = _machine(port)
        now = 0
        for _ in range(pairing.WIFI_ATTEMPTS_BEFORE_WARNING):
            machine.tick(now)  # begin
            now += pairing.WIFI_POLL_MS
            machine.tick(now)  # failed
            now += pairing.BACKOFF_MAX_MS
        self.assertEqual(machine.state, pairing.STATE_NO_NETWORK)
        self.assertIn("Retrying", machine.detail)
        # Still retrying: the interface is asked again after the backoff.
        begins = port.begins
        machine.tick(now)
        self.assertEqual(port.begins, begins + 1)

    def test_no_network_recovers_when_the_ap_returns(self):
        port = FakePort(wifi=[pairing.WIFI_FAILED, pairing.WIFI_FAILED, pairing.WIFI_CONNECTED])
        machine = _machine(port)
        now = 0
        state = None
        for _ in range(40):
            state = machine.tick(now)
            if state == pairing.STATE_STARTING:
                break
            now += pairing.BACKOFF_MAX_MS
        self.assertEqual(state, pairing.STATE_STARTING)

    def test_stalled_join_times_out_rather_than_hanging(self):
        port = FakePort(wifi=[pairing.WIFI_CONNECTING])
        machine = _machine(port)
        machine.tick(0)
        machine.tick(pairing.WIFI_POLL_MS)
        self.assertEqual(machine.state, pairing.STATE_CONNECTING)
        self.assertEqual(machine.tick(pairing.WIFI_TIMEOUT_MS), pairing.STATE_CONNECTING)
        self.assertEqual(port.resets, 1)


class TestStart(unittest.TestCase):
    def test_start_reports_identity_and_versions(self):
        port = FakePort(starts=[_default_start()])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(port.start_calls, [("e6614103fake0001", "1.2.0", "1.0.0")])

    def test_start_populates_the_code_and_the_qr_uri(self):
        port = FakePort(starts=[_default_start()])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(machine.state, pairing.STATE_WAITING)
        self.assertEqual(machine.user_code, "WXYZ-1234")
        self.assertEqual(machine.verification_uri, "https://web.example/link?code=WXYZ-1234")

    def test_verification_uri_falls_back_when_complete_is_absent(self):
        body = _default_start()
        del body["verification_uri_complete"]
        port = FakePort(starts=[body])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(machine.verification_uri, "https://web.example/link")

    def test_start_failure_shows_an_error_then_retries(self):
        port = FakePort(starts=[PairingError("network", "timed out"), _default_start()])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        self.assertEqual(machine.state, pairing.STATE_ERROR)
        self.assertEqual(machine.detail, "timed out")
        # Nothing happens until the backoff elapses, then it tries again.
        machine.tick(now + 1)
        self.assertEqual(len(port.start_calls), 1)
        machine.tick(now + pairing.BACKOFF_MAX_MS)
        machine.tick(now + pairing.BACKOFF_MAX_MS)
        self.assertEqual(machine.state, pairing.STATE_WAITING)

    def test_response_without_a_code_is_treated_as_a_failure(self):
        port = FakePort(starts=[{"interval": 5}])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(machine.state, pairing.STATE_ERROR)
        self.assertEqual(machine.detail, "no pairing code")

    def test_junk_interval_falls_back_to_the_default(self):
        port = FakePort(starts=[_default_start(interval="soon")])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(machine._interval, pairing.DEFAULT_INTERVAL_MS)

    def test_absurdly_small_interval_is_floored(self):
        port = FakePort(starts=[_default_start(interval=0)])
        machine = _machine(port)
        _drive_to_waiting(port, machine)
        self.assertEqual(machine._interval, pairing.MIN_INTERVAL_MS)


class TestPolling(unittest.TestCase):
    def test_first_poll_waits_one_interval(self):
        port = FakePort(starts=[_default_start(interval=5)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 4999)
        self.assertEqual(port.poll_calls, [])
        machine.tick(now + 5000)
        self.assertEqual(port.poll_calls, ["opaque-device-code"])

    def test_authorization_pending_keeps_the_code_on_screen(self):
        port = FakePort(
            starts=[_default_start()],
            polls=[PairingError(pairing.PENDING), PairingError(pairing.PENDING)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        machine.tick(now + 10000)
        self.assertEqual(machine.state, pairing.STATE_WAITING)
        self.assertEqual(machine.user_code, "WXYZ-1234")
        self.assertEqual(len(port.poll_calls), 2)

    def test_slow_down_widens_the_interval(self):
        port = FakePort(starts=[_default_start(interval=5)], polls=[PairingError(pairing.SLOW_DOWN)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine._interval, 5000 + pairing.SLOW_DOWN_INCREMENT_MS)
        machine.tick(now + 5000 + 9999)
        self.assertEqual(len(port.poll_calls), 1)
        machine.tick(now + 5000 + 10000)
        self.assertEqual(len(port.poll_calls), 2)

    def test_slow_down_honours_a_longer_top_level_retry_after(self):
        port = FakePort(
            starts=[_default_start(interval=5)],
            polls=[PairingError(pairing.SLOW_DOWN, retry_after=30)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine._interval, 30000)

    def test_slow_down_ignores_a_shorter_retry_after(self):
        # A retry_after below the widened interval must not narrow it back.
        port = FakePort(
            starts=[_default_start(interval=5)],
            polls=[PairingError(pairing.SLOW_DOWN, retry_after=1)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine._interval, 5000 + pairing.SLOW_DOWN_INCREMENT_MS)

    def test_rate_limited_is_treated_like_slow_down(self):
        port = FakePort(
            starts=[_default_start(interval=5)],
            polls=[PairingError(pairing.RATE_LIMITED, retry_after=45)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_WAITING)
        self.assertEqual(machine._interval, 45000)

    def test_expired_token_moves_to_expired_and_drops_the_code(self):
        port = FakePort(starts=[_default_start()], polls=[PairingError(pairing.EXPIRED_TOKEN)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_EXPIRED)
        self.assertIsNone(machine.user_code)
        self.assertIsNone(machine.verification_uri)

    def test_access_denied_moves_to_denied(self):
        port = FakePort(starts=[_default_start()], polls=[PairingError(pairing.ACCESS_DENIED)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_DENIED)

    def test_badge_taken_is_terminal_and_names_the_reason(self):
        # A badge whose uid is still linked to another account is refused at
        # claim with 409 badge_taken. It must say so and stop, not spin on
        # "Reconnecting" like a network blip on a code that can never claim.
        port = FakePort(starts=[_default_start()], polls=[PairingError("badge_taken")])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_DENIED)
        # It does not keep polling the dead code.
        before = len(port.poll_calls)
        machine.tick(now + 60000)
        self.assertEqual(len(port.poll_calls), before)

    def test_local_deadline_expires_the_code_without_a_poll(self):
        port = FakePort(starts=[_default_start(expires_in=600)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 600000)
        self.assertEqual(machine.state, pairing.STATE_EXPIRED)
        self.assertEqual(port.poll_calls, [])

    def test_network_blip_keeps_the_code_and_backs_off(self):
        port = FakePort(
            starts=[_default_start()],
            polls=[PairingError("network", "reset by peer"), PairingError(pairing.PENDING)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_WAITING)
        self.assertEqual(machine.user_code, "WXYZ-1234")
        self.assertEqual(machine.detail, "Reconnecting")
        # Backed off at least a full interval before the next attempt.
        machine.tick(now + 5000 + pairing.DEFAULT_INTERVAL_MS - 1)
        self.assertEqual(len(port.poll_calls), 1)
        machine.tick(now + 5000 + pairing.DEFAULT_INTERVAL_MS)
        self.assertEqual(len(port.poll_calls), 2)
        self.assertIsNone(machine.detail)

    def test_seconds_left_counts_down_and_floors_at_zero(self):
        port = FakePort(starts=[_default_start(expires_in=600)])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        self.assertEqual(machine.seconds_left(now), 600)
        self.assertEqual(machine.seconds_left(now + 599000), 1)
        self.assertEqual(machine.seconds_left(now + 999999), 0)

    def test_seconds_left_is_none_outside_the_waiting_screen(self):
        port = FakePort()
        machine = _machine(port)
        self.assertIsNone(machine.seconds_left(0))


class TestApproval(unittest.TestCase):
    def test_success_writes_only_the_three_token_fields(self):
        port = FakePort(starts=[_default_start()], polls=[_approved()])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_APPROVED)
        self.assertEqual(len(port.saved), 1)
        self.assertEqual(
            port.saved[0],
            {
                "badge_token": "badge-token-value",
                "badge_id": "badge-uuid",
                "handle": "prashant",
            },
        )

    def test_missing_handle_is_stored_as_null_not_dropped(self):
        body = _approved()
        body["user"] = {}
        port = FakePort(starts=[_default_start()], polls=[body])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(sorted(port.saved[0].keys()), ["badge_id", "badge_token", "handle"])
        self.assertIsNone(port.saved[0]["handle"])

    def test_success_without_a_token_is_a_failure_not_a_handoff(self):
        port = FakePort(starts=[_default_start()], polls=[{"badge_id": "badge-uuid"}])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_ERROR)
        self.assertEqual(port.saved, [])

    def test_launcher_handoff_happens_after_the_dwell(self):
        port = FakePort(starts=[_default_start()], polls=[_approved()])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        approved_at = now + 5000
        machine.tick(approved_at + pairing.APPROVED_DWELL_MS - 1)
        self.assertEqual(port.launched, 0)
        self.assertEqual(machine.tick(approved_at + pairing.APPROVED_DWELL_MS), pairing.STATE_DONE)
        self.assertEqual(port.launched, 1)
        # Done is terminal; the launcher is never invoked twice.
        machine.tick(approved_at + 10**6)
        self.assertEqual(port.launched, 1)

    def test_unwritable_token_file_stops_rather_than_looping(self):
        port = FakePort(starts=[_default_start()], polls=[_approved()])
        port.save_error = OSError("read only filesystem")
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_ERROR)
        self.assertEqual(machine.message, "Cannot save token")
        self.assertEqual(port.launched, 0)


class TestRestart(unittest.TestCase):
    def test_restart_from_expired_asks_for_a_new_code(self):
        port = FakePort(
            starts=[_default_start(), _default_start()],
            polls=[PairingError(pairing.EXPIRED_TOKEN)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.state, pairing.STATE_EXPIRED)
        machine.restart(now + 6000)
        self.assertEqual(machine.state, pairing.STATE_STARTING)
        machine.tick(now + 6000)
        self.assertEqual(machine.state, pairing.STATE_WAITING)
        self.assertEqual(len(port.start_calls), 2)

    def test_restart_rejoins_wifi_when_the_link_is_down(self):
        port = FakePort(
            wifi=[pairing.WIFI_CONNECTED],
            starts=[_default_start()],
            polls=[PairingError(pairing.ACCESS_DENIED)],
        )
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        port.wifi = [pairing.WIFI_FAILED]
        machine.restart(now + 6000)
        self.assertEqual(machine.state, pairing.STATE_CONNECTING)

    def test_restart_never_undoes_a_completed_pairing(self):
        port = FakePort(starts=[_default_start()], polls=[_approved()])
        machine = _machine(port)
        now = _drive_to_waiting(port, machine)
        machine.tick(now + 5000)
        self.assertEqual(machine.restart(now + 5001), pairing.STATE_APPROVED)


class TestBackoff(unittest.TestCase):
    def test_backoff_doubles_and_caps(self):
        self.assertEqual(pairing.backoff_ms(0), pairing.BACKOFF_BASE_MS)
        self.assertEqual(pairing.backoff_ms(1), pairing.BACKOFF_BASE_MS)
        self.assertEqual(pairing.backoff_ms(2), pairing.BACKOFF_BASE_MS * 2)
        self.assertEqual(pairing.backoff_ms(3), pairing.BACKOFF_BASE_MS * 4)
        self.assertEqual(pairing.backoff_ms(99), pairing.BACKOFF_MAX_MS)


if __name__ == "__main__":
    unittest.main()
