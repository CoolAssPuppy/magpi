# The pairing state machine (spec 4.2). Pure and testable: it owns every
# transition and every timing rule, and reaches the world only through a
# port. Drawing lives in ui.py and the port implementation lives in net.py,
# the same split the server uses between _shared/pairing.ts and
# _shared/pairing_port.ts.
#
# Nothing here blocks on its own. tick() performs at most one port call per
# frame and only when its own clock says the interval has elapsed, because
# update() runs every frame on the badge and a blocking call inside it
# stalls the UI (spec 3.3).

# Port contract. An implementation must provide:
#
#   wifi_begin()            start joining; raises MissingCredentials when
#                           secrets.py is absent or incomplete
#   wifi_status()           -> WIFI_CONNECTING | WIFI_CONNECTED | WIFI_FAILED
#   wifi_reset()            tear the interface down so the next begin is clean
#   start(uid, fw, sdk)     -> the /device/start body; raises PairingError
#   poll(device_code)       -> the /device/poll body; raises PairingError
#   save_token(token)       persist the token dict; raises OSError on failure
#   launch()                hand off to the launcher

STATE_CONNECTING = "connecting"
STATE_NO_NETWORK = "no_network"
STATE_NO_CREDENTIALS = "no_credentials"
STATE_STARTING = "starting"
STATE_WAITING = "waiting"
STATE_APPROVED = "approved"
STATE_EXPIRED = "expired"
STATE_DENIED = "denied"
STATE_ERROR = "error"
STATE_DONE = "done"

WIFI_CONNECTING = "connecting"
WIFI_CONNECTED = "connected"
WIFI_FAILED = "failed"

# How often the interface is asked whether it is up. The radio takes
# seconds, so anything tighter is wasted work in the frame loop.
WIFI_POLL_MS = 500
# A join that has neither succeeded nor reported failure by now is treated
# as failed. MicroPython's WLAN.status() can sit in an in-progress state
# indefinitely when the SSID is simply not present.
#
# 20s was too tight to survive contact with hardware: a cold join on a Tufty
# 2350 measured 17.1s, so a slightly slower one tripped the timeout, reset the
# radio, and reached the "no network" screen on a network that was working.
WIFI_TIMEOUT_MS = 45000
# Two quiet retries before the screen starts blaming the network. A badge
# powered on outside radio range should not flash an error in the first
# second, and an attendee at a table should not be told to find a helper
# for something that fixes itself.
WIFI_ATTEMPTS_BEFORE_WARNING = 2

# Transient-failure backoff, shared by the start call and by unexpected
# poll errors. Doubling from 3 seconds, capped, so a room full of badges
# that lost the gateway does not hammer it back down (spec 8.7).
BACKOFF_BASE_MS = 3000
BACKOFF_MAX_MS = 60000
_MAX_DOUBLINGS = 8

# RFC 8628 says a slow_down widens the interval; the server widens its own
# copy by the same amount (_shared/pairing.ts SLOW_DOWN_INCREMENT_SECONDS).
SLOW_DOWN_INCREMENT_MS = 5000
DEFAULT_INTERVAL_MS = 5000
# The server can hand back an interval; refuse to poll faster than this
# whatever it says, so a bad value cannot turn every badge into a flooder.
MIN_INTERVAL_MS = 1000

# How long "Paired" stays on screen before the launcher takes over. Long
# enough to read, short enough that nobody wonders whether it worked.
APPROVED_DWELL_MS = 2000

# Codes the server sends in the error envelope (spec 7.1).
PENDING = "authorization_pending"
SLOW_DOWN = "slow_down"
EXPIRED_TOKEN = "expired_token"
ACCESS_DENIED = "access_denied"
RATE_LIMITED = "rate_limited"
# 409 at claim: this uid is still actively linked to another account, so the
# rebind is refused. Terminal, not a retryable blip.
BADGE_TAKEN = "badge_taken"


class PairingError(Exception):
    """A /device/start or /device/poll call that did not return a body the
    machine can use. `code` is the server's error code, or "network" when
    the request never completed."""

    def __init__(self, code, message=None, retry_after=None):
        # super(), not Exception.__init__(self, ...): MicroPython does not
        # expose __init__ on the built-in exception types, so the explicit
        # form raised AttributeError the first time the badge tried to build
        # one of these, which was on the first poll of every pairing.
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        # Seconds, from the TOP LEVEL of the error body. The gateway puts it
        # there rather than under detail (_shared/errors.ts), and a verifier
        # that reads it from detail silently falls back to its own default.
        self.retry_after = retry_after


class MissingCredentials(Exception):
    """secrets.py is absent or has no SSID. No amount of retrying fixes
    this, so it gets its own screen telling the holder what to do."""

    pass


def _backoff_ms(failures):
    if failures <= 0:
        return BACKOFF_BASE_MS
    delay = BACKOFF_BASE_MS * (2 ** min(failures - 1, _MAX_DOUBLINGS))
    return min(delay, BACKOFF_MAX_MS)


class PairingMachine:
    def __init__(self, port, badge_uid, fw="unknown", sdk="unknown"):
        self.port = port
        self.badge_uid = badge_uid
        self.fw = fw
        self.sdk = sdk

        self.state = STATE_CONNECTING
        # What the screen says. Held here rather than in ui.py so the state
        # machine tests cover the words an attendee actually reads.
        self.message = "Joining WiFi"
        self.detail = None
        self.user_code = None
        self.verification_uri = None
        self.token = None

        self._device_code = None
        self._interval = DEFAULT_INTERVAL_MS
        self._deadline = None
        self._next_at = 0
        self._failures = 0
        self._wifi_started = False
        self._wifi_since = 0
        self._retry_state = STATE_STARTING

    # -- public surface ----------------------------------------------------

    def tick(self, now_ms):
        """Advance by one frame. Returns the current state."""
        handler = _HANDLERS.get(self.state)
        if handler is not None:
            handler(self, now_ms)
        return self.state

    def restart(self, now_ms):
        """Ask for a fresh user_code. Bound to a button on the expired,
        denied, and error screens so a lapsed code is one press from a new
        one rather than a power cycle."""
        if self.state in (STATE_APPROVED, STATE_DONE):
            return self.state
        self.user_code = None
        self.verification_uri = None
        self._device_code = None
        self._deadline = None
        self._failures = 0
        self._interval = DEFAULT_INTERVAL_MS
        if self._wifi_started and self.port.wifi_status() == WIFI_CONNECTED:
            self._enter(STATE_STARTING, "Contacting server", now_ms)
        else:
            self._wifi_started = False
            self._enter(STATE_CONNECTING, "Joining WiFi", now_ms)
        return self.state

    def seconds_left(self, now_ms):
        """Seconds until the displayed code expires, or None when no code is
        on screen. The screen counts down so nobody stares at a dead code."""
        if self._deadline is None or self.state != STATE_WAITING:
            return None
        remaining = self._deadline - now_ms
        return 0 if remaining < 0 else remaining // 1000

    # -- internals ---------------------------------------------------------

    def _enter(self, state, message, now_ms, detail=None, delay_ms=0):
        self.state = state
        self.message = message
        self.detail = detail
        self._next_at = now_ms + delay_ms

    def _fail(self, now_ms, retry_state, message, detail=None):
        """Transient failure: show it, then retry on a widening backoff.
        Nothing here is terminal; a badge left on a table must recover on
        its own when the network comes back."""
        self._failures += 1
        self._retry_state = retry_state
        self._enter(
            STATE_ERROR, message, now_ms, detail=detail, delay_ms=_backoff_ms(self._failures)
        )

    def _connect(self, now_ms):
        if now_ms < self._next_at:
            return
        if not self._wifi_started:
            try:
                self.port.wifi_begin()
            except MissingCredentials as e:
                self._enter(
                    STATE_NO_CREDENTIALS,
                    "No WiFi configured",
                    now_ms,
                    detail=str(e) or "Add secrets.py over USB",
                )
                return
            self._wifi_started = True
            self._wifi_since = now_ms
            self._next_at = now_ms + WIFI_POLL_MS
            return

        status = self.port.wifi_status()
        if status == WIFI_CONNECTED:
            self._failures = 0
            self._enter(STATE_STARTING, "Contacting server", now_ms)
            return
        if status == WIFI_FAILED or now_ms - self._wifi_since >= WIFI_TIMEOUT_MS:
            self._wifi_started = False
            self._failures += 1
            self.port.wifi_reset()
            if self._failures >= WIFI_ATTEMPTS_BEFORE_WARNING:
                self._enter(
                    STATE_NO_NETWORK,
                    "Cannot reach WiFi",
                    now_ms,
                    detail="Retrying. Ask a helper if this persists.",
                    delay_ms=_backoff_ms(self._failures),
                )
            else:
                self._enter(
                    STATE_CONNECTING, "Joining WiFi", now_ms, delay_ms=_backoff_ms(self._failures)
                )
            return
        self._next_at = now_ms + WIFI_POLL_MS

    def _start(self, now_ms):
        if now_ms < self._next_at:
            return
        try:
            body = self.port.start(self.badge_uid, self.fw, self.sdk)
        except PairingError as e:
            self._fail(now_ms, STATE_STARTING, "Cannot reach server", detail=e.message)
            return

        user_code = body.get("user_code")
        device_code = body.get("device_code")
        if not user_code or not device_code:
            self._fail(now_ms, STATE_STARTING, "Bad server response", detail="no pairing code")
            return

        self.user_code = user_code
        self._device_code = device_code
        # verification_uri_complete carries the code, so the QR needs no
        # typing. verification_uri is the bare fallback for a catalogue of
        # older servers, and is not worth encoding on its own.
        self.verification_uri = body.get("verification_uri_complete") or body.get(
            "verification_uri"
        )
        self._interval = _interval_ms(body.get("interval"))
        expires_in = body.get("expires_in")
        self._deadline = None if not expires_in else now_ms + int(expires_in) * 1000
        self._failures = 0
        # First poll waits a full interval: the attendee has not had time to
        # scan anything, and an immediate poll only earns a slow_down.
        self._enter(STATE_WAITING, "Scan to pair", now_ms, delay_ms=self._interval)

    def _wait(self, now_ms):
        if self._deadline is not None and now_ms >= self._deadline:
            self._expire(now_ms)
            return
        if now_ms < self._next_at:
            return
        try:
            body = self.port.poll(self._device_code)
        except PairingError as e:
            self._handle_poll_error(e, now_ms)
            return

        token = body.get("badge_token")
        badge_id = body.get("badge_id")
        if not token or not badge_id:
            self._fail(now_ms, STATE_WAITING, "Bad server response", detail="no badge token")
            return

        user = body.get("user") or {}
        # Only these three keys reach the filesystem (spec 11.2). The poll
        # body also carries display_name and avatar_url; the SDK does not
        # read them and the badge has no reason to keep them.
        self.token = {
            "badge_token": token,
            "badge_id": badge_id,
            "handle": user.get("handle"),
        }
        try:
            self.port.save_token(self.token)
        except OSError as e:
            # The pairing succeeded and the token is spent: the server has
            # marked the row claimed and will not hand it out again. Say so
            # plainly instead of silently looping back to a dead code.
            self._retry_state = STATE_STARTING
            self._enter(
                STATE_ERROR,
                "Cannot save token",
                now_ms,
                detail=str(e),
                delay_ms=BACKOFF_MAX_MS,
            )
            return
        self.detail = self.token["handle"]
        self._enter(
            STATE_APPROVED,
            "Paired",
            now_ms,
            detail=self.token["handle"],
            delay_ms=APPROVED_DWELL_MS,
        )

    def _handle_poll_error(self, error, now_ms):
        code = error.code
        if code == PENDING:
            # The expected answer for most of this screen's life.
            self._failures = 0
            self.detail = None
            self._next_at = now_ms + self._interval
            return
        if code in (SLOW_DOWN, RATE_LIMITED):
            # Widen by the RFC 8628 increment, then take the server's
            # retry_after as a floor if it asked for longer.
            self._interval += SLOW_DOWN_INCREMENT_MS
            retry_ms = _retry_after_ms(error)
            if retry_ms > self._interval:
                self._interval = retry_ms
            self._failures = 0
            self._next_at = now_ms + self._interval
            return
        if code == EXPIRED_TOKEN:
            self._expire(now_ms)
            return
        if code == ACCESS_DENIED:
            self._enter(
                STATE_DENIED,
                "Pairing declined",
                now_ms,
                detail="Press A to try again",
            )
            return
        if code == BADGE_TAKEN:
            # Refused for good until the current owner unlinks it. Retrying the
            # same code only earns the same 409, so stop here and name it.
            self._enter(
                STATE_DENIED,
                "Badge already linked",
                now_ms,
                detail="Linked to another account",
            )
            return
        # Network blip or an unexpected status. Keep the code on screen: it
        # is still valid, and the attendee should not have to start over
        # because one request timed out.
        self._failures += 1
        self.detail = "Reconnecting"
        # The agreed interval is the floor. A backoff shorter than it would
        # turn a failing request into a faster poll than a succeeding one,
        # which is how a badge earns a slow_down for being broken.
        delay = max(self._interval, _backoff_ms(self._failures))
        retry_ms = _retry_after_ms(error)
        self._next_at = now_ms + (retry_ms if retry_ms > delay else delay)

    def _expire(self, now_ms):
        self.user_code = None
        self.verification_uri = None
        self._device_code = None
        self._deadline = None
        self._enter(STATE_EXPIRED, "Code expired", now_ms, detail="Press A for a new code")

    def _error(self, now_ms):
        if now_ms < self._next_at:
            return
        self._enter(self._retry_state, "Contacting server", now_ms)

    def _approved(self, now_ms):
        if now_ms < self._next_at:
            return
        self.port.launch()
        self._enter(STATE_DONE, "Paired", now_ms)


def _interval_ms(seconds):
    try:
        value = int(seconds) * 1000
    except (TypeError, ValueError):
        return DEFAULT_INTERVAL_MS
    return value if value >= MIN_INTERVAL_MS else MIN_INTERVAL_MS


def _retry_after_ms(error):
    try:
        return max(0, int(error.retry_after)) * 1000
    except (TypeError, ValueError):
        return 0


_HANDLERS = {
    STATE_CONNECTING: PairingMachine._connect,
    STATE_NO_NETWORK: PairingMachine._connect,
    STATE_STARTING: PairingMachine._start,
    STATE_WAITING: PairingMachine._wait,
    STATE_ERROR: PairingMachine._error,
    STATE_APPROVED: PairingMachine._approved,
}
