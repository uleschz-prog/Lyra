import { describe, expect, it } from "vitest";

import { aspectHint, imageFromPayload, imageModels, runwayOutputUrl, runwayRatio } from "@/lib/ai/media";

describe("generación de imagen y video", () => {
  it("pide un modelo de imagen y no el modelo de chat", () => {
    expect(imageModels()).toEqual(["gemini-3.1-flash-image", "gemini-2.5-flash-image"]);
    expect(imageModels().includes("gemini-2.5-flash")).toBe(false);
  });

  it("traduce el formato a una pista visual y a la proporción de video", () => {
    expect(aspectHint("vertical")).toBe("Formato vertical 9:16.");
    expect(aspectHint("16:9")).toBe("Formato horizontal 16:9.");
    expect(runwayRatio("9:16")).toBe("720:1280");
    expect(runwayRatio("1:1")).toBe("960:960");
    expect(runwayRatio("16:9")).toBe("1280:720");
  });

  it("lee la imagen que devuelve Gemini, en interactions o en generateContent", () => {
    expect(imageFromPayload({ output_image: { mime_type: "image/png", data: "a".repeat(50) } })?.mime).toBe("image/png");
    expect(
      imageFromPayload({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "b".repeat(50) } }] } }],
      })?.mime,
    ).toBe("image/jpeg");
    expect(imageFromPayload({ candidates: [{ content: { parts: [{ text: "solo texto" }] } }] })).toBeNull();
  });

  it("lee la dirección del video cuando Runway termina", () => {
    expect(runwayOutputUrl({ output: ["https://cdn.example/video.mp4"] })).toBe("https://cdn.example/video.mp4");
    expect(runwayOutputUrl({ status: "RUNNING" })).toBeNull();
  });
});
