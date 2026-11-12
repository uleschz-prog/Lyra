import { handleDispatch } from "@/lib/vega/dispatch-http";

// Cron diario de vercel.json (plan Hobby: una vez al día). Desde la Fase 6 es el mismo
// despachador de rutinas que /api/vega/routines/dispatch, que un pinger externo puede
// llamar cada 5 minutos para tener horas exactas.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Hobby dispara este cron con ±59 min de holgura: adelanta lo que vence en los
// próximos 90 min para que las rutinas de las 7:00 (las de antes de la Fase 6) no se
// pasen al día siguiente.
const DAILY_HORIZON_MS = 90 * 60_000;

export function GET(request: Request) {
  return handleDispatch(request, { horizonMs: DAILY_HORIZON_MS });
}
