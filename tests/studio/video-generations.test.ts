import { describe, expect, it } from "vitest";

import { isVideoDuration, videoQuotaCost, videoSegmentCount, videoSegmentPrompt } from "@/lib/studio/video-generation-shared";
import {
  videoQuotaAllowance,
  videoQuotaDurationOptions,
  videoQuotaReservationSeconds,
} from "@/lib/studio/video-quota-shared";

describe("generación de videos del estudio", () => {
  it("asigna cupo por plan y reserva más segundos para Wan 3.0 Prime", () => {
    expect(videoQuotaAllowance("STARTED")).toBe(40);
    expect(videoQuotaAllowance("PRO")).toBe(140);
    expect(videoQuotaAllowance("FOUNDER")).toBe(360);
    expect(videoQuotaCost(30, "wan-3.0")).toBe(30);
    expect(videoQuotaReservationSeconds(30, "wan-3.0-prime")).toBe(41);
    expect(videoQuotaDurationOptions(40, "wan-3.0")).toContain(30);
    expect(videoQuotaDurationOptions(40, "wan-3.0-prime")).not.toContain(30);
    expect(videoSegmentCount(30)).toBe(1);
    expect(videoSegmentCount(60)).toBe(2);
    expect(videoSegmentCount(180)).toBe(6);
  });

  it("solo acepta las duraciones disponibles", () => {
    expect(isVideoDuration(30)).toBe(true);
    expect(isVideoDuration(60)).toBe(true);
    expect(isVideoDuration(180)).toBe(true);
    expect(isVideoDuration(15)).toBe(true);
    expect(isVideoDuration("30")).toBe(false);
  });

  it("prepara instrucciones de continuidad y sonido para cada segmento", () => {
    const prompt = videoSegmentPrompt("Lanzamiento", "La marca llega. El producto brilla.", 1, 2, 15);
    expect(prompt).toContain("segmento 2 de 2");
    expect(prompt).toContain("15 segundos en 480p");
    expect(prompt).toContain("El producto brilla.");
    expect(prompt).toContain("Mantén el mismo producto");
    expect(prompt).toContain("sonido ambiente realista");
    expect(prompt).toContain("no incluyas música, voces ni diálogo");
  });
});
