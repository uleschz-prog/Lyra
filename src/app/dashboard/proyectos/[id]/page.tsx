import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileCode2, Inbox, Sparkles, Store } from "lucide-react";

import { GameLeaderboardPanel } from "@/components/projects/game-leaderboard-panel";
import { LiveDataPanel } from "@/components/projects/live-data-panel";
import { ProjectActions } from "@/components/projects/project-actions";
import { PublishPanel } from "@/components/projects/publish-panel";
import { RestoreVersionButton } from "@/components/projects/restore-version-button";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { hasReadySite } from "@/lib/projects/handoff";
import { LIVE_APP_MONTHLY_FEE, liveAppsAvailable } from "@/lib/liveapps/config";
import { gameSpaceSchema, topScores } from "@/lib/games/leaderboard";
import { gameManifestFromFiles } from "@/lib/games/spec";
import { ownedSpace, spaceOverview } from "@/lib/liveapps/core";
import { manifestFromFiles } from "@/lib/liveapps/project";
import { getProject, getProjectVersionFiles, parseVersionParam } from "@/lib/projects/queries";
import { getPrisma } from "@/lib/prisma";
import { getPublishState } from "@/lib/publish/core";
import { countUnreadLeads } from "@/lib/leads/queries";
import { formatProjectDate, projectKindLabels } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Proyecto" };

async function gamePanelData(userId: string, projectId: string, versionNumber?: number) {
  const db = getPrisma();
  const [space, version] = await Promise.all([
    ownedSpace(db, userId, projectId).catch(() => null),
    getProjectVersionFiles(userId, projectId, versionNumber).catch(() => null),
  ]);
  const enabled = Boolean(gameManifestFromFiles(version?.files)?.leaderboard);
  const active = Boolean(space && space.status === "active" && gameSpaceSchema(space.schema));
  const top = active && space ? await topScores(db, space.id).catch(() => []) : [];
  return { enabled, active, top };
}

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const project = await getProject(user.id, id).catch(() => null);
  if (!project || project.versions.length === 0) notFound();

  const publish = hasReadySite(project.kind) ? await getPublishState(getPrisma(), user.id, project.id).catch(() => null) : null;
  const unreadLeads = project.kind === "sitio" ? await countUnreadLeads(user.id, project.id).catch(() => 0) : 0;
  // Datos en vivo (apps): el panel aparece si ya hay espacio o si la cuenta puede activarlo.
  const liveOverview = project.kind === "app" ? await spaceOverview(getPrisma(), user.id, project.id).catch(() => null) : null;
  const liveVersion = project.kind === "app" && !liveOverview && liveAppsAvailable(user) ? await getProjectVersionFiles(user.id, project.id, publish?.versionNumber ?? undefined).catch(() => null) : null;
  const showLive = project.kind === "app" && (Boolean(liveOverview) || liveAppsAvailable(user));
  // Juegos: ranking en línea (si la versión lo trae; se activa al publicar).
  const game = project.kind === "juego" ? await gamePanelData(user.id, project.id, publish?.versionNumber ?? undefined) : null;
  const head = await headers();
  const host = head.get("host");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || (host ? `${head.get("x-forwarded-proto") ?? "https"}://${host}` : "");
  const requested = parseVersionParam(v);
  const current = project.versions.find((version) => version.number === requested) ?? project.versions[0];
  const query = `?v=${current.number}`;
  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]";
  // Botón principal con sus propias clases: mezclarlo con `button` dejaba bg-white encima (texto blanco invisible).
  const primary = "inline-flex items-center gap-1.5 rounded-lg border border-[#7C3AED] bg-[#7C3AED] px-3 py-2 text-xs font-medium text-white hover:border-[#6D28D9] hover:bg-[#6D28D9]";

  return (
    <div className="space-y-6">
      <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Proyectos
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-[#8A8680]">{projectKindLabels[project.kind]}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] sm:text-3xl dark:text-[#F2F0F7]">{project.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5C5854] dark:text-[#C8C4D4]">{current.summary || project.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/proyectos/${project.id}/preview${query}`} target="_blank" rel="noopener noreferrer" className={button}>
            <ExternalLink className="size-3.5" />
            Abrir en pestaña
          </a>
          {hasReadySite(project.kind) ? (
            <a
              href={`/api/proyectos/${project.id}/sitio${query}`}
              title="Un solo archivo HTML listo para subir a cualquier hosting"
              className={primary}
            >
              <Download className="size-3.5" />
              {project.kind === "juego" ? "Descargar juego listo" : "Descargar sitio listo"}
            </a>
          ) : null}
          <a
            href={`/api/proyectos/${project.id}/zip${query}`}
            title={hasReadySite(project.kind) ? "Código fuente, sitio listo y guía para publicarlo" : "Archivos del proyecto"}
            className={hasReadySite(project.kind) ? button : primary}
          >
            <FileCode2 className="size-3.5" />
            Descargar ZIP
          </a>
          {hasReadySite(project.kind) && project.versions[0].generator === "vega-v2" ? (
            <Link href={`/dashboard/super-agent?editar=${project.id}`} title="Pídele a Vega cambios; se guardan como versión nueva" className={button}>
              <Sparkles className="size-3.5" />
              Editar con Vega
            </Link>
          ) : null}
          {project.kind === "sitio" ? (
            <Link href={`/dashboard/proyectos/${project.id}/contactos`} className={button}>
              <Inbox className="size-3.5" />
              Contactos
              {unreadLeads ? <span className="rounded-full bg-[#7C3AED] px-1.5 text-[10px] font-semibold text-white">{unreadLeads}</span> : null}
            </Link>
          ) : null}
          <Link href={`/dashboard/marketplace/publicar?proyecto=${project.id}`} className={button}>
            <Store className="size-3.5" />
            Publicar en Marketplace
          </Link>
          <ProjectActions id={project.id} title={project.title} afterDelete="/dashboard/proyectos" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Vista previa" className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white dark:border-white/12">
          <div className="flex items-center justify-between border-b border-[#F0ECE6] px-4 py-2.5 text-xs text-[#5C5854] dark:border-white/10 dark:text-[#C8C4D4]">
            <span>Versión {current.number}</span>
            <span className="flex items-center gap-2">
              {current.number !== project.versions[0].number ? <RestoreVersionButton projectId={project.id} number={current.number} /> : null}
              <span>{formatProjectDate(current.createdAt)}</span>
            </span>
          </div>
          <iframe
            key={current.number}
            title={`Vista previa de ${project.title}, versión ${current.number}`}
            src={`/api/proyectos/${project.id}/preview${query}`}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="h-[70dvh] min-h-[480px] w-full bg-white"
          />
        </section>

        <div className="space-y-4">
          {hasReadySite(project.kind) ? (
            <PublishPanel projectId={project.id} title={project.title} versions={project.versions.map((version) => version.number)} initial={publish} origin={origin} />
          ) : null}
          {game ? (
            <GameLeaderboardPanel
              projectId={project.id}
              enabled={game.enabled}
              active={game.active && publish?.status === "published"}
              top={game.top}
              gameUrl={publish?.status === "published" ? `${origin}/s/${publish.slug}` : null}
            />
          ) : null}
          {showLive ? (
            <LiveDataPanel
              projectId={project.id}
              hasManifest={Boolean(manifestFromFiles(liveVersion?.files))}
              overview={liveOverview}
              appUrl={publish?.status === "published" ? `${origin}/s/${publish.slug}` : null}
              monthlyFee={LIVE_APP_MONTHLY_FEE}
            />
          ) : null}
          <aside aria-label="Versiones" className="rounded-2xl border border-[#E7E2DA] bg-white p-4 dark:border-white/12 dark:bg-[#181625]">
            <h2 className="text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Versiones</h2>
            <p className="mt-1 text-xs text-[#8A8680]">Cada vez que Vega entrega cambios se guarda una versión nueva.</p>
            <ol className="mt-3 space-y-1.5">
              {project.versions.map((version) => {
                const active = version.number === current.number;
                return (
                  <li key={version.number}>
                    <Link
                      href={`/dashboard/proyectos/${project.id}?v=${version.number}`}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-[#EDE9FE] text-[#1E1E24] dark:bg-[#2B2740] dark:text-[#F2F0F7]"
                          : "text-[#5C5854] hover:bg-[#F6F4F1] dark:text-[#C8C4D4] dark:hover:bg-[#221F30]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          v{version.number}
                          {publish?.status === "published" && publish.versionNumber === version.number ? (
                            <span className="ml-1.5 rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">En línea</span>
                          ) : null}
                          {version.generator === "vega-v2" ? (
                            <span className="ml-1.5 rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">Premium</span>
                          ) : null}
                        </span>
                        <span className="text-xs text-[#8A8680]">{size(version.sizeBytes)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-[#8A8680]">{formatProjectDate(version.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
