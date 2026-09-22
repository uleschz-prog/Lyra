import type { DemoAgent } from "@/lib/types";

export function simulateAgentReply(agent: DemoAgent, input: string) {
  const topic = input.trim().replace(/\s+/g, " ");

  if (agent.id === "prospector") {
    return [
      `Perfil: alguien que ya habla de «${topic}» y necesita un siguiente paso concreto, no un discurso de ingresos.`,
      `Gancho: «${topic} encaja con el flujo de prospección de LYRA. ¿Te muestro cómo lo ordena la academia en dos minutos?»`,
      "Siguiente paso: envía el gancho hoy y deja una revisión de 15 minutos en el calendario.",
    ].join("\n\n");
  }

  if (agent.id === "copywriter") {
    return [
      `Gancho: ${topic}.`,
      "Cuerpo: LYRA junta la academia y los agentes para que la red deje de improvisar cada conversación. El mensaje cabe en una historia y en un correo corto.",
      "Llamado: entra al backoffice y abre el Estudio IA con el mismo tema.",
    ].join("\n\n");
  }

  if (agent.id === "closer") {
    return [
      `Objeción implícita en «${topic}»: falta claridad sobre el siguiente compromiso, no más argumentos.`,
      "Respuesta: reconoce la duda, resume el beneficio operativo y ofrece una sola decisión: revisar la academia o agendar el seguimiento.",
      "Pregunta de avance: «¿Lo vemos mañana en 15 minutos o prefieres la lección de prospección esta noche?»",
    ].join("\n\n");
  }

  return [
    `Tema de práctica: ${topic}.`,
    "Día 1–2: estudia la lección y anota una frase que puedas decir sin leer.",
    "Día 3–5: usa el Agente Prospector con un contacto real y guarda el gancho.",
    "Día 6–7: revisa con tu patrocinador qué conversación avanzó y cuál se estancó.",
  ].join("\n\n");
}
