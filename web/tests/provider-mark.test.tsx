import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderMark } from "@/components/provider-mark";

const KNOWN_SLUGS = ["google", "linear", "slack", "notion", "github", "vercel", "posthog"];

function glyphPathFor(slug: string): string {
  const { container, unmount } = render(<ProviderMark slug={slug} />);
  const path = container.querySelector("path")?.getAttribute("d");
  unmount();
  if (!path) throw new Error(`${slug} drew no glyph`);
  return path;
}

describe("the provider column", () => {
  it.each(KNOWN_SLUGS)("draws a glyph for %s", (slug) => {
    expect(glyphPathFor(slug).length).toBeGreaterThan(0);
  });

  it("gives every provider its own recognisable shape", () => {
    const paths = KNOWN_SLUGS.map((slug) => glyphPathFor(slug));

    expect(new Set(paths).size).toBe(KNOWN_SLUGS.length);
  });

  it("still lists a provider whose mark has not been drawn yet", () => {
    const fallback = glyphPathFor("dropbox");

    expect(fallback.length).toBeGreaterThan(0);
    expect(KNOWN_SLUGS.map((slug) => glyphPathFor(slug))).not.toContain(fallback);
  });

  it("gives every unknown provider the same placeholder", () => {
    expect(glyphPathFor("dropbox")).toBe(glyphPathFor("stripe"));
  });

  it("sits at 18 square unless the caller asks otherwise", () => {
    const { container } = render(<ProviderMark slug="google" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
  });

  it("scales to the size the row asks for", () => {
    const { container } = render(<ProviderMark slug="slack" size={32} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("takes its colour from the text around it rather than a brand palette", () => {
    const { container } = render(<ProviderMark slug="notion" />);

    expect(container.querySelector("svg")).toHaveAttribute("fill", "currentColor");
  });

  it("is skipped by screen readers, because the provider name is written beside it", () => {
    const { container } = render(<ProviderMark slug="github" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
