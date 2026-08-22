import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Silkscreen } from "next/font/google";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint, so a chosen theme never flashes the other one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${text.variable} ${screen.variable}`}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
