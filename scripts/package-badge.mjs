#!/usr/bin/env node
/**
 * Copies the two apps and the SDK onto a badge in disk mode.
 *
 * The launcher lists every folder holding an icon.png and names the tile from
 * the folder, turning underscores into spaces and capitalising each word.
 * There is no title field, so the deployed folder name is the label, which is
 * why notifier-app ships as Notifier rather than under its repo slug.
 *
 * Writes to /Volumes/TUFTY by default, or to --out for a dry run.
 *
 *   pnpm badge:package
 *   pnpm badge:package -- --out dist/badge
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = "/Volumes/TUFTY";

/** Repo folder to the name the launcher will show. */
const APPS = {
  "device/notifier-app": "Notifier",
  "device/pomodoro-app": "Pomodoro",
};

const SDK_SOURCE = "device/badge-sdk/sb";
const SDK_TARGET = "badge/sdk/sb";

// Never shipped: test-only packages, caches, and the host tooling that imports
// them. Device code is stdlib-only, and a tests folder on the badge is bytes
// that cannot run.
const SKIP = new Set(["tests", "tools", "__pycache__"]);

/**
 * Nothing beginning with a dot reaches a badge.
 *
 * A coverage run left a 52K .coverage beside the app and the packager copied
 * it onto a device with 2MB of flash. Naming each offender as it appears is
 * how the next one gets shipped too; the badge needs no dotfile at all.
 */
function isHidden(name) {
  return name.startsWith(".");
}

function readTarget() {
  const index = process.argv.indexOf("--out");
  if (index === -1) return { path: DEFAULT_TARGET, isVolume: true };
  const value = process.argv[index + 1];
  if (!value) {
    process.stderr.write("--out needs a path\n");
    process.exit(2);
  }
  return { path: join(root, value), isVolume: false };
}

/**
 * macOS writes an AppleDouble `._` file beside every real file on a FAT
 * volume unless COPYFILE_DISABLE is set, and the launcher tries to load
 * `._notifier.py` as an app. Belt and braces: the env var is set for the copy
 * and anything that got through is swept afterwards.
 */
function sweep(directory) {
  let removed = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.name.startsWith("._") || entry.name === ".DS_Store") {
      rmSync(full, { force: true, recursive: true });
      removed += 1;
      continue;
    }
    if (entry.isDirectory()) removed += sweep(full);
  }
  return removed;
}

function copyTree(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const name = source.split("/").pop() ?? "";
      return !SKIP.has(name) && !isHidden(name);
    },
  });
}

function main() {
  const { path: target, isVolume } = readTarget();

  // A badge has to be mounted; a dry-run directory is ours to create.
  if (isVolume && !existsSync(target)) {
    process.stderr.write(
      `${target} is not mounted.\n\n` +
        "Put the badge in disk mode: hold BOOT, tap RESET, release BOOT.\n" +
        "A drive named TUFTY should appear. Its root is the device's /system.\n\n" +
        "For a dry run without a badge: pnpm badge:package -- --out dist/badge\n",
    );
    process.exit(1);
  }
  if (!isVolume) mkdirSync(target, { recursive: true });

  process.env.COPYFILE_DISABLE = "1";

  for (const [source, label] of Object.entries(APPS)) {
    const from = join(root, source);
    const to = join(target, "apps", label);

    if (!existsSync(join(from, "icon.png"))) {
      process.stderr.write(
        `${source} has no icon.png, so the launcher would not list it.\n` +
          "Run: python3 scripts/gen-icons.py\n",
      );
      process.exit(1);
    }

    rmSync(to, { recursive: true, force: true });
    mkdirSync(to, { recursive: true });
    copyTree(from, to);
    process.stdout.write(`${source} -> apps/${label}\n`);
  }

  const sdkTo = join(target, SDK_TARGET);
  rmSync(sdkTo, { recursive: true, force: true });
  mkdirSync(dirname(sdkTo), { recursive: true });
  copyTree(join(root, SDK_SOURCE), sdkTo);
  process.stdout.write(`${SDK_SOURCE} -> ${SDK_TARGET}\n`);

  const removed = sweep(target);
  if (removed > 0) process.stdout.write(`swept ${removed} AppleDouble files\n`);

  const total = countFiles(target);
  process.stdout.write(`\n${total} files on ${relative(root, target) || target}.\n`);

  if (isVolume) {
    process.stdout.write("Eject before unplugging: diskutil eject /Volumes/TUFTY\n");
  }
}

function countFiles(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else if (statSync(full).isFile()) count += 1;
  }
  return count;
}

main();
