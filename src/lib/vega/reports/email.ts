import { deliveryDecision } from "../send-policy";

export async function sendOwnReportEmail(input: {
  apiKey: string | undefined;
  from: string | undefined;
  to: string;
  ownerEmail: string;
  subject: string;
  html: string;
  scheduled: boolean;
  fetch: typeof fetch;
}): Promise<{ delivered: boolean; reason: "sent" | "confirmation_required" | "not_configured" | "provider_error" }> {
  const decision = deliveryDecision({
    channel: "email",
    scheduled: input.scheduled,
    recipient: input.to,
    ownerEmail: input.ownerEmail,
  });
  if (!decision.allowed) return { delivered: false, reason: "confirmation_required" };
  if (!input.apiKey || !input.from) return { delivered: false, reason: "not_configured" };

  const response = await input.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.ownerEmail],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!response.ok) return { delivered: false, reason: "provider_error" };
  return { delivered: true, reason: "sent" };
}
