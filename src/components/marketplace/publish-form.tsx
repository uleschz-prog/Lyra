"use client";

import { LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { publishTemplateAction } from "@/app/dashboard/marketplace/actions";

type ProjectOption = { id: string; title: string; kind: string; versionCount: number; summary: string };

const kindLabels: Record<string, string> = { sitio: "Sitio web", app: "App", agente: "Agente" };
const field =
  "w-full rounded-xl border border-[#E7E2DA] bg-white px-3 py-2.5 text-sm text-[#1E1E24] outline-none focus:border-[#A78BFA] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]";

export function PublishForm({ projects, initialProjectId, minPrice, maxPrice, feePercent, holdDays }: {
  projects: ProjectOption[];
  initialProjectId?: string;
  minPrice: number;
  maxPrice: number;
  feePercent: number;
  holdDays: number;
}) {
  const first = projects.find((project) => project.id === initialProjectId) ?? projects[0];
  const [projectId, setProjectId] = useState(first?.id ?? "");
  const selected = projects.find((project) => project.id === projectId);
  const [title, setTitle] = useState(first?.title ?? "");
  const [description, setDescription] = useState(first?.summary ?? "");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState(String(minPrice * 4));
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ slug: string; status: string } | null>(null);

  const credits = paid ? Number(price) || 0 : 0;
  const fee = Math.ceil(credits * (feePercent / 100));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !projectId) return;
    setBusy(true);
    const result = await publishTemplateAction({ projectId, title, description, category, tags, price: credits }).finally(() => setBusy(false));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPublished({ slug: result.slug, status: result.status });
  }

  if (published) {
    return (
      <div className="rounded-2xl border border-[#E7E2DA] bg-white p-6 dark:border-white/12 dark:bg-[#181625]">
        <h2 className="text-lg font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">{published.status === "approved" ? "Plantilla publicada" : "Plantilla enviada a revisión"}</h2>
        <p className="mt-1 text-sm text-[#5C5854] dark:text-[#C8C4D4]">
          {published.status === "approved"
            ? "Ya aparece en el Marketplace."
            : "Un administrador la revisa antes de mostrarla en el Marketplace. Guardamos una copia fija: tus cambios posteriores al proyecto no la modifican."}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href={`/dashboard/marketplace/${published.slug}`} className="rounded-full bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white">Ver plantilla</Link>
          <Link href="/dashboard/marketplace/mis-plantillas" className="rounded-full border border-[#E7E2DA] px-4 py-2 text-sm font-medium text-[#1E1E24] dark:border-white/12 dark:text-[#F2F0F7]">Mis plantillas</Link>
        </div>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[#D9D3CA] bg-white p-6 text-sm text-[#5C5854] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]">
        Primero crea un sitio, una app o un agente con Vega; después podrás publicarlo aquí como plantilla.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-[#E7E2DA] bg-white p-6 dark:border-white/12 dark:bg-[#181625]" data-testid="publish-form">
      <label className="grid gap-1.5 text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
        Proyecto
        <select
          value={projectId}
          onChange={(event) => {
            const next = projects.find((project) => project.id === event.target.value);
            setProjectId(event.target.value);
            if (next) {
              setTitle(next.title);
              setDescription(next.summary);
            }
          }}
          className={field}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {kindLabels[project.kind] ?? project.kind} · {project.title} (v{project.versionCount})
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-[#8A8680]">Se publica la última versión{selected ? ` (v${selected.versionCount})` : ""} como copia fija.</span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
        Título
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} className={field} required />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
        Descripción
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className={field} placeholder="Qué incluye, para qué negocio sirve y qué se puede personalizar." required />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
          Categoría
          <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={40} className={field} placeholder="Ej. Salud, Restaurantes, Ventas" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
          Etiquetas
          <input value={tags} onChange={(event) => setTags(event.target.value)} className={field} placeholder="separadas por coma: clínica, citas" />
        </label>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">Precio</legend>
        <div className="flex flex-wrap gap-2">
          {[false, true].map((option) => (
            <button
              key={String(option)}
              type="button"
              aria-pressed={paid === option}
              onClick={() => setPaid(option)}
              className={`rounded-full border px-4 py-2 text-sm ${paid === option ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[#E7E2DA] text-[#1E1E24] dark:border-white/12 dark:text-[#F2F0F7]"}`}
            >
              {option ? "Con precio en créditos" : "Gratis"}
            </button>
          ))}
        </div>
        {paid ? (
          <div className="mt-1 grid gap-1.5">
            <input type="number" min={minPrice} max={maxPrice} step={1} value={price} onChange={(event) => setPrice(event.target.value)} className={`${field} max-w-40`} aria-label="Precio en créditos" />
            <p className="text-xs text-[#8A8680]">
              De {minPrice} a {maxPrice} créditos. LYRA retiene {feePercent}% ({fee} créditos); tú recibes {Math.max(0, credits - fee)} créditos por venta, disponibles {holdDays} días después. Las ganancias son en créditos (sin retiro en efectivo) y no generan Bono Órbita.
            </p>
          </div>
        ) : null}
      </fieldset>
      <div className="flex items-center justify-between gap-3 border-t border-[#F0ECE6] pt-4 dark:border-white/10">
        <p className="text-xs text-[#8A8680]">Un administrador revisa cada plantilla antes de mostrarla. No publiques datos personales ni llaves.</p>
        <button type="submit" disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Publicar en Marketplace
        </button>
      </div>
    </form>
  );
}
