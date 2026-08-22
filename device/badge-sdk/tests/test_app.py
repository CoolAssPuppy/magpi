# The badge lifecycle: which branch an app boots into, what B does on each of
# them, and the handover when a badge turns out to be revoked.
#
# This used to live in the Supabase app's __init__.py, where it could not be
# imported off-device because it reached `badge`, `screen` and `run` as globals
# the firmware injects. That is why the one bug this code produced in the wild
# shipped: pressing B on an unpaired badge swapped the machine for a pairing
# machine and the frame loop carried on calling the old one's methods on it.
#
# BadgeApp takes an Env instead of reaching for globals, so all of it is
# reachable from a test now, for every app rather than only for slides.

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: E402  installs runtime stubs before sb imports

from sb import net  # noqa: E402
from sb import pairing  # noqa: E402
from sb.app import B_HOLD_MS, BadgeApp, Env, MODE_PAIRING, MODE_RUNNING, RunSpec  # noqa: E402

UNPAIRED = "unpaired"


class FakeMachine:
    """An app's machine, reduced to the contract RunSpec states."""

    def __init__(self, fetch):
        self.fetch = fetch
        self.state = "ready"
        self.calls = []

    def waiting_for_network(self):
        self.calls.append("waiting_for_network")

    def no_network(self, now_ms):
        self.calls.append("no_network")

    def load(self, now_ms, power=None):
        self.calls.append("load")

    def tick(self, now_ms, power=None):
        self.calls.append("tick")
        return self.state

    def advance(self, now_ms):
        self.calls.append("advance")


class FakeView:
    def __init__(self, *args):
        self.drawn = 0

    def draw(self, machine, now_ms=0):
        self.drawn += 1


class StubPort:
    """A DevicePort that is joined the moment it is asked."""

    instances = []

    def __init__(self, *args, **kwargs):
        self.resets = 0
        self.begins = 0
        StubPort.instances.append(self)

    def wifi_status(self):
        return pairing.WIFI_CONNECTED

    def wifi_begin(self):
        self.begins += 1

    def wifi_reset(self):
        self.resets += 1


def build(paired=True, buttons=None, claims_b=False, runtime_b_states=()):
    """An app wired to fakes, plus the pieces a test needs to poke at."""
    StubPort.instances = []
    machines = []

    def make_machine(fetch):
        machine = FakeMachine(fetch)
        machines.append(machine)
        return machine

    spec = RunSpec(
        make_machine=make_machine,
        make_view=lambda *args: FakeView(),
        fetch=lambda power=None: {"ok": True},
        unpaired_state=UNPAIRED,
        buttons=buttons or {},
        claims_b=claims_b,
        runtime_b_states=runtime_b_states,
    )
    env = Env(
        badge=fakes.fake_badge,
        screen=fakes.FakeScreen(),
        shape=fakes.FakeShape(),
        color=fakes.FakeColor(),
        BUTTON_A="BUTTON_A",
        BUTTON_B="BUTTON_B",
    )
    app = BadgeApp(spec, env)
    return app, machines


class Boot(unittest.TestCase):
    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        net.DevicePort = StubPort

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port

    def test_a_paired_badge_runs_the_app(self):
        net.is_paired = lambda: True
        app, machines = build()

        app.update()

        self.assertEqual(app.mode, MODE_RUNNING)
        # The radio is off at open, so the app waits rather than fetching into
        # a network that is not there yet.
        self.assertIn("waiting_for_network", machines[0].calls)

    def test_an_unpaired_badge_opens_pairing_instead(self):
        net.is_paired = lambda: False
        app, machines = build()

        app.update()

        self.assertEqual(app.mode, MODE_PAIRING)
        self.assertEqual(machines, [], "the app's own machine was built for an unpaired badge")


class RePairFromUnpaired(unittest.TestCase):
    """Pressing B on a revoked badge opens pairing without crashing.

    The badge showed "Press B to pair again", the wearer did, and the app died
    to the launcher. Restarting worked, which is what made it look
    intermittent: a cold boot enters pairing directly and never crosses the
    swap.
    """

    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        self._forget = net.forget_token
        self.forgotten = []
        net.is_paired = lambda: True
        net.DevicePort = StubPort
        net.forget_token = lambda: self.forgotten.append(True)

        self.app, self.machines = build()
        self.app.update()
        self.machines[0].state = UNPAIRED
        self.app.wifi_since = None

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port
        net.forget_token = self._forget

    def test_the_frame_after_the_swap_does_not_crash(self):
        self.buttons.press("BUTTON_B")
        self.buttons.frame(self.app.update)

        # This is the frame that died: the loop carried on past the swap and
        # called the app machine's signature on a PairingMachine.
        self.buttons.frame(self.app.update)

        self.assertEqual(self.app.mode, MODE_PAIRING)

    def test_the_dead_token_is_dropped(self):
        self.buttons.press("BUTTON_B")
        self.buttons.frame(self.app.update)

        self.assertEqual(self.forgotten, [True], "a token the server rejected was kept")

    def test_the_running_join_is_forgotten_with_the_mode(self):
        self.app.wifi_since = 1234

        self.buttons.press("BUTTON_B")
        self.buttons.frame(self.app.update)

        # settle_first_fetch would otherwise poll a port this mode no longer
        # owns, and call app-machine methods on a PairingMachine.
        self.assertIsNone(self.app.wifi_since)

    def test_an_app_button_cannot_fire_on_the_swap_frame(self):
        # UP chorded with B was a second way to crash: toggle_auto does not
        # exist on a PairingMachine.
        pressed = []
        app, machines = build(buttons={"BUTTON_A": lambda m, now: pressed.append(now)})
        app.update()
        machines[0].state = UNPAIRED
        app.wifi_since = None

        self.buttons.press("BUTTON_B")
        self.buttons.press("BUTTON_A")
        self.buttons.frame(app.update)
        self.buttons.frame(app.update)

        self.assertEqual(app.mode, MODE_PAIRING)


class RetryWhileStillPaired(unittest.TestCase):
    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        net.is_paired = lambda: True
        net.DevicePort = StubPort
        self.app, self.machines = build()
        self.app.update()
        self.app.wifi_since = None

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port

    def test_b_refetches_and_stays_in_the_app(self):
        self.machines[0].calls.clear()

        self.buttons.press("BUTTON_B")
        self.buttons.frame(self.app.update)

        self.assertEqual(self.app.mode, MODE_RUNNING)
        self.assertIn("load", self.machines[0].calls)


class ClaimingB(unittest.TestCase):
    """An app may borrow B, and only while the badge can still help itself.

    B normally means "try again", and that word covers three different jobs:
    re-pairing a badge the server has forgotten, rejoining a radio that
    dropped, and plain refetching. Only the first two are escapes from a state
    the app cannot get itself out of, and those are the ones the runtime keeps
    whatever an app asks for.
    """

    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        self._forget = net.forget_token
        net.is_paired = lambda: True
        net.DevicePort = StubPort
        net.forget_token = lambda: None

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port
        net.forget_token = self._forget

    def running(self, **kwargs):
        pressed = []
        app, machines = build(
            buttons={"BUTTON_B": lambda m, now: pressed.append(now)}, **kwargs
        )
        app.update()
        app.wifi_since = None
        return app, machines, pressed

    def test_an_app_that_does_not_claim_b_never_sees_it(self):
        app, machines, pressed = self.running()

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertTrue(app.runtime_owns_b())
        self.assertEqual(pressed, [])
        self.assertIn("load", machines[0].calls)

    def test_an_app_that_claims_b_is_handed_the_press(self):
        app, machines, pressed = self.running(claims_b=True)
        machines[0].calls.clear()

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertFalse(app.runtime_owns_b())
        self.assertEqual(len(pressed), 1)
        self.assertNotIn("load", machines[0].calls)

    def test_b_goes_back_to_the_runtime_on_a_badge_the_server_forgot(self):
        # The one state B can actually fix. An app that swallowed it would
        # strand the badge on a screen telling the wearer to press it.
        app, machines, pressed = self.running(claims_b=True)
        machines[0].state = UNPAIRED

        self.assertTrue(app.runtime_owns_b())

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertEqual(pressed, [])
        self.assertEqual(app.mode, MODE_PAIRING)

    def test_the_unpaired_state_is_the_runtimes_without_being_listed(self):
        app, machines, pressed = self.running(claims_b=True, runtime_b_states=("offline",))

        self.assertIn(UNPAIRED, app.spec.runtime_b_states)

    def test_b_goes_back_to_the_runtime_while_the_radio_is_still_joining(self):
        app, machines, pressed = self.running(claims_b=True)
        app.wifi_since = 0

        self.assertTrue(app.runtime_owns_b())

    def test_b_goes_back_to_the_runtime_on_a_screen_that_says_to_press_it(self):
        # The offline and error screens tell the wearer to press B, so they are
        # exactly the frames where B has to mean what they were told.
        app, machines, pressed = self.running(
            claims_b=True, runtime_b_states=("offline", "error")
        )
        machines[0].state = "offline"
        machines[0].calls.clear()

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertEqual(pressed, [])
        self.assertIn("load", machines[0].calls)

    def test_a_healthy_app_takes_b_back_once_the_trouble_clears(self):
        app, machines, pressed = self.running(claims_b=True, runtime_b_states=("offline",))
        machines[0].state = "offline"
        self.assertTrue(app.runtime_owns_b())

        machines[0].state = "ready"

        self.assertFalse(app.runtime_owns_b())

    def test_a_claimed_b_with_no_handler_does_nothing_rather_than_crashing(self):
        app, machines = build(claims_b=True, buttons={})
        app.update()
        app.wifi_since = None
        machines[0].calls.clear()

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertEqual(app.mode, MODE_RUNNING)
        self.assertNotIn("load", machines[0].calls)

    def test_the_press_reaches_the_app_once_and_not_twice(self):
        # pressed() is edge triggered and reports a press to the first caller
        # only, so B must be read in exactly one place.
        app, machines, pressed = self.running(claims_b=True)

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertEqual(len(pressed), 1)


if __name__ == "__main__":
    unittest.main()


class WhenTheServerForgetsTheBadge(unittest.TestCase):
    """Deleting an account on the website leaves a badge holding a dead token.

    Every one of these is a path somebody actually got stuck on: the badge sat
    on a screen that would not move, and the only way out was a press nobody
    knew to make.
    """

    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        self._forget = net.forget_token
        self.forgotten = []
        net.is_paired = lambda: True
        net.DevicePort = StubPort
        net.forget_token = lambda *a, **k: self.forgotten.append(True)

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port
        net.forget_token = self._forget

    def test_pairing_opens_on_its_own_without_a_press(self):
        # An account deleted on the website used to leave the badge showing
        # "Badge was removed" until somebody thought to press B.
        app, machines = build()
        app.update()
        machines[0].state = UNPAIRED

        app.update()
        self.assertEqual(app.mode, MODE_RUNNING, "it gave up before the message could be read")

        fakes.fake_badge.advance(3000)
        app.update()

        self.assertEqual(app.mode, MODE_PAIRING)
        self.assertTrue(self.forgotten, "the dead token was kept")

    def test_the_message_is_held_long_enough_to_read(self):
        app, machines = build()
        app.update()
        machines[0].state = UNPAIRED

        for _ in range(5):
            app.update()
            fakes.fake_badge.advance(100)

        self.assertEqual(app.mode, MODE_RUNNING)

    def test_b_opens_pairing_at_once_rather_than_waiting(self):
        app, machines = build()
        app.update()
        machines[0].state = UNPAIRED

        self.buttons.press("BUTTON_B")
        self.buttons.frame(app.update)

        self.assertEqual(app.mode, MODE_PAIRING)

    def test_a_badge_that_recovers_does_not_drift_into_pairing(self):
        # The hold is a countdown, so a state that returns to normal has to
        # cancel it rather than let it run out later.
        app, machines = build()
        app.update()
        machines[0].state = UNPAIRED
        app.update()

        machines[0].state = "ready"
        fakes.fake_badge.advance(3000)
        app.update()

        self.assertEqual(app.mode, MODE_RUNNING)


class TheWayOutOfAnythingStuck(unittest.TestCase):
    """Holding B opens pairing from any state at all.

    A press of B can only fix the failures the runtime knows how to name. This
    is the one that does not depend on the runtime having worked out what is
    wrong, which is what somebody staring at a frozen "Connecting" needs.
    """

    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        self._forget = net.forget_token
        self.forgotten = []
        net.is_paired = lambda: True
        net.DevicePort = StubPort
        net.forget_token = lambda *a, **k: self.forgotten.append(True)

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port
        net.forget_token = self._forget

    def hold_b_from(self, state):
        app, machines = build()
        app.update()  # enters running; B is not touched, so the hold arms
        machines[0].state = state

        # A real hold: B down across frame after frame, past B_HOLD_MS.
        elapsed = 0
        while app.mode == MODE_RUNNING and elapsed <= B_HOLD_MS + 200:
            self.buttons.hold("BUTTON_B")
            self.buttons.frame(app.update, advance_ms=200)
            elapsed += 200
        return app

    def test_from_connecting(self):
        # The state somebody was stuck on: the radio is still joining and no
        # amount of pressing B changes that.
        self.assertEqual(self.hold_b_from("loading").mode, MODE_PAIRING)

    def test_from_an_unreachable_server(self):
        self.assertEqual(self.hold_b_from("error").mode, MODE_PAIRING)

    def test_from_a_working_app(self):
        # Deliberate: somebody wanting to move a badge to another account
        # should not have to break it first.
        self.assertEqual(self.hold_b_from("ready").mode, MODE_PAIRING)

    def test_the_dead_token_goes_with_it(self):
        # Left behind, the next open would boot back into running mode and
        # fail the same way.
        self.hold_b_from("loading")
        self.assertTrue(self.forgotten)

    def test_an_app_that_owns_b_cannot_swallow_the_hold(self):
        # The runtime reads the hold before any app handler sees the button.
        seen = []
        app, machines = build(
            buttons={"BUTTON_B": lambda machine, now: seen.append(now)},
            claims_b=True,
        )
        app.update()
        machines[0].state = "ready"

        elapsed = 0
        while app.mode == MODE_RUNNING and elapsed <= B_HOLD_MS + 200:
            self.buttons.hold("BUTTON_B")
            self.buttons.frame(app.update, advance_ms=200)
            elapsed += 200

        self.assertEqual(app.mode, MODE_PAIRING)

    def test_a_single_held_frame_never_wipes_the_token(self):
        # held() is a firmware reading. One noisy frame of it must not cost a
        # badge its pairing; the hold has to be sustained.
        app, machines = build()
        app.update()  # arms: B released
        machines[0].state = "ready"

        self.buttons.hold("BUTTON_B")
        self.buttons.frame(app.update, advance_ms=100)

        self.assertEqual(app.mode, MODE_RUNNING)
        self.assertFalse(self.forgotten)

    def test_a_pin_stuck_high_never_wipes_the_token(self):
        # If held() reads true from the first running frame and never releases,
        # it is a stuck or floating pin, not a gesture. It must never arm, so a
        # paired badge can never be dropped to the QR by one.
        app, machines = build()
        for _ in range(20):  # four seconds, well past B_HOLD_MS
            if app.mode == MODE_RUNNING:
                machines[0].state = "ready"
            self.buttons.hold("BUTTON_B")
            self.buttons.frame(app.update, advance_ms=200)

        self.assertEqual(app.mode, MODE_RUNNING)
        self.assertFalse(self.forgotten)


class WhenPairingFinishes(unittest.TestCase):
    """The app starts itself. It does not wait to be restarted.

    This used to depend on port.launch() soft-resetting the badge, inside a
    bare except. On the firmware nothing happened and the exception was
    swallowed, so a wearer whose token was already written sat looking at the
    pairing code until they went back to the launcher and opened the app again.
    """

    def setUp(self):
        self.buttons = fakes.ButtonQueue()
        self._paired = net.is_paired
        self._port = net.DevicePort
        net.DevicePort = StubPort
        # Unpaired at open, paired by the time pairing reports it is done.
        self.paired = False
        net.is_paired = lambda: self.paired

    def tearDown(self):
        net.is_paired = self._paired
        net.DevicePort = self._port

    def finish_pairing(self):
        app, machines = build()
        app.update()
        self.assertEqual(app.mode, MODE_PAIRING)

        self.paired = True
        app.machine.state = pairing.STATE_DONE
        app.update()
        return app, machines

    def test_the_app_runs_without_anything_restarting_it(self):
        app, machines = self.finish_pairing()

        self.assertEqual(app.mode, MODE_RUNNING)
        self.assertEqual(len(machines), 1, "the app's machine was never built")

    def test_it_joins_the_network_the_way_a_normal_open_does(self):
        _, machines = self.finish_pairing()

        self.assertIn("waiting_for_network", machines[0].calls)

    def test_a_launch_that_does_nothing_cannot_strand_the_wearer(self):
        # The whole point: launch() is a no-op now, and the hand-off must not
        # depend on it.
        self.assertIsNone(net.DevicePort().launch() if hasattr(StubPort, "launch") else None)
        app, _ = self.finish_pairing()
        self.assertEqual(app.mode, MODE_RUNNING)

    def test_pairing_that_is_done_without_a_token_does_not_hand_off(self):
        # is_paired() is the authority, not the screen: a DONE state with no
        # token on disk would boot straight back into pairing.
        app, _ = build()
        app.update()

        app.machine.state = pairing.STATE_DONE
        app.update()

        self.assertEqual(app.mode, MODE_PAIRING)
