"use client";

import { cn } from "@/lib/utils";

export type ExampleCategory = "apps" | "sitios" | "agentes" | "herramientas";

type Preview = {
  prompt: string;
  label: string;
  className: string;
  frame: "app" | "site" | "chat" | "board";
};

const previews: Record<ExampleCategory, Preview[]> = {
  apps: [
    {
      prompt: "Una app de reservas para mi clínica",
      label: "Agenda de clínica",
      className: "h-[168px] w-[196px] bg-[#1F6B4A] text-white",
      frame: "app",
    },
    {
      prompt: "Una app para cobrar membresías de mi gimnasio",
      label: "Membresías",
      className: "h-[132px] w-[150px] bg-[#312F2F] text-white",
      frame: "board",
    },
    {
      prompt: "Un panel donde mi equipo vea las citas del día",
      label: "Citas del día",
      className: "h-[188px] w-[210px] bg-white text-[#1E1E24]",
      frame: "board",
    },
    {
      prompt: "Una app para que mis pacientes confirmen su cita",
      label: "Confirmación",
      className: "h-[150px] w-[168px] bg-[#7C3AED] text-white",
      frame: "app",
    },
  ],
  sitios: [
    {
      prompt: "Un sitio web para mi estudio",
      label: "Estudio",
      className: "h-[176px] w-[220px] bg-[#F4EFE6] text-[#1E1E24]",
      frame: "site",
    },
    {
      prompt: "Una landing para lanzar mi curso",
      label: "Curso",
      className: "h-[148px] w-[176px] bg-[#1E1E24] text-white",
      frame: "site",
    },
    {
      prompt: "Una página de menú para mi restaurante",
      label: "Menú",
      className: "h-[190px] w-[168px] bg-[#F7F1E8] text-[#1E1E24]",
      frame: "board",
    },
    {
      prompt: "Una página de inicio para mi marca",
      label: "Marca",
      className: "h-[140px] w-[200px] bg-white text-[#1E1E24]",
      frame: "site",
    },
  ],
  agentes: [
    {
      prompt: "Un superagente de recepción que agende citas en WhatsApp",
      label: "Recepción",
      className: "h-[180px] w-[188px] bg-[#E7F6EC] text-[#1E1E24]",
      frame: "chat",
    },
    {
      prompt: "Un agente que responda dudas de mis clientes por la noche",
      label: "Turno noche",
      className: "h-[156px] w-[200px] bg-[#1B2430] text-white",
      frame: "chat",
    },
    {
      prompt: "Un agente que confirme citas y mande recordatorios",
      label: "Recordatorios",
      className: "h-[140px] w-[210px] bg-white text-[#1E1E24]",
      frame: "app",
    },
    {
      prompt: "Un agente que conteste mensajes de mi red",
      label: "Bandeja",
      className: "h-[168px] w-[160px] bg-[#312F2F] text-white",
      frame: "chat",
    },
  ],
  herramientas: [
    {
      prompt: "Una herramienta interna para seguir a mi equipo",
      label: "Equipo",
      className: "h-[172px] w-[200px] bg-white text-[#1E1E24]",
      frame: "board",
    },
    {
      prompt: "Un tablero de créditos y comisiones",
      label: "Créditos",
      className: "h-[148px] w-[176px] bg-[#1E1E24] text-white",
      frame: "board",
    },
    {
      prompt: "Una lista de tareas compartida con mi red",
      label: "Tareas",
      className: "h-[186px] w-[168px] bg-[#F7F1E8] text-[#1E1E24]",
      frame: "board",
    },
    {
      prompt: "Un panel para ver el avance de mi red",
      label: "Red",
      className: "h-[136px] w-[210px] bg-[#E8F4F4] text-[#1E1E24]",
      frame: "app",
    },
  ],
};

function Frame({ kind, light }: { kind: Preview["frame"]; light: boolean }) {
  const line = light ? "bg-black/10" : "bg-white/20";
  const chip = light ? "bg-black/10" : "bg-white/15";

  if (kind === "chat") {
    return (
      <div className="mt-3 space-y-2">
        <div className={cn("ml-auto h-7 w-4/5 rounded-2xl rounded-br-sm", chip)} />
        <div className={cn("h-10 w-3/4 rounded-2xl rounded-bl-sm", light ? "bg-[#7C3AED]/80" : "bg-[#25D366]/70")} />
        <div className={cn("ml-auto h-6 w-2/3 rounded-2xl rounded-br-sm", chip)} />
      </div>
    );
  }

  if (kind === "site") {
    return (
      <div className="mt-3">
        <div className={cn("h-16 rounded-md", chip)} />
        <div className={cn("mt-2 h-2 w-3/4 rounded-full", line)} />
        <div className={cn("mt-1.5 h-2 w-1/2 rounded-full", line)} />
      </div>
    );
  }

  if (kind === "board") {
    return (
      <div className="mt-3 space-y-2">
        {[72, 88, 64].map((width) => (
          <div key={width} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", light ? "bg-[#7C3AED]" : "bg-[#10B981]")} />
            <span className={cn("h-2 rounded-full", line)} style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {["09", "10", "11"].map((hour) => (
        <div key={hour} className={cn("rounded-md px-1 py-2 text-center text-[10px]", chip)}>
          {hour}
        </div>
      ))}
    </div>
  );
}

export function ExamplePreviews({
  category,
  onPick,
}: {
  category: ExampleCategory;
  onPick: (prompt: string) => void;
}) {
  const items = previews[category];
  const loop = [...items, ...items];

  return (
    <div className="relative left-1/2 mt-8 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden">
      <div key={category} className="lyra-marquee flex w-max items-start gap-3 px-3">
        {loop.map((item, index) => {
          const light = item.className.includes("text-[#1E1E24]");
          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              onClick={() => onPick(item.prompt)}
              className={cn(
                "shrink-0 overflow-hidden rounded-[10px] px-3 py-3 text-left shadow-[0_10px_24px_rgba(30,30,36,0.08)]",
                item.className,
              )}
            >
              <span className="block text-xs tracking-wide opacity-70">Ejemplo</span>
              <span className="mt-1 block text-base font-medium">{item.label}</span>
              <Frame kind={item.frame} light={light} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
