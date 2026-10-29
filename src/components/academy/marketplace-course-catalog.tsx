"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type MarketplaceCourseCardData = {
  id: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  pricingType: "FREE" | "ONE_TIME" | "MONTHLY";
  creatorName: string;
  lessonCount: number;
  enrolled: boolean;
  progress: number;
};

function priceLabel(course: MarketplaceCourseCardData) {
  if (course.pricingType === "FREE") return "Gratis";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: course.currency }).format(Number(course.price));
}

export function MarketplaceCourseCatalog({ courses }: { courses: MarketplaceCourseCardData[] }) {
  const router = useRouter();
  const [pendingCourse, setPendingCourse] = useState<string | null>(null);

  async function enroll(course: MarketplaceCourseCardData) {
    setPendingCourse(course.id);
    try {
      const response = await fetch("/api/academy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      const data = (await response.json()) as { error?: string; checkoutUrl?: string; enrolled?: boolean };
      if (!response.ok) throw new Error(data.error ?? "No se pudo iniciar la inscripción.");
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (data.enrolled) {
        toast.success("Ya tienes acceso al curso.");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar la inscripción.");
    } finally {
      setPendingCourse(null);
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#8A8680]">Marketplace de creadores</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#1E1E24]">Cursos publicados</h2>
        </div>
        <Link href="/dashboard/academy/creator" className="text-sm font-medium text-[#5C5854] underline underline-offset-4">
          Panel del creador
        </Link>
      </div>
      {courses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-[#6A6662]">
          Aún no hay cursos publicados por creadores.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((course) => (
            <article key={course.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[#8A8680]">Por {course.creatorName}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[#1E1E24]">{course.title}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-surface-hover px-3 py-1 text-xs font-medium text-[#312F2F]">
                  {priceLabel(course)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#5C5854]">{course.description}</p>
              {course.enrolled ? (
                <>
                  <div className="mt-5 flex items-center justify-between text-xs text-[#6A6662]">
                    <span>{course.lessonCount} lecciones</span>
                    <span>{course.progress}% completado</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover">
                    <div className="h-full rounded-full bg-[#06B6D4]" style={{ width: `${course.progress}%` }} />
                  </div>
                  <Button asChild size="sm" className="mt-4">
                    <Link href={`/dashboard/academy/${course.id}`}>Continuar curso</Link>
                  </Button>
                </>
              ) : (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs text-[#8A8680]">{course.lessonCount} lecciones</span>
                  {course.pricingType === "MONTHLY" ? (
                    <Button type="button" size="sm" disabled>
                      Mensual deshabilitado
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pendingCourse === course.id}
                      onClick={() => void enroll(course)}
                    >
                      {pendingCourse === course.id ? "Procesando…" : course.pricingType === "FREE" ? "Inscribirme gratis" : "Comprar curso"}
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
