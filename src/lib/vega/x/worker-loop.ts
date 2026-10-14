export async function runWorkerLoop(input: {
  intervalMs: number;
  signal: AbortSignal;
  run: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  while (!input.signal.aborted) {
    try {
      await input.run();
    } catch (error) {
      input.onError?.(error);
    }
    if (input.signal.aborted) return;
    await input.sleep(input.intervalMs);
  }
}
