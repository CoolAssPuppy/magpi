#!/usr/bin/env node
/**
 * Copies the two apps, the SDK, and the gateway config onto a badge in disk
 * mode.
 *
 * The launcher lists every folder under /system/apps holding an __init__.py,
 * and names the tile from the folder, turning underscores into spaces and
 * capitalising each word. There is no title field, so the deployed folder name
 * is the label, which is why notifier-app ships as Notifier rather than under
 * its repo slug. icon.png is optional to the launcher and required here: an app
 * without one gets the default grey square.
 *
 * Writes to /Volumes/TUFTY by default, or to --out for a dry run.
 *
 *   doppler run -- pnpm badge:package
 *   pnpm badge:package -- --out dist/badge
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = "/Volumes/TUFTY";

/**
 * Repo folder to the name the launcher will show.
 *
 * The launcher sorts on this name and offers nothing else to sort by, so the
 * name is also the position. Magpi and Pomodoro are adjacent in codepoint
 * order and ahead of every lowercase folder, which is what the stock apps use.
 *
 * Magpi rather than Notifier because that is what every screen the wearer
 * reads already calls it, DEPLOY.md included. Notifier stays the name of the
 * code.
 */
const APPS = {
  "device/notifier-app": "Magpi",
  "device/pomodoro-app": "Pomodoro",
};

const SDK_SOURCE = "device/badge-sdk/sb";
const SDK_TARGET = "badge/sdk/sb";
// Read by sb and by sb.net, both on their first line of network code. Written
// here rather than committed, because the origin is per-deployment and a badge
// without this file cannot open either app: DevicePort() opens it before it
// touches the radio, and the launcher catches the resulting OSError and shows a
// traceback.
const CONFIG_TARGET = "badge/config.json";

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|\[?::1\]?)$/i;

/** The same URL with the loopback host swapped for a placeholder LAN address. */
function lanHint(gateway) {
  const url = new URL(gateway);
  url.hostname = "192.168.1.20";
  return url.toString().replace(/\/+$/, "");
}

/**
 * The one thing a badge has to be told: where the gateway lives.
 *
 * FUNCTIONS_BASE_URL is the name the edge functions already use for their own
 * public origin, so `doppler run -- pnpm badge:package` needs no new secret.
 * MAGPI_GATEWAY overrides it, which is how a badge gets pointed at a laptop
 * running the stack locally.
 *
 * `env` is passed in rather than read, so this is testable.
 */
export function gatewayConfig(env) {
  const named =
    env.MAGPI_GATEWAY ||
    env.FUNCTIONS_BASE_URL ||
    (env.NEXT_PUBLIC_SUPABASE_URL ? `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1` : "");

  if (!named) {
    throw new Error(
      "No gateway origin. Set MAGPI_GATEWAY, or run this under Doppler so\n" +
        "FUNCTIONS_BASE_URL is in the environment:\n\n" +
        "  doppler run -- pnpm badge:package\n",
    );
  }

  // Trailing slash stripped here rather than at every call site: sb builds
  // `gateway + "/gateway/desk"` and the gateway matches on the exact path, so a
  // double slash is a 404 the badge reports as "Cannot reach server".
  const gateway = named.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(gateway)) {
    throw new Error(`Gateway must start with http:// or https://, got: ${gateway}\n`);
  }

  // Doppler's dev config names the local stack as 127.0.0.1, which is correct
  // for everything that runs on this machine and unreachable from a badge:
  // there, loopback is the badge's own. Caught here because the badge reports
  // it as "Cannot reach server", which reads like a server that is down.
  if (LOOPBACK.test(new URL(gateway).hostname)) {
    throw new Error(
      `${gateway} is this machine's loopback, which on a badge means the badge.\n\n` +
        "For the deployed stack:\n" +
        "  doppler run --config prd -- pnpm badge:package\n\n" +
        "For the stack on this machine, name it by its LAN address instead:\n" +
        `  MAGPI_GATEWAY=${lanHint(gateway)} pnpm badge:package\n`,
    );
  }

  const config = { gateway };

  // Optional, and only written when set. An empty cert_sha256 alongside
  // require_pin is a badge that refuses every request it makes.
  const pin = env.MAGPI_CERT_SHA256;
  if (pin) config.cert_sha256 = pin.toLowerCase();
  if (env.MAGPI_REQUIRE_PIN === "true") config.require_pin = true;

  return config;
}

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

  // Resolved before anything is written. A badge half-copied and then refused
  // is a badge whose apps are newer than its SDK.
  let config;
  try {
    config = gatewayConfig(process.env);
  } catch (error) {
    process.stderr.write(`${error.message}`);
    process.exit(1);
  }

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

  const configTo = join(target, CONFIG_TARGET);
  writeFileSync(configTo, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`${CONFIG_TARGET} -> ${config.gateway}\n`);

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

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
