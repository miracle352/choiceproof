type IconProps = { className?: string };

export function ArrowUpRightIcon({ className = "icon" }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 15 15 5M7 5h8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ArrowRightIcon({ className = "icon" }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ArrowLeftIcon({ className = "icon" }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 10H4m4-4-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
