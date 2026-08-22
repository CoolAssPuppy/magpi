import { test } from "node:test";
import assert from "node:assert/strict";

import { missingImporters, planDeploy } from "./functions-deploy-plan.mjs";

const FUNCTIONS = ["admin", "gateway", "device-poll"];
const IMPORTERS = ["admin", "gateway", "device-poll"];
const base = "api/supabase/functions";

test("deploys only the functions whose own files changed", () => {
  const deploy = planDeploy({
    changedPaths: [`${base}/gateway/index.ts`],
    functions: FUNCTIONS,
    importers: IMPORTERS,
  });
  assert.deepEqual(deploy, ["gateway"]);
});

test("a _shared change redeploys every importer", () => {
  const deploy = planDeploy({
    changedPaths: [`${base}/_shared/gateway_port.ts`],
    functions: FUNCTIONS,
    importers: IMPORTERS,
  });
  assert.deepEqual(deploy, ["admin", "device-poll", "gateway"]);
});

test("a non-importer is left alone by a _shared change", () => {
  const deploy = planDeploy({
    changedPaths: [`${base}/_shared/x.ts`],
    functions: ["admin", "gateway", "standalone"],
    importers: ["admin", "gateway"],
  });
  assert.deepEqual(deploy, ["admin", "gateway"]);
});

test("no function change means nothing to deploy", () => {
  const deploy = planDeploy({
    changedPaths: ["web/lib/db.ts"],
    functions: FUNCTIONS,
    importers: IMPORTERS,
  });
  assert.deepEqual(deploy, []);
});

test("guard passes when the deployed set covers every importer", () => {
  const missing = missingImporters({
    changedPaths: [`${base}/_shared/x.ts`],
    importers: IMPORTERS,
    deployed: ["admin", "gateway", "device-poll"],
  });
  assert.deepEqual(missing, []);
});

test("guard flags an importer a _shared change would leave stale", () => {
  // The Sparkle failure: _shared changed, but the deployed set (e.g. a diff
  // against a cancelled run's SHA) omits gateway. The job must not land green.
  const missing = missingImporters({
    changedPaths: [`${base}/_shared/gateway_port.ts`],
    importers: IMPORTERS,
    deployed: ["admin"],
  });
  assert.deepEqual(missing, ["gateway", "device-poll"]);
});

test("guard ignores coverage when _shared did not change", () => {
  const missing = missingImporters({
    changedPaths: [`${base}/gateway/index.ts`],
    importers: IMPORTERS,
    deployed: [],
  });
  assert.deepEqual(missing, []);
});
