import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs fake requests before sb is imported)
from sb.poller import Poller


class TestPoller(unittest.TestCase):
    def test_first_tick_fetches_immediately(self):
        p = Poller(lambda: "data", interval_ms=5000)
        self.assertEqual(p.tick(0), "data")
        self.assertIsNone(p.error)
        self.assertFalse(p.loading)

    def test_tick_within_interval_returns_cached_value(self):
        calls = []

        def fn():
            calls.append(1)
            return len(calls)

        p = Poller(fn, interval_ms=5000)
        self.assertEqual(p.tick(1000), 1)
        self.assertEqual(p.tick(2000), 1)
        self.assertEqual(p.tick(5999), 1)
        self.assertEqual(len(calls), 1)

    def test_tick_after_interval_refetches(self):
        calls = []

        def fn():
            calls.append(1)
            return len(calls)

        p = Poller(fn, interval_ms=5000)
        p.tick(0)
        self.assertEqual(p.tick(5000), 2)
        self.assertEqual(p.tick(10001), 3)

    def test_error_is_captured_and_value_preserved(self):
        state = {"fail": False}

        def fn():
            if state["fail"]:
                raise RuntimeError("boom")
            return "ok"

        p = Poller(fn, interval_ms=1000)
        p.tick(0)
        state["fail"] = True
        self.assertEqual(p.tick(1000), "ok")
        self.assertIsInstance(p.error, RuntimeError)
        self.assertFalse(p.loading)

    def test_loading_starts_true(self):
        p = Poller(lambda: None)
        self.assertTrue(p.loading)
        self.assertIsNone(p.value)


class FailingFn:
    """Fails until told otherwise, counting the fetches it was asked for."""

    def __init__(self, error=None):
        self.error = error or RuntimeError("boom")
        self.calls = 0

    def __call__(self):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return "ok"


class TestPollerBackoff(unittest.TestCase):
    def test_interval_doubles_on_consecutive_errors(self):
        fn = FailingFn()
        p = Poller(fn, interval_ms=1000)
        p.tick(0)
        self.assertEqual(fn.calls, 1)

        # First failure: the next fetch waits 2000ms, not 1000ms.
        p.tick(1999)
        self.assertEqual(fn.calls, 1)
        p.tick(2000)
        self.assertEqual(fn.calls, 2)

        # Second failure: 4000ms.
        p.tick(5999)
        self.assertEqual(fn.calls, 2)
        p.tick(6000)
        self.assertEqual(fn.calls, 3)

        # Third failure: 8000ms.
        p.tick(13999)
        self.assertEqual(fn.calls, 3)
        p.tick(14000)
        self.assertEqual(fn.calls, 4)

    def test_backoff_is_capped(self):
        fn = FailingFn()
        p = Poller(fn, interval_ms=1000, max_backoff_ms=4000)
        now = 0
        for _ in range(10):
            p.tick(now)
            now += 100000
        self.assertEqual(p.delay(), 4000)

    def test_success_resets_the_backoff(self):
        fn = FailingFn()
        p = Poller(fn, interval_ms=1000)
        p.tick(0)
        p.tick(2000)
        self.assertEqual(p.delay(), 4000)

        fn.error = None
        p.tick(6000)
        self.assertEqual(p.value, "ok")
        self.assertIsNone(p.error)
        self.assertEqual(p.errors, 0)
        self.assertEqual(p.delay(), 1000)
        p.tick(7000)
        self.assertEqual(fn.calls, 4)

    def test_rate_limited_retry_after_is_honoured_when_longer(self):
        class RateLimited(Exception):
            retry_after = 30

        fn = FailingFn(RateLimited())
        p = Poller(fn, interval_ms=1000)
        p.tick(0)
        self.assertEqual(p.delay(), 30000)
        p.tick(29999)
        self.assertEqual(fn.calls, 1)
        p.tick(30000)
        self.assertEqual(fn.calls, 2)

    def test_backoff_wins_when_longer_than_retry_after(self):
        class RateLimited(Exception):
            retry_after = 1

        p = Poller(FailingFn(RateLimited()), interval_ms=10000)
        p.tick(0)
        self.assertEqual(p.delay(), 20000)

    def test_junk_retry_after_is_ignored(self):
        class Weird(Exception):
            retry_after = "soon"

        p = Poller(FailingFn(Weird()), interval_ms=1000)
        p.tick(0)
        self.assertEqual(p.delay(), 2000)

    def test_healthy_polling_keeps_the_plain_interval(self):
        p = Poller(lambda: "data", interval_ms=5000)
        p.tick(0)
        self.assertEqual(p.delay(), 5000)
        self.assertEqual(p.errors, 0)


if __name__ == "__main__":
    unittest.main()
