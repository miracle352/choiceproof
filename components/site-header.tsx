"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowUpRightIcon } from "@/components/icons";

export function SiteHeader() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const isCurrent = (destination: "how" | "evidence" | "chamber") => {
    if (destination === "chamber") return pathname === "/chamber";
    if (destination === "evidence") return pathname === "/evidence" || pathname.startsWith("/share/");
    return pathname === "/" && hash === "#how-it-works";
  };

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Choiceproof home">
          <BrandLogo />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/#how-it-works" aria-current={isCurrent("how") ? "location" : undefined}>How it works</Link>
          <Link href="/evidence" aria-current={isCurrent("evidence") ? "page" : undefined}>Evidence</Link>
          <Link href="/chamber" aria-current={isCurrent("chamber") ? "page" : undefined}>Chamber</Link>
        </nav>
        <Link className="header-cta" href="/chamber">Test a decision <ArrowUpRightIcon /></Link>
        <details className="mobile-nav">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile navigation">
            <Link href="/">Home</Link>
            <Link href="/chamber" aria-current={isCurrent("chamber") ? "page" : undefined}>Chamber</Link>
            <Link href="/evidence" aria-current={isCurrent("evidence") ? "page" : undefined}>Evidence</Link>
            <Link href="/#how-it-works" aria-current={isCurrent("how") ? "location" : undefined}>How it works</Link>
            <Link className="mobile-nav-cta" href="/chamber">Test a decision</Link>
          </nav>
        </details>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><BrandLogo /><span>Test the choice. Keep the proof.</span></div>
      <div><span>Private by default</span><span>Bounded SERV decisions</span><span>Human-reviewed evidence</span></div>
    </footer>
  );
}
