import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes


class TestFakeRequests(unittest.TestCase):
    def setUp(self):
        fakes.fake_requests.calls = []
        fakes.fake_requests.handler = None

    def test_request_records_call_and_delegates_to_handler(self):
        fakes.fake_requests.handler = lambda m, u, h, d: fakes.FakeResponse(200, {"ok": True})
        r = fakes.fake_requests.request("GET", "https://x/", headers={"a": "b"}, data="{}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"ok": True})
        self.assertEqual(len(fakes.fake_requests.calls), 1)
        self.assertEqual(fakes.fake_requests.calls[0]["url"], "https://x/")
        self.assertEqual(fakes.fake_requests.calls[0]["headers"], {"a": "b"})

    def test_request_without_handler_fails_loudly(self):
        with self.assertRaises(AssertionError):
            fakes.fake_requests.request("GET", "https://x/")

    def test_response_without_payload_has_empty_content(self):
        r = fakes.FakeResponse(204)
        self.assertEqual(r.content, b"")
        r.close()
        self.assertTrue(r.closed)


class TestFakeScreen(unittest.TestCase):
    def test_records_pen_clear_and_text(self):
        s = fakes.FakeScreen()
        s.pen = ("rgb", 1, 2, 3)
        s.clear()
        s.text("Hi", 24, 50, 8)
        self.assertEqual(s.calls[0], ("pen", ("rgb", 1, 2, 3)))
        self.assertEqual(s.calls[1], ("clear",))
        self.assertEqual(s.calls[2], ("text", "Hi", 24, 50, 8))
        self.assertEqual(s.pen, ("rgb", 1, 2, 3))

    def test_text_size_defaults_to_six(self):
        s = fakes.FakeScreen()
        s.text("Hi", 1, 2)
        self.assertEqual(s.calls[0], ("text", "Hi", 1, 2, 6))

    def test_shape_calls_are_recorded(self):
        s = fakes.FakeScreen()
        s.shape(("rect", 0, 0, 6, 6))
        self.assertEqual(s.calls[0], ("shape", ("rect", 0, 0, 6, 6)))

    def test_direct_badgeware_primitives_are_recorded(self):
        s = fakes.FakeScreen()
        s.rectangle(1, 2, 3, 4)
        s.circle(5, 6, 7)
        s.line(8, 9, 10, 11)
        self.assertEqual(s.calls[0], ("rectangle", 1, 2, 3, 4))
        self.assertEqual(s.calls[1], ("circle", 5, 6, 7))
        self.assertEqual(s.calls[2], ("line", 8, 9, 10, 11))


class TestFakeBadge(unittest.TestCase):
    def test_ticks_advance(self):
        fakes.fake_badge.ticks = 1000
        returned = fakes.fake_badge.advance(250)
        self.assertEqual(fakes.fake_badge.ticks, 1250)
        self.assertEqual(returned, 1250)

    def test_buttons_report_false(self):
        buttons = (
            fakes.fake_badge.BUTTON_A,
            fakes.fake_badge.BUTTON_B,
            fakes.fake_badge.BUTTON_C,
            fakes.fake_badge.BUTTON_UP,
            fakes.fake_badge.BUTTON_DOWN,
            fakes.fake_badge.BUTTON_HOME,
        )
        for button in buttons:
            self.assertFalse(fakes.fake_badge.pressed(button))
            self.assertFalse(fakes.fake_badge.held(button))
            self.assertFalse(fakes.fake_badge.released(button))
            self.assertFalse(fakes.fake_badge.changed(button))

    def test_uid_is_present(self):
        self.assertTrue(fakes.fake_badge.uid)

    def test_display_mode_is_remembered(self):
        fakes.fake_badge.mode(0b11)
        self.assertEqual(fakes.fake_badge.mode(), 0b11)


class TestRunCapture(unittest.TestCase):
    def test_run_captures_the_update_function(self):
        def update():
            pass

        fakes.run(update)
        self.assertIs(fakes.run.update, update)


class TestRuntimeStubs(unittest.TestCase):
    def test_stub_modules_import_cleanly(self):
        import badge  # noqa: F401
        import color  # noqa: F401
        import font  # noqa: F401
        import mat3  # noqa: F401
        import rtc  # noqa: F401
        import shape  # noqa: F401

    def test_image_is_not_importable(self):
        # BadgeOS injects `image` into an app's namespace; there is no module
        # to import on the badge. A stub here made `import image` work under
        # test and fail on hardware, which is how the avatar reached the device
        # and never drew. Views take it as an argument instead.
        with self.assertRaises(ImportError):
            import image  # noqa: F401

    def test_stub_modules_are_plain_namespaces(self):
        import shape

        shape.rectangle = lambda x, y, w, h: ("rect", x, y, w, h)
        self.assertEqual(shape.rectangle(1, 2, 3, 4), ("rect", 1, 2, 3, 4))


if __name__ == "__main__":
    unittest.main()
