import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Choiceproof — Bounded AI decision workbench",
  description:
    "Test repeatable, bounded AI decisions with OpenServ SERV Reasoning.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
