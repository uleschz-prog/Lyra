import assert from "node:assert/strict";
import test from "node:test";

import { runWorkerLoop } from "./worker-loop";

test("el worker reutiliza el ciclo y se detiene sin esperar si ya se abortó", async () => {
  const controller = new AbortController();
  let runs = 0;
  let sleeps = 0;
  await runWorkerLoop({
    intervalMs: 10,
    signal: controller.signal,
    run: async () => {
      runs += 1;
      controller.abort();
    },
    sleep: async () => {
      sleeps += 1;
    },
  });
  assert.equal(runs, 1);
  assert.equal(sleeps, 0);
});

test("un fallo de una vuelta no tumba el bucle", async () => {
  const controller = new AbortController();
  let runs = 0;
  await runWorkerLoop({
    intervalMs: 5,
    signal: controller.signal,
    run: async () => {
      runs += 1;
      if (runs === 1) throw new Error("red");
      controller.abort();
    },
    sleep: async () => undefined,
  });
  assert.equal(runs, 2);
});
