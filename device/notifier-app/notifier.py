# The Notifier machine. Pure Python: no drawing, no network, no SDK import.
#
# It is handed a `fetch` callable and two caches, and it answers what the
# screen should say. Every SDK failure has been translated into the exceptions
# below before it reaches here, so this module never learns that `sb` exists.

from sb.constants import (
    DEFAULT_POLL_MS,
    MIN_POLL_MS,
    POMODORO_LEDS,
    POMODORO_LONG_MIN,
    POMODORO_SESSIONS,
    POMODORO_SHORT_MIN,
    POMODORO_WORK_MIN,
)

STATE_WAITING = "waiting"
STATE_LOADING = "loading"
STATE_READY = "ready"
STATE_STALE = "stale"
STATE_OFFLINE = "offline"
STATE_BUSY = "busy"
STATE_UNPAIRED = "unpaired"

POMODORO_DEFAULTS = {
    "work_min": POMODORO_WORK_MIN,
    "short_min": POMODORO_SHORT_MIN,
    "long_min": POMODORO_LONG_MIN,
    "sessions": POMODORO_SESSIONS,
    "leds": POMODORO_LEDS,
}


class NotifierError(Exception):
    pass


class Unpaired(NotifierError):
    """The server has forgotten this badge. The runtime opens pairing."""


class Unreachable(NotifierError):
    """The fetch did not land. `retry_after` is set when a limiter said so."""

    def __init__(self, message, retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


class Notifier:
    def __init__(self, fetch, cache, pomodoro_cache, known_slugs):
        self._fetch = fetch
        self._cache = cache
        self._pomodoro_cache = pomodoro_cache
        # What this build can draw. A slug outside it is skipped rather than
        # failed, so the server can ship a page before the badge is updated.
        self._known = tuple(known_slugs)

        self.payload = None
        self.page_index = 0
        self.poll_interval_ms = DEFAULT_POLL_MS
        self.message = None
        self.retry_after = None
        self.clock = None
        self.power_label = None
        self.now_ms = 0
        # Set by C, cleared by the next fetch. The runtime resets the poller's
        # clock when it sees this rather than the machine calling the network.
        self.wants_refetch = False
        self._fetched_at = None
        # Per-page view state, keyed by slug: which item is expanded and which
        # is selected. Not persisted, because it is a glance not a preference.
        self._view = {}

        saved = _clean_saved(self._cache.load(default=None))
        if saved is not None:
            # Draw the last good payload immediately rather than showing an
            # empty screen for the twenty seconds the radio takes.
            self._adopt(saved["payload"], now_ms=None)
            self.page_index = _clamp_index(saved["page_index"], len(self.slugs))
            self.state = STATE_LOADING
        else:
            self.state = STATE_WAITING

    # The contract the runtime calls.

    def waiting_for_network(self):
        if self.payload is None:
            self.state = STATE_WAITING

    def no_network(self, now_ms):
        self.state = STATE_STALE if self.payload is not None else STATE_OFFLINE
        self.message = "No network"

    def load(self, now_ms, power=None):
        self.now_ms = now_ms
        self.power_label = _power_label(power)
        self.wants_refetch = False
        try:
            fetched = self._fetch(power)
        except Unpaired as error:
            self.state = STATE_UNPAIRED
            self.message = str(error)
            return
        except Unreachable as error:
            self._fail(error)
            return

        self._adopt(fetched, now_ms)
        self._write_pomodoro(fetched)
        self._persist()
        self.state = STATE_READY
        self.message = None
        self.retry_after = None

    def tick(self, now_ms, power=None):
        """One frame. The poller decides when load runs, so this only ages."""
        self.now_ms = now_ms
        if power is not None:
            self.power_label = _power_label(power)
        if self.state == STATE_READY and self._is_stale(now_ms):
            self.state = STATE_STALE

    def restart(self, now_ms):
        self.state = STATE_WAITING if self.payload is None else STATE_LOADING
        self.message = None

    # Pages.

    @property
    def slugs(self):
        """The enabled pages, in payload order, minus anything unknown."""
        if not self.payload:
            return []
        pages = self.payload.get("pages") or []
        return [page["slug"] for page in pages if _is_drawable(page, self._known)]

    @property
    def current_slug(self):
        slugs = self.slugs
        if not slugs:
            return None
        return slugs[_clamp_index(self.page_index, len(slugs))]

    @property
    def current_page(self):
        slug = self.current_slug
        if slug is None:
            return None
        for page in self.payload.get("pages") or []:
            if page.get("slug") == slug:
                return page
        return None

    def next_page(self, now_ms):
        self._move(1)

    def previous_page(self, now_ms):
        self._move(-1)

    def refetch_now(self, now_ms):
        """C. The runtime resets the poller's clock on the next frame."""
        self.wants_refetch = True

    # Per-page view state. A page asks for its own; nothing else reads it.

    def page_view_state(self, slug):
        return self._view.setdefault(slug, {"expanded": 0, "selected": 0})

    def cycle_selection(self, now_ms):
        slug = self.current_slug
        if slug is None:
            return
        state = self.page_view_state(slug)
        state["selected"] += 1

    def toggle_expanded(self, now_ms):
        slug = self.current_slug
        if slug is None:
            return
        state = self.page_view_state(slug)
        state["expanded"] = 0 if state["expanded"] else 1

    # Age and interval.

    def age_ms(self, now_ms):
        if self._fetched_at is None:
            return None
        # badge.ticks wraps, so a now behind the fetch means the counter
        # rolled, not that the payload arrived in the future.
        return max(0, now_ms - self._fetched_at)

    # Internals.

    def _move(self, step):
        count = len(self.slugs)
        if count == 0:
            return
        self.page_index = (_clamp_index(self.page_index, count) + step) % count
        self._persist()

    def _adopt(self, fetched, now_ms):
        if not isinstance(fetched, dict):
            return
        self.payload = fetched
        self.poll_interval_ms = _clean_interval(fetched.get("poll_interval_ms"))
        self.clock = _clock_from(fetched.get("server_time"))
        if now_ms is not None:
            self._fetched_at = now_ms

    def _fail(self, error):
        self.message = str(error)
        self.retry_after = error.retry_after
        if error.retry_after is not None:
            self.state = STATE_BUSY
        elif self.payload is not None:
            self.state = STATE_STALE
        else:
            self.state = STATE_OFFLINE

    def _is_stale(self, now_ms):
        age = self.age_ms(now_ms)
        # Three missed polls. One is a hiccup, three is a radio that is gone.
        return age is not None and age > self.poll_interval_ms * 3

    def _persist(self):
        self._cache.save({"payload": self.payload, "page_index": self.page_index})

    def _write_pomodoro(self, fetched):
        """Hand the Pomodoro settings over, only when they changed.

        This runs every poll. Rewriting an unchanged file every thirty seconds
        for months is avoidable flash wear.
        """
        block = fetched.get("pomodoro")
        if not isinstance(block, dict) or not block:
            return
        settings = dict(POMODORO_DEFAULTS)
        for key in POMODORO_DEFAULTS:
            if key in block:
                settings[key] = block[key]
        if settings == self._pomodoro_cache.load(default=None):
            return
        self._pomodoro_cache.save(settings)


def _is_drawable(page, known):
    return isinstance(page, dict) and page.get("slug") in known


def _clamp_index(index, count):
    if count <= 0:
        return 0
    try:
        index = int(index)
    except (TypeError, ValueError):
        return 0
    return index if 0 <= index < count else 0


def _clean_interval(value):
    try:
        interval = int(value)
    except (TypeError, ValueError):
        return DEFAULT_POLL_MS
    return max(MIN_POLL_MS, interval)


def _clock_from(server_time):
    """HH:MM out of an ISO timestamp. The badge has no timezone database, so
    the server sends the time it wants shown."""
    if not isinstance(server_time, str) or "T" not in server_time:
        return None
    time_part = server_time.split("T", 1)[1]
    if len(time_part) < 5 or time_part[2] != ":":
        return None
    hours, minutes = time_part[:2], time_part[3:5]
    if not (hours.isdigit() and minutes.isdigit()):
        return None
    return "%s:%s" % (hours, minutes)


def _power_label(power):
    """USB when charging, the voltage otherwise, nothing when unknown."""
    if not isinstance(power, dict):
        return None
    if power.get("charging"):
        return "USB"
    try:
        return "%.1fV" % float(power["battery_v"])
    except (KeyError, TypeError, ValueError):
        return None


def _clean_saved(saved):
    """A saved file that does not hold a payload is the same as no file."""
    if not isinstance(saved, dict):
        return None
    if not isinstance(saved.get("payload"), dict):
        return None
    return {"payload": saved["payload"], "page_index": saved.get("page_index", 0)}
