import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { SortableAcademyList } from "@/components/academy/sortable-academy-list";
import { brand } from "@/config/brand";
import { academyMarketplaceEnabled } from "@/lib/academy/mercadopago";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import {
  createAcademyCourse,
  createAcademyLessonAttachment,
  createAcademyLesson,
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
  const marketplaceEnabled = academyMarketplaceEnabled();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [account, courses, allSales, monthSales, activeStudents, recentSales] = await Promise.all([
    prisma.creatorAccount.findUnique({
      where: { userId: user.id },
      select: { status: true, sellerId: true, siteId: true, connectedAt: true },
    }),
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
        description="Construye tus cursos, conecta los pagos y consulta ventas y alumnos."
        section="academy"
      />

      {query.error ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p role="status" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {query.saved}
        </p>
      ) : null}
      {!marketplaceEnabled ? (
        <p role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Los pagos están cerrados hasta que Lyra habilite la app Marketplace tras validar la integración con Mercado Pago.
        </p>
      ) : null}

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-[#1E1E24]">Cuenta de cobro Mercado Pago</h2>
            <p className="mt-1 text-sm text-[#6A6662]">
              {account?.status === "connected"
                ? `Conectada · ${account.siteId ?? "país por verificar"} · ${account.sellerId}`
                : "Conecta tu cuenta de vendedor para cobrar cursos de pago."}
            </p>
            <p className="mt-2 text-xs text-[#8A8680]">
              Mercado Pago descuenta su tarifa de procesamiento del saldo del creador; Lyra retiene el 7% del precio.
            </p>
          </div>
          <a
            href="/api/academy/mercadopago/connect"
            className="inline-flex h-10 items-center rounded-lg bg-[#312F2F] px-4 text-sm font-medium text-white hover:bg-[#1E1E24]"
          >
            {account?.status === "connected" ? "Volver a conectar" : "Conectar Mercado Pago"}
          </a>
        </div>
      </section>

      <section aria-label="Métricas de ventas" className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Ventas brutas", money(allSales._sum.totalAmount)],
          ["Ingreso del creador · antes de tarifa MP", money(allSales._sum.creatorPayout93Percent)],
          ["Comisión acumulada de Lyra", money(allSales._sum.lyraFee7Percent)],
          ["Alumnos activos", String(activeStudents)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-[#8A8680]">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1E24]">{value}</p>
          </article>
        ))}
      </section>

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-[#1E1E24]">Ventas de este mes</h2>
        <p className="mt-2 text-sm text-[#6A6662]">
          {monthSales._count._all} ventas · Bruto {money(monthSales._sum.totalAmount)} · Tu parte{" "}
          {money(monthSales._sum.creatorPayout93Percent)} · Lyra {money(monthSales._sum.lyraFee7Percent)}
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

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-[#1E1E24]">Crear un curso</h2>
        <p className="mt-1 text-sm text-[#6A6662]">
          Los pagos únicos dividen automáticamente el precio en 7% para Lyra y 93% para ti, antes de la tarifa de Mercado Pago.
        </p>
        <form action={createAcademyCourse} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#5C5854]">
            Título
            <input name="title" required maxLength={150} className="rounded-lg border border-border bg-white px-3 py-2 text-[#1E1E24]" />
          </label>
          <label className="grid gap-1 text-sm text-[#5C5854]">
            Tipo de acceso
            <select name="pricingType" className="rounded-lg border border-border bg-white px-3 py-2 text-[#1E1E24]">
              <option value="FREE">Gratis</option>
              <option value="ONE_TIME">Pago único</option>
              <option disabled>Mensual · deshabilitado temporalmente</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#5C5854]">
            Precio MXN (sólo pago único)
            <input name="price" type="number" min="0.01" max="9999999999.99" step="0.01" placeholder="499.00" className="rounded-lg border border-border bg-white px-3 py-2 text-[#1E1E24]" />
          </label>
          <label className="grid gap-1 text-sm text-[#5C5854] md:col-span-2">
            Descripción
            <textarea name="description" required maxLength={5000} rows={3} className="rounded-lg border border-border bg-white px-3 py-2 text-[#1E1E24]" />
          </label>
          <button type="submit" className="h-10 w-fit rounded-lg bg-[#312F2F] px-4 text-sm font-medium text-white hover:bg-[#1E1E24]">
            Guardar borrador
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#1E1E24]">Mis cursos</h2>
        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-[#6A6662]">
            Aún no has creado cursos.
          </p>
        ) : (
          courses.map((course) => (
            <article key={course.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8A8680]">
                    {course.status === "PUBLISHED" ? "Publicado" : "Borrador"} ·{" "}
                    {course.pricingType === "FREE" ? "Gratis" : money(course.price, course.currency)}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-[#1E1E24]">{course.title}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-[#6A6662]">{course.description}</p>
                </div>
                {course.status !== "PUBLISHED" ? (
                  <form action={publishAcademyCourse}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <button className="h-9 rounded-lg border border-border px-3 text-sm text-[#312F2F] hover:bg-surface-hover">
                      Publicar
                    </button>
                  </form>
                ) : null}
              </div>

              <form action={createAcademyModule} className="mt-5 flex flex-wrap gap-2">
                <input type="hidden" name="courseId" value={course.id} />
                <input name="title" required maxLength={120} placeholder="Nombre del módulo" className="min-w-60 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1E1E24]" />
                <button className="rounded-lg border border-border px-3 py-2 text-sm text-[#312F2F] hover:bg-surface-hover">
                  Agregar módulo
                </button>
              </form>

              <p className="mt-4 text-xs text-[#8A8680]">Arrastra módulos y lecciones para cambiar su orden.</p>
              <SortableAcademyList
                courseId={course.id}
                kind="module"
                itemIds={course.modules.map((module) => module.id)}
              >
                {course.modules.map((module, index) => (
                  <section key={module.id} className="rounded-xl border border-border bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium text-[#1E1E24]">
                        {index + 1}. {module.title}
                      </h4>
                      <div className="flex gap-1">
                        {(["up", "down"] as const).map((direction) => (
                          <form key={direction} action={moveAcademyModule}>
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="moduleId" value={module.id} />
                            <input type="hidden" name="direction" value={direction} />
                            <button
                              aria-label={direction === "up" ? "Subir módulo" : "Bajar módulo"}
                              className="rounded-md border border-border px-2 py-1 text-xs text-[#5C5854] hover:bg-surface-hover"
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
                    <form action={createAcademyLesson} className="mt-4 grid gap-2 md:grid-cols-2">
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="moduleId" value={module.id} />
                      <input name="title" required maxLength={150} placeholder="Título de la lección" className="rounded-lg border border-border px-3 py-2 text-sm text-[#1E1E24]" />
                      <input name="videoUrl" type="url" placeholder="https://youtu.be/..." className="rounded-lg border border-border px-3 py-2 text-sm text-[#1E1E24]" />
                      <input name="description" maxLength={1000} placeholder="Descripción breve" className="rounded-lg border border-border px-3 py-2 text-sm text-[#1E1E24]" />
                      <textarea name="content" maxLength={20000} rows={2} placeholder="Contenido de texto (opcional)" className="rounded-lg border border-border px-3 py-2 text-sm text-[#1E1E24]" />
                      <button className="h-9 w-fit rounded-lg border border-border px-3 text-sm text-[#312F2F] hover:bg-surface-hover md:col-span-2">
                        Agregar lección
                      </button>
                    </form>
                  </section>
                ))}
              </SortableAcademyList>
            </article>
          ))
        )}
      </section>
    </>
  );
}
