export type DeliveryChannel = "email" | "whatsapp";

export function deliveryDecision(input: {
  channel: DeliveryChannel;
  scheduled: boolean;
  recipient: string;
  ownerEmail: string;
}): { allowed: boolean; reason: "own_scheduled_email" | "confirmation_required" } {
  const recipient = input.recipient.trim().toLowerCase();
  const owner = input.ownerEmail.trim().toLowerCase();
  if (input.channel === "email" && input.scheduled && recipient.length > 0 && recipient === owner) {
    return { allowed: true, reason: "own_scheduled_email" };
  }
  return { allowed: false, reason: "confirmation_required" };
}
