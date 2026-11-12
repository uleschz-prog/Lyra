import { afterEach, describe, expect, it, vi } from "vitest";

import {
  higgsfieldAuthHeaders,
  higgsfieldGenerationRequest,
  higgsfieldOutputContentType,
  extractHiggsfieldOutputUrls,
  parseSoul2ImageOptions,
  parseWanVideoOptions,
  higgsfieldPublicError,
} from "@/lib/ai/higgsfield-api";
import { parseSoulReferenceInput } from "@/lib/ai/higgsfield-references";

describe("Higgsfield API configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses only the server-side HF credential names and expected authorization format", () => {
    vi.stubEnv("HF_KEY_ID", "hf-id");
    vi.stubEnv("HF_KEY_SECRET", "hf-secret");
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "legacy-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "legacy-secret");

    expect(higgsfieldAuthHeaders()).toEqual({ Authorization: "Key hf-id:hf-secret" });
  });

  it("does not fall back to legacy credential names", () => {
    vi.stubEnv("HF_KEY_ID", "");
    vi.stubEnv("HF_KEY_SECRET", "");
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "legacy-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "legacy-secret");

    expect(higgsfieldAuthHeaders()).toBeNull();
  });

  it("uses the specified Soul 2 and Wan 3.0 Prime endpoints with their default payloads", () => {
    expect(higgsfieldGenerationRequest("image", "portrait")).toEqual({
      endpoint: "/higgsfield-ai/soul/v2/standard",
      body: {
        prompt: "portrait",
        batch_size: 1,
        resolution: "720p",
        aspect_ratio: "4:3",
        enhance_prompt: true,
      },
    });
    expect(higgsfieldGenerationRequest("video", "dance")).toEqual({
      endpoint: "/alibaba/wan-3.0-prime/text-to-video",
      body: {
        prompt: "dance",
        duration: 5,
        resolution: "1080p",
        aspect_ratio: "adaptive",
        generate_audio: true,
        enable_thinking: false,
      },
    });
    expect(
      higgsfieldGenerationRequest("video", "dance", {
        duration: 30,
        resolution: "720p",
        aspect_ratio: "9:16",
        generate_audio: false,
        enable_thinking: true,
        seed: 2147483647,
      }),
    ).toEqual({
      endpoint: "/alibaba/wan-3.0-prime/text-to-video",
      body: {
        prompt: "dance",
        duration: 30,
        resolution: "720p",
        aspect_ratio: "9:16",
        generate_audio: false,
        enable_thinking: true,
        seed: 2147483647,
      },
    });
  });

  it("applies Soul 2 defaults, validates options, and accepts a reference UUID", () => {
    expect(parseSoul2ImageOptions(undefined)).toEqual({
      batch_size: 1,
      resolution: "720p",
      aspect_ratio: "4:3",
      enhance_prompt: true,
    });
    expect(parseSoul2ImageOptions({ seed: 1, batch_size: 4, resolution: "1080p", aspect_ratio: "9:16" }))
      .toMatchObject({ seed: 1, batch_size: 4, resolution: "1080p", aspect_ratio: "9:16" });
    expect(parseSoul2ImageOptions({
      custom_reference_id: "3b241d00-0fb1-4fdb-b7ca-34f05a80a315",
      custom_reference_strength: 0.6,
    })).toMatchObject({
      custom_reference_id: "3b241d00-0fb1-4fdb-b7ca-34f05a80a315",
      custom_reference_strength: 0.6,
    });
    expect(parseSoul2ImageOptions({ seed: 0 })).toBeNull();
    expect(parseSoul2ImageOptions({ seed: 1000001 })).toBeNull();
    expect(parseSoul2ImageOptions({ batch_size: 2 })).toBeNull();
    expect(parseSoul2ImageOptions({ resolution: "2K" })).toBeNull();
    expect(parseSoul2ImageOptions({ aspect_ratio: "21:9" })).toBeNull();
    expect(parseSoul2ImageOptions({ custom_reference_id: "not-a-uuid" })).toBeNull();
    expect(parseSoul2ImageOptions({ custom_reference_strength: 0.5 })).toBeNull();
  });

  it("sends optional Soul 2 style, reference, seed, and batch settings", () => {
    expect(
      higgsfieldGenerationRequest("image", "portrait", undefined, {
        seed: 25,
        style_id: "cinematic",
        custom_reference_id: "3b241d00-0fb1-4fdb-b7ca-34f05a80a315",
        custom_reference_strength: 0.7,
        batch_size: 4,
        resolution: "1080p",
        aspect_ratio: "9:16",
        enhance_prompt: false,
      }),
    ).toEqual({
      endpoint: "/higgsfield-ai/soul/v2/standard",
      body: {
        prompt: "portrait",
        seed: 25,
        style_id: "cinematic",
        custom_reference_id: "3b241d00-0fb1-4fdb-b7ca-34f05a80a315",
        custom_reference_strength: 0.7,
        batch_size: 4,
        resolution: "1080p",
        aspect_ratio: "9:16",
        enhance_prompt: false,
      },
    });
  });

  it("applies Wan defaults and rejects values outside the model schema", () => {
    expect(parseWanVideoOptions(undefined)).toEqual({
      duration: 5,
      resolution: "1080p",
      aspect_ratio: "adaptive",
      generate_audio: true,
      enable_thinking: false,
    });
    expect(parseWanVideoOptions({ duration: 1 })).toBeNull();
    expect(parseWanVideoOptions({ duration: 31 })).toBeNull();
    expect(parseWanVideoOptions({ seed: -1 })).toBeNull();
    expect(parseWanVideoOptions({ resolution: "4K" })).toBeNull();
    expect(parseWanVideoOptions({ aspect_ratio: "2:1" })).toBeNull();
    expect(parseWanVideoOptions({ generate_audio: "yes" })).toBeNull();
  });

  it("extracts completed video output from the documented video field", () => {
    expect(extractHiggsfieldOutputUrls("video", { status: "completed", video: { url: "https://cdn.example/video.mp4" } }))
      .toEqual(["https://cdn.example/video.mp4"]);
    expect(extractHiggsfieldOutputUrls("video", { status: "completed", video: "https://cdn.example/video.mp4" }))
      .toEqual(["https://cdn.example/video.mp4"]);
    expect(extractHiggsfieldOutputUrls("image", {
      status: "completed",
      result: { images: [{ url: "https://cdn.example/image.png" }] },
    })).toEqual(["https://cdn.example/image.png"]);
    expect(extractHiggsfieldOutputUrls("image", {
      status: "completed",
      images: [{ url: "https://cdn.example/soul2-image.png" }],
    })).toEqual(["https://cdn.example/soul2-image.png"]);
    expect(extractHiggsfieldOutputUrls("video", {
      status: "completed",
      video: { url: "http://cdn.example/video.mp4" },
    })).toEqual([]);
  });

  it("detects supported outputs when the CDN omits or mislabels content-type", () => {
    expect(
      higgsfieldOutputContentType(
        "image",
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "application/octet-stream",
      ),
    ).toBe("image/png");
    expect(
      higgsfieldOutputContentType(
        "video",
        Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
        "application/octet-stream",
      ),
    ).toBe("video/mp4");
    expect(
      higgsfieldOutputContentType("image", Uint8Array.from([1, 2, 3]), "video/mp4"),
    ).toBeNull();
  });

  it("validates Soul ID names and public image URLs", () => {
    expect(parseSoulReferenceInput({
      name: "Portrait",
      image_urls: ["https://images.example/one.jpg", "https://images.example/two.jpg"],
    })).toEqual({
      name: "Portrait",
      imageUrls: ["https://images.example/one.jpg", "https://images.example/two.jpg"],
    });
    expect(parseSoulReferenceInput({ name: "Portrait", image_urls: [] })).toBeNull();
    expect(parseSoulReferenceInput({ name: "Portrait", image_urls: ["http://images.example/one.jpg"] })).toBeNull();
    expect(parseSoulReferenceInput({ name: "Portrait", image_urls: ["https://user:pass@example.com/one.jpg"] }))
      .toBeNull();
    expect(parseSoulReferenceInput({
      name: "Portrait",
      image_urls: ["https://images.example/one.jpg", "https://images.example/one.jpg"],
    })).toBeNull();
  });

  it("returns useful errors without forwarding the raw response body", () => {
    expect(higgsfieldPublicError(401, { message: "Unauthorized" }, "Fallback")).toContain("autenticación");
    expect(higgsfieldPublicError(400, { message: "queue full" }, "Fallback")).toContain("más solicitudes");
    expect(
      higgsfieldPublicError(422, { message: "bad aspect_ratio", access_token: "do-not-show" }, "Fallback"),
    ).toBe("bad aspect_ratio");
    expect(higgsfieldPublicError(503, { access_token: "do-not-show" }, "Servicio no disponible")).toBe(
      "Servicio no disponible",
    );
  });
});
