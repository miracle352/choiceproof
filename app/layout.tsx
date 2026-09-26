import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAULTLINE — Decision stress testing",
  description:
    "Find where bounded AI decisions break with controlled challenges, exact diffs, and OpenServ SERV Reasoning.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
