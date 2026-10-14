import { main } from "../src/worker/vega-x-worker";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "error";
  console.error(JSON.stringify({ event: "vega.worker.fatal", message }));
  process.exitCode = 1;
});
