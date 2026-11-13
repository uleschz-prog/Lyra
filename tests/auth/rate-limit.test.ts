import { describe, expect, it } from "vitest";

import {
  authLimits,
  checkAuthLimit,
  clearAuthFailures,
  clientIp,
  hashKey,
  rateLimitMessage,
  recordAuthAttempt,
} from "@/lib/auth/rate-limit";

import { memoryAttempts } from "./memory-attempts";

const t0 = new Date("2026-11-13T12:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

async function fail(db: ReturnType<typeof memoryAttempts>["db"], times: number, subject: { ip: string; id?: string }, minute = 0) {
  for (let i = 0; i < times; i++) await recordAuthAttempt(db, "login", subject, at(minute), false);
}

describe("límite de login", () => {
  it("bloquea el 6.º intento fallido del mismo correo + IP en 15 min y libera después", async () => {
    const { db } = memoryAttempts();
    const subject = { ip: "1.1.1.1", id: "ana@lyra.mx" };
    await fail(db, 4, subject);
    expect(await checkAuthLimit(db, "login", subject, at(1))).toEqual({ allowed: true });
    await fail(db, 1, subject);
    const blocked = await checkAuthLimit(db, "login", subject, at(1));
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBe(14 * 60);
    expect((await checkAuthLimit(db, "login", subject, at(15))).allowed).toBe(true);
  });

  it("el mismo correo desde otra IP no queda bloqueado por el límite correo + IP", async () => {
    const { db } = memoryAttempts();
    await fail(db, 5, { ip: "1.1.1.1", id: "ana@lyra.mx" });
    expect((await checkAuthLimit(db, "login", { ip: "2.2.2.2", id: "ana@lyra.mx" }, at(1))).allowed).toBe(true);
  });

  it("bloquea una IP con 20 fallos en 1 h aunque cambie de correo", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 20; i++) await fail(db, 1, { ip: "3.3.3.3", id: `u${i}@x.mx` }, i);
    const result = await checkAuthLimit(db, "login", { ip: "3.3.3.3", id: "nuevo@x.mx" }, at(21));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBe(39 * 60);
    expect((await checkAuthLimit(db, "login", { ip: "3.3.3.3", id: "nuevo@x.mx" }, at(61))).allowed).toBe(true);
  });

  it("bloquea un correo atacado desde muchas IPs (30 por hora)", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 30; i++) await fail(db, 1, { ip: `10.0.0.${i}`, id: "jefe@lyra.mx" });
    expect((await checkAuthLimit(db, "login", { ip: "10.0.1.1", id: "JEFE@lyra.mx" }, at(1))).allowed).toBe(false);
  });

  it("un acceso correcto limpia los fallos de ese correo + IP pero no los de la IP", async () => {
    const { db, rows } = memoryAttempts();
    const subject = { ip: "4.4.4.4", id: "ana@lyra.mx" };
    await fail(db, 5, subject);
    await clearAuthFailures(db, "login", subject);
    expect((await checkAuthLimit(db, "login", subject, at(1))).allowed).toBe(true);
    expect(rows.filter((row) => row.keyHash === hashKey("login", "ip", "4.4.4.4"))).toHaveLength(5);
  });

  it("solo guarda hashes, nunca la IP ni el correo", async () => {
    const { db, rows } = memoryAttempts();
    await fail(db, 1, { ip: "5.5.5.5", id: "secreto@lyra.mx" });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toMatch(/5\.5\.5\.5|secreto/);
    }
  });

  it("depura los registros de más de 24 h", async () => {
    const { db, rows } = memoryAttempts();
    await fail(db, 2, { ip: "6.6.6.6", id: "a@b.mx" });
    await recordAuthAttempt(db, "login", { ip: "6.6.6.6", id: "a@b.mx" }, at(25 * 60), true);
    expect(rows.every((row) => row.createdAt.getTime() === at(25 * 60).getTime())).toBe(true);
  });
});

describe("límite de registro y OAuth", () => {
  it("registro: 10 intentos por IP en 1 h", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 10; i++) await recordAuthAttempt(db, "register", { ip: "7.7.7.7", id: `n${i}@x.mx` }, at(i), false);
    expect((await checkAuthLimit(db, "register", { ip: "7.7.7.7", id: "otro@x.mx" }, at(11))).allowed).toBe(false);
    expect((await checkAuthLimit(db, "register", { ip: "8.8.8.8", id: "otro@x.mx" }, at(11))).allowed).toBe(true);
  });

  it("registro: 5 intentos por correo en 1 h desde IPs distintas", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 5; i++) await recordAuthAttempt(db, "register", { ip: `9.9.9.${i}`, id: "mismo@x.mx" }, at(i), false);
    expect((await checkAuthLimit(db, "register", { ip: "9.9.9.200", id: "mismo@x.mx" }, at(6))).allowed).toBe(false);
  });

  it("registro: 30 por IP en 24 h aunque se respete el límite por hora", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 30; i++) await recordAuthAttempt(db, "register", { ip: "12.0.0.1", id: `d${i}@x.mx` }, at(i * 7 * 60 / 10), false);
    expect((await checkAuthLimit(db, "register", { ip: "12.0.0.1", id: "z@x.mx" }, at(22 * 60))).allowed).toBe(false);
  });

  it("OAuth: 20 por IP en 15 min", async () => {
    const { db } = memoryAttempts();
    for (let i = 0; i < 20; i++) await recordAuthAttempt(db, "oauth", { ip: "11.1.1.1" }, at(0), false);
    expect((await checkAuthLimit(db, "oauth", { ip: "11.1.1.1" }, at(5))).allowed).toBe(false);
    expect((await checkAuthLimit(db, "oauth", { ip: "11.1.1.1" }, at(15))).allowed).toBe(true);
  });

  it("los valores pedidos están configurados", () => {
    expect(authLimits.login).toContainEqual({ scope: "ip+id", max: 5, windowMs: 15 * 60_000 });
    expect(authLimits.login).toContainEqual({ scope: "ip", max: 20, windowMs: 60 * 60_000 });
  });
});

describe("utilidades", () => {
  it("toma la primera IP del encabezado y prefiere el de Vercel", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("desconocida");
  });

  it("mensaje en español con minutos", () => {
    expect(rateLimitMessage(30)).toBe("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
    expect(rateLimitMessage(14 * 60)).toBe("Demasiados intentos. Espera unos 14 minutos e inténtalo de nuevo.");
  });
});
