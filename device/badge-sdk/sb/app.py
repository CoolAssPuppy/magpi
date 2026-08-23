# Being a badge, so an app only has to be itself.
#
# Every app faces the same three problems before it can draw anything of its
# own: the badge may not be paired, the radio is off when the app opens and a
# cold join takes 17 to 21 seconds on this hardware, and pairing has to be able
# to take over the screen when a token turns out to be dead. None of that is
# specific to any one page.
#
# So this holds the lifecycle and an app supplies two things: a machine that
# knows how to fetch and hold its own data, and a view that knows how to draw
# that machine. Everything else -- the token file, the WiFi settle, the pairing
# screen, the battery reading, the handover when a badge is revoked -- happens
# here, once, for everyone.
#
# The contract an app's machine must meet is small and is stated in RunSpec.

from sb import net
from sb import pairing
from sb.pairing import PairingMachine
from sb.ui import draw_hold, PairingScreen, Palette

MODE_PAIRING = "pairing"
# How long the "badge was removed" message stays up before pairing opens on
# its own. Long enough to read a sentence, short enough that nobody decides the
# badge has hung. A press of B still skips it.
UNPAIRED_HOLD_MS = 2000

# How long B must be held to open pairing from a running app. held() is a
# firmware reading this cannot verify, and forgetting the token is expensive, so
# the gesture has to be deliberate: B seen released and then held this long, not
# a single frame that a noisy or stuck-high pin could fake.
B_HOLD_MS = 1500

MODE_RUNNING = "running"


class RunSpec:
    """What an app hands the runtime.

    `make_machine(fetch)` returns the app's state machine. It must offer:
        waiting_for_network()   the radio is joining
        no_network(now_ms)      the join gave up
        load(now_ms, power)     fetch and hold the result
        tick(now_ms, power)     one frame
        state                   compared against `unpaired_state`

    `make_view(screen, shape, color)` returns something with draw(machine).

    `fetch(power)` is the app's own call into the SDK, sb.desk.
    It is passed in rather than chosen here so the runtime stays ignorant of
    which endpoint an app speaks to.

    `unpaired_state` is the value `machine.state` takes when the server has
    forgotten this badge. Reaching it hands the screen to pairing.

    `claims_b` lets an app take B while its machine is healthy. B normally
    means "try again", but that word covers three different jobs: re-pairing a
    badge the server has forgotten, rejoining a radio that dropped, and plain
    refetching. Only the first two are escapes from a state the app cannot get
    itself out of, and only those are worth reserving a button for. An app that
    needs three answer buttons can have B for the third and still hand it back
    the moment the badge is in trouble.

    `runtime_b_states` are the app states where B returns to the runtime even
    with `claims_b` set. `unpaired_state` is always one of them, and so is any
    frame where the radio is still joining. List your offline and error states
    here: they are the screens that tell the wearer to press B.
    """

    def __init__(
        self,
        make_machine,
        make_view,
        fetch,
        unpaired_state,
        buttons=None,
        claims_b=False,
        runtime_b_states=(),
    ):
        self.make_machine = make_machine
        self.make_view = make_view
        self.fetch = fetch
        self.unpaired_state = unpaired_state
        # {button_constant: callable(machine, now_ms)}. B is the runtime's
        # unless claims_b says otherwise.
        self.buttons = buttons or {}
        self.claims_b = claims_b
        # unpaired is always the runtime's: it is the one state B can actually
        # fix, and an app that swallowed it would strand the badge.
        self.runtime_b_states = tuple(runtime_b_states) + (unpaired_state,)


class BadgeApp:
    """The frame loop. Construct once, call update() every frame.

    `env` carries the firmware globals rather than reaching for them as
    module-level names, so this is constructible under CPython and the
    lifecycle can be tested. That matters: the one bug this code has produced
    in the wild was a mode swap the frame loop then kept running past, and it
    shipped because the module holding it could not be imported off-device.
    """

    def __init__(self, spec, env):
        self.spec = spec
        self.env = env
        self.mode = None
        self.machine = None
        self.view = None
        # Running mode only. Pairing keeps its own port inside its machine.
        self.port = None
        # When the join started, or None once the first fetch has settled.
        self.wifi_since = None
        # A join that fails is retried on a widening backoff rather than left
        # for a wearer to notice. An app that stays up all day meets a router
        # reboot, an AP that has not finished coming back, and a badge switched
        # on in a room it cannot reach yet; none of those are worth a screen
        # that says "No network" until somebody walks over and presses B.
        # Consecutive failures, and when the next attempt is due.
        self.wifi_failures = 0
        self.wifi_retry_at = None
        # Whether B has been seen released since running began, and when the
        # current hold started. A pin stuck high never arms, so it can never
        # wipe a token; a real hold arms on release and then fires on time.
        self.b_hold_armed = False
        self.b_held_since = None
        # How far through the hold this frame is, 0 to 1. Read by the runtime's
        # own draw, so a gesture that takes a second and a half is visible for
        # all of it rather than none of it.
        self.b_hold_progress = 0.0
        self._palette = None
        # When the server first said it does not know this badge. Pairing opens
        # on its own a moment later; None whenever the badge is known.
        self.unpaired_since = None

    # -- lifecycle -----------------------------------------------------------

    def boot(self):
        """Choose the branch once, at open, and stay in it.

        Deliberately not re-checked every frame. Pairing ends by handing off to
        the launcher, and an app cannot un-pair a badge on its own, so there is
        no transition for a per-frame check to catch: it would only be a file
        read in the frame loop, every frame, forever.
        """
        if net.is_paired():
            self._enter_running()
        else:
            self._enter_pairing()

    def _enter_running(self):
        env = self.env
        self.mode = MODE_RUNNING
        self.machine = self.spec.make_machine(self.spec.fetch)
        self.view = self.spec.make_view(env.screen, env.shape, env.color)
        # The radio is off when an app opens. Fetching here resolved DNS with
        # no network and failed, which every paired badge showed as "Cannot
        # reach the server" on a network that was fine.
        self.port = net.DevicePort()
        self.wifi_failures = 0
        self.wifi_retry_at = None
        self.port.wifi_begin()
        self.wifi_since = env.badge.ticks
        self.unpaired_since = None
        # A fresh running session: B must be released and then held again before
        # it can open pairing, so opening an app with a thumb on B is harmless.
        self.b_hold_armed = False
        self.b_held_since = None
        self.machine.waiting_for_network()

    def _enter_pairing(self):
        env = self.env
        self.mode = MODE_PAIRING
        self.machine = PairingMachine(
            net.DevicePort(),
            env.badge.uid,
            fw=net.firmware_version(),
            sdk=net.SDK_VERSION,
        )
        self.view = PairingScreen(env.screen, env.shape, env.color)
        # The running-mode join is over. Leaving either set would point
        # settle_first_fetch, or the rejoin timer, at a port this mode no
        # longer owns. Pairing runs its own join inside its machine.
        self.wifi_since = None
        self.wifi_retry_at = None
        self.wifi_failures = 0
        self.unpaired_since = None

    def update(self):
        now = self.env.badge.ticks
        if self.machine is None:
            self.boot()
        if self.mode == MODE_RUNNING:
            self._update_running(now)
        else:
            self._update_pairing(now)

    # -- running -------------------------------------------------------------

    def _update_running(self, now):
        env = self.env

        for button, handler in self.spec.buttons.items():
            # B is read once, below. pressed() is edge triggered and reports a
            # press to the first caller only, so reading it here as well would
            # mean whichever of the two ran first got the press and the other
            # never saw it.
            if button == env.BUTTON_B:
                continue
            if env.badge.pressed(button):
                handler(self.machine, now)

        # Holding B opens pairing from anywhere, without asking why the badge
        # is stuck. A press of B can only fix the failures the runtime knows
        # how to name; a wearer looking at a screen that will not move needs a
        # way through that does not depend on the runtime having diagnosed it
        # correctly. This is that way, and it is the same on every app. It is a
        # sustained hold, not a frame, so the firmware reading that drives it
        # cannot wipe a token on a glitch.
        if self._b_hold_opens_pairing(now):
            net.forget_token()
            self._enter_pairing()
            return

        if env.badge.pressed(env.BUTTON_B):
            if self.runtime_owns_b():
                # B can end running mode outright: on a badge the server has
                # forgotten it opens pairing and swaps both the machine and the
                # view. Nothing below this line survives that swap, because it
                # all speaks the app's machine and pairing's is a different
                # shape.
                if self.retry(now):
                    return
            else:
                handler = self.spec.buttons.get(env.BUTTON_B)
                if handler is not None:
                    handler(self.machine, now)

        self.rejoin_when_due(now)
        self.settle_first_fetch(now)

        # A badge the server has forgotten cannot be retried into working, and
        # waiting for a press meant an account deleted on the website left the
        # badge sitting on a message until somebody thought to press B. The
        # message is held long enough to read, then pairing opens by itself.
        if self.machine.state == self.spec.unpaired_state:
            if self.unpaired_since is None:
                self.unpaired_since = now
            elif now - self.unpaired_since >= UNPAIRED_HOLD_MS:
                net.forget_token()
                self._enter_pairing()
                return
        else:
            self.unpaired_since = None

        self.view.draw(self.machine)
        self._draw_hold()
        self.machine.tick(now, self.power())

    def _draw_hold(self):
        """The runtime's own mark, on top of whatever the app drew.

        Here rather than in each app's view: the gesture is the runtime's on
        every screen of every app, and an app that forgot to draw it would be
        an app where the escape hatch looks broken.
        """
        if self.b_hold_progress <= 0:
            return
        env = self.env
        if self._palette is None:
            self._palette = Palette(env.color)
        try:
            draw_hold(
                env.screen,
                env.shape,
                self._palette,
                self.b_hold_progress,
                label="Hold to re-pair",
                width=getattr(env.screen, "width", None) or 320,
                height=getattr(env.screen, "height", None) or 240,
            )
        except Exception:
            # A mark on top of the app's screen is worth strictly less than the
            # app, and this runs on every frame of every app.
            self.b_hold_progress = 0.0

    def _b_hold_opens_pairing(self, now):
        """Whether B has been held long enough, and honestly enough, to pair.

        held() is a firmware call this code cannot verify against the hardware,
        and acting on it wrongly deletes the badge's token and drops it to the
        pairing screen. So the reading is trusted only when it is a real
        gesture: read defensively, arm on a release, and fire on a sustained
        hold. A pin that reads held from the first running frame never arms, so
        a stuck or noisy pin cannot wipe a working token.
        """
        try:
            held = bool(self.env.badge.held(self.env.BUTTON_B))
        except Exception:
            # A firmware without held() must not be able to wipe a token.
            held = False

        if not held:
            self.b_hold_armed = True
            self.b_held_since = None
            self.b_hold_progress = 0.0
            return False
        if not self.b_hold_armed:
            # A pin that has read held since the app opened. Nothing is counted
            # and nothing is drawn: showing a bar here would advertise a
            # gesture that is deliberately not going to fire.
            self.b_hold_progress = 0.0
            return False
        if self.b_held_since is None:
            self.b_held_since = now
            self.b_hold_progress = 0.0
            return False

        elapsed = now - self.b_held_since
        self.b_hold_progress = min(1.0, elapsed / float(B_HOLD_MS))
        return elapsed >= B_HOLD_MS

    def runtime_owns_b(self):
        """Whether this frame's B belongs to the runtime rather than the app.

        An app only gets to keep B while the badge can still help itself. The
        moment it cannot -- the server has forgotten it, the radio is still
        joining or waiting to try again, or the app has put up one of the
        screens that tells the wearer to press B -- the button goes back to
        meaning "try again", because that is the only thing that can fix any of
        those.
        """
        if not self.spec.claims_b:
            return True
        if self.wifi_since is not None or self.wifi_retry_at is not None:
            return True
        return getattr(self.machine, "state", None) in self.spec.runtime_b_states

    def retry(self, now):
        """B means "try again", whichever half of the journey failed.

        Returns True when it left running mode, which means the caller must
        stop touching the machine and the view immediately.
        """
        # A badge the server has forgotten cannot be retried into working. Drop
        # the dead token and open pairing, which is the only thing that can fix
        # it and the thing the wearer was told to press B for.
        if self.machine.state == self.spec.unpaired_state:
            net.forget_token()
            self._enter_pairing()
            return True

        if self.port is not None and self.port.wifi_status() != pairing.WIFI_CONNECTED:
            self.rejoin(now)
            return False

        self.machine.load(now, self.power())
        return False

    def rejoin(self, now):
        """Drop the radio and join again, starting the settle over.

        B and the backoff timer both land here, so pressing B during a wait is
        the same act as the wait finishing, only sooner. The count is not
        cleared: a wearer pressing B twice in a row must not reset a badge that
        has been failing for ten minutes back to a three second retry.
        """
        self.port.wifi_reset()
        self.port.wifi_begin()
        self.wifi_since = now
        self.wifi_retry_at = None
        self.machine.waiting_for_network()

    def rejoin_when_due(self, now):
        """Start the next attempt once its backoff has elapsed."""
        if self.wifi_retry_at is None or now < self.wifi_retry_at:
            return
        self.rejoin(now)

    def settle_first_fetch(self, now):
        """Fetch as soon as the radio is up, and give up when it will not come.

        Runs in the frame loop rather than blocking the open, so the screen
        keeps drawing "Connecting" for the twenty seconds a cold join takes.
        """
        if self.wifi_since is None:
            return
        status = self.port.wifi_status()
        if status == pairing.WIFI_CONNECTED:
            self.wifi_since = None
            self.wifi_failures = 0
            self.wifi_retry_at = None
            self.machine.load(now, self.power())
        elif status == pairing.WIFI_FAILED or now - self.wifi_since >= pairing.WIFI_TIMEOUT_MS:
            self.wifi_since = None
            self.wifi_failures += 1
            self.wifi_retry_at = now + pairing.backoff_ms(self.wifi_failures)
            self.machine.no_network(now)

    # -- pairing -------------------------------------------------------------

    def _update_pairing(self, now):
        env = self.env
        # A press only ever means "give me a new code", and only on the screens
        # where the current one is dead. Any other frame ignores it, so a badge
        # in a pocket cannot churn through user codes.
        dead = (pairing.STATE_EXPIRED, pairing.STATE_DENIED, pairing.STATE_ERROR)
        if env.badge.pressed(env.BUTTON_A) and self.machine.state in dead:
            self.machine.restart(now)
        self.machine.tick(now)

        # Pairing is finished and the token is on disk, so this app can simply
        # start. It used to wait for port.launch(), a soft reset that BadgeOS
        # was never confirmed to honour and whose failure was swallowed: the
        # code stayed on screen with the badge already paired, and the only way
        # on was to leave for the launcher and open the app again.
        if self.machine.state == pairing.STATE_DONE and net.is_paired():
            self._enter_running()
            return

        self.view.draw(self.machine, now)

    # -- shared --------------------------------------------------------------

    def power(self):
        """What the badge knows about its own battery, or None off hardware.

        Voltage rather than percentage: battery_level() sits at 100 long after
        the reading would have told you something.
        """
        try:
            return {
                "battery": self.env.badge.battery_voltage(),
                "charging": self.env.badge.is_charging(),
                "usb": self.env.badge.usb_connected(),
            }
        except Exception:
            return None


class Env:
    """The firmware globals, gathered into one object.

    BadgeOS injects `badge`, `screen`, `shape`, `color` and the BUTTON_*
    constants into an app's namespace. Passing them in rather than importing
    them is what makes the runtime testable off-device.
    """

    def __init__(self, badge, screen, shape, color, BUTTON_A, BUTTON_B):
        self.badge = badge
        self.screen = screen
        self.shape = shape
        self.color = color
        self.BUTTON_A = BUTTON_A
        self.BUTTON_B = BUTTON_B
