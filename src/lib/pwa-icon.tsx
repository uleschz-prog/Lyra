import { ImageResponse } from "next/og";

export function pwaIcon(size: number, maskable = false) {
  const face = Math.round(size * (maskable ? 0.46 : 0.58));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 55%, #4C1D95 100%)",
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={face} height={face} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="#FFFFFF" fillOpacity="0.16" />
          <rect x="7.6" y="9" width="2.4" height="4.4" rx="1.2" fill="#FFFFFF" />
          <rect x="14" y="9" width="2.4" height="4.4" rx="1.2" fill="#FFFFFF" />
          <path d="M9 16.2 Q12 18.4 15 16.2" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
