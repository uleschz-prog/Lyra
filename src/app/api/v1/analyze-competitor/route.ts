import { NextResponse } from "next/server";

import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { ListeningLimitError, parseCompetitorUsernames } from "@/lib/vega/input";
import { llmFailure, requireVegaUser } from "@/lib/vega/session";
import { getGateway } from "@/lib/vega/runtime";
import { composeCompetitorAnalysis, renderCompetitorHtml } from "@/lib/vega/reports/competitor";
import { addListening, postsByAuthors, readUserBudgetUsd, saveReport } from "@/lib/vega/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireVegaUser();
  if (!session.user) return session.response;

  const body = await request.json().catch(() => null);
  const parsed = parseCompetitorUsernames(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const listening = await addListening(session.user.id, { keywords: [], competitors: parsed.usernames });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await postsByAuthors(parsed.usernames, since);
    const budgetUsd = await readUserBudgetUsd(session.user.id, session.user.package);
    const composed = await composeCompetitorAnalysis({
      usernames: parsed.usernames,
      posts,
      now: new Date(),
      summarize: async (prompt) => {
        const result = await getGateway().complete({
          userId: session.user.id,
          feature: "vega.competitor",
          tier: "balanced",
          budgetUsd,
          maxTokens: 700,
          messages: [
            { role: "system", content: "Responde solo JSON." },
            { role: "user", content: prompt },
          ],
        });
        return result.text;
      },
    });
    const html = renderCompetitorHtml(composed.report);
    await saveReport({
      profileId: listening.profileId,
      kind: "competitor",
      title: "Comparativo de competidores",
      payload: composed.report,
      html,
      periodStart: new Date(composed.report.period.start),
      periodEnd: new Date(composed.report.period.end),
    });
    logVega("info", "vega.competitor.ready", {
      userId: session.user.id,
      competitors: parsed.usernames.length,
      status: composed.report.status,
      llmCalled: composed.llmCalled,
    });
    return NextResponse.json({ ...composed.report, html, llmBudgetExceeded: composed.llmBudgetExceeded });
  } catch (error) {
    if (error instanceof ListeningLimitError) return NextResponse.json({ error: error.message }, { status: 400 });
    const mapped = llmFailure(error);
    if (mapped) return mapped;
    logVega("error", "vega.competitor.failed", { userId: session.user.id, message: safeErrorMessage(error) });
    return NextResponse.json({ error: "No se pudo armar el comparativo." }, { status: 500 });
  }
}
