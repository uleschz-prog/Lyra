import { describe, expect, it } from "vitest";

import { renderStudioVideo } from "@/lib/studio/render-video";
import { scenesFromScript, secondsFor, wrapLine } from "@/lib/studio/video-plan";

describe("plan de video del estudio", () => {
  it("parte el guion en planos y envuelve el texto", () => {
    expect(scenesFromScript("Hola. Mira esto. Pídelo hoy.")).toEqual([
      { index: 1, line: "Hola." },
      { index: 2, line: "Mira esto." },
      { index: 3, line: "Pídelo hoy." },
    ]);
    expect(wrapLine("una frase larga que no cabe en una sola linea del plano", 16).length).toBeGreaterThan(1);
    expect(secondsFor("30 s")).toBe(9);
  });

  it("escribe un mp4 que se puede reproducir", async () => {
    const video = await renderStudioVideo({
      title: "Bienvenida",
      script: "LYRA arma el plano. El guion entra en pantalla. Guárdalo cuando quede listo.",
      format: "9:16",
      styleId: "vlog",
      duration: "15 s",
    });
    expect(video.subarray(4, 8).toString()).toBe("ftyp");
    expect(video.length).toBeGreaterThan(1000);
  });
});
