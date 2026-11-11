import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, BookOpen, CircleDollarSign, GraduationCap, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SortableAcademyList } from "@/components/academy/sortable-academy-list";
import { CourseCoverManager } from "@/components/academy/course-cover-manager";
import { AcademyLessonForm } from "@/components/academy/creator/academy-lesson-form";
import { brand } from "@/config/brand";
import { academyPaymentsEnabled } from "@/lib/academy/mercadopago";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import {
  createAcademyCourse,
  createAcademyLessonAttachment,
  createAcademyModule,
  moveAcademyModule,
  publishAcademyCourse,
} from "./actions";

export const metadata: Metadata = { title: "Crear cursos · Academia" };

function money(amount: unknown, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(amount ?? 0));
}

export default async function CreatorAcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const query = await searchParams;
  const prisma = getPrisma();
  const paymentsEnabled = academyPaymentsEnabled();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [courses, allSales, monthSales, pendingPayout, paidPayout, activeStudents, recentSales] = await Promise.all([
    prisma.course.findMany({
      where: { creatorId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        modules: {
          orderBy: [{ position: "asc" }, { id: "asc" }],
          include: {
            lessons: {
              orderBy: [{ position: "asc" }, { id: "asc" }],
              include: { attachments: { select: { id: true } } },
            },
          },
        },
      },
    }),
    prisma.academyTransaction.aggregate({
      where: { creatorId: user.id, paymentGatewayStatus: "APPROVED" },
      _sum: { totalAmount: true, creatorPayout93Percent: true, lyraFee7Percent: true },
      _count: { _all: true },
    }),
    prisma.academyTransaction.aggregate({
      where: { creatorId: user.id, paymentGatewayStatus: "APPROVED", paidAt: { gte: monthStart } },
      _sum: { totalAmount: true, creatorPayout93Percent: true, lyraFee7Percent: true },
      _count: { _all: true },
    }),
    prisma.academyTransaction.aggregate({
      where: { creatorId: user.id, paymentGatewayStatus: "APPROVED", creatorPayoutStatus: "PENDING" },
      _sum: { creatorPayout93Percent: true },
    }),
    prisma.academyTransaction.aggregate({
      where: { creatorId: user.id, paymentGatewayStatus: "APPROVED", creatorPayoutStatus: "PAID" },
      _sum: { creatorPayout93Percent: true },
    }),
    prisma.courseEnrollment.count({
      where: { course: { creatorId: user.id }, status: "ACTIVE" },
    }),
    prisma.academyTransaction.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        totalAmount: true,
        lyraFee7Percent: true,
        creatorPayout93Percent: true,
        currency: true,
        paymentGatewayStatus: true,
        creatorPayoutStatus: true,
        creatorPaidAt: true,
        creatorPayoutReference: true,
        paidAt: true,
        createdAt: true,
        course: { select: { title: true } },
        buyer: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title="Panel del creador"
        description="Construye tus cursos, consulta ventas y revisa el estado de tus pagos."
        section="academy"
      />

      <section className="relative mb-8 overflow-hidden rounded-[28px] bg-[#111019] px-6 py-7 text-white shadow-[0_24px_70px_-38px_rgba(54,34,120,0.7)] sm:px-9 sm:py-9">
        <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-violet-600/30 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-36 right-1/4 size-72 rounded-full bg-cyan-400/20 blur-[100px]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:linear-gradient(to_right,black,transparent_75%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-end">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200">
              <Sparkles size={13} aria-hidden="true" /> Lyra Academy · Creator studio
            </p>
            <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Convierte lo que sabes en algo que <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">transforma.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base">
              Diseña una experiencia de aprendizaje propia. Empieza con una idea, suma tus lecciones y publícala cuando esté lista.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#crear-curso" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#17151F] transition hover:-translate-y-0.5 hover:bg-violet-100">
                Crear mi curso <ArrowDownRight size={16} aria-hidden="true" />
              </a>
              <a href="#mis-cursos" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-white/85 transition hover:border-white/40 hover:bg-white/[0.06]">
                Explorar mis cursos <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md lg:block">
            <div className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-400/20 text-violet-100">
                <GraduationCap size={19} aria-hidden="true" />
              </span>
              <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">TU ESPACIO CREATIVO</span>
            </div>
            <p className="mt-5 text-xs text-white/45">UNA IDEA PUEDE SER</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">Tu próximo gran curso.</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/55">
              <BookOpen size={14} className="text-cyan-200" aria-hidden="true" /> Contenido · comunidad · crecimiento
            </div>
          </div>
        </div>
      </section>

      {query.error ? (
        <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {query.saved}
        </p>
      ) : null}
      {!paymentsEnabled ? (
        <p role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Los pagos de cursos estarán disponibles cuando LYRA habilite Mercado Pago para Academia.
        </p>
      ) : null}

      <section className="mb-8 rounded-3xl border border-border bg-gradient-to-br from-white via-white to-violet-50/60 p-5 shadow-[0_12px_35px_-28px_rgba(45,34,75,0.4)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
          <div>
            <h2 className="font-semibold text-[#1E1E24]">Cobros y pagos a creadores</h2>
            <p className="mt-1 text-sm text-[#6A6662]">
              El pago del alumno se deposita directamente en la cuenta de Mercado Pago de LYRA. LYRA liquida manualmente
              el 93% correspondiente al creador; el 7% restante corresponde a la plataforma.
            </p>
            <p className="mt-2 text-xs text-[#8A8680]">
              Las tarifas de procesamiento de Mercado Pago se descuentan de la cuenta de LYRA, no del pago del creador.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Métricas de ventas" className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Ventas brutas", value: money(allSales._sum.totalAmount), Icon: ArrowUpRight, tone: "from-violet-50 to-white", detail: "Ingresos totales" },
          { label: "Pendiente de pago", value: money(pendingPayout._sum.creatorPayout93Percent), Icon: CircleDollarSign, tone: "from-cyan-50 to-white", detail: "LYRA paga manualmente" },
          { label: "Pagado", value: money(paidPayout._sum.creatorPayout93Percent), Icon: Sparkles, tone: "from-fuchsia-50 to-white", detail: "Liquidaciones registradas" },
          { label: "Alumnos activos", value: String(activeStudents), Icon: GraduationCap, tone: "from-emerald-50 to-white", detail: "En tus cursos" },
        ].map(({ label, value, Icon, tone, detail }) => (
          <article key={label} className={`group rounded-2xl border border-border bg-gradient-to-br ${tone} p-4 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-950/[0.04]`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#77716A]">{label}</p>
              <span className="grid size-8 place-items-center rounded-lg bg-white/80 text-violet-700 shadow-sm">
                <Icon size={16} aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight text-[#1E1E24]">{value}</p>
            <p className="mt-1 text-[11px] text-[#9A958F]">{detail}</p>
          </article>
        ))}
      </section>

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-[#1E1E24]">Ventas de este mes</h2>
        <p className="mt-2 text-sm text-[#6A6662]">
          {monthSales._count._all} ventas · Bruto {money(monthSales._sum.totalAmount)} · Tu parte del 93%{" "}
          {money(monthSales._sum.creatorPayout93Percent)}
        </p>
      </section>

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-[#1E1E24]">Movimientos recientes</h2>
        {recentSales.length === 0 ? (
          <p className="mt-3 text-sm text-[#6A6662]">Tus ventas aparecerán aquí.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-[#8A8680]">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Curso / alumno</th>
                  <th className="pb-2 pr-4 font-medium">Estado</th>
                  <th className="pb-2 pr-4 font-medium">Venta bruta</th>
                  <th className="pb-2 pr-4 font-medium">Lyra · 7%</th>
                  <th className="pb-2 pr-4 font-medium">Creador · 93%</th>
                  <th className="pb-2 pr-4 font-medium">Pago</th>
                  <th className="pb-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-[#312F2F]">
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{sale.course.title}</p>
                      <p className="text-xs text-[#8A8680]">{sale.buyer.name}</p>
                    </td>
                    <td className="py-3 pr-4">{sale.paymentGatewayStatus}</td>
                    <td className="py-3 pr-4 tabular-nums">{money(sale.totalAmount, sale.currency)}</td>
                    <td className="py-3 pr-4 tabular-nums">{money(sale.lyraFee7Percent, sale.currency)}</td>
                    <td className="py-3 pr-4 tabular-nums">{money(sale.creatorPayout93Percent, sale.currency)}</td>
                    <td className="py-3 pr-4">
                      {sale.creatorPayoutStatus === "PAID"
                        ? `Pagado${sale.creatorPaidAt ? ` · ${sale.creatorPaidAt.toLocaleDateString("es-MX")}` : ""}${sale.creatorPayoutReference ? ` · ${sale.creatorPayoutReference}` : ""}`
                        : sale.creatorPayoutStatus === "CANCELLED" ? "Cancelado por reembolso" : "Pendiente"}
                    </td>
                    <td className="py-3 text-xs text-[#6A6662]">
                      {(sale.paidAt ?? sale.createdAt).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white via-white to-violet-50/80 shadow-[0_18px_55px_-42px_rgba(70,49,134,0.5)]" id="crear-curso">
        <div className="border-b border-violet-100/80 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-500 text-white shadow-lg shadow-violet-600/20">
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Paso 01 · La idea</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Toma 2 minutos</span>
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1E1E24] sm:text-2xl">Dale forma a tu curso</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6A6662]">
                Cuéntales qué van a aprender. Podrás añadir portada, módulos y videos después de crearlo.
              </p>
            </div>
            <div className="hidden items-center gap-1.5 pt-1 sm:flex" aria-label="Paso 1 de 3">
              <span className="h-1.5 w-8 rounded-full bg-violet-600" />
              <span className="h-1.5 w-5 rounded-full bg-violet-200" />
              <span className="h-1.5 w-5 rounded-full bg-violet-200" />
            </div>
          </div>
        </div>
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <form action={createAcademyCourse} className="grid gap-x-4 gap-y-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[#5C5854] md:col-span-2">
              Nombre del curso
              <input
                name="title"
                required
                maxLength={150}
                placeholder="Ej. Diseño web desde cero"
                className="h-11 rounded-xl border border-[#E6E2EC] bg-white px-3.5 text-sm font-normal text-[#1E1E24] shadow-sm outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#5C5854]">
              Tipo de acceso
              <select
                name="pricingType"
                className="h-11 rounded-xl border border-[#E6E2EC] bg-white px-3.5 text-sm font-normal text-[#1E1E24] shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              >
                <option value="FREE">Gratis para todos</option>
                <option value="ONE_TIME">Pago único</option>
                <option disabled>Mensual · próximamente</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#5C5854]">
              Precio en MXN <span className="font-normal text-[#96909A]">· para cursos de pago</span>
              <div className="flex h-11 items-center rounded-xl border border-[#E6E2EC] bg-white shadow-sm transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10">
                <span className="pl-3.5 text-sm font-medium text-[#99939C]">$</span>
                <input
                  name="price"
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  placeholder="499"
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-normal text-[#1E1E24] outline-none placeholder:text-[#AAA5AE]"
                />
                <span className="pr-3.5 text-xs text-[#99939C]">MXN</span>
              </div>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#5C5854] md:col-span-2">
              Descripción <span className="font-normal text-[#96909A]">· qué aprenderán y para quién es</span>
              <textarea
                name="description"
                required
                maxLength={5000}
                rows={3}
                placeholder="Al terminar este curso, podrás…"
                className="resize-y rounded-xl border border-[#E6E2EC] bg-white px-3.5 py-3 text-sm font-normal leading-6 text-[#1E1E24] shadow-sm outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-4 md:col-span-2">
              <p className="max-w-md text-xs leading-5 text-[#817B85]">
                En cursos de pago recibes el 93% del precio. LYRA cobra en su cuenta y cubre la tarifa de Mercado Pago.
              </p>
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#211A32] px-5 text-sm font-semibold text-white shadow-lg shadow-violet-950/10 transition hover:-translate-y-0.5 hover:bg-violet-800 hover:shadow-violet-700/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/25"
              >
                Crear curso <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="space-y-4" id="mis-cursos">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">Tu estudio creativo</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24]">Mis cursos</h2>
          <p className="mt-1 text-sm text-[#6A6662]">Añade contenido a tus cursos, revisa el avance y publícalos cuando estén listos.</p>
        </div>
        {courses.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-violet-200 bg-gradient-to-br from-white via-violet-50/50 to-cyan-50/60 px-6 py-10 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-violet-700 shadow-lg shadow-violet-950/[0.05]">
              <BookOpen size={23} aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-[#1E1E24]">Tu espacio empieza con una idea</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#6A6662]">Crea tu primer curso y construye una experiencia de aprendizaje que tus alumnos recuerden.</p>
            <a href="#crear-curso" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-md shadow-violet-700/20 transition hover:-translate-y-0.5 hover:bg-violet-800">
              Crear primer curso <ArrowDownRight size={15} aria-hidden="true" />
            </a>
          </div>
        ) : (
          courses.map((course) => (
            <article key={course.id} className="relative overflow-hidden rounded-3xl border border-[#E8E4ED] bg-white p-4 shadow-[0_16px_50px_-40px_rgba(35,25,55,0.55)] transition hover:shadow-[0_20px_55px_-38px_rgba(75,53,132,0.3)] sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-400 to-cyan-400" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${course.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        <span className={`size-1.5 rounded-full ${course.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {course.status === "PUBLISHED" ? "Publicado" : "Borrador"}
                      </span>
                      <span className="rounded-full bg-[#F5F3F7] px-2.5 py-1 text-[10px] font-medium text-[#716B76]">
                        {course.pricingType === "FREE" ? "Gratis" : money(course.price, course.currency)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#1E1E24]">{course.title}</h3>
                    <p className="mt-1 max-w-2xl text-sm text-[#6A6662]">{course.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-800">
                        <BookOpen size={12} aria-hidden="true" />
                        {course.modules.length} {course.modules.length === 1 ? "módulo" : "módulos"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1.5 text-[10px] font-medium text-cyan-800">
                        <GraduationCap size={13} aria-hidden="true" />
                        {course.modules.reduce((total, module) => total + module.lessons.length, 0)} lecciones
                      </span>
                    </div>
                  </div>
                  {course.status !== "PUBLISHED" ? (
                    <form action={publishAcademyCourse}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 to-indigo-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-700/15 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-700/20">
                        Publicar curso <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    </form>
                  ) : null}
              </div>

              <CourseCoverManager
                courseId={course.id}
                courseTitle={course.title}
                coverImageUrl={course.coverImageUrl}
              />

              <div className="mt-6 flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-xs font-bold text-white shadow-md shadow-cyan-700/15">02</span>
                <div>
                  <p className="text-sm font-semibold text-[#1E1E24]">Arma el recorrido de aprendizaje</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#6A6662]">Agrupa tus lecciones en módulos por tema, etapa o semana.</p>
                </div>
              </div>
              <form action={createAcademyModule} className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-[#EDE9F2] bg-[#FAF9FC] p-3">
                <input type="hidden" name="courseId" value={course.id} />
                <input name="title" required maxLength={120} placeholder="Ej. Fundamentos" aria-label="Nombre del nuevo módulo" className="h-10 min-w-48 flex-1 rounded-xl border border-[#E6E2EC] bg-white px-3 text-sm text-[#1E1E24] outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10" />
                <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#302044] px-3.5 text-xs font-semibold text-white transition hover:bg-violet-800">
                  <BookOpen size={14} aria-hidden="true" /> Crear módulo
                </button>
              </form>

              {course.modules.length ? (
                <p className="mt-4 flex items-center gap-1.5 text-[10px] text-[#96909A]">
                  <span className="size-1.5 rounded-full bg-violet-400" /> Arrastra módulos y lecciones para cambiar su orden.
                </p>
              ) : null}
              <SortableAcademyList
                courseId={course.id}
                kind="module"
                itemIds={course.modules.map((module) => module.id)}
              >
                {course.modules.map((module, index) => (
                  <section key={module.id} className="rounded-2xl border border-[#ECE8F1] bg-gradient-to-br from-white to-[#FCFBFD] p-3.5 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-[10px] font-bold text-violet-800">{String(index + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-[#1E1E24]">{module.title}</h4>
                          <p className="mt-0.5 text-[10px] text-[#96909A]">{module.lessons.length} lecciones</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(["up", "down"] as const).map((direction) => (
                          <form key={direction} action={moveAcademyModule}>
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="moduleId" value={module.id} />
                            <input type="hidden" name="direction" value={direction} />
                            <button
                              aria-label={direction === "up" ? "Subir módulo" : "Bajar módulo"}
                              className="grid size-8 place-items-center rounded-lg border border-[#E9E4EF] bg-white text-xs text-[#5C5854] transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                            >
                              {direction === "up" ? "↑" : "↓"}
                            </button>
                          </form>
                        ))}
                      </div>
                    </div>
                    <SortableAcademyList
                      courseId={course.id}
                      kind="lesson"
                      parentId={module.id}
                      itemIds={module.lessons.map((lesson) => lesson.id)}
                    >
                      {module.lessons.map((lesson) => (
                        <div key={lesson.id} className="rounded-lg border border-border px-3 py-2 text-sm text-[#6A6662]">
                          {lesson.title}
                          {lesson.attachments.length ? ` · ${lesson.attachments.length} materiales` : ""}
                        </div>
                      ))}
                    </SortableAcademyList>
                    {module.lessons.map((lesson) => (
                      <form key={`${lesson.id}-attachment`} action={createAcademyLessonAttachment} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="lessonId" value={lesson.id} />
                        <input name="title" required maxLength={150} placeholder={`Material para ${lesson.title}`} className="min-w-48 flex-1 rounded-lg border border-border px-3 py-2 text-xs text-[#1E1E24]" />
                        <input name="fileUrl" required type="url" placeholder="https://..." className="min-w-48 flex-1 rounded-lg border border-border px-3 py-2 text-xs text-[#1E1E24]" />
                        <button className="rounded-lg border border-border px-3 py-2 text-xs text-[#312F2F] hover:bg-surface-hover">
                          Agregar material
                        </button>
                      </form>
                    ))}
                    <AcademyLessonForm courseId={course.id} moduleId={module.id} />
                  </section>
                ))}
              </SortableAcademyList>
              {course.modules.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-[#6A6662]">
                  Crea tu primer módulo arriba; después podrás agregar lecciones y subir tus videos.
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </>
  );
}
