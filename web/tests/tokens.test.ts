import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Consistency that depends on remembering is consistency that ends after the
 * fourth screen. This walks web/ and fails on any raw colour, radius, or
 * duration outside the primitives file.
 */

const WEB_ROOT = join(import.meta.dirname, "..");
const PRIMITIVES = join(WEB_ROOT, "app", "tokens.css");

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".svg"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "coverage", "tests"]);

const GENERATED_FILES = new Set([
  // Generated from device-constants.json, and pixel values are the point of it.
  join(WEB_ROOT, "lib", "badge-constants.ts"),
  // The favicon is fetched without the stylesheet, so a var() here would
  // render nothing. Its values are checked against the primitives below
  // instead, which is what stops it drifting.
  join(WEB_ROOT, "app", "icon.svg"),
]);

const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_FUNCTION_COLOUR = /\b(rgb|rgba|hsl|hsla|oklch|oklab)\s*\(/;
const RAW_RADIUS = /border-radius\s*:\s*[^;]*\d+(px|rem|em)/;
const RAW_RADIUS_CLASS = /\brounded-\[[^\]]+\]/;
const RAW_DURATION = /(transition|animation)[a-zA-Z-]*\s*:\s*[^;]*\b\d+m?s\b/;
const RAW_DURATION_CLASS = /\bduration-\[[^\]]+\]/;

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "a hex colour", pattern: RAW_HEX },
  { name: "an rgb(), hsl(), or oklch() colour", pattern: RAW_FUNCTION_COLOUR },
  { name: "a raw border-radius", pattern: RAW_RADIUS },
  { name: "an arbitrary rounded-[] class", pattern: RAW_RADIUS_CLASS },
  { name: "a raw transition or animation duration", pattern: RAW_DURATION },
  { name: "an arbitrary duration-[] class", pattern: RAW_DURATION_CLASS },
];

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walk(full);
    } else if (SCANNED_EXTENSIONS.has(extname(entry.name))) {
      yield full;
    }
  }
}

function scannedFiles(): string[] {
  return [...walk(WEB_ROOT)].filter((path) => path !== PRIMITIVES && !GENERATED_FILES.has(path));
}

/** Line, one-indexed, of the first line matching `pattern`. */
function findOffence(source: string, pattern: RegExp): string | null {
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    if (pattern.test(line)) return `line ${index + 1}: ${line.trim()}`;
  }
  return null;
}

describe("the token system", () => {
  const files = scannedFiles();

  it("scans something, so a broken walk cannot pass silently", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rule of RULES) {
    it(`finds no ${rule.name} outside the primitives file`, () => {
      const offences: string[] = [];
      for (const path of files) {
        const offence = findOffence(readFileSync(path, "utf8"), rule.pattern);
        if (offence) offences.push(`${relative(WEB_ROOT, path)} ${offence}`);
      }
      expect(offences).toEqual([]);
    });
  }

  it("defines the complete light palette before any theme block", () => {
    // In the theme block, not a bare :root. Tailwind generates a utility only
    // for what the theme block declares, so a semantic sitting in :root is a
    // custom property no class can reach. The guarantee is unchanged: every
    // colour is defined once up front, and a theme only ever redefines.
    const primitives = readFileSync(PRIMITIVES, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const bareRoot = primitives.slice(
      primitives.indexOf("@theme {"),
      primitives.indexOf("@media (prefers-color-scheme: dark)"),
    );
    for (const token of [
      "--color-background",
      "--color-surface",
      "--color-raised",
      "--color-ink",
      "--color-ink-muted",
      "--color-border",
      "--color-border-strong",
      "--color-accent",
      "--color-accent-ink",
      "--color-positive",
      "--color-caution",
      "--color-critical",
      "--color-focus",
    ]) {
      expect(bareRoot, `${token} must be defined on bare :root`).toContain(`${token}:`);
    }
  });

  it("redefines nothing in a theme block that bare :root did not define first", () => {
    // Comments mention :root by name, so they are stripped before splitting.
    const primitives = readFileSync(PRIMITIVES, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const dark = primitives.indexOf("@media (prefers-color-scheme: dark)");
    const bareRoot = primitives.slice(primitives.indexOf("@theme {"), dark);
    const themed = primitives.slice(dark);

    const declared = new Set(bareRoot.match(/--color-[a-z-]+(?=:)/g) ?? []);
    const remapped = themed.match(/--color-[a-z-]+(?=:)/g) ?? [];

    for (const token of remapped) {
      expect(declared.has(token), `${token} has its only definition in a theme block`).toBe(true);
    }
  });

  it("draws the favicon in colours the primitives file actually declares", () => {
    // It cannot use a var(), so this is what keeps it the same bird.
    const primitives = readFileSync(PRIMITIVES, "utf8").toLowerCase();
    const favicon = readFileSync(join(WEB_ROOT, "app", "icon.svg"), "utf8").toLowerCase();

    const used = new Set(favicon.match(/#[0-9a-f]{6}/g) ?? []);
    expect(used.size).toBeGreaterThan(0);
    for (const colour of used) {
      expect(primitives, `${colour} is in the favicon but not a primitive`).toContain(colour);
    }
  });

  it("guards the explicit light choice against the dark media query", () => {
    const primitives = readFileSync(PRIMITIVES, "utf8");
    expect(primitives).toContain(':root:not([data-theme="light"])');
    expect(primitives).toContain(':root[data-theme="dark"]');
  });
});
