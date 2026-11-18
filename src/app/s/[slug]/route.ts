import { leadEndpointPath, leadRuntimeScript } from "@/lib/leads/runtime";
import { getPrisma } from "@/lib/prisma";
import { findPublished } from "@/lib/publish/core";
import {
  notPublishedHtml,
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
  );
  return new Response(page, {
    status: 200,
    headers: publishedHeaders({
      indexable: target.indexable,
      connect: endpoint ? [endpoint] : [],
    }),
  });
}
