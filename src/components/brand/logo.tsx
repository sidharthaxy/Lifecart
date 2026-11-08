/**
 * LifeCart mark: a shopping cart (shopping) with budget bars rising out of it (money and budgets) and a sparkle
 * (the AI agent), on the brand blue-to-violet gradient with a mint accent. Same drawing as src/app/icon.svg.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="lc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2F6BFF" />
          <stop offset=".55" stopColor="#2140C8" />
          <stop offset="1" stopColor="#5B2FD6" />
        </linearGradient>
        <linearGradient id="lc-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#lc-bg)" />
      <rect width="48" height="24" rx="13" fill="url(#lc-shine)" />
      <path d="M7.5 13h4.4l4 17.2h17.2l3.6-11.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="18.6" y="23.2" width="3.6" height="4.6" rx="1.2" fill="#7CF3C6" />
      <rect x="23.8" y="20.2" width="3.6" height="7.6" rx="1.2" fill="#7CF3C6" />
      <rect x="29" y="16.8" width="3.6" height="11" rx="1.2" fill="#7CF3C6" />
      <path transform="translate(33.5 5.5) scale(.95)" d="M5 0C5.4 3 7 4.6 10 5 7 5.4 5.4 7 5 10 4.6 7 3 5.4 0 5 3 4.6 4.6 3 5 0Z" fill="#fff" />
      <circle cx="18.8" cy="36" r="2.7" fill="#fff" />
      <circle cx="30.6" cy="36" r="2.7" fill="#fff" />
    </svg>
  );
}

/** Mark + wordmark, as used in headers. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-heading text-[19px] font-extrabold tracking-tight">
        Life<span className="text-primary">Cart</span>
      </span>
    </span>
  );
}
