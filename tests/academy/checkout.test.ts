import { afterEach, describe, expect, it, vi } from "vitest";

import { createAcademyPkcePair, decryptAcademyCredential, encryptAcademyCredential } from "@/lib/academy/credentials";
import { calculateAcademySplit } from "@/lib/academy/checkout";
import { shouldApplyAcademyPaymentStatus } from "@/lib/academy/fulfill";
import {
  academyPaymentsEnabled,
  createAcademyCompanyPreference,
  createAcademyOAuthAuthorization,
  getAcademyCompanyAccessToken,
} from "@/lib/academy/mercadopago";

describe("Pagos de Academia", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reparte el precio bruto en 7% para Lyra y 93% para el creador", () => {
    expect(calculateAcademySplit("100.00")).toMatchObject({
      totalAmount: "100.00",
      lyraFee7Percent: "7.00",
      creatorPayout93Percent: "93.00",
    });
  });

  it("redondea la comisión a centavos y conserva la suma del precio", () => {
    const split = calculateAcademySplit("10.01");
    expect(split.lyraFee7Percent).toBe("0.70");
    expect(split.creatorPayout93Percent).toBe("9.31");
    expect(Number(split.lyraFee7Percent) + Number(split.creatorPayout93Percent)).toBe(10.01);
  });

  it("rechaza precios fuera del formato monetario", () => {
    expect(() => calculateAcademySplit("10.001")).toThrow("hasta dos decimales");
    expect(() => calculateAcademySplit("-1")).toThrow("hasta dos decimales");
    expect(() => calculateAcademySplit("0.00")).toThrow("mayor a cero");
  });

  it("sólo habilita pagos con la bandera activa y el token empresarial", () => {
    vi.stubEnv("ACADEMY_PAYMENTS_ENABLED", "true");
    vi.stubEnv("ACADEMY_MARKETPLACE_ENABLED", "");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "company-token");
    expect(academyPaymentsEnabled()).toBe(true);
    expect(getAcademyCompanyAccessToken()).toBe("company-token");

    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    expect(academyPaymentsEnabled()).toBe(false);
    expect(() => getAcademyCompanyAccessToken()).toThrow("MERCADOPAGO_ACCESS_TOKEN");
  });

  it("genera PKCE S256 y cifra credenciales con autenticación", () => {
    vi.stubEnv("ACADEMY_MP_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const { verifier, challenge } = createAcademyPkcePair();
    expect(verifier).toHaveLength(43);
    expect(challenge).toMatch(/^[\w-]{43}$/);
    const encrypted = encryptAcademyCredential("seller-access-token");
    expect(encrypted).not.toContain("seller-access-token");
    expect(decryptAcademyCredential(encrypted)).toBe("seller-access-token");
  });

  it("solicita consentimiento OAuth con PKCE y acceso de renovación", () => {
    vi.stubEnv("MERCADOPAGO_CLIENT_ID", "lyra-app-id");
    vi.stubEnv("MERCADOPAGO_CLIENT_SECRET", "test-secret");
    vi.stubEnv("ACADEMY_MP_REDIRECT_URI", "https://lyyra.example/api/academy/mercadopago/callback");
    const authorization = createAcademyOAuthAuthorization();
    const url = new URL(authorization.url);

    expect(url.origin).toBe("https://auth.mercadopago.com");
    expect(url.searchParams.get("client_id")).toBe("lyra-app-id");
    expect(url.searchParams.get("scope")).toBe("offline_access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(authorization.state).toHaveLength(43);
  });

  it("cobra el precio completo en la cuenta de LYRA, sin split automático al creador", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lyyra.example");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "456" }))
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { items: { unit_price: number }[]; marketplace_fee?: number; notification_url: string };
        expect(body.items[0]?.unit_price).toBe(100);
        expect(body).not.toHaveProperty("marketplace_fee");
        expect(body.notification_url).toContain("external_reference=lyra_academy_");
        return Response.json({
          id: "pref-1",
          init_point: "https://www.mercadopago.com.mx/checkout/pref-1",
          collector_id: "456",
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAcademyCompanyPreference({
        accessToken: "seller-token",
        externalReference: "lyra_academy_12345678901234567890123456789012",
        courseId: "course-1",
        courseTitle: "Curso",
        buyerId: "buyer-1",
        creatorId: "creator-1",
        price: 100,
        currency: "MXN",
      }),
    ).resolves.toMatchObject({ id: "pref-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rechaza la preferencia si el cobro no se asigna a la cuenta de LYRA", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lyyra.example");
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(Response.json({ id: "456" }))
        .mockResolvedValueOnce(Response.json({
            id: "pref-2",
            init_point: "https://www.mercadopago.com.mx/checkout/pref-2",
            collector_id: "789",
          })),
    );

    await expect(
      createAcademyCompanyPreference({
        accessToken: "seller-token",
        externalReference: "lyra_academy_12345678901234567890123456789012",
        courseId: "course-1",
        courseTitle: "Curso",
        buyerId: "buyer-1",
        creatorId: "creator-1",
        price: 100,
        currency: "MXN",
      }),
    ).rejects.toThrow("cuenta de LYRA");
  });

  it("no permite que una notificación atrasada revierta un reembolso o una aprobación", () => {
    expect(shouldApplyAcademyPaymentStatus("REFUNDED", "APPROVED")).toBe(false);
    expect(shouldApplyAcademyPaymentStatus("APPROVED", "PENDING")).toBe(false);
    expect(shouldApplyAcademyPaymentStatus("APPROVED", "REFUNDED")).toBe(true);
    expect(shouldApplyAcademyPaymentStatus("PENDING", "APPROVED")).toBe(true);
  });
});
