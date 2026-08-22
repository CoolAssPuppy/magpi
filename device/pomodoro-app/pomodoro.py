# The Pomodoro machine. Pure Python: no drawing, no network, no SDK import.
#
# There is no pause. A pomodoro is indivisible, and interrupted means void, so
# the only way out of a running one is to abandon it and lose it. That is the
# technique rather than a missing feature, and it is the reason this is worth
# building instead of using a phone timer.

from sb.constants import (
    POMODORO_LEDS,
    POMODORO_LONG_MIN,
    POMODORO_SESSIONS,
    POMODORO_SHORT_MIN,
    POMODORO_WORK_MIN,
)

STATE_IDLE = "idle"
STATE_WORK = "work"
STATE_SHORT_BREAK = "short_break"
STATE_LONG_BREAK = "long_break"
STATE_SET_DONE = "set_done"
STATE_ABANDON_CONFIRM = "abandon_confirm"

DEFAULTS = {
    "work_min": POMODORO_WORK_MIN,
    "short_min": POMODORO_SHORT_MIN,
    "long_min": POMODORO_LONG_MIN,
    "sessions": POMODORO_SESSIONS,
    "leds": POMODORO_LEDS,
}

# How long C must be held to void the current pomodoro. Long enough that a
# brush against the case cannot cost twenty minutes of work.
ABANDON_HOLD_MS = 1500

# The last stretch of a work phase, when the LEDs come up. Sixty seconds is
# long enough to finish a sentence and short enough to still be a warning.
LED_RAMP_MS = 60000
BREATHE_PERIOD_MS = 4000

MINUTE_MS = 60000

_LIMITS = {
    "work_min": (1, 120),
    "short_min": (1, 60),
    "long_min": (1, 120),
    "sessions": (2, 8),
}

# How much UP and DOWN move the work length. Whole units, because a badge with
# five buttons is not a place to dial in 23 minutes.
LENGTH_STEP_MIN = 5

_PHASE_LABELS = {
    STATE_IDLE: "READY",
    STATE_WORK: "WORK",
    STATE_SHORT_BREAK: "BREAK",
    STATE_LONG_BREAK: "LONG BREAK",
    STATE_SET_DONE: "SET DONE",
    STATE_ABANDON_CONFIRM: "ABANDON",
}


def clean_settings(raw):
    """The settings Notifier wrote, with anything unusable replaced.

    A badge that read a truncated file must still run a timer, so every
    failure here lands on the default rather than raising.
    """
    settings = dict(DEFAULTS)
    if not isinstance(raw, dict):
        return settings
    for key, default in DEFAULTS.items():
        if key not in raw:
            continue
        value = raw[key]
        if key == "leds":
            settings[key] = bool(value)
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        low, high = _LIMITS[key]
        settings[key] = min(high, max(low, number))
    return settings


def clean_log(raw, today):
    """Today's tally, or a fresh one when the day rolled over."""
    if not isinstance(raw, dict):
        return {"day": today, "count": 0}
    if raw.get("day") != today:
        return {"day": today, "count": 0}
    try:
        return {"day": today, "count": max(0, int(raw.get("count", 0)))}
    except (TypeError, ValueError):
        return {"day": today, "count": 0}


class Pomodoro:
    def __init__(self, settings_cache, log_cache, clock):
        self._settings_cache = settings_cache
        self._log_cache = log_cache
        self._clock = clock

        self.settings = clean_settings(settings_cache.load(default=None))

        self._day = self._today()
        self._log = clean_log(log_cache.load(default=None), self._day)

        self._state = STATE_IDLE
        self._phase_ends_at = None
        self._now_ms = 0
        self._completed_in_set = 0

        # The C hold. Armed only after C has been seen released, so a pin held
        # from the first frame cannot void a pomodoro on boot.
        self._c_armed = False
        self._c_down_at = None
        self.hold_progress = 0.0

    # What the view reads.

    @property
    def state(self):
        return self._state

    @property
    def completed_in_set(self):
        return self._completed_in_set

    @property
    def completed_today(self):
        return self._log["count"]

    @property
    def remaining_ms(self):
        if self._phase_ends_at is None:
            return self._phase_length_ms(self._state)
        return max(0, self._phase_ends_at - self._now_ms)

    @property
    def clock_text(self):
        total = self.remaining_ms // 1000
        return "%02d:%02d" % (total // 60, total % 60)

    @property
    def phase_label(self):
        return _PHASE_LABELS[self._state]

    @property
    def set_dots(self):
        """One per pomodoro in the set: 1 done, 2 running, 0 still to come."""
        dots = []
        for index in range(self.settings["sessions"]):
            if index < self._completed_in_set:
                dots.append(1)
            elif index == self._completed_in_set and self._state in (STATE_WORK,
                                                                     STATE_ABANDON_CONFIRM):
                dots.append(2)
            else:
                dots.append(0)
        return dots

    # The frame loop.

    def tick(self, now_ms):
        self._now_ms = now_ms
        if self._phase_ends_at is None or now_ms < self._phase_ends_at:
            return
        if self._state == STATE_WORK:
            self._finish_work()
        elif self._state == STATE_SHORT_BREAK:
            # The break is over, and the screen says so. Starting the next
            # pomodoro is a decision, so nothing moves until A.
            self._phase_ends_at = now_ms
        elif self._state == STATE_LONG_BREAK:
            # A finished long break is a finished set, which is worth its own
            # screen: four pomodoros is the unit the technique counts in.
            self._state = STATE_SET_DONE
            self._phase_ends_at = now_ms

    # Buttons.

    def press_a(self, now_ms):
        self._now_ms = now_ms
        if self._state == STATE_IDLE:
            self._begin(STATE_WORK, now_ms)
        elif self._state == STATE_SET_DONE:
            self._completed_in_set = 0
            self._begin(STATE_WORK, now_ms)
        elif self._state == STATE_SHORT_BREAK and self.remaining_ms == 0:
            self._begin(STATE_WORK, now_ms)

    def press_up(self, now_ms):
        self._adjust(LENGTH_STEP_MIN)

    def press_down(self, now_ms):
        self._adjust(-LENGTH_STEP_MIN)

    def hold_c(self, now_ms, is_down):
        """Read defensively: arm on a release, fire on a sustained hold.

        A pin that reads high from the first frame is a pin this cannot trust,
        and acting on it would void a pomodoro nobody abandoned.
        """
        self._now_ms = now_ms
        if not self._can_abandon():
            self._reset_hold()
            return

        if not is_down:
            self._c_armed = True
            self._reset_hold(keep_armed=True)
            if self._state == STATE_ABANDON_CONFIRM:
                self._state = STATE_WORK
            return

        if not self._c_armed:
            return

        if self._c_down_at is None:
            self._c_down_at = now_ms
            self._state = STATE_ABANDON_CONFIRM

        held = now_ms - self._c_down_at
        self.hold_progress = min(1.0, held / float(ABANDON_HOLD_MS))
        if held >= ABANDON_HOLD_MS:
            self._abandon()

    # LEDs.

    def leds(self, now_ms):
        """Four levels. Dark unless this phase has something to say."""
        if not self.settings["leds"]:
            return (0.0,) * 4
        if self._state == STATE_WORK:
            return (self._ramp(),) * 4
        if self._state in (STATE_SHORT_BREAK, STATE_LONG_BREAK):
            return (self._breathe(now_ms),) * 4
        return (0.0,) * 4

    # Internals.

    def _ramp(self):
        """Off until the last minute, then linearly up to full."""
        remaining = self.remaining_ms
        if remaining > LED_RAMP_MS:
            return 0.0
        return min(1.0, (LED_RAMP_MS - remaining) / float(LED_RAMP_MS))

    def _breathe(self, now_ms):
        """A slow triangle. A rest is not an alert, so it never reaches full."""
        position = (now_ms % BREATHE_PERIOD_MS) / float(BREATHE_PERIOD_MS)
        rising = position * 2 if position < 0.5 else (1.0 - position) * 2
        return round(rising * 0.4, 3)

    def _can_abandon(self):
        return self._state in (STATE_WORK, STATE_ABANDON_CONFIRM)

    def _reset_hold(self, keep_armed=False):
        self._c_down_at = None
        self.hold_progress = 0.0
        if not keep_armed:
            self._c_armed = False

    def _adjust(self, step):
        # Fixed once a pomodoro is running: changing the length mid-phase is
        # the pause button wearing a different hat.
        if self._state != STATE_IDLE:
            return
        low, high = _LIMITS["work_min"]
        self.settings["work_min"] = min(high, max(low, self.settings["work_min"] + step))

    def _phase_length_ms(self, state):
        if state in (STATE_WORK, STATE_ABANDON_CONFIRM):
            return self.settings["work_min"] * MINUTE_MS
        if state == STATE_SHORT_BREAK:
            return self.settings["short_min"] * MINUTE_MS
        if state == STATE_LONG_BREAK:
            return self.settings["long_min"] * MINUTE_MS
        return self.settings["work_min"] * MINUTE_MS

    def _begin(self, state, now_ms):
        self._state = state
        self._phase_ends_at = now_ms + self._phase_length_ms(state)
        self._reset_hold()

    def _finish_work(self):
        self._completed_in_set += 1
        self._bank()
        # Rest immediately. The technique says so, so this is not a decision
        # and there is no button to press.
        if self._completed_in_set >= self.settings["sessions"]:
            self._begin(STATE_LONG_BREAK, self._now_ms)
        else:
            self._begin(STATE_SHORT_BREAK, self._now_ms)

    def _abandon(self):
        """Void the pomodoro. It does not count, which is the whole point."""
        self._state = STATE_IDLE
        self._phase_ends_at = None
        self._reset_hold()

    def _bank(self):
        self._roll_day()
        self._log["count"] += 1
        self._log_cache.save(dict(self._log))

    def _roll_day(self):
        today = self._today()
        if today != self._day:
            self._day = today
            self._log = {"day": today, "count": 0}

    def _today(self):
        """The local date, or None when the clock cannot answer.

        A badge with no RTC still counts this session; it just cannot tell one
        day from the next, and a tally that resets on reboot beats a crash.
        """
        try:
            return self._clock.local_date()
        except Exception:
            return None
