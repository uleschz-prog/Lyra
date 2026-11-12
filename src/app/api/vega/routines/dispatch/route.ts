import { handleDispatch } from "@/lib/vega/dispatch-http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleDispatch(request);
}

export function POST(request: Request) {
  return handleDispatch(request);
}
