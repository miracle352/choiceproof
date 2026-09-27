import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", variable: "--font-sans", display: "swap" });
const mono = localFont({ src: "../node_modules/next/dist/next-devtools/server/font/geist-mono-latin.woff2", variable: "--font-mono", display: "swap" });
const display = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2", style: "normal", weight: "200 800" },
    { path: "../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2", style: "italic", weight: "200 800" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Choiceproof - Measure the boundary. Keep the evidence.",
  description:
    "Test bounded AI decisions with controlled challenges, exact diffs, and OpenServ SERV Reasoning.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
