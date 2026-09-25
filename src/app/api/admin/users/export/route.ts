import { getCurrentUser } from "@/lib/auth/profile";
import { isSuspended } from "@/lib/auth/suspension";
import { getPrisma } from "@/lib/prisma";

function cell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const date = (value: Date | null) =>
  value ? value.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" }) : "";

export async function GET() {
  const admin = await getCurrentUser();
  if (admin?.role !== "ADMIN") return new Response("No autorizado", { status: 401 });

  const users = await getPrisma().user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      package: true,
      pendingPackage: true,
      credits: true,
      activationCredits: true,
      walletBalance: true,
      referralCode: true,
      createdAt: true,
      suspendedUntil: true,
      sponsor: { select: { name: true, username: true } },
    },
  });

  const header = [
    "ID",
    "Nombre",
    "Usuario",
    "Correo",
    "Rol",
    "Paquete",
    "Paquete pendiente de pago",
    "Estado",
    "Créditos",
    "Créditos de activación",
    "Comisiones (USD)",
    "Patrocinador",
    "Usuario del patrocinador",
    "Código de invitación",
    "Alta",
    "Suspendida hasta",
  ];
  const rows = users.map((user) => [
    user.id,
    user.name,
    user.username,
    user.email,
    user.role === "ADMIN" ? "Administrador" : "Socio",
    user.package === "NONE" ? "" : user.package,
    user.pendingPackage ?? "",
    isSuspended(user.suspendedUntil) ? "Suspendida" : user.pendingPackage ? "Pendiente de pago" : "Activa",
    user.credits,
    user.activationCredits,
    user.walletBalance.toFixed(2),
    user.sponsor?.name ?? "",
    user.sponsor?.username ?? "",
    user.referralCode,
    date(user.createdAt),
    isSuspended(user.suspendedUntil) ? date(user.suspendedUntil) : "",
  ]);

  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lyra-usuarios-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
