import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Choiceproof home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>CHOICEPROOF</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/chamber">Chamber</Link>
          <Link href="/evidence">Evidence</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <Link className="header-cta" href="/chamber">Test a decision <span aria-hidden="true">↗</span></Link>
        <details className="mobile-nav">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile navigation">
            <Link href="/">Home</Link>
            <Link href="/chamber">Chamber</Link>
            <Link href="/evidence">Evidence</Link>
            <Link href="/#how-it-works">How it works</Link>
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
      <div><strong>CHOICEPROOF</strong><span>Test the choice. Keep the proof.</span></div>
      <div><span>Private by default</span><span>Bounded SERV decisions</span><span>Human-reviewed evidence</span></div>
    </footer>
  );
}
