import { strict as assert } from "node:assert";
import { test } from "node:test";

import { renderPython, renderTypeScript, validate } from "./gen-device-constants.mjs";

const sample = {
  SCREEN_W: 320,
  PAGE_SLUGS: ["next_thing", "day_shape"],
  POMODORO_LEDS: true,
};

test("python output declares every constant", () => {
  const python = renderPython(sample);
  assert.match(python, /^SCREEN_W = 320$/m);
  assert.match(python, /^PAGE_SLUGS = \("next_thing", "day_shape"\)$/m);
  assert.match(python, /^POMODORO_LEDS = True$/m);
});

test("typescript output declares every constant as a const", () => {
  const ts = renderTypeScript(sample);
  assert.match(ts, /^export const SCREEN_W = 320;$/m);
  assert.match(ts, /^export const PAGE_SLUGS = \["next_thing", "day_shape"\] as const;$/m);
  assert.match(ts, /^export const POMODORO_LEDS = true;$/m);
});

test("both outputs warn against hand editing", () => {
  assert.match(renderPython(sample), /Do not edit by hand/);
  assert.match(renderTypeScript(sample), /Do not edit by hand/);
});

test("validate rejects a float", () => {
  assert.throws(() => validate({ SCREEN_W: 1.5 }), /must be an integer/);
});

test("validate rejects a nested object", () => {
  assert.throws(() => validate({ POMODORO: { work: 25 } }), /unsupported value/);
});

test("validate rejects a mixed array", () => {
  assert.throws(() => validate({ PAGE_SLUGS: ["a", 1] }), /strings/);
});

test("validate accepts integers, booleans, and string arrays", () => {
  assert.doesNotThrow(() => validate(sample));
});
