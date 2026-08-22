import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Silkscreen } from "next/font/google";
import { headers } from "next/headers";

import { AnalyticsProvider } from "@/lib/analytics/provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

const display = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
});

const text = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-text-loaded",
  display: "swap",
});

// Stands in for the badge ROM fonts inside previews. The device has no light
// mode, so a preview drawn in this face is drawn in the badge palette too.
const screen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-screen-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Magpi",
  description: "A desk companion for the Pimoroni Tufty 2350.",
};

/**
 * Reading the nonce makes every page dynamic, which the policy already
 * requires: a nonce is minted per request, so an HTML page cached from an
 * earlier one carries a nonce the new response header does not name, and every
 * script on it is refused.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware on the forwarded request headers.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint, so a chosen theme never flashes the other one. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${text.variable} ${screen.variable}`}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
