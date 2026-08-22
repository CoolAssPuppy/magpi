/**
 * The Python suites under device/.
 *
 * One list, imported by both python-tests.mjs and python-coverage.mjs, so a
 * new suite cannot be tested and silently not measured.
 */
export const DEVICE_SUITES = [
  "device/badge-sdk",
  "device/notifier-app",
  "device/pomodoro-app",
  "device/testing",
];

/** How every one of them is discovered. Uniform on purpose. */
export const DISCOVER = ["-m", "unittest", "discover", "-s", "tests"];

/**
 * The suites coverage is measured against.
 *
 * device/testing is the test harness itself: fakes, the seam stub, and the
 * block reader that lets a test assert drawn type. It is exercised by every
 * other suite here, and it still runs under `pnpm device:test`. Holding a
 * harness to a product coverage bar measures the wrong thing, and the number
 * it produces is meaningless either way, because each suite is measured on its
 * own and the helpers do their work inside the others.
 */
export const MEASURED_SUITES = DEVICE_SUITES.filter((suite) => suite !== "device/testing");

/**
 * Not measured inside a suite.
 *
 * `__init__.py` is each app's firmware seam. It is the one file that touches
 * BadgeOS globals and sets up sys.path for a badge, so it cannot execute under
 * CPython at all: the three-file split exists precisely to keep that wiring in
 * one place and everything else testable off-device. Counting lines that
 * physically cannot run turns the threshold into a number nobody can move.
 *
 * `tools/` is host-only tooling, chiefly the recorder that replays the real
 * pages into the web preview fixtures. It never reaches a badge, which is why
 * package-badge.mjs skips it too, and it is exercised by
 * `pnpm previews:fixtures:check` on every run of the gate.
 */
export const OMIT = ["tests/*", "tools/*", "__init__.py"];
