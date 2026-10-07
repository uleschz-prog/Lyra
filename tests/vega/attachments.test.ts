import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { creditRingRatio } from "@/lib/vega/credit-meter";
import {
  attachmentChips,
  attachmentMeta,
  excerptsFromMeta,
  htmlToText,
  isBlockedIp,
  prepareAttachments,
  publicUrlError,
} from "@/lib/vega/attachments";

function zipStored(entries: { name: string; content: string }[]) {
  return Buffer.concat(
    entries.map(({ name, content }) => {
      const data = Buffer.from(content);
      const fileName = Buffer.from(name);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(fileName.length, 26);
      local.writeUInt32LE(data.length, 18);
      return Buffer.concat([local, fileName, data]);
    }),
  );
}

function zipDeflated(name: string, content: string) {
  const raw = Buffer.from(content);
  const data = deflateRawSync(raw);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt32LE(data.length, 18);
  return Buffer.concat([local, fileName, data]);
}

const open = async () => null;

describe("adjuntos de Vega", () => {
  it("lee varios archivos de texto, un Word y una imagen", async () => {
    const docx = zipDeflated("word/document.xml", "<w:document><w:t>Citas de la clínica</w:t></w:document>");
    const ready = await prepareAttachments(
      [
        { kind: "file", name: "notas.txt", mime: "text/plain", text: "María López, limpieza, 10:30." },
        { kind: "file", name: "lista.csv", mime: "text/csv", text: "nombre,servicio\nMaría,limpieza" },
        { kind: "file", name: "clinica.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: docx.toString("base64") },
        { kind: "file", name: "logo.png", mime: "image/png", data: Buffer.from("png").toString("base64") },
      ],
      { resolveHost: open },
    );
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.items).toHaveLength(4);
    expect(ready.items[0]?.excerpt).toContain("María López");
    expect(ready.items[2]?.excerpt).toContain("Citas de la clínica");
    expect(ready.items[3]?.inline?.mimeType).toBe("image/png");
    const meta = attachmentMeta(ready.items);
    expect(excerptsFromMeta(meta)).toContain("Citas de la clínica");
    expect(attachmentChips(meta).map((item) => item.name)).toEqual(["notas.txt", "lista.csv", "clinica.docx", "logo.png"]);
  });

  it("abre varios enlaces y rechaza los privados", async () => {
    expect(publicUrlError("http://127.0.0.1/secreto")).toBeTruthy();
    expect(publicUrlError("http://169.254.169.254/latest")).toBeTruthy();
    expect(publicUrlError("http://localhost/vega")).toBeTruthy();
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(publicUrlError("https://ejemplo.test/guia")).toBeNull();

    const ready = await prepareAttachments([{ kind: "link", url: "https://ejemplo.test/guia" }, { kind: "link", url: "https://ejemplo.test/precios" }], {
      resolveHost: open,
      fetch: (async () =>
        new Response("<html><body><h1>Guía de citas</h1><p>Limpieza dental</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.items[0]?.excerpt).toContain("Limpieza dental");
    expect(htmlToText("<script>alert(1)</script><p>Hola</p>")).toBe("Hola");
  });

  it("rechaza demasiados archivos y un tipo desconocido", async () => {
    const many = Array.from({ length: 13 }, (_, index) => ({ kind: "file", name: `n${index}.txt`, mime: "text/plain", text: "hola" }));
    const limited = await prepareAttachments(many, { resolveHost: open });
    expect(limited.ok).toBe(false);
    const zip = zipStored([{ name: "readme.txt", content: "no es word" }]);
    const unknown = await prepareAttachments([{ kind: "file", name: "virus.exe", mime: "application/octet-stream", data: zip.toString("base64") }], {
      resolveHost: open,
    });
    expect(unknown.ok).toBe(false);
  });
});

describe("círculo de créditos", () => {
  it("empieza lleno y se desgasta al gastar", () => {
    expect(creditRingRatio(300, 300)).toBe(1);
    expect(creditRingRatio(220, 300)).toBeCloseTo(220 / 300);
    expect(creditRingRatio(0, 300)).toBe(0);
    expect(creditRingRatio(999898, 999901)).toBeCloseTo(1 - 3 / 50);
    expect(creditRingRatio(40, 1000)).toBeCloseTo(40 / 1000);
  });
});
