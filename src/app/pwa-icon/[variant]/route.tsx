import { pwaIcon } from "@/lib/pwa-icon";

const variants: Record<string, { size: number; maskable: boolean }> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
};

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const variant = variants[(await params).variant];
  if (!variant) return new Response("Not found", { status: 404 });
  const image = pwaIcon(variant.size, variant.maskable);
  image.headers.set("Cache-Control", "public, max-age=86400, immutable");
  return image;
}
