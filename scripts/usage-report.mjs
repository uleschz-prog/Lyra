import fs from "fs";
import { PrismaClient } from "@prisma/client";

// Load env without dotenv dependency (supports quoted values, multi-line not needed).
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const txt = fs.readFileSync(file, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(".env.production.local");

const url = process.env.DATABASE_URL || "";
console.log("DB protocol: " + (url.split("://")[0] || "(none)") + " | host-present: " + url.includes("@"));

const prisma = new PrismaClient();
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function bucket(desc) {
  const d = (desc || "").toLowerCase();
  if (d.startsWith("notebook")) return "Notebook";
  if (d.startsWith("voz") || d.startsWith("speech")) return "Voz";
  if (d.startsWith("búsqueda") || d.startsWith("busqueda") || d.startsWith("search")) return "Búsqueda";
  if (d.startsWith("vega")) return "Vega";
  if (d.startsWith("telegram")) return "Telegram";
  if (d.startsWith("whatsapp")) return "WhatsApp";
  if (d.startsWith("agente")) return "Agente proyecto";
  return "Otros";
}

const rows = await prisma.transaction.findMany({
  where: { kind: "CREDIT_SPEND", createdAt: { gte: since } },
  select: { userId: true, creditDelta: true, description: true },
});

let total = 0;
const byFn = {};
const byUser = {};
for (const r of rows) {
  const amt = -r.creditDelta;
  total += amt;
  const b = bucket(r.description);
  byFn[b] = (byFn[b] || 0) + amt;
  byUser[r.userId] = byUser[r.userId] || { credits: 0, ops: 0 };
  byUser[r.userId].credits += amt;
  byUser[r.userId].ops += 1;
}

const ids = Object.keys(byUser);
const socios = ids.length;
const top = ids.map((id) => ({ id, ...byUser[id] })).sort((a, b) => b.credits - a.credits).slice(0, 5);
const users = await prisma.user.findMany({ where: { id: { in: top.map((t) => t.id) } }, select: { id: true, email: true, name: true } });
const nm = Object.fromEntries(users.map((u) => [u.id, u.name || u.email || u.id]));

console.log(JSON.stringify({
  since: since.toISOString(),
  total,
  ops: rows.length,
  byFn,
  socios,
  avgPerSocio: socios ? +(total / socios).toFixed(1) : 0,
  top: top.map((t) => ({ name: nm[t.id], credits: t.credits, ops: t.ops })),
  over300: ids.filter((id) => byUser[id].credits > 300).length,
  over1500: ids.filter((id) => byUser[id].credits > 1500).length,
  under300: ids.filter((id) => byUser[id].credits <= 300).length,
  under1500: ids.filter((id) => byUser[id].credits <= 1500).length,
  allUsers: await prisma.user.count(),
}, null, 2));

await prisma.$disconnect();
