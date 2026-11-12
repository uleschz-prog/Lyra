import { describe, expect, it } from "vitest";

import { sandboxedHtmlCsp, sandboxedHtmlCspWithFonts, sandboxedHtmlResponse } from "@/lib/vega/sandboxed-html";

describe("vista previa aislada", () => {
  it("sirve el HTML con CSP sandbox sin allow-same-origin", async () => {
    const response = sandboxedHtmlResponse("<p>hola</p>");
    expect(response.headers.get("content-security-policy")).toBe(sandboxedHtmlCsp);
    expect(sandboxedHtmlCsp.startsWith("sandbox ")).toBe(true);
    expect(sandboxedHtmlCsp).not.toContain("allow-same-origin");
    expect(sandboxedHtmlCsp).toContain("connect-src 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("<p>hola</p>");
  });

  it("los proyectos v2 solo agregan Google Fonts a la CSP aislada", () => {
    expect(sandboxedHtmlCspWithFonts).toContain("sandbox allow-scripts");
    expect(sandboxedHtmlCspWithFonts).toContain("style-src 'unsafe-inline' https://fonts.googleapis.com");
    expect(sandboxedHtmlCspWithFonts).toContain("font-src data: https://fonts.gstatic.com");
    expect(sandboxedHtmlCspWithFonts).toContain("connect-src 'none'");
    expect(sandboxedHtmlResponse("<p>x</p>", 200, { fonts: true }).headers.get("content-security-policy")).toBe(sandboxedHtmlCspWithFonts);
    expect(sandboxedHtmlCsp).not.toContain("fonts.googleapis.com");
  });
});
