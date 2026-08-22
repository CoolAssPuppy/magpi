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

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "coverage", "tests"]);

/** Generated from device-constants.json, and pixel values are the point of it. */
const GENERATED_FILES = new Set([join(WEB_ROOT, "lib", "badge-constants.ts")]);

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

  it("defines the complete light palette on bare :root", () => {
    const primitives = readFileSync(PRIMITIVES, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const bareRoot = primitives.slice(
      primitives.indexOf(":root {"),
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
    const [, ...themeBlocks] = primitives.split(":root");
    const bareRoot = themeBlocks[0] ?? "";
    const themed = themeBlocks.slice(1).join("\n");

    const declared = new Set(bareRoot.match(/--color-[a-z-]+(?=:)/g) ?? []);
    const remapped = themed.match(/--color-[a-z-]+(?=:)/g) ?? [];

    for (const token of remapped) {
      expect(declared.has(token), `${token} has its only definition in a theme block`).toBe(true);
    }
  });

  it("guards the explicit light choice against the dark media query", () => {
    const primitives = readFileSync(PRIMITIVES, "utf8");
    expect(primitives).toContain(':root:not([data-theme="light"])');
    expect(primitives).toContain(':root[data-theme="dark"]');
  });
});
