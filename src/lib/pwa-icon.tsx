import { ImageResponse } from "next/og";

/**
 * Ícono de la app instalada: el logo de LYRA (círculo violeta con la constelación de Lira,
 * igual que en components/brand/logo.tsx) sobre el fondo oscuro de la marca. El «maskable»
 * deja el logo dentro de la zona segura (80 %) para que Android lo recorte sin cortarlo.
 */
export function pwaIcon(size: number, maskable = false) {
  const mark = Math.round(size * (maskable ? 0.56 : 0.72));
  const line = "#F5F3FF";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 45%, #241046 0%, #0B0A10 72%)",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10.25" fill="#7C3AED" />
          <path d="M2.5 11.6 L24.7 4.8 L14 30.1" fill="none" stroke={line} strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="2.5" cy="11.6" r="1.7" fill={line} />
          <circle cx="24.7" cy="4.8" r="2.25" fill={line} />
          <circle cx="14" cy="30.1" r="1.7" fill={line} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
