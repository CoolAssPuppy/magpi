"""What survives a reboot, and what a power cut is allowed to cost.

The store is the only thing on the badge besides pairing that writes to flash,
so its failures are tested rather than assumed: a truncated file, a directory
that will not accept a write, and a saved shape the app no longer understands.
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from testing import fakes  # noqa: E402,F401  installs firmware stubs first

from sb import net, store  # noqa: E402


def blank():
    return {"seen": []}


class Paths(unittest.TestCase):
    def test_the_shipped_default_is_the_writable_directory_net_names(self):
        # Not an override test. Pairing wrote the token to one path while the
        # SDK read another, and every test overrode both, so nothing caught it.
        self.assertEqual(store.STATE_DIR, net.STATE_DIR)
        self.assertEqual(store.path_for("pomodoro"), net.STATE_DIR + "/pomodoro.json")


class RoundTrip(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        previous = store._set_dir(self.tmp.name)
        self.addCleanup(store._set_dir, previous)

    def test_what_was_saved_is_what_comes_back(self):
        store.save("pomodoro", {"score": 12, "streak": 3})

        self.assertEqual(store.load("pomodoro"), {"score": 12, "streak": 3})

    def test_an_app_that_has_never_run_gets_its_default(self):
        self.assertEqual(store.load("pomodoro", blank), {"seen": []})

    def test_two_apps_starting_empty_do_not_share_one_default(self):
        first = store.load("poll", blank)
        first["seen"].append("q1")

        self.assertEqual(store.load("pomodoro", blank), {"seen": []})

    def test_a_file_a_power_cut_truncated_reads_as_nothing_saved(self):
        with open(store.path_for("pomodoro"), "w") as handle:
            handle.write('{"score": 1')

        self.assertEqual(store.load("pomodoro", blank), {"seen": []})

    def test_a_saved_shape_the_app_no_longer_understands_reads_as_default(self):
        store.save("pomodoro", ["not", "a", "dict"])

        def clean(raw):
            return {"score": raw["score"]}

        self.assertEqual(store.load("pomodoro", blank, clean=clean), {"seen": []})

    def test_the_cleaner_decides_what_is_worth_keeping(self):
        def clean(raw):
            return {"score": int(raw.get("score", 0))}

        store.save("pomodoro", {"score": 9, "junk": object()}, clean=clean)

        self.assertEqual(store.load("pomodoro", clean=clean), {"score": 9})

    def test_a_save_leaves_no_temporary_file_behind(self):
        store.save("pomodoro", {"score": 1})

        self.assertEqual(os.listdir(self.tmp.name), ["pomodoro.json"])

    def test_a_second_save_replaces_the_first_rather_than_appending(self):
        store.save("pomodoro", {"score": 1})
        store.save("pomodoro", {"score": 2})

        with open(store.path_for("pomodoro")) as handle:
            self.assertEqual(json.load(handle), {"score": 2})

    def test_a_write_that_cannot_land_is_reported_not_raised(self):
        store._set_dir(os.path.join(self.tmp.name, "nope", "deeper"))

        self.assertFalse(store.save("pomodoro", {"score": 1}))
        self.assertEqual(store.load("pomodoro", blank), {"seen": []})

    def test_a_failed_write_leaves_the_previous_state_readable(self):
        store.save("pomodoro", {"score": 1})
        # A value json cannot serialise fails after the temp file is opened,
        # which is the moment the old file must still be standing.
        self.assertFalse(store.save("pomodoro", {"score": {1, 2}}))

        self.assertEqual(store.load("pomodoro"), {"score": 1})

    def test_forgetting_a_badge_drops_what_it_remembered(self):
        store.save("pomodoro", {"score": 1})

        self.assertTrue(store.forget("pomodoro"))
        self.assertEqual(store.load("pomodoro", blank), {"seen": []})

    def test_forgetting_what_was_never_saved_is_not_an_error(self):
        self.assertFalse(store.forget("pomodoro"))


if __name__ == "__main__":
    unittest.main()
