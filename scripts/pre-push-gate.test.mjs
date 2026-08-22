import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildSteps, resolveSkips } from "./pre-push-gate.mjs";

const allPresent = {
  hasMigrations: true,
  hasE2ESpecs: true,
  hasWebTests: true,
  hasPreviewRecorder: true,
};

test("steps run cheapest and most likely to fail first", () => {
  const names = buildSteps({ e2ePort: 3001 }).map((step) => step.name);
  assert.equal(names[0], "Format");
  assert.equal(names[1], "Device constants");
  assert.equal(names.at(-1), "E2E tests");
  assert.ok(names.indexOf("Web lint") < names.indexOf("Web typecheck"));
  assert.ok(names.indexOf("Web typecheck") < names.indexOf("Web unit tests"));
  assert.ok(names.indexOf("Web unit tests") < names.indexOf("Web build"));
});

test("the e2e step runs on the port it was given", () => {
  const e2e = buildSteps({ e2ePort: 3003 }).find((step) => step.name === "E2E tests");
  assert.match(e2e.command, /PORT=3003/);
});

test("a step with nothing to run is skipped, with a reason", () => {
  const steps = buildSteps({ e2ePort: 3001 });
  const skips = resolveSkips(steps, { ...allPresent, hasMigrations: false });
  assert.match(skips.get("Database tests (pgTAP)"), /no migrations/);
});

test("strict mode turns every skip into a failure", () => {
  const steps = buildSteps({ e2ePort: 3001 });
  const skips = resolveSkips(steps, { ...allPresent, hasE2ESpecs: false }, { isStrict: true });
  assert.equal(skips.size, 0);
});

test("nothing is skipped when every input is present", () => {
  const skips = resolveSkips(buildSteps({ e2ePort: 3001 }), allPresent);
  assert.equal(skips.size, 0);
});
