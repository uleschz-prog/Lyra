import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryAttempts } from "./memory-attempts";

const state = vi.hoisted(() => ({
  users: [] as { id: string; email: string; username: string; password: string; suspendedUntil: Date | null }[],
  attempts: null as unknown,
  sessions: [] as string[],
  registered: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: {
      findFirst: async ({ where }: { where: { OR: { email?: string; username?: string }[] } }) => {
        const [byEmail, byUsername] = where.OR;
        return state.users.find((user) => user.email === byEmail.email || user.username === byUsername.username) ?? null;
      },
    },
    ...(state.attempts as object),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: async (id: string) => {
    state.sessions.push(id);
  },
}));
vi.mock("@/lib/auth/register-member", () => {
  class AuthError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    AuthError,
    registerMember: async (input: { email: string }) => {
      state.registered.push(input.email);
      throw new AuthError(409, "Ese correo ya tiene una cuenta.");
    },
  };
});
vi.mock("@/lib/payments/signup", () => ({ requestOrigin: () => "http://x", signupCheckout: async () => null }));

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: register } = await import("@/app/api/auth/register/route");

function loginRequest(identifier: string, password: string, ip = "200.1.1.1") {
  return new Request("http://lyra.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ identifier, password }),
  });
}

describe("rutas de acceso con límite", () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = "postgresql://test@localhost/test";
    process.env.SESSION_SECRET = "x".repeat(40);
    state.attempts = memoryAttempts().db;
    state.sessions = [];
    state.registered = [];
    state.users = [{ id: "u1", email: "ana@lyra.mx", username: "ana", password: await bcrypt.hash("correcta-123", 4), suspendedUntil: null }];
  });

  it("después de 5 fallos responde 429 con Retry-After, aun con la contraseña correcta", async () => {
    for (let i = 0; i < 5; i++) expect((await login(loginRequest("ana@lyra.mx", "mal"))).status).toBe(401);
    const blocked = await login(loginRequest("ana@lyra.mx", "correcta-123"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/^Demasiados intentos/);
    expect(state.sessions).toEqual([]);
  });

  it("el 429 es idéntico exista o no la cuenta", async () => {
    for (let i = 0; i < 5; i++) {
      await login(loginRequest("ana@lyra.mx", "mal"));
      await login(loginRequest("nadie@lyra.mx", "mal"));
    }
    const real = await login(loginRequest("ana@lyra.mx", "mal"));
    const ghost = await login(loginRequest("nadie@lyra.mx", "mal"));
    expect(real.status).toBe(429);
    expect(ghost.status).toBe(429);
    expect(await real.json()).toEqual(await ghost.json());
  });

  it("un login correcto antes del límite entra y limpia los fallos", async () => {
    for (let i = 0; i < 4; i++) await login(loginRequest("ana@lyra.mx", "mal"));
    expect((await login(loginRequest("ana@lyra.mx", "correcta-123"))).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(loginRequest("ana@lyra.mx", "mal"))).status).toBe(401);
    expect(state.sessions).toEqual(["u1"]);
  });

  it("registro: el 11.º intento desde la misma IP en 1 h recibe 429 sin llegar a registerMember", async () => {
    const make = (i: number) =>
      new Request("http://lyra.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "201.2.2.2" },
        body: JSON.stringify({ email: `p${i}@x.mx`, password: "x" }),
      });
    for (let i = 0; i < 10; i++) expect((await register(make(i))).status).toBe(409);
    const blocked = await register(make(10));
    expect(blocked.status).toBe(429);
    expect(state.registered).toHaveLength(10);
  });
});
