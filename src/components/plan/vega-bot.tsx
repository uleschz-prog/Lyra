export function VegaBot({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={`vega-bot ${className}`} aria-hidden>
      <defs>
        <linearGradient id="vegaBotBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* antena */}
      <line x1="32" y1="8" x2="32" y2="14" stroke="#E9D5FF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="6" r="3" fill="#E9D5FF" className="vega-bot-antenna" />
      {/* cabeza */}
      <rect x="14" y="14" width="36" height="26" rx="9" fill="url(#vegaBotBody)" />
      {/* ojos */}
      <circle cx="25" cy="27" r="3.4" fill="#fff" className="vega-bot-eye" />
      <circle cx="39" cy="27" r="3.4" fill="#fff" className="vega-bot-eye" />
      {/* sonrisa */}
      <path d="M26 34 Q32 38 38 34" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* cuerpo */}
      <rect x="20" y="42" width="24" height="14" rx="6" fill="#5B21B6" />
      <circle cx="32" cy="49" r="3.5" fill="#E9D5FF" className="vega-bot-core" />
      {/* brazos */}
      <rect x="10" y="44" width="8" height="4" rx="2" fill="#7C3AED" className="vega-bot-arm-left" />
      <rect x="46" y="44" width="8" height="4" rx="2" fill="#7C3AED" className="vega-bot-arm-right" />
    </svg>
  );
}
