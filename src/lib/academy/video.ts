export function academyVideoEmbed(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { kind: "embed" as const, url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null;
  }
  if (host === "youtube.com" || host === "www.youtube.com") {
    const id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")
          ? url.pathname.split("/")[2]
          : null;
    return id ? { kind: "embed" as const, url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? { kind: "embed" as const, url: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[1];
    return id && /^\d+$/.test(id) ? { kind: "embed" as const, url: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return { kind: "video" as const, url: url.toString() };
  return null;
}
