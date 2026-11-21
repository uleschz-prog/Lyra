import { leadEndpointPath, leadRuntimeScript } from "@/lib/leads/runtime";
import { liveApiPath } from "@/lib/liveapps/http";
import { getPrisma } from "@/lib/prisma";
import { findPublished } from "@/lib/publish/core";
import {
  notPublishedHtml,
  liveConfigScript,
  publishedHeaders,
  publishedPageHtml,
} from "@/lib/publish/page";
import { appOrigin, publishedSourceHtml } from "@/lib/publish/server";

/**
 * Sitio publicado por un socio. Va con CSP «sandbox» (origen opaco): el código generado no puede
 * leer cookies ni almacenamiento de LYRA y sus peticiones salen sin credenciales. No se lee la
 * sesión aquí: la respuesta es igual para todos y la CDN la guarda un minuto.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const origin = appOrigin(request);
  const target = await findPublished(getPrisma(), slug.toLowerCase()).catch(
    () => null,
  );
  const html = target
    ? await publishedSourceHtml(target).catch(() => null)
    : null;
  if (!target || !html) {
    return new Response(notPublishedHtml(origin), {
      status: 404,
      headers: {
        ...publishedHeaders({ indexable: false }),
        "Cache-Control": "public, max-age=0, s-maxage=30",
      },
    });
  }
  // Solo los sitios reciben contactos (en una app, los formularios guardan registros propios).
  const endpoint =
    target.kind === "sitio"
      ? `${origin}${leadEndpointPath(target.slug)}`
      : null;
  // Apps con datos en vivo: la app recibe la dirección de su Data API y puede conectarse solo ahí.
  const space =
    target.kind === "app"
      ? await getPrisma()
          .appSpace.findUnique({ where: { projectId: target.projectId }, select: { status: true } })
          .catch(() => null)
      : null;
  const liveApi = space ? `${origin}${liveApiPath(target.slug)}` : null;
  const page = publishedPageHtml(
    html,
    {
      title: target.title,
      description: target.summary,
      url: `${origin}/s/${target.slug}`,
      indexable: target.indexable,
      appUrl: origin,
    },
    endpoint ? leadRuntimeScript(endpoint) : "",
    liveApi && space
      ? liveConfigScript({ api: liveApi, slug: target.slug, status: space.status === "active" ? "active" : "paused" })
      : "",
  );
  return new Response(page, {
    status: 200,
    headers: publishedHeaders({
      indexable: target.indexable,
      connect: [endpoint, liveApi].filter((item): item is string => Boolean(item)),
    }),
  });
}
