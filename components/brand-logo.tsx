type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <svg className="brand-glyph" viewBox="0 0 34 34" role="img">
        <path className="brand-glyph-shell" d="M16.5 3.5A13.5 13.5 0 0 0 16.5 30.5" />
        <path className="brand-glyph-shell brand-glyph-shell-right" d="M17.5 3.5A13.5 13.5 0 0 1 17.5 30.5" />
        <path className="brand-glyph-left" d="M4.5 18.2C9.2 18.2 12 15.8 16.5 12.4" />
        <path className="brand-glyph-right" d="M17.5 12.4C22 15.8 24.8 18.2 29.5 18.2" />
        <path className="brand-glyph-seam" d="M17 5.2v23.6" />
      </svg>
      {!compact && <span>CHOICEPROOF</span>}
    </span>
  );
}
