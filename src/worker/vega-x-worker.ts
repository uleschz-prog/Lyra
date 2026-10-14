import { runIngestWorker } from "@/lib/vega/runtime";

export async function main() {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  await runIngestWorker(controller.signal);
}
