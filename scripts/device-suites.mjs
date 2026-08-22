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
