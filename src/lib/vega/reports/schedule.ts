export type ScheduleSnapshot = {
  id: string;
  profileId: string;
  userId: string;
  packageId: string;
  email: string;
  cadence: "DAILY" | "WEEKLY";
  enabled: boolean;
  lastSentAt: Date | null;
};

export function isReportDue(input: { cadence: "DAILY" | "WEEKLY"; lastSentAt: Date | null; now: Date }): boolean {
  if (!input.lastSentAt) return true;
  if (input.cadence === "DAILY") {
    return input.lastSentAt.toISOString().slice(0, 10) < input.now.toISOString().slice(0, 10);
  }
  return input.now.getTime() - input.lastSentAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

export async function runScheduledReports(input: {
  schedules: ScheduleSnapshot[];
  now: Date;
  canSend: (schedule: ScheduleSnapshot) => boolean;
  build: (schedule: ScheduleSnapshot) => Promise<{ html: string; useLlm: boolean }>;
  summarize: (schedule: ScheduleSnapshot) => Promise<string | null>;
  save: (schedule: ScheduleSnapshot, html: string) => Promise<void>;
  send: (schedule: ScheduleSnapshot, html: string) => Promise<{ delivered: boolean; reason: string }>;
  markSent: (schedule: ScheduleSnapshot, now: Date) => Promise<void>;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const schedule of input.schedules) {
    if (!schedule.enabled || !input.canSend(schedule) || !isReportDue({ cadence: schedule.cadence, lastSentAt: schedule.lastSentAt, now: input.now })) {
      skipped += 1;
      continue;
    }
    try {
      const built = await input.build(schedule);
      if (built.useLlm) await input.summarize(schedule);
      await input.save(schedule, built.html);
      await input.send(schedule, built.html);
      await input.markSent(schedule, input.now);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, skipped, failed };
}
