import { CreditProvider } from "@/components/dashboard/credit-provider";
import { VegaChat } from "@/components/vega/vega-chat";
import { buildProject } from "@/lib/vega/build-project";

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
  const { pieza } = await searchParams;
  const now = new Date().toISOString();
  const project = clinic.ok ? clinic.project : null;
  return (
    <CreditProvider initialBalance={220} initialTransactions={[]} totalEarnedCommissions={0}>
      <div className="min-h-screen bg-[#F6F4F1] p-6">
        <VegaChat
          creditAllowance={300}
          firstName="Ana"
          initialChats={[
            { id: "c1", title: "App de citas para la clínica", updatedAt: now },
            { id: "c2", title: "Plan de prospección de la semana", updatedAt: now },
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
              : []
          }
        />
      </div>
    </CreditProvider>
  );
}
