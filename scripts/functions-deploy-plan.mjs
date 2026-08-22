#!/usr/bin/env node
/**
 * Which edge functions a push must redeploy, and the guard that a _shared
 * change never leaves an importer stale on prod.
 *
 * _shared is a library every function bundles at deploy time, so editing it
 * changes prod only once its importers are redeployed. A cancelled or flaky run
 * that skips that redeploy leaves prod stale while git looks shipped; that hid
 * Sparkle's broken route for a day. CI diffs against the last *deployed* commit
 * (a marker tag, not github.event.before, which a cancelled run makes lie).
 *
 *   plan  --base <ref> --head <ref>              print the functions to deploy
 *   guard --base <ref> --head <ref> --deployed … exit 1 if a _shared change
 *                                                left any importer undeployed
 *
 * With no --base (first run / lost marker) plan prints every function.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS_REL = "api/supabase/functions";
const SHARED = "_shared";

/** Every function dir under the functions root, `_shared` excluded. */
export function listFunctions(functionsDir) {
  return readdirSync(functionsDir)
    .filter((name) => name !== SHARED)
    .filter((name) => {
      try {
        return statSync(join(functionsDir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

/** Functions whose source imports `_shared`, so a _shared edit reaches them. */
export function sharedImporters(functionsDir, functions = listFunctions(functionsDir)) {
  return functions.filter((name) => importsShared(join(functionsDir, name)));
}

function importsShared(dir) {
  for (const file of walk(dir)) {
    if (/\.[cm]?[jt]sx?$/.test(file) && readFileSync(file, "utf8").includes(`${SHARED}/`)) {
      return true;
    }
  }
  return false;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** True if any changed path is under functions/_shared/. */
export function sharedChangedIn(changedPaths) {
  return changedPaths.some((p) => p.startsWith(`${FUNCTIONS_REL}/${SHARED}/`));
}

/**
 * The functions to redeploy for a set of changed paths (repo-relative, forward
 * slashes). A _shared change pulls in every importer; otherwise only the
 * functions whose own files changed.
 */
export function planDeploy({ changedPaths, functions, importers }) {
  const prefix = `${FUNCTIONS_REL}/`;
  const directlyChanged = functions.filter((name) =>
    changedPaths.some((p) => p.startsWith(`${prefix}${name}/`)),
  );
  const deploy = sharedChangedIn(changedPaths)
    ? [...new Set([...importers, ...directlyChanged])]
    : directlyChanged;
  return deploy.sort();
}

/**
 * Importers a _shared change requires but that are absent from `deployed`. The
 * guard: non-empty means the job would land green with stale functions on prod.
 */
export function missingImporters({ changedPaths, importers, deployed }) {
  if (!sharedChangedIn(changedPaths)) return [];
  const set = new Set(deployed);
  return importers.filter((name) => !set.has(name));
}

function changedPathsFromGit(base, head) {
  if (!base) return null;
  const out = execFileSync(
    "git",
    ["diff", "--name-only", base, head, "--", `:(top)${FUNCTIONS_REL}/`],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const flags = Object.fromEntries(
    argv
      .slice(1)
      .flatMap((arg, i, all) => (arg.startsWith("--") ? [[arg.slice(2), all[i + 1]]] : [])),
  );
  return { mode, flags };
}

function main() {
  const { mode, flags } = parseArgs();
  const functionsDir = join(REPO_ROOT, FUNCTIONS_REL);
  const functions = listFunctions(functionsDir);
  const importers = sharedImporters(functionsDir, functions);
  const changedPaths = changedPathsFromGit(flags.base ?? "", flags.head ?? "HEAD");

  if (mode === "guard") {
    // No baseline means plan deployed everything; nothing can be stale.
    const missing =
      changedPaths === null
        ? []
        : missingImporters({
            changedPaths,
            importers,
            deployed: (flags.deployed ?? "").split(/\s+/).filter(Boolean),
          });
    if (missing.length) {
      process.stderr.write(
        `_shared changed but these importers were not redeployed: ${missing.join(", ")}\n`,
      );
      process.exit(1);
    }
    return;
  }

  // Default: plan.
  const deploy =
    changedPaths === null ? functions : planDeploy({ changedPaths, functions, importers });
  process.stdout.write(deploy.length ? `${deploy.join("\n")}\n` : "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
