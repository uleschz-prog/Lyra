import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreditProvider } from "@/components/dashboard/credit-provider";
import { VegaChat } from "@/components/vega/vega-chat";
import { getCurrentUser } from "@/lib/auth/profile";
import { buildProject } from "@/lib/vega/build-project";

export const metadata: Metadata = { title: "Vista de prueba de Vega", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const clinic = buildProject({
  titulo: "Clínica Luna",
  tipo: "app",
  resumen: "Agenda de citas para recepción: el paciente elige servicio, fecha y hora.",
  color: "#0F766E",
  secciones: [
    {
      tipo: "portada",
      titulo: "Agenda tu cita",
      texto: "Consulta, limpieza y valoración. La recepción ve las citas del día en esta misma pantalla.",
      boton: "Agendar",
    },
    {
      tipo: "servicios",
      titulo: "Servicios",
      items: [
        { nombre: "Consulta general", detalle: "30 minutos con el médico", precio: "$500" },
        { nombre: "Limpieza dental", detalle: "45 minutos", precio: "$800" },
      ],
    },
    {
      tipo: "agenda",
      titulo: "Nueva cita",
      servicios: ["Consulta general", "Limpieza dental"],
      nota: "La cita queda guardada en este navegador.",
    },
  ],
  sugerencias: ["Hazme el logo de Clínica Luna", "Crea un video corto para anunciar la clínica"],
});

export default async function PreviewVega({ searchParams }: { searchParams: Promise<{ pieza?: string }> }) {
  // Página de prueba interna: solo para administradores; para todos los demás no existe.
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  const { pieza } = await searchParams;
  const now = new Date().toISOString();
  const project = clinic.ok ? clinic.project : null;
  return (
    <CreditProvider initialBalance={220} initialTransactions={[]} totalEarnedCommissions={0}>
      <div className="min-h-screen bg-[#F6F4F1] p-6">
        <VegaChat
          creditAllowance={300}
          firstName="Ana"
          initialAgentId="agent-preview"
          initialAgents={[{
            id: "agent-preview",
            name: "Vega",
            specialty: "Asistente general",
            instructions: "",
            avatar: "✦",
            isDefault: true,
            persona: {},
          }]}
          initialChats={[
            { id: "c1", agentId: "agent-preview", title: "App de citas para la clínica", updatedAt: now },
            { id: "c2", agentId: "agent-preview", title: "Plan de prospección de la semana", updatedAt: now },
          ]}
          initialMessages={
            pieza === "1" && project
              ? [
                  { id: "u1", role: "user", content: "Quiero una app para agendar citas en mi clínica" },
                  {
                    id: "a1",
                    role: "assistant",
                    content: "Listo. Clínica Luna ya tiene agenda, servicios y vista previa. Puedes descargar el código y abrirlo donde quieras.",
                    actions: [{ id: "p1", kind: "deliver_project", payload: project, status: "done" }],
                  },
                ]
              : pieza === "edicion"
                ? [
                    { id: "u1", role: "user", content: "Quiero cambiar mi proyecto «El Fogón de Doña Mari»: pon los precios reales (pastor $25, gringa $65, quesadilla $45, agua $30) y aclara que incluyen IVA." },
                    {
                      id: "a1",
                      role: "assistant",
                      content: "Listo, apliqué los cambios en la lista de precios y quedó como versión 2. La versión 1 sigue en Proyectos por si quieres regresar.",
                      actions: [
                        {
                          id: "p2",
                          kind: "deliver_project",
                          status: "done",
                          result: "Cambios listos en El Fogón de Doña Mari: versión 2",
                          payload: {
                            kind: "sitio",
                            title: "El Fogón de Doña Mari",
                            summary: "Lista de precios con tacos, gringas, quesadillas y aguas, con la nota de IVA incluido.",
                            files: [],
                            suggestions: [],
                            edit: { projectId: "ptaqueriademo01", version: null, request: "Precios reales con IVA incluido" },
                            build: { buildId: "b-demo", status: "done", projectId: "ptaqueriademo01", versionNumber: 2, title: "El Fogón de Doña Mari", files: 1 },
                          } as unknown as NonNullable<typeof project>,
                        },
                      ],
                    },
                  ]
                : []
          }
        />
      </div>
    </CreditProvider>
  );
}
