"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, GraduationCap, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { academyVideoEmbed } from "@/lib/academy/video";

export type MarketplaceCourseCardData = {
  id: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  pricingType: "FREE" | "ONE_TIME" | "MONTHLY";
  creatorName: string;
  lessonCount: number;
  previewVideoUrl: string | null;
  coverImageUrl: string | null;
  enrolled: boolean;
  progress: number;
};

type CourseFilter = "all" | "free" | "paid" | "enrolled";

const filters: { id: CourseFilter; label: string }[] = [
  { id: "all", label: "Para ti" },
  { id: "free", label: "Gratis" },
  { id: "paid", label: "De pago" },
  { id: "enrolled", label: "Mis cursos" },
];

function priceLabel(course: MarketplaceCourseCardData) {
  if (course.pricingType === "FREE") return "Gratis";
  if (course.pricingType === "MONTHLY") return "Mensual";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: course.currency }).format(Number(course.price));
  } catch {
    return `${course.currency} ${course.price}`;
  }
}

function safeImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function CourseVideoPreview({ course, active }: { course: MarketplaceCourseCardData; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const preview = course.previewVideoUrl ? academyVideoEmbed(course.previewVideoUrl) : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  if (active && preview?.kind === "video") {
    return (
      <video
        ref={videoRef}
        src={preview.url}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-label={`Vista previa de ${course.title}`}
      />
    );
  }

  if (active && preview?.kind === "embed") {
    const url = new URL(preview.url);
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("loop", "1");
    url.searchParams.set("controls", "0");
    url.searchParams.set("playsinline", "1");
    return (
      <iframe
        src={url.toString()}
        title={`Vista previa de ${course.title}`}
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  const image = safeImageUrl(course.coverImageUrl);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_55%_20%,#373042_0%,#17151e_42%,#09090c_100%)]">
      {image ? <img src={image} alt="" className="h-full w-full object-cover opacity-65" referrerPolicy="no-referrer" /> : null}
      <div className="absolute inset-0 grid place-items-center">
        <div className="grid size-20 place-items-center rounded-full border border-white/20 bg-black/25 text-white/85 backdrop-blur">
          <BookOpen size={30} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceCourseCatalog({ courses }: { courses: MarketplaceCourseCardData[] }) {
  const router = useRouter();
  const feedRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<CourseFilter>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingCourse, setPendingCourse] = useState<string | null>(null);

  const visibleCourses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return courses.filter((course) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "free" && course.pricingType === "FREE") ||
        (filter === "paid" && course.pricingType !== "FREE") ||
        (filter === "enrolled" && course.enrolled);
      const matchesSearch =
        !normalizedSearch ||
        `${course.title} ${course.description} ${course.creatorName}`.toLocaleLowerCase().includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [courses, filter, search]);

  const currentActiveId = visibleCourses.some((course) => course.id === activeId) ? activeId : visibleCourses[0]?.id ?? null;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [filter, search]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || visibleCourses.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const courseId = mostVisible?.target.getAttribute("data-course-id");
        if (courseId) setActiveId(courseId);
      },
      { root: feed, threshold: [0.55, 0.75] },
    );
    feed.querySelectorAll<HTMLElement>("[data-course-id]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [visibleCourses]);

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

  function moveFeed(direction: -1 | 1) {
    const feed = feedRef.current;
    if (!feed) return;
    const cards = [...feed.querySelectorAll<HTMLElement>("[data-course-id]")];
    if (cards.length < 2) return;
    const currentIndex = cards.findIndex((card) => card.dataset.courseId === currentActiveId);
    const nextCard = cards[(Math.max(0, currentIndex) + direction + cards.length) % cards.length];
    feed.scrollTo({ top: nextCard.offsetTop, behavior: "smooth" });
  }

  return (
    <section className="mb-10" aria-label="Marketplace de cursos">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#8A8680]">Marketplace de creadores</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#1E1E24]">Descubre tu próximo curso</h2>
        </div>
        <Link href="/dashboard/academy/creator" className="text-sm font-medium text-[#5C5854] underline underline-offset-4">
          Panel del creador
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1" role="tablist" aria-label="Filtrar cursos">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === item.id ? "bg-[#1E1E24] text-white" : "text-[#68645F] hover:bg-surface-hover"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex h-10 min-w-52 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[#79746F] sm:max-w-xs">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar cursos</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cursos o creadores"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#1E1E24] outline-none placeholder:text-[#99948D]"
          />
        </label>
      </div>

      {visibleCourses.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-border bg-surface px-6 text-center">
          <div>
            <GraduationCap className="mx-auto text-[#8A8680]" size={32} aria-hidden="true" />
            <p className="mt-3 font-medium text-[#312F2F]">
              {courses.length === 0 ? "Aún no hay cursos publicados por creadores." : "No encontramos cursos con esos filtros."}
            </p>
            <p className="mt-1 text-sm text-[#77716A]">Los nuevos cursos aparecerán aquí en cuanto se publiquen.</p>
            {courses.length === 0 ? (
              <Link href="/dashboard/academy/creator" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
                Publicar un curso
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[1.75rem] border border-[#27242d] bg-[#09090c] shadow-xl">
          <div
            ref={feedRef}
            role="region"
            className="h-[min(74dvh,780px)] min-h-[480px] snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Cursos, desliza verticalmente para explorar"
          >
            {visibleCourses.map((course) => {
              const isPending = pendingCourse === course.id;
              const isActive = currentActiveId === course.id;
              return (
                <article
                  key={course.id}
                  data-course-id={course.id}
                  className="relative mx-auto h-[min(74dvh,780px)] min-h-[480px] w-full snap-start snap-always overflow-hidden text-white"
                >
                  <CourseVideoPreview course={course} active={isActive} />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/15" />

                  <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 text-center">
                    <div className="grid size-11 place-items-center rounded-full border border-white/30 bg-black/30 text-sm font-semibold shadow-lg backdrop-blur">
                      {course.creatorName.trim().slice(0, 1).toLocaleUpperCase() || "L"}
                    </div>
                    <span className="max-w-14 text-[10px] leading-tight text-white/90">{course.creatorName}</span>
                  </div>

                  <div className="absolute bottom-0 left-0 z-10 max-w-[calc(100%-5.5rem)] p-5 pb-6 sm:p-8 sm:pb-8">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs font-semibold backdrop-blur">
                        {course.pricingType === "FREE" ? "CURSO GRATUITO" : "CURSO DE PAGO"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1E1E24]">{priceLabel(course)}</span>
                      {course.pricingType === "MONTHLY" ? (
                        <span className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-black">Próximamente</span>
                      ) : null}
                    </div>
                    <p className="mb-1 text-sm font-medium text-white/80">Por {course.creatorName}</p>
                    <h3 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{course.title}</h3>
                    <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-white/80">{course.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/75">
                      <span className="inline-flex items-center gap-1.5">
                        <BookOpen size={14} aria-hidden="true" />
                        {course.lessonCount} lecciones
                      </span>
                      {course.enrolled ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Check size={14} aria-hidden="true" />
                          {course.progress}% completado
                        </span>
                      ) : null}
                    </div>
                    {course.enrolled ? (
                      <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/25">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${course.progress}%` }} />
                      </div>
                    ) : null}
                    {course.enrolled ? (
                      <Link
                        href={`/dashboard/academy/${course.id}`}
                        className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#1E1E24] transition hover:bg-white/90"
                      >
                        <BookOpen size={16} aria-hidden="true" />
                        Continuar aprendiendo
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending || course.pricingType === "MONTHLY"}
                        onClick={() => void enroll(course)}
                        className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#a3f554] px-5 text-sm font-bold text-[#17210b] shadow-lg transition hover:bg-[#b8ff70] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ShoppingBag size={16} aria-hidden="true" />
                        {isPending
                          ? "Procesando…"
                          : course.pricingType === "FREE"
                            ? "Inscribirme gratis"
                            : course.pricingType === "MONTHLY"
                              ? "Membresía no disponible"
                              : "Comprar curso"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {visibleCourses.length > 1 ? (
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <span className="rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 backdrop-blur">
                {visibleCourses.findIndex((course) => course.id === currentActiveId) + 1} / {visibleCourses.length}
              </span>
              <button
                type="button"
                aria-label="Curso anterior"
                onClick={() => moveFeed(-1)}
                className="grid size-9 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur hover:bg-black/60"
              >
                <ChevronUp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Siguiente curso"
                onClick={() => moveFeed(1)}
                className="grid size-9 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur hover:bg-black/60"
              >
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
