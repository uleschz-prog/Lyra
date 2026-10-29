"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { academyMarketplaceEnabled } from "@/lib/academy/mercadopago";
import { getPrisma } from "@/lib/prisma";

const builderPath = "/dashboard/academy/creator";

function message(status: "error" | "saved", text: string): never {
  redirect(`${builderPath}?${status}=${encodeURIComponent(text)}`);
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function requireCreator() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function ownedCourse(courseId: string, creatorId: string) {
  const course = await getPrisma().course.findFirst({
    where: { id: courseId, creatorId },
    select: { id: true },
  });
  if (!course) message("error", "No se encontró el curso.");
  return course;
}

function safeVideoUrl(value: string) {
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    message("error", "La URL del video no es válida.");
  }
  if (url.protocol !== "https:") message("error", "El video debe usar HTTPS.");
  const hostname = url.hostname.toLowerCase();
  const embedHosts = ["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com", "player.vimeo.com"];
  const isAllowedEmbed = embedHosts.includes(hostname);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(url.pathname);
  if (!isAllowedEmbed && !isDirectVideo) {
    message("error", "Usa un enlace de YouTube, Vimeo o un archivo MP4/WebM/MOV.");
  }
  return url.toString();
}

export async function createAcademyCourse(formData: FormData) {
  const user = await requireCreator();
  const title = field(formData, "title");
  const description = field(formData, "description");
  const pricingType = field(formData, "pricingType");
  const rawPrice = field(formData, "price");
  if (!title || title.length > 150 || !description || description.length > 5000) {
    message("error", "Escribe un título (máximo 150 caracteres) y una descripción (máximo 5000).");
  }
  if (pricingType !== "FREE" && pricingType !== "ONE_TIME") {
    message("error", "Los cursos mensuales aún no están disponibles.");
  }

  const price = pricingType === "FREE" ? "0.00" : rawPrice;
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0 && pricingType !== "FREE") {
    message("error", "El precio debe ser mayor a cero y tener hasta dos decimales.");
  }
  if (pricingType === "ONE_TIME") {
    const account = await getPrisma().creatorAccount.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (account?.status !== "connected") {
      message("error", "Conecta tu cuenta de Mercado Pago antes de crear un curso de pago.");
    }
  }

  const baseSlug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "curso";
  await getPrisma().course.create({
    data: {
      creatorId: user.id,
      slug: `${baseSlug}-${randomBytes(3).toString("hex")}`,
      title,
      description,
      price,
      currency: "MXN",
      pricingType,
    },
  });
  revalidatePath(builderPath);
  revalidatePath("/dashboard/academy");
  message("saved", "Curso creado como borrador.");
}

export async function createAcademyModule(formData: FormData) {
  const user = await requireCreator();
  const courseId = field(formData, "courseId");
  const title = field(formData, "title");
  if (!courseId || !title || title.length > 120) {
    message("error", "Escribe el nombre del módulo (máximo 120 caracteres).");
  }
  await ownedCourse(courseId, user.id);
  const current = await getPrisma().courseModule.aggregate({
    where: { courseId },
    _max: { position: true },
  });
  await getPrisma().courseModule.create({
    data: { courseId, title, position: (current._max.position ?? -1) + 1 },
  });
  revalidatePath(builderPath);
  message("saved", "Módulo agregado.");
}

export async function createAcademyLesson(formData: FormData) {
  const user = await requireCreator();
  const courseId = field(formData, "courseId");
  const moduleId = field(formData, "moduleId");
  const title = field(formData, "title");
  const description = field(formData, "description");
  const content = field(formData, "content");
  const videoUrl = safeVideoUrl(field(formData, "videoUrl"));
  if (!courseId || !moduleId || !title || title.length > 150 || description.length > 1000 || content.length > 20000) {
    message("error", "Revisa el título, descripción y contenido de la lección.");
  }
  if (!videoUrl && !content) message("error", "Agrega un video o contenido de texto para la lección.");

  const courseModule = await getPrisma().courseModule.findFirst({
    where: { id: moduleId, courseId, course: { creatorId: user.id } },
    select: { id: true },
  });
  if (!courseModule) message("error", "El módulo no pertenece a uno de tus cursos.");
  const current = await getPrisma().lesson.aggregate({
    where: { moduleId },
    _max: { position: true },
  });
  await getPrisma().lesson.create({
    data: {
      courseId,
      moduleId,
      title,
      description,
      content: content || null,
      videoUrl,
      position: (current._max.position ?? -1) + 1,
      isPublished: true,
    },
  });
  revalidatePath(builderPath);
  revalidatePath("/dashboard/academy");
  message("saved", "Lección agregada.");
}

export async function createAcademyLessonAttachment(formData: FormData) {
  const user = await requireCreator();
  const courseId = field(formData, "courseId");
  const lessonId = field(formData, "lessonId");
  const title = field(formData, "title");
  const fileUrl = field(formData, "fileUrl");
  if (!title || title.length > 150 || fileUrl.length > 2048) {
    message("error", "Revisa el nombre y el enlace del material.");
  }
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    message("error", "El enlace del material no es válido.");
  }
  if (url.protocol !== "https:") message("error", "El material debe usar HTTPS.");

  const lesson = await getPrisma().lesson.findFirst({
    where: { id: lessonId, courseId, course: { creatorId: user.id } },
    select: { id: true },
  });
  if (!lesson) message("error", "La lección no pertenece a uno de tus cursos.");
  const current = await getPrisma().lessonAttachment.aggregate({
    where: { lessonId },
    _max: { position: true },
  });
  await getPrisma().lessonAttachment.create({
    data: { lessonId, title, fileUrl: url.toString(), position: (current._max.position ?? -1) + 1 },
  });
  revalidatePath(builderPath);
  message("saved", "Material agregado a la lección.");
}

export async function publishAcademyCourse(formData: FormData) {
  const user = await requireCreator();
  const courseId = field(formData, "courseId");
  await ownedCourse(courseId, user.id);
  const prisma = getPrisma();
  const [course, lessonCount] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { title: true, description: true, pricingType: true } }),
    prisma.lesson.count({ where: { courseId, isPublished: true } }),
  ]);
  if (!course?.title.trim() || !course.description.trim() || lessonCount === 0) {
    message("error", "Agrega título, descripción y al menos una lección publicada antes de publicar.");
  }
  if (course.pricingType === "MONTHLY") message("error", "Los cursos mensuales aún no están disponibles.");
  if (course.pricingType === "ONE_TIME") {
    if (!academyMarketplaceEnabled()) message("error", "El Marketplace de Academia aún no está habilitado.");
    const account = await prisma.creatorAccount.findUnique({ where: { userId: user.id }, select: { status: true } });
    if (account?.status !== "connected") message("error", "Conecta Mercado Pago antes de publicar el curso.");
  }

  await prisma.course.update({
    where: { id: courseId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  revalidatePath(builderPath);
  revalidatePath("/dashboard/academy");
  message("saved", "Curso publicado en la Academia.");
}

export async function moveAcademyModule(formData: FormData) {
  const user = await requireCreator();
  const courseId = field(formData, "courseId");
  const moduleId = field(formData, "moduleId");
  const direction = field(formData, "direction");
  if (direction !== "up" && direction !== "down") message("error", "Movimiento no válido.");
  await ownedCourse(courseId, user.id);
  const modules = await getPrisma().courseModule.findMany({
    where: { courseId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  const index = modules.findIndex((item) => item.id === moduleId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= modules.length) message("error", "El módulo ya está en ese extremo.");
  const current = modules[index];
  const target = modules[swapIndex];
  await getPrisma().$transaction([
    getPrisma().courseModule.update({ where: { id: current.id }, data: { position: target.position } }),
    getPrisma().courseModule.update({ where: { id: target.id }, data: { position: current.position } }),
  ]);
  revalidatePath(builderPath);
  message("saved", "Orden de módulos actualizado.");
}
