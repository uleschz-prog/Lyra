import type { Metadata } from "next";
import Link from "next/link";

import { OnboardingFrame } from "@/components/onboarding/frame";

export const metadata: Metadata = { title: "Activa MetaMask" };

const steps = [
  {
    title: "Instálala",
    body: "En la computadora entra a metamask.io y agrega la extensión de Chrome, Brave o Edge. En el teléfono descarga MetaMask desde la tienda oficial de apps.",
  },
  {
    title: "Crea la cartera",
    body: "Elige «Crear una cartera nueva». Inventa una contraseña. MetaMask te muestra 12 palabras: anótalas en papel y guárdalas. Esas palabras son la única forma de recuperar la cuenta.",
  },
  {
    title: "Agrega Polygon",
    body: "Abre MetaMask, entra a redes y busca Polygon. Si no aparece, al volver a LYRA y pulsar «Vincular MetaMask» la red se agrega sola. Polygon es la red donde LYRA cobra: es rápida y la comisión cuesta centavos.",
  },
  {
    title: "Ten un poco de POL y el USDC del paquete",
    body: "POL paga la comisión de la red. USDC es el dólar con el que pagas Inicio, Negocio o Pro. Puedes comprarlos en un exchange y retirarlos a tu dirección de MetaMask, eligiendo la red Polygon.",
  },
  {
    title: "Vuelve aquí",
    body: "Regresa a LYRA y pulsa «Vincular MetaMask». Aprueba la conexión. Después eliges el paquete y pagas.",
  },
];

export default function MetaMaskTutorialPage() {
  return (
    <OnboardingFrame title="Activa tu MetaMask">
      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-md border border-[#E7E2DA] px-4 py-3">
            <p className="text-sm font-medium text-[#1E1E24]">
              {index + 1}. {step.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#5C5854]">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link
        href="/vincular"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[#312F2F] text-sm font-medium text-white"
      >
        Ya la tengo, vincular
      </Link>
    </OnboardingFrame>
  );
}
